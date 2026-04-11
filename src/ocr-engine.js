import { createWorker } from 'tesseract.js';

export class OcrEngine {
  constructor() {
    this.worker = null;
  }

  async initialize() {
    this.worker = await createWorker('eng');
    await this.worker.setParameters({
      tessedit_pageseg_mode: '6',
    });
  }

  /**
   * Run OCR on a preprocessed image.
   * Returns { text, confidence }.
   */
  async recognize(imagePath) {
    if (!this.worker) {
      throw new Error('OcrEngine not initialized. Call initialize() first.');
    }

    const { data } = await this.worker.recognize(imagePath);
    return {
      text: data.text,
      confidence: data.confidence,
    };
  }

  /**
   * Second-pass OCR on MRZ region with character whitelist.
   * rectangle: { left, top, width, height } in pixels.
   */
  async recognizeMrz(imagePath, rectangle) {
    if (!this.worker) {
      throw new Error('OcrEngine not initialized. Call initialize() first.');
    }

    await this.worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
    });

    try {
      const { data } = await this.worker.recognize(imagePath, { rectangle });
      return {
        text: data.text,
        confidence: data.confidence,
      };
    } finally {
      await this.worker.setParameters({
        tessedit_char_whitelist: '',
      });
    }
  }

  async shutdown() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}
