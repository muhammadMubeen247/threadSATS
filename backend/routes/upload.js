const express = require('express');
const router = express.Router();
const { uploadImage, uploadMultipleImages } = require('../controllers/controllers.upload');
const { protect } = require('../middleware/middleware.auth');
const { uploadSingle, uploadMultiple, handleUploadError } = require('../middleware/upload');

// @route   POST /api/upload/image
// @desc    Upload single image
// @access  Private
router.post('/image', protect, uploadSingle, handleUploadError, uploadImage);

// @route   POST /api/upload/images
// @desc    Upload multiple images (max 4)
// @access  Private
router.post('/images', protect, uploadMultiple, handleUploadError, uploadMultipleImages);

module.exports = router;