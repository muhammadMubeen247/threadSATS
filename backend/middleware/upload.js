const multer = require('multer');
const path = require('path');

// Configure multer for memory storage (no disk writes)
const storage = multer.memoryStorage();

// Allowed image extensions & MIME types
const IMAGE_EXT = /jpeg|jpg|png|gif|webp/;
const VIDEO_EXT = /mp4|mov|webm/;
const VIDEO_MIMES = /video\/mp4|video\/quicktime|video\/webm/;

// File filter - allow images and videos
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');

  // Check images
  if (IMAGE_EXT.test(ext) && IMAGE_EXT.test(file.mimetype)) {
    return cb(null, true);
  }

  // Check videos
  if (VIDEO_EXT.test(ext) && VIDEO_MIMES.test(file.mimetype)) {
    return cb(null, true);
  }

  cb(new Error('Only image (jpeg, jpg, png, gif, webp) and video (mp4, mov, webm) files are allowed'));
};

// File filter - images only (for profile pics, cover photos)
const imageOnlyFilter = (req, file, cb) => {
  const extname = IMAGE_EXT.test(path.extname(file.originalname).toLowerCase());
  const mimetype = IMAGE_EXT.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  }
  cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
};

// Media upload (images + videos, up to 50MB for videos)
const mediaUpload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter,
});

// Image-only upload (5MB, for profile pics / cover photos)
const imageUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageOnlyFilter,
});

// Middleware for single image upload (profile pics, cover photos)
const uploadSingle = imageUpload.single('image');

// Middleware for multiple media (max 4)
const uploadMultiple = mediaUpload.array('media', 4);

// Error handling middleware
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum is 50MB per file.',
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum is 4 media files.',
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected field name. Use "media" for file uploads.',
      });
    }
  }

  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || 'Error uploading file',
    });
  }

  next();
};

module.exports = {
  uploadSingle,
  uploadMultiple,
  handleUploadError,
};