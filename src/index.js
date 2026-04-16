#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import path from 'path';
import { PassportScanner } from './passport-scanner.js';
import { CsvDatabase } from './csv-database.js';
import { DatabasePassportScanner } from './database-passport-scanner.js';

const program = new Command();

program
  .name('passport-ocr')
  .description('Batch scan passport images and extract data via OCR + MRZ parsing')
  .version('1.0.0');

program
  .command('scan')
  .description('Scan passport images from input directory')
  .option('-i, --input <dir>', 'Input directory with passport images', './input')
  .option('-o, --output <dir>', 'Output directory for results', './output')
  .option('-f, --file <filename>', 'Process single file only')
  .option('-e, --engine <type>', 'OCR engine: gemini or tesseract', 'tesseract')
  .option('-m, --model <name>', 'Gemini model name', 'gemini-2.5-flash')
  .action(async (opts) => {
    const inputDir = path.resolve(opts.input);
    const outputDir = path.resolve(opts.output);

    if (opts.engine === 'gemini' && !process.env.GEMINI_API_KEY) {
      console.error('Error: GEMINI_API_KEY environment variable is required for Gemini engine.');
      console.error('Set it with: export GEMINI_API_KEY=your_key_here');
      process.exit(1);
    }

    const scanner = new PassportScanner(inputDir, outputDir, {
      engine: opts.engine,
      geminiModel: opts.model,
    });

    try {
      await scanner.initialize();

      if (opts.file) {
        const filePath = path.join(inputDir, opts.file);
        const resolved = path.resolve(filePath);
        if (!resolved.startsWith(path.resolve(inputDir) + path.sep)) {
          console.error('Error: file must be inside input directory');
          process.exit(1);
        }
        console.log(`Processing single file: ${opts.file}\n`);
        const result = await scanner.processOne(filePath);
        console.log(
          result.status === 'SUCCESS'
            ? `SUCCESS (confidence: ${result.record.ocr_confidence}%)`
            : `ERROR: ${result.error}`,
        );
      } else {
        await scanner.processAll();
      }

      console.log(scanner.generateReport());
    } catch (err) {
      console.error(`Fatal error: ${err.message}`);
      process.exit(1);
    } finally {
      await scanner.shutdown();
    }
  });

program
  .command('report')
  .description('Show CSV summary report')
  .option('-o, --output <dir>', 'Output directory', './output')
  .action(async (opts) => {
    const csvPath = path.join(path.resolve(opts.output), 'passports.csv');
    const db = new CsvDatabase(csvPath);

    try {
      const records = await db.getAllRecords();
      if (records.length === 0) {
        console.log('No records found.');
        return;
      }

      const success = records.filter((r) => r.status === 'SUCCESS').length;
      const failed = records.filter((r) => r.status === 'ERROR').length;

      console.log(`\nTotal records: ${records.length}`);
      console.log(`Success: ${success}`);
      console.log(`Failed: ${failed}`);
      console.log('\nRecent entries:');

      records.slice(-5).forEach((r) => {
        console.log(
          `  ${r.id}. ${r.filename} - ${r.status} ${r.status === 'SUCCESS' ? `(${r.surname}, ${r.given_names})` : `(${r.error_message})`}`,
        );
      });
    } catch (err) {
      console.error(`Error reading CSV: ${err.message}`);
      process.exit(1);
    }
  });

function parseMysqlUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || '3306', 10),
    user: u.username,
    password: decodeURIComponent(u.password),
    database: u.pathname.replace('/', ''),
  };
}

program
  .command('scan-db')
  .description('Scan passports from MySQL + Google Drive')
  .option('-m, --model <name>', 'Gemini model name', 'gemini-2.5-flash')
  .option('-l, --limit <n>', 'Max passports to process', '100')
  .option('-c, --credentials <path>', 'Google service account JSON', './credentials.json')
  .action(async (opts) => {
    const { GEMINI_API_KEY, SOURCE_DATABASE_URL, SHARED_DATABASE_URL } = process.env;

    if (!GEMINI_API_KEY) { console.error('Error: GEMINI_API_KEY required in .env'); process.exit(1); }
    if (!SOURCE_DATABASE_URL) { console.error('Error: SOURCE_DATABASE_URL required in .env'); process.exit(1); }
    if (!SHARED_DATABASE_URL) { console.error('Error: SHARED_DATABASE_URL required in .env'); process.exit(1); }

    const scanner = new DatabasePassportScanner({
      geminiModel: opts.model,
      credentialsPath: path.resolve(opts.credentials),
      limit: parseInt(opts.limit, 10),
      sourceDb: parseMysqlUrl(SOURCE_DATABASE_URL),
      sharedDb: parseMysqlUrl(SHARED_DATABASE_URL),
    });

    try {
      await scanner.initialize();
      await scanner.processAll();
      console.log(scanner.generateReport());
    } catch (err) {
      console.error(`Fatal error: ${err.message}`);
      process.exit(1);
    } finally {
      await scanner.shutdown();
    }
  });

program.parse();
