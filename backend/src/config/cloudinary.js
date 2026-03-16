import { v2 as cloudinary } from 'cloudinary';
import logger from './logger.js';

if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  logger.info('Cloudinary configured');
} else {
  logger.warn('Cloudinary not configured — file uploads will use local storage');
}

// Upload a file buffer to Cloudinary
export async function uploadToCloudinary(fileBuffer, options = {}) {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: options.folder || 'advance-al',
      resource_type: options.resourceType || 'auto',
      ...options,
    };

    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    stream.end(fileBuffer);
  });
}

// Delete a file from Cloudinary by public_id
export async function deleteFromCloudinary(publicId) {
  try {
    return await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    logger.error('Cloudinary delete error', { publicId, error: error.message });
    throw error;
  }
}

export default cloudinary;
