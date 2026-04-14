# Passport OCR Batch Scanner - Codebase Summary

## Executive Overview

**Project:** Passport OCR Batch Scanner
**Type:** Node.js CLI Tool
**Version:** 1.0.0
**Total LOC:** ~620 lines (core functionality)
**Key Features:** Batch OCR + MRZ parsing → CSV export
**Language:** JavaScript (ES2022)
**Module Type:** ES Modules

This document provides a high-level understanding of the codebase structure, key components, and how they interact.

---

## Project Statistics

| Metric | Value |
|--------|-------|
| Main Source Files | 7 |
| Utility Modules | 1 |
| Test Files | 5 |
| Documentation Files | 4 |
| Total Lines of Code | ~620 |
| Average Module Size | 88 LOC |
| Largest Module | PassportScanner (165 LOC) |
| Smallest Module | ImagePreprocessor (27 LOC) |
| Dependencies | 7 production, 1 dev |
| Node.js Version | 16+ (LTS) |

---

## Core Components

### 1. CLI Entry Point: `src/index.js`

**Purpose:** Parse command-line arguments and route to handlers
**Size:** 91 LOC
**Key Exports:** Program setup via Commander

**Commands:**
- `scan`: Batch or single-file processing
  - Options: `--input`, `--output`, `--file`
  - Routes to PassportScanner
- `report`: Display CSV summary
  - Options: `--output`
  - Routes to CsvDatabase.getAllRecords()

**Error Handling:**
- Path traversal validation for `--file` option
- Graceful shutdown on SIGTERM
- Exit code 1 on fatal errors

**Dependencies:**
- commander (CLI framework)
- passport-scanner.js (orchestrator)
- csv-database.js (report reading)

---

### 2. Main Orchestrator: `src/passport-scanner.js`

**Purpose:** Coordinate the full OCR pipeline and track statistics
**Size:** 165 LOC
**Key Exports:** `PassportScanner` class

**Public Methods:**
- `initialize()` – Set up OCR engine and CSV database
- `scanDirectory()` – List image files in input directory
- `processOne(imagePath)` – Run full pipeline on single image
- `processAll()` – Batch process all images
- `generateReport()` – Create summary with statistics
- `shutdown()` – Clean up OCR worker

**Processing Pipeline:**
1. Validate image (format, size, resolution)
2. Preprocess image (resize, grayscale, sharpen)
3. Run full-page OCR (Tesseract.js)
4. Extract MRZ lines from OCR text
5. Parse MRZ data and validate checksums
6. Write record to CSV (with async-lock)
7. Track statistics (success, failed, confidence)

**State Management:**
- Tracks: total, success, failed, confidence scores
- Maintains OCR engine and CSV database instances
- Generates human-readable report

**Dependencies:**
- fs/promises (directory scanning)
- path (file handling)
- image-validator.js (validation)
- image-preprocessor.js (preprocessing)
- ocr-engine.js (OCR)
- mrz-parser.js (MRZ parsing)
- csv-database.js (storage)

---

### 3. OCR Engine: `src/ocr-engine.js`

**Purpose:** Wrap Tesseract.js for text recognition
**Size:** 63 LOC
**Key Exports:** `OcrEngine` class

**Public Methods:**
- `initialize()` – Load English model, set segmentation mode
- `recognize(imagePath)` – Full-page OCR → `{text, confidence}`
- `recognizeMrz(imagePath, rectangle)` – Region-based OCR with character whitelist
- `shutdown()` – Terminate worker

**Configuration:**
- Language: English only (eng model)
- PSM Mode: 6 ("uniform block of text")
- Character whitelist for MRZ: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<"

**Performance:**
- Bottleneck: 800-1500 ms per image
- Memory: ~200 MB for worker

**Dependencies:**
- tesseract.js (OCR library)

---

### 4. Image Preprocessor: `src/image-preprocessor.js`

**Purpose:** Optimize images for OCR accuracy
**Size:** 27 LOC
**Key Exports:** `preprocess()` function

**Processing Pipeline:**
1. Resize to 1200px width (maintains aspect ratio)
2. Convert to grayscale
3. Normalize pixel values to full range
4. Sharpen with sigma 1.5
5. Median blur with radius 3
6. Output as PNG

**Configuration:**
- Target width: 1200 pixels
- Optimization reason: Reduces noise, enhances text clarity

**Output:**
- PNG file saved to `output/preprocessed/`

**Dependencies:**
- sharp (image processing)
- path (file naming)
- fs/promises (directory creation)

---

### 5. MRZ Parser: `src/mrz-parser.js`

**Purpose:** Extract, correct, and parse Machine Readable Zone data
**Size:** 95 LOC
**Key Exports:** 4 functions

**Functions:**

**extractMrzLines(ocrText)**
- Input: Raw OCR text from Tesseract
- Logic:
  - Split by newline, remove whitespace, uppercase
  - Filter lines ≥ 30 chars containing '<'
  - Take last 2 qualifying lines (MRZ at passport bottom)
  - Normalize to 44 chars (TD3 format)
- Output: `[line1, line2]` or `null`

**fixOcrErrors(mrzLine)**
- Input: Single MRZ line with possible OCR errors
- Logic: Context-aware letter→digit substitutions
  - O→0, I→1, B→8, S→5, G→6
  - Only in digit-expected positions (between digits/chevrons)
- Output: Corrected line

**parseMrz(mrzLines)**
- Input: Two MRZ lines
- Logic:
  - Fix OCR errors
  - Parse via mrz library (ICAO 9303 validation)
  - Extract: surname, given names, passport number, DOB, expiry, nationality, sex, issuing country
- Output: `{valid, surname, givenNames, passportNumber, dateOfBirth, expiryDate, nationality, sex, issuingCountry, error?}`

**formatMrzDate(yymmdd)**
- Input: MRZ date format (YYMMDD)
- Logic: Century conversion (00-30→20xx, 31-99→19xx)
- Output: YYYY-MM-DD ISO format

**Error Handling:**
- Returns `valid: false` and error message on parse failure
- Graceful degradation for malformed MRZ

**Dependencies:**
- mrz library (ICAO checksum validation)

---

### 6. CSV Database: `src/csv-database.js`

**Purpose:** Persist and retrieve passport data with thread-safe writes
**Size:** 132 LOC
**Key Exports:** `CsvDatabase` class

**CSV Schema (16 columns):**
1. id (auto-incremented)
2. filename
3. passport_number
4. surname
5. given_names
6. date_of_birth (YYYY-MM-DD)
7. expiry_date (YYYY-MM-DD)
8. nationality
9. sex (M/F)
10. issuing_country
11. mrz_valid (true/false)
12. ocr_confidence (0-100)
13. raw_text (full OCR, escaped newlines)
14. status (SUCCESS/ERROR)
15. error_message
16. processed_at (ISO 8601 UTC)

**Public Methods:**
- `initialize()` – Create file or count existing records
- `appendRecord(data)` – Async-locked append to CSV
- `getAllRecords()` – Parse CSV into objects
- `findByPassportNumber(number)` – Query by passport number

**Thread Safety:**
- Uses async-lock to serialize writes
- Prevents concurrent corruption

**Security:**
- CSV injection prevention: sanitizes dangerous prefixes
- Escapes quotes per RFC 4180

**Parsing:**
- Custom CSV line parser respecting quoted fields
- Handles escaped quotes

**Dependencies:**
- csv-writer (efficient writing)
- fs/promises (file I/O)
- async-lock (concurrency control)

---

### 7. Image Validator: `src/utils/image-validator.js`

**Purpose:** Validate image before processing
**Size:** 44 LOC
**Key Exports:** `validateImage()` function

**Validation Checks:**
1. **Format**: Whitelist [.jpg, .jpeg, .png, .bmp, .tiff, .tif]
2. **Resolution**: Minimum 800×600 pixels
3. **File Size**: Maximum 50 MB

**Output:**
- Success: `{valid: true, metadata: {...}}`
- Failure: `{valid: false, error: "description"}`

**Performance:**
- 10-50 ms per image (Sharp metadata read)

**Error Messages:**
- Clear, actionable (e.g., "Resolution 640x480 below minimum 800x600")

**Dependencies:**
- sharp (metadata extraction)
- path (extension checking)

---

## Dependency Tree

```
index.js
├── commander
├── PassportScanner
│   ├── image-validator
│   │   └── sharp
│   ├── image-preprocessor
│   │   └── sharp
│   ├── OcrEngine
│   │   └── tesseract.js
│   ├── mrz-parser
│   │   └── mrz
│   └── CsvDatabase
│       ├── csv-writer
│       ├── async-lock
│       └── fs/promises
└── CsvDatabase (for report command)
```

---

## Data Flow

### Batch Processing Flow

```
CLI scan command
    │
    ├─→ PassportScanner.initialize()
    │   ├─→ OcrEngine.initialize() [loads Tesseract model]
    │   └─→ CsvDatabase.initialize() [creates/counts CSV]
    │
    ├─→ PassportScanner.scanDirectory()
    │   └─→ Returns list of image files
    │
    ├─→ PassportScanner.processAll() [for each image]
    │   └─→ PassportScanner.processOne(imagePath)
    │       ├─→ validateImage(imagePath)
    │       │   └─→ Check format, resolution, size
    │       ├─→ preprocess(imagePath, outputDir)
    │       │   ├─→ Resize, grayscale, normalize, sharpen
    │       │   └─→ Save to preprocessed/
    │       ├─→ OcrEngine.recognize(preprocessedPath)
    │       │   └─→ {text, confidence}
    │       ├─→ extractMrzLines(ocrText)
    │       │   └─→ [line1, line2]
    │       ├─→ parseMrz(mrzLines)
    │       │   └─→ {valid, surname, givenNames, ...}
    │       └─→ CsvDatabase.appendRecord({...})
    │           └─→ Async-locked write to CSV
    │
    ├─→ PassportScanner.generateReport()
    │   └─→ Display statistics
    │
    └─→ PassportScanner.shutdown()
        └─→ OcrEngine.shutdown()
```

### Report Flow

```
CLI report command
    │
    ├─→ CsvDatabase.getAllRecords()
    │   └─→ Parse CSV file into objects
    │
    └─→ Display summary:
        - Total records
        - Success/failed count
        - Recent 5 entries
```

---

## Error Handling Strategy

### Error Categories

| Category | Where Caught | Recovery |
|----------|-------------|----------|
| Format/Size/Resolution | validateImage() | Skip image, log to CSV |
| Preprocessing | preprocess() | Catch error, log to CSV |
| OCR Failure | OcrEngine.recognize() | Catch error, log to CSV |
| MRZ Not Found | extractMrzLines() | Return null, log error |
| MRZ Parse Error | parseMrz() | Catch exception, mark invalid |
| CSV Write Error | CsvDatabase.appendRecord() | Async-lock handles; if fails, image lost |
| CLI Error | index.js action() | Print error, exit(1) |

### Error Recording

All errors flow through PassportScanner.processOne() → catch block → CSV record:
```csv
id,filename,...,status,error_message,processed_at
10,bad_image.jpg,...,ERROR,"MRZ lines not found in OCR output",2025-04-11T14:30:47Z
```

---

## Configuration & Constants

### Image Validation (`image-validator.js`)
```javascript
const SUPPORTED_FORMATS = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif'];
const MIN_WIDTH = 800;
const MIN_HEIGHT = 600;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
```

### Image Preprocessing (`image-preprocessor.js`)
```javascript
const TARGET_WIDTH = 1200;
// Pipeline: resize → grayscale → normalize → sharpen → median
```

### OCR Configuration (`ocr-engine.js`)
```javascript
// Language: 'eng'
// PSM Mode: 6 (uniform block)
// MRZ whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<'
```

### MRZ Substitutions (`mrz-parser.js`)
```javascript
const OCR_SUBSTITUTIONS = {
  O: '0', I: '1', B: '8', S: '5', G: '6'
};
```

### Batch Processing (`passport-scanner.js`)
```javascript
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif'];
```

---

## Testing Coverage

| Module | Approach | Key Tests |
|--------|----------|-----------|
| mrz-parser.js | Unit | Extract/parse/format, error cases, OCR corrections |
| image-validator.js | Unit | Valid/invalid formats, resolution, file size |
| csv-database.js | Unit | Append, parse, sanitize, concurrent writes |
| ocr-engine.js | Integration | Initialize, recognize, shutdown |
| PassportScanner | Integration | Full pipeline, error recovery |

**Test Framework:** Vitest
**Target Coverage:** 80%+

---

## Performance Profile

### Per-Image Processing Time

| Step | Duration | Notes |
|------|----------|-------|
| Validation | 10-50 ms | Sharp metadata |
| Preprocessing | 100-200 ms | Resize + filters |
| OCR | 800-1500 ms | Tesseract bottleneck |
| MRZ Parsing | 1-5 ms | Checksum validation |
| CSV Write | 10-50 ms | Disk I/O + async-lock |
| **Total** | **~1-2 seconds** | Varies by image size |

### Memory Profile

| Component | Usage |
|-----------|-------|
| Tesseract worker | ~200 MB |
| Image buffer (1200x1500) | ~8-12 MB |
| CSV in memory | Negligible |
| Node.js runtime | ~30 MB |
| **Total steady-state** | **~250 MB** |

### Scalability

- Batch size: 50-100 images before memory monitoring
- CSV size: Split at 1 GB for read performance
- Concurrency: Currently sequential; worker pool possible

---

## Technology Stack

| Purpose | Technology | Rationale |
|---------|-----------|-----------|
| OCR | Tesseract.js | Offline, no API costs |
| Image Processing | Sharp | Native performance |
| MRZ Parsing | mrz library | Tested ICAO implementation |
| CLI | Commander | Industry standard |
| CSV | csv-writer | Efficient, portable |
| Concurrency | async-lock | Lightweight, no external service |
| Testing | Vitest | Fast, parallel |

---

## Extension Points

### Easy to Extend

1. **Parallel Processing** → Wrap ProcessAll loop in worker threads
2. **Alternative OCR** → Replace OcrEngine with Google Vision API
3. **Database Backend** → Add SQLiteDatabase class
4. **Multi-language** → Load additional Tesseract models
5. **Webhook Notifications** → Hook into PassportScanner events

### Hard to Change

- MRZ format (ICAO 9303 is standard)
- CSV schema (required for downstream tools)
- Tesseract configuration (optimized for passports)

---

## Development Workflow

### Setup
```bash
git clone <repo>
cd ocr
npm install
```

### Development
```bash
npm start scan --input ./input --output ./output
npm test
npm test -- --coverage
```

### Local Testing
```bash
mkdir -p input output
# Add passport images to ./input/
npm start scan --input ./input --output ./output
npm start report --output ./output
cat output/passports.csv
```

---

## Deployment & Packaging

### Current Format
- Loose Node.js scripts (requires Node 16+)
- Entry point: `src/index.js` (shebang `#!/usr/bin/env node`)
- CLI: `npm start` or `node src/index.js`

### Packaging Options (v2.0+)
- **pkg** – Single executable (Windows, macOS, Linux)
- **esbuild** – Bundle with Tesseract models
- **Docker** – Container with Node + Tesseract

### Environment Requirements
- Node.js 16+ LTS
- ~50-100 MB disk for Tesseract models (downloaded on first run)
- Input/output directories with read/write permissions

---

## Known Limitations & TODOs

### Current Limitations
- Single-threaded (sequential processing only)
- English OCR only
- No multi-page document support
- No real-time camera mode
- MRZ errors need manual review for mission-critical use

### Future TODOs (v2.0+)
- [ ] Parallel batch processing via worker threads
- [ ] Multi-language OCR (French, Spanish, German)
- [ ] Web UI for browser-based scanning
- [ ] SQLite backend for large datasets (>100k records)
- [ ] Webhook notifications on completion
- [ ] Advanced image quality scoring

---

## File Structure Summary

```
D:\Văn\ocr
├── README.md                    # User guide (quick start, usage, CSV schema)
├── package.json                 # 7 deps + 1 dev dep
├── package-lock.json
│
├── docs/
│   ├── project-overview-pdr.md # Requirements, success metrics, roadmap
│   ├── system-architecture.md  # Module design, data flow, tech decisions
│   ├── code-standards.md        # Style, patterns, testing, performance
│   └── codebase-summary.md      # This file
│
├── src/
│   ├── index.js                 # CLI entry (91 LOC)
│   ├── passport-scanner.js      # Orchestrator (165 LOC)
│   ├── ocr-engine.js            # Tesseract wrapper (63 LOC)
│   ├── image-preprocessor.js    # Sharp pipeline (27 LOC)
│   ├── mrz-parser.js            # MRZ logic (95 LOC)
│   ├── csv-database.js          # CSV I/O (132 LOC)
│   └── utils/
│       └── image-validator.js   # Validation (44 LOC)
│
├── test/
│   ├── passport-scanner.test.js
│   ├── ocr-engine.test.js
│   ├── mrz-parser.test.js
│   ├── image-validator.test.js
│   └── csv-database.test.js
│
├── input/                       # Example input (gitignored)
└── output/                      # Example output (gitignored)
```

---

**Codebase Summary Version:** 1.0.0
**Generated:** 2025-04-11
**Total Source Code:** ~620 lines (core logic only)
**Maintainability Index:** High (modular, well-documented, tested)
