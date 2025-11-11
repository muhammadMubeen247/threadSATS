const User = require('../models/User');
const OTP = require('../models/OTP');
const jwt = require('jsonwebtoken');
const { sendOTPEmail } = require('../config/email');

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// @desc    Register new user and send OTP
// @route   POST /api/auth/signup
// @access  Public
exports.signup = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    
    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({
          success: false,
          message: 'Email already registered',
        });
      }
      if (existingUser.username === username) {
        return res.status(400).json({
          success: false,
          message: 'Username already taken',
        });
      }
    }

    // Create user (unverified)
    const user = await User.create({
      username,
      email,
      password,
      verified: false,
    });

    // Generate and save OTP
    const otp = generateOTP();
    await OTP.create({ email, otp });

    // Send OTP email
    await sendOTPEmail(email, otp);

    res.status(201).json({
      success: true,
      message: 'Registration successful! Please check your email for OTP verification.',
      data: {
        email: user.email,
        username: user.username,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during signup',
      error: error.message,
    });
  }
};

// @desc    Verify OTP
// @route   POST /api/auth/verify-otp
// @access  Public
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    // Find OTP record
    const otpRecord = await OTP.findOne({ email, otp });

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP',
      });
    }

    // Update user verification status
    const user = await User.findOneAndUpdate(
      { email },
      { verified: true },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Delete OTP after successful verification
    await OTP.deleteOne({ email, otp });

    // Generate token
    const token = generateToken(user._id);

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(200).json({
      success: true,
      message: 'Email verified successfully!',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profilePic: user.profilePic,
        verified: user.verified,
        rollNumber: user.rollNumber,
        department: user.department,
        batch: user.batch,
      },
    });
  } catch (error) {
    console.error('OTP verification error:', error);
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

    if (user.verified) {
      return res.status(400).json({
        success: false,
        message: 'Email already verified',
      });
    }

    // Delete existing OTPs for this email
    await OTP.deleteMany({ email });

    // Generate new OTP
    const otp = generateOTP();
    await OTP.create({ email, otp });

    // Send OTP email
    await sendOTPEmail(email, otp);

    res.status(200).json({
      success: true,
      message: 'OTP resent successfully! Please check your email.',
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

    // Check if user exists (include password for comparison)
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Check if email is verified
    if (!user.verified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email first',
        needsVerification: true,
      });
    }

    // Check password
    const isPasswordMatch = await user.comparePassword(password);

    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Generate token
    const token = generateToken(user._id);

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(200).json({
      success: true,
      message: 'Login successful!',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profilePic: user.profilePic,
        bio: user.bio,
        rollNumber: user.rollNumber,
        department: user.department,
        batch: user.batch,
        followersCount: user.followers.length,
        followingCount: user.following.length,
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
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
};

// @desc    Get current logged in user
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
        profilePic: user.profilePic,
        bio: user.bio,
        rollNumber: user.rollNumber,
        department: user.department,
        batch: user.batch,
        verified: user.verified,
        followersCount: user.followers.length,
        followingCount: user.following.length,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};