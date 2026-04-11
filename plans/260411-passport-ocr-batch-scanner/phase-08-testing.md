# Phase 8: Testing

**Priority:** Medium | **Effort:** 30min | **Status:** completed

## Overview
Unit tests for core modules using vitest.

## Related Files
- Create: `tests/image-validator.test.js`
- Create: `tests/mrz-parser.test.js`
- Create: `tests/csv-database.test.js`

## Implementation Steps

1. **mrz-parser.test.js**: Test MRZ extraction, parsing, OCR error correction, date formatting
2. **csv-database.test.js**: Test append, read, duplicate detection, CSV escaping
3. **image-validator.test.js**: Test format validation, resolution check
4. Use sample MRZ strings (not real passport data)

## Success Criteria
- All tests pass with `npm test`
- Core parsing logic covered
- Edge cases tested (invalid MRZ, corrupted images, empty folder)
