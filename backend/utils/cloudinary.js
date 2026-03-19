const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');

/**
 * Upload image to Cloudinary from buffer
 * @param {Buffer} buffer - Image file buffer
 * @param {String} folder - Cloudinary folder name
 * @returns {Promise<Object>} - Upload result with url and publicId
 */
const uploadToCloudinary = (buffer, folder = 'threadsats') => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: 'auto',
        // Create optimized versions
        transformation: [
          {
            width: 1200,
            height: 1200,
            crop: 'limit', // Don't upscale, only downscale if larger
            quality: 'auto:good', // Automatic quality optimization
            fetch_format: 'auto', // Automatically choose best format (WebP if supported)
          },
        ],
        // Generate thumbnail
        eager: [
          {
            width: 400,
            height: 400,
            crop: 'fill',
            gravity: 'auto',
            quality: 'auto:low',
            fetch_format: 'auto',
          },
        ],
        eager_async: true, // Generate thumbnails asynchronously
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            thumbnail: result.eager?.[0]?.secure_url || result.secure_url,
            width: result.width,
            height: result.height,
            format: result.format,
            bytes: result.bytes,
          });
        }
      }
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

/**
 * Delete image from Cloudinary
 * @param {String} publicId - Cloudinary public ID
 * @returns {Promise<Object>} - Deletion result
 */
const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Cloudinary deletion error:', error);
    throw error;
  }
};

/**
 * Delete multiple images from Cloudinary
 * @param {Array<String>} publicIds - Array of Cloudinary public IDs
 * @returns {Promise<Object>} - Deletion result
 */
const deleteMultipleFromCloudinary = async (publicIds) => {
  try {
    const result = await cloudinary.api.delete_resources(publicIds);
    return result;
  } catch (error) {
    console.error('Cloudinary bulk deletion error:', error);
    throw error;
  }
};

/**
 * Get image details from Cloudinary
 * @param {String} publicId - Cloudinary public ID
 * @returns {Promise<Object>} - Image details
 */
const getImageDetails = async (publicId) => {
  try {
    const result = await cloudinary.api.resource(publicId);
    return result;
  } catch (error) {
    console.error('Cloudinary fetch error:', error);
    throw error;
  }
};

/**
 * Upload video to Cloudinary from buffer (minimal transforms for free tier)
 * @param {Buffer} buffer - Video file buffer
 * @param {String} folder - Cloudinary folder name
 * @returns {Promise<Object>} - Upload result
 */
const uploadVideoToCloudinary = (buffer, folder = 'threadsats') => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'video',
        // No eager transformations to conserve free tier credits
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          // Derive poster thumbnail by swapping extension to .jpg (free, no transform cost)
          const posterUrl = result.secure_url.replace(/\.[^.]+$/, '.jpg');
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            thumbnail: posterUrl,
            width: result.width,
            height: result.height,
            format: result.format,
            duration: result.duration || 0,
            bytes: result.bytes,
          });
        }
      }
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

module.exports = {
  uploadToCloudinary,
  uploadVideoToCloudinary,
  deleteFromCloudinary,
  deleteMultipleFromCloudinary,
  getImageDetails,
};