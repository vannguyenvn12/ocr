import { readdir } from 'fs/promises';
import path from 'path';
import { validateImage } from './utils/image-validator.js';
import { preprocess } from './image-preprocessor.js';
import { OcrEngine } from './ocr-engine.js';
import { extractMrzLines, parseMrz } from './mrz-parser.js';
import { CsvDatabase } from './csv-database.js';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif'];

export class PassportScanner {
  constructor(inputDir, outputDir) {
    this.inputDir = inputDir;
    this.outputDir = outputDir;
    this.preprocessedDir = path.join(outputDir, 'preprocessed');
    this.csvPath = path.join(outputDir, 'passports.csv');
    this.ocr = new OcrEngine();
    this.db = new CsvDatabase(this.csvPath);
    this.results = { total: 0, success: 0, failed: 0, confidences: [] };
  }

  async initialize() {
    await this.ocr.initialize();
    await this.db.initialize();
  }

  async scanDirectory() {
    const entries = await readdir(this.inputDir);
    return entries
      .filter((f) => IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase()))
      .map((f) => path.join(this.inputDir, f));
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

      // Preprocess
      const preprocessedPath = await preprocess(imagePath, this.preprocessedDir);

      // OCR full page
      const ocrResult = await this.ocr.recognize(preprocessedPath);

      // Extract and parse MRZ
      const mrzLines = extractMrzLines(ocrResult.text);
      if (!mrzLines) {
        throw new Error('MRZ lines not found in OCR output');
      }

      const parsed = parseMrz(mrzLines);
      if (!parsed.valid && parsed.error) {
        throw new Error(`MRZ parse error: ${parsed.error}`);
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
        ocr_confidence: Math.round(ocrResult.confidence),
        raw_text: ocrResult.text.replace(/\n/g, '\\n'),
        status: 'SUCCESS',
        error_message: '',
      });

      this.results.success++;
      this.results.confidences.push(ocrResult.confidence);
      return { status: 'SUCCESS', filename, record };
    } catch (err) {
      // Store error to CSV
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
        console.log(`SUCCESS (confidence: ${Math.round(this.results.confidences.at(-1))}%)`);
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
    await this.ocr.shutdown();
  }
}
