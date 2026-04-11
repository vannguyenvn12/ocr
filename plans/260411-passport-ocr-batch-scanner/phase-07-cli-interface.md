# Phase 7: CLI Interface

**Priority:** Medium | **Effort:** 15min | **Status:** completed

## Overview
Commander-based CLI for running the passport scanner.

## Related Files
- Create: `src/index.js`

## Implementation Steps

1. CLI commands:
   - `node src/index.js scan --input ./input --output ./output` → batch scan
   - `node src/index.js scan --input ./input --output ./output --file passport.jpg` → single file
   - `node src/index.js report --output ./output` → show CSV summary
2. Options:
   - `--input, -i` → input directory (default: `./input`)
   - `--output, -o` → output directory (default: `./output`)
   - `--file, -f` → single file mode
3. Add `bin` field to package.json for `npx passport-ocr` usage

## Success Criteria
- `node src/index.js scan -i ./input` processes all images
- `--help` shows usage
- Exit code 0 on success, 1 on failure
