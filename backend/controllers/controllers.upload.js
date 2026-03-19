const { uploadToCloudinary, uploadVideoToCloudinary } = require('../utils/cloudinary');

const MAX_VIDEO_DURATION = 60; // seconds
const MAX_VIDEOS = 2;
const MAX_MEDIA = 4;

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

// @desc    Upload multiple media files (images + videos, max 4 total, max 2 videos)
// @route   POST /api/upload/media
// @access  Private
const uploadMedia = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files provided',
      });
    }

    if (req.files.length > MAX_MEDIA) {
      return res.status(400).json({
        success: false,
        message: `Maximum ${MAX_MEDIA} media files allowed`,
      });
    }

    const imageFiles = req.files.filter((f) => f.mimetype.startsWith('image/'));
    const videoFiles = req.files.filter((f) => f.mimetype.startsWith('video/'));

    if (videoFiles.length > MAX_VIDEOS) {
      return res.status(400).json({
        success: false,
        message: `Maximum ${MAX_VIDEOS} videos allowed per thread`,
      });
    }

    const folder = process.env.CLOUDINARY_FOLDER || 'threadsats';

    // Upload images
    const imagePromises = imageFiles.map((file) => uploadToCloudinary(file.buffer, folder));

    // Upload videos
    const videoPromises = videoFiles.map((file) => uploadVideoToCloudinary(file.buffer, folder));

    const [imageResults, videoResults] = await Promise.all([
      Promise.all(imagePromises),
      Promise.all(videoPromises),
    ]);

    // Validate video duration server-side
    for (const vid of videoResults) {
      if (vid.duration > MAX_VIDEO_DURATION) {
        return res.status(400).json({
          success: false,
          message: `Video exceeds maximum duration of ${MAX_VIDEO_DURATION} seconds`,
        });
      }
    }

    const images = imageResults.map((r) => ({
      url: r.url,
      thumbnail: r.thumbnail,
      publicId: r.publicId,
      width: r.width,
      height: r.height,
      format: r.format,
      size: r.bytes,
    }));

    const videos = videoResults.map((r) => ({
      url: r.url,
      thumbnail: r.thumbnail,
      publicId: r.publicId,
      width: r.width,
      height: r.height,
      format: r.format,
      duration: r.duration,
      size: r.bytes,
    }));

    res.status(200).json({
      success: true,
      message: `${images.length} image(s) and ${videos.length} video(s) uploaded successfully`,
      images,
      videos,
    });
  } catch (error) {
    console.error('Upload media error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload media',
      error: error.message,
    });
  }
};

module.exports = {
  uploadImage,
  uploadMedia,
};