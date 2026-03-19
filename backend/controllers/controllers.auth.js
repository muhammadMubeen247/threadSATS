const User = require('../models/User');
const OTP = require('../models/OTP');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendOTPEmail, sendPasswordResetOTPEmail } = require('../config/email');

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

const DEGREE_TO_DEPARTMENT = {
  bcs: 'Computer Science',
  bse: 'Software Engineering',
  bit: 'Information Technology',
  // add more mappings if you have them:
  // bba: 'Business Administration',
  // bee: 'Electrical Engineering',
};

function parseComsatsEmail(email = '') {
  const lower = String(email).trim().toLowerCase();

  // local-part: fa22-bcs-112
  const [local] = lower.split('@');
  const parts = (local || '').split('-');

  if (parts.length !== 3) {
    throw new Error('Email must look like fa22-bcs-112@cuilahore.edu.pk');
  }

  const [sessionYearRaw, degreeRaw, idRaw] = parts;

  // fa22 / sp22
  if (!/^(fa|sp)\d{2}$/.test(sessionYearRaw)) {
    throw new Error('Email must start with faYY or spYY (e.g., fa22 or sp22).');
  }

  // bcs / bse / bit ...
  if (!/^[a-z]{2,6}$/.test(degreeRaw)) {
    throw new Error('Degree code in email is invalid (e.g., bcs, bse).');
  }

  // 112
  if (!/^\d{1,6}$/.test(idRaw)) {
    throw new Error('Student id in email is invalid (e.g., 112).');
  }

  const batch = sessionYearRaw.toUpperCase();     // FA22
  const degree = degreeRaw.toUpperCase();         // BCS
  const rollNumber = `${batch}-${degree}-${idRaw}`;

  const department = DEGREE_TO_DEPARTMENT[degreeRaw];
  if (!department) {
    throw new Error(`Unknown degree code "${degreeRaw}". Add it to DEGREE_TO_DEPARTMENT.`);
  }

  return { batch, rollNumber, department };
}


// @desc    Register new user (send OTP)
// @route   POST /api/auth/signup
// @access  Public
exports.signup = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // ✅ derive batch/rollNumber/department from email
    let derived;
    try {
      derived = parseComsatsEmail(email);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: e.message,
      });
    }

    const { rollNumber, department, batch } = derived;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }, { rollNumber }],
    });

    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({ success: false, message: 'Email already registered' });
      }
      if (existingUser.username === username) {
        return res.status(400).json({ success: false, message: 'Username already taken' });
      }
      if (existingUser.rollNumber === rollNumber) {
        return res.status(400).json({ success: false, message: 'Roll number already registered' });
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await OTP.create({ email, otp: otpCode, expiresAt: otpExpiry });
    await sendOTPEmail(email, otpCode);

    // ✅ Create user (unverified) with derived fields
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      rollNumber,
      department,
      batch,
      isVerified: false,
    });

    return res.status(201).json({
      success: true,
      message: 'OTP sent to your email. Please verify to complete registration.',
      userId: user._id,
    });
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during signup',
    });
  }
};

// @desc    Verify OTP and complete registration
// @route   POST /api/auth/verify-otp
// @access  Public
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    // Find OTP
    const otpRecord = await OTP.findOne({ email, otp });

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP',
      });
    }

    // Check if OTP expired
    if (otpRecord.expiresAt < new Date()) {
      await OTP.deleteOne({ _id: otpRecord._id });
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.',
      });
    }

    // Mark user as verified
    const user = await User.findOneAndUpdate(
      { email },
      { isVerified: true },
      { new: true }
    ).select('-password');

    // Delete OTP
    await OTP.deleteOne({ _id: otpRecord._id });

    // Generate token
    const token = generateToken(user._id);

    res
      .cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      })
      .status(200)
      .json({
        success: true,
        message: 'Email verified successfully',
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          rollNumber: user.rollNumber,
          department: user.department,
          batch: user.batch,
          profilePic: user.profilePic,
          bio: user.bio,
          isVerified: user.isVerified,
        },
      });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during OTP verification',
      error: error.message,
    });
  }
};

// @desc    Resend OTP
// @route   POST /api/auth/resend-otp
// @access  Public
exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email already verified',
      });
    }

    // Delete old OTP
    await OTP.deleteMany({ email });

    // Generate new OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    // Save new OTP
    await OTP.create({
      email,
      otp: otpCode,
      expiresAt: otpExpiry,
    });

    // Send OTP email
    await sendOTPEmail(email, otpCode);

    res.status(200).json({
      success: true,
      message: 'New OTP sent to your email',
    });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while resending OTP',
      error: error.message,
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Check if verified
    if (!user.isVerified) {
      return res.status(401).json({
        success: false,
        message: 'Please verify your email first',
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Generate token
    const token = generateToken(user._id);

    res
      .cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      })
      .status(200)
      .json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          rollNumber: user.rollNumber,
          department: user.department,
          batch: user.batch,
          profilePic: user.profilePic,
          bio: user.bio,
          isVerified: user.isVerified,
        },
      });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message,
    });
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res) => {
  try {
    res
      .cookie('token', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        expires: new Date(0),
      })
      .status(200)
      .json({
        success: true,
        message: 'Logged out successfully',
      });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during logout',
      error: error.message,
    });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        rollNumber: user.rollNumber,
        department: user.department,
        batch: user.batch,
        profilePic: user.profilePic,
        bio: user.bio,
        isVerified: user.isVerified,
        followersCount: user.followers.length,
        followingCount: user.following.length,
      },
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user',
      error: error.message,
    });
  }
};

// @desc    Change password (requires old password)
// @route   POST /api/auth/change-password
// @access  Private
exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    // protect middleware should set req.user
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const ok = await bcrypt.compare(oldPassword, user.password);
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Old password is incorrect' });
    }

    // newPassword != oldPassword is already enforced by validator, but keep a safe-guard
    const same = await bcrypt.compare(newPassword, user.password);
    if (same) {
      return res.status(400).json({ success: false, message: 'New password must be different from old password' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    return res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('changePassword error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Send password reset OTP
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // (recommended) prevent user enumeration: respond success even if not found
    const user = await User.findOne({ email });

    // always clear old reset OTPs for this email
    await OTP.deleteMany({ email, purpose: 'reset' });

    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If an account exists for this email, an OTP has been sent.',
      });
    }

    if (!user.isVerified) {
      return res.status(200).json({
        success: true,
        message: 'If an account exists for this email, an OTP has been sent.',
      });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await OTP.create({
      email,
      otp: otpCode,
      purpose: 'reset',
      expiresAt: otpExpiry,
    });

    await sendPasswordResetOTPEmail(email, otpCode);

    return res.status(200).json({
      success: true,
      message: 'If an account exists for this email, an OTP has been sent.',
    });
  } catch (error) {
    console.error('forgotPassword error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while requesting password reset',
    });
  }
};

// @desc    Verify reset OTP and set new password
// @route   POST /api/auth/reset-password
// @access  Public
exports.resetPasswordWithOTP = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    const otpRecord = await OTP.findOne({ email, otp, purpose: 'reset' });

    if (!otpRecord) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    if (otpRecord.expiresAt < new Date()) {
      await OTP.deleteOne({ _id: otpRecord._id });
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.',
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // still delete OTP so it can’t be replayed
      await OTP.deleteOne({ _id: otpRecord._id });
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // optional safeguard: prevent reusing the same password
    const same = await bcrypt.compare(newPassword, user.password);
    if (same) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from old password',
      });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    // consume OTP(s)
    await OTP.deleteMany({ email, purpose: 'reset' });

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully. You can now log in.',
    });
  } catch (error) {
    console.error('resetPasswordWithOTP error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while resetting password',
    });
  }
};

// @desc    Verify reset OTP (does not change password)
// @route   POST /api/auth/verify-reset-otp
// @access  Public
exports.verifyResetOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const otpRecord = await OTP.findOne({ email, otp, purpose: 'reset' });
    if (!otpRecord) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    if (otpRecord.expiresAt < new Date()) {
      await OTP.deleteOne({ _id: otpRecord._id });
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.',
      });
    }

    return res.status(200).json({ success: true, message: 'OTP verified' });
  } catch (error) {
    console.error('verifyResetOTP error:', error);
    return res.status(500).json({ success: false, message: 'Server error while verifying OTP' });
  }
};
