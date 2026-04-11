import sharp from 'sharp';
import path from 'path';
import { mkdir } from 'fs/promises';

const TARGET_WIDTH = 1200;

/**
 * Preprocess a passport image for optimal OCR accuracy.
 * Pipeline: resize → grayscale → normalize → sharpen → median filter
 */
export async function preprocess(inputPath, outputDir) {
  const filename = path.basename(inputPath, path.extname(inputPath)) + '.png';
  const outputPath = path.join(outputDir, filename);

  await mkdir(outputDir, { recursive: true });

  await sharp(inputPath)
    .resize({ width: TARGET_WIDTH })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.5 })
    .median(3)
    .png()
    .toFile(outputPath);

  return outputPath;
}
