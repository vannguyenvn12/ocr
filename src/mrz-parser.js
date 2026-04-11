import { parse } from 'mrz';

const OCR_SUBSTITUTIONS = {
  O: '0',
  I: '1',
  B: '8',
  S: '5',
  G: '6',
};

/**
 * Extract MRZ lines from full-page OCR text.
 * MRZ lines are >= 30 chars and contain '<'.
 */
export function extractMrzLines(ocrText) {
  const lines = ocrText
    .split('\n')
    .map((l) => l.replace(/\s/g, '').toUpperCase())
    .filter((l) => l.length >= 30 && l.includes('<'));

  if (lines.length < 2) {
    return null;
  }

  // Take last 2 qualifying lines (MRZ is at bottom of passport)
  const mrzLines = lines.slice(-2);

  // Normalize to 44 chars (TD3 passport format)
  return mrzLines.map((line) => {
    if (line.length < 44) return line.padEnd(44, '<');
    if (line.length > 44) return line.slice(0, 44);
    return line;
  });
}

/**
 * Fix common OCR substitution errors in MRZ text.
 * Only apply substitutions in digit-expected positions.
 */
export function fixOcrErrors(mrzLine) {
  // In MRZ, positions with numbers are well-defined,
  // but a simpler approach: fix known confusions contextually
  let fixed = mrzLine;
  // Replace letters that look like digits only when surrounded by digits or '<'
  for (const [letter, digit] of Object.entries(OCR_SUBSTITUTIONS)) {
    // Replace letter with digit when between digits/chevrons
    fixed = fixed.replace(
      new RegExp(`(?<=[0-9<])${letter}(?=[0-9<])`, 'g'),
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
    const cleaned = mrzLines.map(fixOcrErrors);
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
