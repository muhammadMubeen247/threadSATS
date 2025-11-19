const { body, param, validationResult } = require('express-validator');

// Validation rules for creating a thread
exports.createThreadValidation = [
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Thread content is required')
    .isLength({ min: 1, max: 500 })
    .withMessage('Thread content must be between 1 and 500 characters'),
  
  body('isAnonymous')
    .optional()
    .isBoolean()
    .withMessage('isAnonymous must be a boolean'),
  
  body('images')
    .optional()
    .isArray()
    .withMessage('Images must be an array')
    .custom((images) => {
      if (images.length > 4) {
        throw new Error('Maximum 4 images allowed');
      }
      return true;
    }),
  
  body('images.*.url')
    .if(body('images').exists())
    .trim()
    .notEmpty()
    .withMessage('Image URL is required')
    .isURL()
    .withMessage('Invalid image URL'),
  
  body('images.*.publicId')
    .if(body('images').exists())
    .trim()
    .notEmpty()
    .withMessage('Image publicId is required'),
  
  body('images.*.thumbnail')
    .optional()
    .trim()
    .isURL()
    .withMessage('Invalid thumbnail URL'),
];

// Validation for thread ID parameter
exports.threadIdValidation = [
  param('threadId')
    .isMongoId()
    .withMessage('Invalid thread ID'),
];

// Validation for user ID parameter
exports.userIdValidation = [
  param('userId')
    .isMongoId()
    .withMessage('Invalid user ID'),
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