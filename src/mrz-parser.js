import { parse } from 'mrz';

/**
 * Extract MRZ lines from full-page OCR text.
 * MRZ lines are >= 30 chars and contain '<'.
 * Also detects lines where '<' was misread as K/L.
 */
export function extractMrzLines(ocrText) {
  const lines = ocrText
    .split('\n')
    .map((l) => l.replace(/\s/g, '').toUpperCase())
    .filter((l) => l.length >= 30);

  // Find lines that look like MRZ: contain '<' OR have many repeated K/L
  const mrzCandidates = lines.filter((l) => {
    if (l.includes('<')) return true;
    const klRuns = l.match(/[KL]{3,}/g);
    return klRuns && klRuns.some((run) => run.length >= 3);
  });

  if (mrzCandidates.length < 2) {
    return null;
  }

  // Take last 2 qualifying lines (MRZ is at bottom of passport)
  const raw = mrzCandidates.slice(-2);

  // Line 1 (names): aggressive cleanup — S/K/L likely misread '<'
  // Line 2 (data): conservative cleanup
  const mrzLines = [
    cleanMrzLine(raw[0], true),
    cleanMrzLine(raw[1], false),
  ];

  // Apply structure-aware fixes using known TD3 positions
  const fixed = fixByStructure(mrzLines);

  // Normalize to 44 chars
  return fixed.map((line) => {
    if (line.length < 44) return line.padEnd(44, '<');
    if (line.length > 44) return line.slice(0, 44);
    return line;
  });
}

/**
 * Clean a raw MRZ line — fix common OCR misreads of '<'.
 */
function cleanMrzLine(line, isNameLine) {
  // Replace K/L in runs of 2+ with <
  let cleaned = line.replace(/[KL]{2,}/g, (match) => '<'.repeat(match.length));

  if (isNameLine) {
    // SS between letters → << (double chevron separator)
    cleaned = cleaned.replace(/(?<=[A-Z])SS(?=[A-Z])/g, '<<');
    // Single S adjacent to < → < (misread separator)
    cleaned = cleaned.replace(/(?<=<)S(?=[A-Z])/g, '<');
    cleaned = cleaned.replace(/(?<=[A-Z])S(?=<)/g, '<');
    // Single S between two name-length segments (4+ letters each side)
    cleaned = cleaned.replace(/(?<=[A-Z]{4})S(?=[A-Z]{4})/g, '<');
  }

  // Replace isolated K/L/S adjacent to <
  cleaned = cleaned.replace(/(?<=<)[KLS]/g, '<');
  cleaned = cleaned.replace(/[KLS](?=<)/g, '<');
  cleaned = cleaned.replace(/[KL]+$/g, (match) => '<'.repeat(match.length));

  return cleaned;
}

/**
 * Fix OCR errors using known TD3 MRZ structure.
 * TD3 Line 1: P<ISSNAME<<GIVEN<NAMES<<<...  (44 chars)
 * TD3 Line 2: DOCNUM____CNATYYMMDDCSGENDERYYMMDDCPERSONAL_____C (44 chars)
 *             positions: 0-8 doc#, 9 check, 10-12 nationality, 13-18 DOB, 19 check,
 *             20 sex, 21-26 expiry, 27 check, 28-41 personal, 42 check, 43 composite
 */
function fixByStructure(lines) {
  let [line1, line2] = lines;

  // Line 1: position 0 must be P (passport), position 1 must be <
  if (line1.length >= 2) {
    line1 = 'P<' + line1.slice(2);
  }

  // Line 1: clean trailing single noise chars before filler (e.g., THATI<<<→THAT<<<)
  line1 = line1.replace(/([A-Z]{3,})[A-Z](<{3,})/, (_, word, fillers) => {
    return word + '<' + fillers;
  });

  // Line 2: known digit positions vs letter positions
  if (line2.length >= 44) {
    const chars = line2.split('');

    // Position 9: check digit (must be digit)
    chars[9] = toDigit(chars[9]);
    // Positions 10-12: nationality (must be letters)
    for (let i = 10; i <= 12; i++) chars[i] = toLetter(chars[i]);
    // Positions 13-18: DOB YYMMDD (must be digits)
    for (let i = 13; i <= 18; i++) chars[i] = toDigit(chars[i]);
    // Position 19: check digit
    chars[19] = toDigit(chars[19]);
    // Position 20: sex M/F/<
    // Positions 21-26: expiry YYMMDD (must be digits)
    for (let i = 21; i <= 26; i++) chars[i] = toDigit(chars[i]);
    // Position 27: check digit
    chars[27] = toDigit(chars[27]);
    // Position 42: check digit
    chars[42] = toDigit(chars[42]);
    // Position 43: composite check digit
    chars[43] = toDigit(chars[43]);

    line2 = chars.join('');
  }

  return [line1, line2];
}

const DIGIT_MAP = { O: '0', I: '1', B: '8', S: '5', G: '6', Z: '2', Q: '0' };
const LETTER_MAP = { '0': 'O', '1': 'I', '8': 'B', '5': 'S', '6': 'G', '2': 'Z' };

function toDigit(ch) {
  return DIGIT_MAP[ch] || ch;
}

function toLetter(ch) {
  return LETTER_MAP[ch] || ch;
}

/**
 * Fix common OCR substitution errors in MRZ text.
 * Apply substitutions when char is adjacent to digits or chevrons.
 */
export function fixOcrErrors(mrzLine) {
  let fixed = mrzLine;
  for (const [letter, digit] of Object.entries(DIGIT_MAP)) {
    // Replace letter→digit when next to a digit or chevron (either side)
    fixed = fixed.replace(
      new RegExp(`(?<=[0-9<])${letter}`, 'g'),
      digit,
    );
    fixed = fixed.replace(
      new RegExp(`${letter}(?=[0-9<])`, 'g'),
      digit,
    );
  }
  return fixed;
}

/**
 * Parse MRZ lines into structured passport data.
 */
export function parseMrz(mrzLines) {
  try {
    // Only apply digit fixes to line 2 (data); line 1 has names with O, I, etc.
    const cleaned = [mrzLines[0], fixOcrErrors(mrzLines[1])];
    const result = parse(cleaned);

    const f = result.fields;
    return {
      valid: result.valid,
      surname: f.lastName || '',
      givenNames: f.firstName || '',
      passportNumber: f.documentNumber || '',
      dateOfBirth: formatMrzDate(f.birthDate),
      expiryDate: formatMrzDate(f.expirationDate),
      nationality: f.nationality || f.issuingState || '',
      sex: f.sex === 'female' ? 'F' : f.sex === 'male' ? 'M' : '',
      issuingCountry: f.issuingState || '',
    };
  } catch (err) {
    return {
      valid: false,
      error: err.message,
    };
  }
}

/**
 * Convert MRZ date YYMMDD to YYYY-MM-DD.
 * Assumes: 00-30 = 2000-2030, 31-99 = 1931-1999.
 */
export function formatMrzDate(yymmdd) {
  if (!yymmdd || yymmdd.length !== 6) return '';
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  const century = yy <= 30 ? '20' : '19';
  return `${century}${yymmdd.slice(0, 2)}-${mm}-${dd}`;
}
