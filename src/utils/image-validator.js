import sharp from 'sharp';
import path from 'path';

const SUPPORTED_FORMATS = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif'];
const MIN_WIDTH = 800;
const MIN_HEIGHT = 600;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Validate an image file for passport OCR processing.
 * Checks format, resolution, and file size.
 */
export async function validateImage(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();

  if (!SUPPORTED_FORMATS.includes(ext)) {
    return {
      valid: false,
      error: `Unsupported format "${ext}". Supported: ${SUPPORTED_FORMATS.join(', ')}`,
    };
  }

  try {
    const metadata = await sharp(imagePath).metadata();

    if (metadata.size && metadata.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File size ${(metadata.size / 1024 / 1024).toFixed(1)}MB exceeds max ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      };
    }

    if (metadata.width < MIN_WIDTH || metadata.height < MIN_HEIGHT) {
      return {
        valid: false,
        error: `Resolution ${metadata.width}x${metadata.height} below minimum ${MIN_WIDTH}x${MIN_HEIGHT}`,
      };
    }

    return { valid: true, metadata };
  } catch (err) {
    return { valid: false, error: `Cannot read image: ${err.message}` };
  }
}
