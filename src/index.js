#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import { PassportScanner } from './passport-scanner.js';
import { CsvDatabase } from './csv-database.js';

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
  .action(async (opts) => {
    const inputDir = path.resolve(opts.input);
    const outputDir = path.resolve(opts.output);

    const scanner = new PassportScanner(inputDir, outputDir);

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

program.parse();
