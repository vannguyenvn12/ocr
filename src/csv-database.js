import { createObjectCsvWriter } from 'csv-writer';
import { readFile, access } from 'fs/promises';
import AsyncLock from 'async-lock';

const CSV_HEADERS = [
  { id: 'id', title: 'id' },
  { id: 'filename', title: 'filename' },
  { id: 'passport_number', title: 'passport_number' },
  { id: 'surname', title: 'surname' },
  { id: 'given_names', title: 'given_names' },
  { id: 'date_of_birth', title: 'date_of_birth' },
  { id: 'expiry_date', title: 'expiry_date' },
  { id: 'nationality', title: 'nationality' },
  { id: 'sex', title: 'sex' },
  { id: 'issuing_country', title: 'issuing_country' },
  { id: 'mrz_valid', title: 'mrz_valid' },
  { id: 'ocr_confidence', title: 'ocr_confidence' },
  { id: 'raw_text', title: 'raw_text' },
  { id: 'status', title: 'status' },
  { id: 'error_message', title: 'error_message' },
  { id: 'processed_at', title: 'processed_at' },
];

/**
 * Sanitize a value to prevent CSV formula injection.
 * Prefixes dangerous chars with single quote.
 */
function sanitizeCsvValue(value) {
  if (typeof value !== 'string') return value;
  if (/^[=+\-@\t\r]/.test(value)) return `'${value}`;
  return value;
}

export class CsvDatabase {
  constructor(filePath) {
    this.filePath = filePath;
    this.lock = new AsyncLock();
    this.nextId = 1;
  }

  async initialize() {
    try {
      await access(this.filePath);
      // File exists, count records to set nextId
      const records = await this.getAllRecords();
      const maxId = records.reduce((max, r) => Math.max(max, parseInt(r.id, 10) || 0), 0);
      this.nextId = maxId + 1;
    } catch {
      // File doesn't exist, create with headers
      const writer = createObjectCsvWriter({
        path: this.filePath,
        header: CSV_HEADERS,
      });
      await writer.writeRecords([]);
    }
  }

  async appendRecord(data) {
    return this.lock.acquire('csv-write', async () => {
      const record = {
        id: this.nextId++,
        ...Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, sanitizeCsvValue(v)]),
        ),
        processed_at: new Date().toISOString(),
      };

      const writer = createObjectCsvWriter({
        path: this.filePath,
        header: CSV_HEADERS,
        append: true,
      });

      await writer.writeRecords([record]);
      return record;
    });
  }

  async getAllRecords() {
    try {
      const content = await readFile(this.filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      if (lines.length <= 1) return [];

      const headers = parseCsvLine(lines[0]);
      return lines.slice(1).map((line) => {
        const values = parseCsvLine(line);
        const record = {};
        headers.forEach((h, i) => {
          record[h] = values[i] || '';
        });
        return record;
      });
    } catch {
      return [];
    }
  }

  async findByPassportNumber(number) {
    const records = await this.getAllRecords();
    return records.find((r) => r.passport_number === number) || null;
  }
}

/**
 * Parse a single CSV line respecting quoted fields.
 */
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
