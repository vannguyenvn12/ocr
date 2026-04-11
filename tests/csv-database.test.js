import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CsvDatabase } from '../src/csv-database.js';
import { unlink, mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

describe('CsvDatabase', () => {
  let db;
  let tmpDir;
  let csvPath;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'csv-test-'));
    csvPath = path.join(tmpDir, 'test.csv');
    db = new CsvDatabase(csvPath);
    await db.initialize();
  });

  afterEach(async () => {
    try {
      await unlink(csvPath);
    } catch {}
  });

  it('creates CSV file with headers on init', async () => {
    const records = await db.getAllRecords();
    expect(records).toHaveLength(0);
  });

  it('appends a record with auto-increment id', async () => {
    await db.appendRecord({
      filename: 'test.jpg',
      passport_number: 'AB123456',
      surname: 'DOE',
      given_names: 'JOHN',
      date_of_birth: '1990-01-15',
      expiry_date: '2030-01-15',
      nationality: 'USA',
      sex: 'M',
      issuing_country: 'USA',
      mrz_valid: true,
      ocr_confidence: 95,
      raw_text: 'sample text',
      status: 'SUCCESS',
      error_message: '',
    });

    const records = await db.getAllRecords();
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe('1');
    expect(records[0].surname).toBe('DOE');
  });

  it('appends multiple records with incrementing ids', async () => {
    await db.appendRecord({ filename: 'a.jpg', passport_number: 'A1', surname: 'A', given_names: '', date_of_birth: '', expiry_date: '', nationality: '', sex: '', issuing_country: '', mrz_valid: true, ocr_confidence: 90, raw_text: '', status: 'SUCCESS', error_message: '' });
    await db.appendRecord({ filename: 'b.jpg', passport_number: 'B2', surname: 'B', given_names: '', date_of_birth: '', expiry_date: '', nationality: '', sex: '', issuing_country: '', mrz_valid: true, ocr_confidence: 85, raw_text: '', status: 'SUCCESS', error_message: '' });

    const records = await db.getAllRecords();
    expect(records).toHaveLength(2);
    expect(records[1].id).toBe('2');
  });

  it('finds record by passport number', async () => {
    await db.appendRecord({ filename: 'test.jpg', passport_number: 'XY789', surname: 'SMITH', given_names: 'JANE', date_of_birth: '', expiry_date: '', nationality: '', sex: '', issuing_country: '', mrz_valid: true, ocr_confidence: 88, raw_text: '', status: 'SUCCESS', error_message: '' });

    const found = await db.findByPassportNumber('XY789');
    expect(found).not.toBeNull();
    expect(found.surname).toBe('SMITH');

    const notFound = await db.findByPassportNumber('NOPE');
    expect(notFound).toBeNull();
  });
});
