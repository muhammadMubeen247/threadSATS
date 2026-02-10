const express = require('express');
const router = express.Router();

const{
    signup,
    verifyOTP,
    resendOTP,
    login,
    logout,
    getMe,
    changePassword
} = require('../controllers/controllers.auth');

const {
    signupValidation,
    loginValidation,
    otpValidation,
    changePasswordValidation,
    validate
} = require('../middleware/validation');

const { protect } = require('../middleware/middleware.auth');

//Public Routes
router.post('/signup', signupValidation, validate, signup);
router.post('/verify-otp', otpValidation, validate, verifyOTP);
router.post('/resend-otp', resendOTP);
router.post('/login', loginValidation, validate, login);

//Protected Routes
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
router.post('/change-password', protect, changePasswordValidation, validate, changePassword);

module.exports = router;