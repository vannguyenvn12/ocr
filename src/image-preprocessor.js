import sharp from 'sharp';
import path from 'path';
import { mkdir } from 'fs/promises';

const TARGET_WIDTH = 1800;

/**
 * Preprocess a passport image for full-page OCR.
 * Gentle pipeline — no binarization to preserve text on patterned backgrounds.
 */
export async function preprocess(inputPath, outputDir) {
  const filename = path.basename(inputPath, path.extname(inputPath)) + '.png';
  const outputPath = path.join(outputDir, filename);
  await mkdir(outputDir, { recursive: true });

  await sharp(inputPath)
    .resize({ width: TARGET_WIDTH })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.0 })
    .png()
    .toFile(outputPath);

  return outputPath;
}

/**
 * Generate multiple MRZ crop variants with different preprocessing.
 * Returns array of image paths to try OCR on.
 * Strategy: different crop heights + preprocessing to handle diverse photo quality.
 */
export async function cropMrzVariants(imagePath, outputDir) {
  await mkdir(outputDir, { recursive: true });
  const metadata = await sharp(imagePath).metadata();
  const baseName = path.basename(imagePath, path.extname(imagePath));
  const variants = [];

  const configs = [
    { name: 'mrz-tall-clean', heightPct: 0.30, threshold: null },
    { name: 'mrz-tall-bin', heightPct: 0.30, threshold: 140 },
    { name: 'mrz-short-clean', heightPct: 0.18, threshold: null },
    { name: 'mrz-short-bin', heightPct: 0.18, threshold: 120 },
  ];

  for (const cfg of configs) {
    const mrzHeight = Math.round(metadata.height * cfg.heightPct);
    const top = metadata.height - mrzHeight;
    const outputPath = path.join(outputDir, `${baseName}-${cfg.name}.png`);

    let pipeline = sharp(imagePath)
      .extract({ left: 0, top, width: metadata.width, height: mrzHeight })
      .resize({ width: TARGET_WIDTH })
      .grayscale()
      .normalize()
      .sharpen({ sigma: 1.2 });

    if (cfg.threshold) {
      pipeline = pipeline.threshold(cfg.threshold);
    }

    await pipeline.png().toFile(outputPath);
    variants.push(outputPath);
  }

  return variants;
}
