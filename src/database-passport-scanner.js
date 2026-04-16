import path from 'path';
import { unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { validateImage } from './utils/image-validator.js';
import { GeminiOcrEngine } from './gemini-ocr-engine.js';
import { GoogleDriveClient } from './google-drive-client.js';
import { MysqlPassportSource } from './mysql-passport-source.js';

/**
 * Scans passports from MySQL + Google Drive instead of local directory.
 * Flow: MySQL (paths) → Google Drive (download) → Gemini OCR → MySQL (results)
 */
export class DatabasePassportScanner {
  constructor(options = {}) {
    this.geminiModel = options.geminiModel || 'gemini-2.5-flash';
    this.credentialsPath = options.credentialsPath || './credentials.json';
    this.tempDir = options.tempDir || './temp';
    this.limit = options.limit || 100;

    this.gemini = new GeminiOcrEngine(process.env.GEMINI_API_KEY, this.geminiModel);
    this.drive = new GoogleDriveClient(this.credentialsPath);
    this.mysql = new MysqlPassportSource(options.sourceDb, options.sharedDb);

    this.results = { total: 0, success: 0, failed: 0, confidences: [] };
  }

  async initialize() {
    await this.gemini.initialize();
    await this.drive.initialize();
    await this.mysql.initialize();
    if (!existsSync(this.tempDir)) await mkdir(this.tempDir, { recursive: true });
  }

  async processAll() {
    const tasks = await this.mysql.fetchPendingPassports(this.limit);
    this.results.total = tasks.length;

    if (tasks.length === 0) {
      console.log('No pending passports to process.');
      return [];
    }

    console.log(`Found ${tasks.length} pending passport(s) to process.\n`);

    const results = [];
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const label = `${task.ticketId} [${task.type.toUpperCase()}]`;
      process.stdout.write(`[${i + 1}/${tasks.length}] ${label} ... `);

      const result = await this.processOneTask(task);
      results.push(result);

      if (result.status === 'SUCCESS') {
        console.log(`OK (confidence: ${result.confidence}%)`);
      } else {
        console.log(`ERROR: ${result.error}`);
      }
    }

    return results;
  }

  async processOneTask(task) {
    let tempFile = null;
    try {
      // Download from Google Drive
      tempFile = await this.drive.downloadByPath(task.path, this.tempDir);

      // Validate image
      const validation = await validateImage(tempFile);
      if (!validation.valid) throw new Error(`Validation: ${validation.error}`);

      // OCR via Gemini
      const parsed = await this.gemini.processPassport(tempFile);

      // Insert result to shared DB
      await this.mysql.insertResult({
        ticketId: task.ticketId,
        passportType: task.type,
        sourcePath: task.path,
        passportNumber: parsed.passportNumber,
        surname: parsed.surname,
        givenNames: parsed.givenNames,
        dateOfBirth: parsed.dateOfBirth || null,
        expiryDate: parsed.expiryDate || null,
        nationality: parsed.nationality,
        sex: parsed.sex,
        issuingCountry: parsed.issuingCountry,
        mrzLine1: parsed.mrzLine1,
        mrzLine2: parsed.mrzLine2,
        mrzValid: parsed.valid,
        ocrConfidence: Math.round(parsed.confidence),
        status: 'SUCCESS',
        errorMessage: null,
      });

      this.results.success++;
      this.results.confidences.push(parsed.confidence);
      return { status: 'SUCCESS', ticketId: task.ticketId, type: task.type, confidence: Math.round(parsed.confidence) };
    } catch (err) {
      // Log error to DB
      try {
        await this.mysql.insertResult({
          ticketId: task.ticketId,
          passportType: task.type,
          sourcePath: task.path,
          status: 'ERROR',
          errorMessage: err.message,
          ocrConfidence: 0,
          mrzValid: false,
        });
      } catch (dbErr) {
        console.error(`\n  Warning: failed to log error to DB: ${dbErr.message}`);
      }

      this.results.failed++;
      return { status: 'ERROR', ticketId: task.ticketId, type: task.type, error: err.message };
    } finally {
      // Cleanup temp file
      if (tempFile) {
        try { await unlink(tempFile); } catch { /* ignore */ }
      }
    }
  }

  generateReport() {
    const avgConf = this.results.confidences.length > 0
      ? Math.round(this.results.confidences.reduce((a, b) => a + b, 0) / this.results.confidences.length)
      : 0;

    return [
      '',
      '=== Database Scan Report ===',
      `Total:      ${this.results.total}`,
      `Success:    ${this.results.success}`,
      `Failed:     ${this.results.failed}`,
      `Avg Confidence: ${avgConf}%`,
      '============================',
    ].join('\n');
  }

  async shutdown() {
    await this.gemini.shutdown();
    await this.mysql.shutdown();
  }
}
