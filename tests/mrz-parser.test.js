import { describe, it, expect } from 'vitest';
import { extractMrzLines, parseMrz, formatMrzDate, fixOcrErrors } from '../src/mrz-parser.js';

describe('extractMrzLines', () => {
  it('extracts 2 MRZ lines from passport OCR text', () => {
    const text = [
      'UNITED STATES OF AMERICA',
      'PASSPORT',
      'Surname: SMITH',
      'Given names: JOHN',
      'P<USASMITH<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<',
      '0123456789USA8001014M2501011<<<<<<<<<<<<<<04',
    ].join('\n');

    const lines = extractMrzLines(text);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveLength(44);
    expect(lines[1]).toHaveLength(44);
    expect(lines[0]).toContain('SMITH');
  });

  it('returns null when no MRZ found', () => {
    expect(extractMrzLines('just some random text')).toBeNull();
  });

  it('returns null with only one qualifying line', () => {
    const text = 'P<USASMITH<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<';
    expect(extractMrzLines(text)).toBeNull();
  });

  it('pads short lines to 44 chars', () => {
    const text = [
      'P<USASMITH<<JOHN<<<<<<<<<<<<<<<<<',
      '0123456789USA8001014M250101<<<<<<',
    ].join('\n');

    const lines = extractMrzLines(text);
    expect(lines).not.toBeNull();
    expect(lines[0]).toHaveLength(44);
    expect(lines[1]).toHaveLength(44);
  });
});

describe('fixOcrErrors', () => {
  it('fixes O to 0 between digits', () => {
    expect(fixOcrErrors('1O2')).toBe('102');
  });

  it('does not change O in names', () => {
    expect(fixOcrErrors('JOHN')).toBe('JOHN');
  });
});

describe('formatMrzDate', () => {
  it('converts YYMMDD to YYYY-MM-DD (2000s)', () => {
    expect(formatMrzDate('250101')).toBe('2025-01-01');
  });

  it('converts YYMMDD to YYYY-MM-DD (1900s)', () => {
    expect(formatMrzDate('800812')).toBe('1980-08-12');
  });

  it('returns empty for invalid input', () => {
    expect(formatMrzDate('')).toBe('');
    expect(formatMrzDate(null)).toBe('');
  });
});

describe('parseMrz', () => {
  it('parses valid TD3 passport MRZ', () => {
    const lines = [
      'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
      'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
    ];

    const result = parseMrz(lines);
    expect(result.surname).toBe('ERIKSSON');
    expect(result.givenNames).toBe('ANNA MARIA');
    expect(result.passportNumber).toBe('L898902C3');
    expect(result.sex).toBe('F');
  });

  it('returns error for invalid MRZ', () => {
    const result = parseMrz(['INVALID<<<<', 'ALSO_INVALID']);
    expect(result.valid).toBe(false);
  });
});
