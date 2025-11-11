const { body, validationResult } = require('express-validator');

// Validation rules for signup
exports.signupValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email')
    .matches(/^[a-z0-9._%+-]+@cuilahore\.edu\.pk$/i)
    .withMessage('Please use a valid COMSATS email (e.g., xxxx-xxx-xxx@cuilahore.edu.pk)'),

  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
];

// Validation rules for login
exports.loginValidation = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

// Validation rules for OTP verification
exports.otpValidation = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email'),
  
  body('otp')
    .trim()
    .isLength({ min: 6, max: 6 })
    .withMessage('OTP must be 6 digits')
    .isNumeric()
    .withMessage('OTP must be numeric'),
];

// Middleware to handle validation errors
exports.validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }
  next();
};