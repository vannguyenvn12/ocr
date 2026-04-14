import { readdir } from 'fs/promises';
import path from 'path';
import { validateImage } from './utils/image-validator.js';
import { preprocess, cropMrzVariants } from './image-preprocessor.js';
import { OcrEngine } from './ocr-engine.js';
import { GeminiOcrEngine } from './gemini-ocr-engine.js';
import { extractMrzLines, parseMrz } from './mrz-parser.js';
import { CsvDatabase } from './csv-database.js';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif'];

export class PassportScanner {
  constructor(inputDir, outputDir, options = {}) {
    this.inputDir = inputDir;
    this.outputDir = outputDir;
    this.preprocessedDir = path.join(outputDir, 'preprocessed');
    this.csvPath = path.join(outputDir, 'passports.csv');
    this.engineType = options.engine || 'tesseract';
    this.geminiModel = options.geminiModel || 'gemini-2.5-flash';

    if (this.engineType === 'gemini') {
      this.gemini = new GeminiOcrEngine(process.env.GEMINI_API_KEY, this.geminiModel);
    } else {
      this.ocr = new OcrEngine();
    }

    this.db = new CsvDatabase(this.csvPath);
    this.results = { total: 0, success: 0, failed: 0, confidences: [] };
  }

  async initialize() {
    if (this.gemini) await this.gemini.initialize();
    if (this.ocr) await this.ocr.initialize();
    await this.db.initialize();
  }

  async scanDirectory() {
    const entries = await readdir(this.inputDir);
    return entries
      .filter((f) => IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase()))
      .map((f) => path.join(this.inputDir, f));
  }

  /**
   * Try multiple MRZ crop variants + full-page fallback.
   * Pick the best result based on MRZ checksum validation.
   */
  async extractBestMrz(imagePath, fullPageText) {
    // Generate multiple MRZ crop variants with different preprocessing
    const variants = await cropMrzVariants(imagePath, this.preprocessedDir);

    let bestResult = null;

    // Try each MRZ crop variant
    for (const variantPath of variants) {
      const mrzOcr = await this.ocr.recognizeMrzImage(variantPath);
      const mrzLines = extractMrzLines(mrzOcr.text);
      if (!mrzLines) continue;

      const parsed = parseMrz(mrzLines);
      if (parsed.valid) {
        // Checksum passed — best possible result
        return { parsed, confidence: mrzOcr.confidence, source: 'mrz-crop' };
      }

      // Keep best invalid result (most fields extracted)
      if (!bestResult || countFields(parsed) > countFields(bestResult.parsed)) {
        bestResult = { parsed, confidence: mrzOcr.confidence, source: 'mrz-crop' };
      }
    }

    // Fallback: try full-page OCR text
    const fullMrzLines = extractMrzLines(fullPageText);
    if (fullMrzLines) {
      const parsed = parseMrz(fullMrzLines);
      if (parsed.valid) {
        return { parsed, confidence: 0, source: 'full-page' };
      }
      if (!bestResult || countFields(parsed) > countFields(bestResult.parsed)) {
        bestResult = { parsed, confidence: 0, source: 'full-page' };
      }
    }

    return bestResult;
  }

  async processOne(imagePath) {
    const filename = path.basename(imagePath);
    this.results.total++;

    try {
      // Validate
      const validation = await validateImage(imagePath);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.error}`);
      }

      let parsed;
      let confidence;
      let rawText;

      if (this.gemini) {
        // Gemini Vision: send image directly, get structured JSON
        const result = await this.gemini.processPassport(imagePath);
        parsed = result;
        confidence = result.confidence;
        rawText = result.raw || '';
      } else {
        // Tesseract: preprocess + MRZ extraction
        const preprocessedPath = await preprocess(imagePath, this.preprocessedDir);
        const ocrResult = await this.ocr.recognize(preprocessedPath);
        confidence = ocrResult.confidence;
        rawText = ocrResult.text;

        const mrzResult = await this.extractBestMrz(imagePath, ocrResult.text);
        if (!mrzResult) {
          throw new Error('MRZ lines not found in any OCR pass');
        }
        parsed = mrzResult.parsed;
        if (!parsed.valid && parsed.error) {
          throw new Error(`MRZ parse error: ${parsed.error}`);
        }
      }

      // Store to CSV
      const record = await this.db.appendRecord({
        filename,
        passport_number: parsed.passportNumber,
        surname: parsed.surname,
        given_names: parsed.givenNames,
        date_of_birth: parsed.dateOfBirth,
        expiry_date: parsed.expiryDate,
        nationality: parsed.nationality,
        sex: parsed.sex,
        issuing_country: parsed.issuingCountry,
        mrz_valid: parsed.valid,
        ocr_confidence: Math.round(confidence),
        raw_text: rawText.replace(/\n/g, '\\n'),
        status: 'SUCCESS',
        error_message: '',
      });

      this.results.success++;
      this.results.confidences.push(confidence);
      return { status: 'SUCCESS', filename, record };
    } catch (err) {
      try {
        await this.db.appendRecord({
          filename,
          passport_number: '',
          surname: '',
          given_names: '',
          date_of_birth: '',
          expiry_date: '',
          nationality: '',
          sex: '',
          issuing_country: '',
          mrz_valid: false,
          ocr_confidence: 0,
          raw_text: '',
          status: 'ERROR',
          error_message: err.message,
        });
      } catch (dbErr) {
        console.error(`Warning: failed to log error to CSV: ${dbErr.message}`);
      }

      this.results.failed++;
      return { status: 'ERROR', filename, error: err.message };
    }
  }

  async processAll() {
    const images = await this.scanDirectory();
    this.results.total = images.length;

    if (images.length === 0) {
      console.log('No images found in input directory.');
      return [];
    }

    console.log(`Found ${images.length} image(s) to process.\n`);

    const results = [];
    for (let i = 0; i < images.length; i++) {
      const filename = path.basename(images[i]);
      process.stdout.write(`[${i + 1}/${images.length}] Processing ${filename}... `);

      const result = await this.processOne(images[i]);

      if (result.status === 'SUCCESS') {
        const conf = Math.round(this.results.confidences.at(-1));
        const valid = result.record?.mrz_valid ? 'VALID' : 'PARTIAL';
        console.log(`${valid} (confidence: ${conf}%)`);
      } else {
        console.log(`ERROR: ${result.error}`);
      }

      results.push(result);
    }

    return results;
  }

  generateReport() {
    const avgConf =
      this.results.confidences.length > 0
        ? Math.round(
            this.results.confidences.reduce((a, b) => a + b, 0) /
              this.results.confidences.length,
          )
        : 0;

    return [
      '',
      '=== Scan Report ===',
      `Total:      ${this.results.total}`,
      `Success:    ${this.results.success}`,
      `Failed:     ${this.results.failed}`,
      `Avg Confidence: ${avgConf}%`,
      `CSV Output: ${this.csvPath}`,
      '===================',
    ].join('\n');
  }

  async shutdown() {
    if (this.gemini) await this.gemini.shutdown();
    if (this.ocr) await this.ocr.shutdown();
  }
}

/** Count non-empty fields in a parsed MRZ result. */
function countFields(parsed) {
  if (!parsed) return 0;
  let count = 0;
  if (parsed.passportNumber) count++;
  if (parsed.surname) count++;
  if (parsed.givenNames) count++;
  if (parsed.dateOfBirth) count++;
  if (parsed.expiryDate) count++;
  if (parsed.nationality) count++;
  return count;
}
