import { createWorker } from 'tesseract.js';

const MRZ_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';

export class OcrEngine {
  constructor() {
    this.generalWorker = null;
    this.mrzWorker = null;
  }

  async initialize() {
    // General worker for full-page OCR
    this.generalWorker = await createWorker('eng');
    await this.generalWorker.setParameters({
      tessedit_pageseg_mode: '3',
      preserve_interword_spaces: '1',
    });

    // MRZ-specific worker: PSM 11 (raw lines) + whitelist
    this.mrzWorker = await createWorker('eng');
    await this.mrzWorker.setParameters({
      tessedit_pageseg_mode: '11',
      tessedit_char_whitelist: MRZ_WHITELIST,
    });
  }

  /** Full-page OCR. Returns { text, confidence }. */
  async recognize(imagePath) {
    if (!this.generalWorker) throw new Error('OcrEngine not initialized');
    const { data } = await this.generalWorker.recognize(imagePath);
    return { text: data.text, confidence: data.confidence };
  }

  /** OCR a pre-cropped MRZ region image with whitelist + PSM 11. */
  async recognizeMrzImage(imagePath) {
    if (!this.mrzWorker) throw new Error('OcrEngine not initialized');
    const { data } = await this.mrzWorker.recognize(imagePath);
    return { text: data.text, confidence: data.confidence };
  }

  async shutdown() {
    if (this.generalWorker) {
      await this.generalWorker.terminate();
      this.generalWorker = null;
    }
    if (this.mrzWorker) {
      await this.mrzWorker.terminate();
      this.mrzWorker = null;
    }
  }
}
