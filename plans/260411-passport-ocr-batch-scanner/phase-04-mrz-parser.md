# Phase 4: MRZ Parser

**Priority:** High | **Effort:** 20min | **Status:** completed

## Overview
Extract MRZ lines from OCR text and parse using `mrz` package.

## Related Files
- Create: `src/mrz-parser.js`

## Implementation Steps

1. `extractMrzLines(ocrText)`:
   - Filter lines >= 30 chars containing `<` character
   - Take last 2 qualifying lines (MRZ is at bottom of passport)
   - Pad/trim to exactly 44 chars
   - Clean OCR artifacts (O→0, I→1 common mistakes in MRZ)
2. `parseMrz(mrzLines)`:
   - Use `mrz` package `parse()` function
   - Return structured data: surname, given_names, passport_number, dob, expiry, nationality, sex, issuing_country
   - Include validation status (checksum pass/fail)
3. `formatDate(yymmdd)` → convert to YYYY-MM-DD

## Key Insights
- OCR commonly confuses: O↔0, I↔1, B↔8, S↔5 in MRZ zone
- MRZ uses `<` as filler, never appears in biographical text
- Line length 44 chars for TD3 (passport), 36 chars for TD1/TD2 (ID cards)

## Success Criteria
- Correctly parses valid MRZ text
- Handles common OCR substitution errors
- Returns clear error when MRZ not found or invalid
