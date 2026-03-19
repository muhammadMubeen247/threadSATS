const express = require('express');
const router = express.Router();
const { uploadImage, uploadMedia } = require('../controllers/controllers.upload');
const { protect } = require('../middleware/middleware.auth');
const { uploadSingle, uploadMultiple, handleUploadError } = require('../middleware/upload');

// @route   POST /api/upload/image
// @desc    Upload single image (profile pics, cover photos)
// @access  Private
router.post('/image', protect, uploadSingle, handleUploadError, uploadImage);

// @route   POST /api/upload/media
// @desc    Upload multiple media files (images + videos, max 4)
// @access  Private
router.post('/media', protect, uploadMultiple, handleUploadError, uploadMedia);

module.exports = router;