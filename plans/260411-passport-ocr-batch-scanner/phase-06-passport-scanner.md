# Phase 6: Passport Scanner Orchestrator

**Priority:** High | **Effort:** 30min | **Status:** completed

## Overview
Main pipeline orchestrating: folder scan → preprocess → OCR → MRZ parse → CSV store.

## Related Files
- Create: `src/passport-scanner.js`

## Implementation Steps

1. `PassportScanner` class:
   - `constructor(inputDir, outputDir)` → configure paths
   - `scanDirectory()` → list all image files in input dir
   - `processOne(imagePath)` → full pipeline for single image
   - `processAll()` → iterate all images, collect results
   - `generateReport()` → summary: total, success, failed, avg confidence
2. Pipeline per image:
   ```
   validate → preprocess → OCR full page → extract MRZ → parse MRZ → store CSV
   ```
3. Error handling: continue on failure, log error to CSV, don't stop batch
4. Console progress: `[3/15] Processing passport_003.jpg... SUCCESS (confidence: 92%)`
5. Final summary report printed to console

## Success Criteria
- Processes entire folder without stopping on errors
- Each result (success or error) stored in CSV
- Summary report shows total/success/failed counts
