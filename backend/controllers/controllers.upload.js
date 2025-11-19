const { uploadToCloudinary } = require('../utils/cloudinary');

// @desc    Upload single image
// @route   POST /api/upload/image
// @access  Private
const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided',
      });
    }

    // Upload to Cloudinary
    const uploadResult = await uploadToCloudinary(
      req.file.buffer,
      process.env.CLOUDINARY_FOLDER || 'threadsats'
    );

    res.status(200).json({
      success: true,
      message: 'Image uploaded successfully',
      image: {
        url: uploadResult.url,
        thumbnail: uploadResult.thumbnail,
        publicId: uploadResult.publicId,
        width: uploadResult.width,
        height: uploadResult.height,
        format: uploadResult.format,
        size: uploadResult.bytes,
      },
    });
  } catch (error) {
    console.error('Upload image error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload image',
      error: error.message,
    });
  }
};

// @desc    Upload multiple images (max 4)
// @route   POST /api/upload/images
// @access  Private
const uploadMultipleImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No image files provided',
      });
    }

    if (req.files.length > 4) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 4 images allowed',
      });
    }

    // Upload all images to Cloudinary
    const uploadPromises = req.files.map((file) =>
      uploadToCloudinary(
        file.buffer,
        process.env.CLOUDINARY_FOLDER || 'threadsats'
      )
    );

    const uploadResults = await Promise.all(uploadPromises);

    // Format response
    const images = uploadResults.map((result) => ({
      url: result.url,
      thumbnail: result.thumbnail,
      publicId: result.publicId,
      width: result.width,
      height: result.height,
      format: result.format,
      size: result.bytes,
    }));

    res.status(200).json({
      success: true,
      message: `${images.length} image(s) uploaded successfully`,
      images,
    });
  } catch (error) {
    console.error('Upload multiple images error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload images',
      error: error.message,
    });
  }
};

module.exports = {
  uploadImage,
  uploadMultipleImages,
};