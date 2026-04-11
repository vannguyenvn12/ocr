# Phase 3: OCR Engine

**Priority:** High | **Effort:** 30min | **Status:** completed

## Overview
Tesseract.js wrapper for text extraction from preprocessed passport images.

## Requirements
- Single worker (sequential processing for MVP)
- Language: `eng` (MRZ is always Latin)
- Return full text + confidence score
- PSM 6 (uniform block) for best passport results

## Related Files
- Create: `src/ocr-engine.js`

## Implementation Steps

1. Create `OcrEngine` class:
   - `initialize()` → create and configure Tesseract worker
   - `recognize(imagePath)` → return `{ text, confidence, words }`
   - `shutdown()` → terminate worker
2. Configure OCR params: `psm: 6`, `oem: 1` (LSTM)
3. Add progress logging
4. Handle worker crashes gracefully

## Key Insights
- Worker must be initialized once and reused (expensive to create)
- MRZ whitelist `ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<` only for MRZ region, full charset for visual zone
- Two-pass approach: first pass full page, second pass MRZ region only with whitelist

## Success Criteria
- OCR extracts readable text from preprocessed passport images
- Confidence score returned for each image
- Worker properly cleaned up on shutdown
