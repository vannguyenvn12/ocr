# Phase 2: Image Preprocessing

**Priority:** High | **Effort:** 30min | **Status:** completed

## Overview
Sharp-based pipeline to optimize passport images for OCR accuracy.

## Requirements
- Resize to minimum 1200px width
- Convert to grayscale
- Normalize contrast
- Sharpen text edges
- Validate image quality before processing

## Related Files
- Create: `src/image-preprocessor.js`
- Create: `src/utils/image-validator.js`

## Implementation Steps

1. **image-validator.js**: Check resolution (min 800x600), format (jpg/png/bmp/tiff), file size
2. **image-preprocessor.js**:
   - `preprocess(inputPath, outputPath)` → Sharp pipeline: resize → grayscale → normalize → sharpen → median filter
   - Return preprocessed image path
3. Handle errors: corrupted files, unsupported formats

## Success Criteria
- Preprocessed images are grayscale, sharpened, normalized
- Invalid images return clear error messages
- Supports jpg, png, bmp, tiff input formats
