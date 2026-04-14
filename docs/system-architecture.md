# System Architecture

## High-Level Overview

The Passport OCR Batch Scanner is a modular Node.js CLI application that processes passport images through a linear pipeline: validation → preprocessing → OCR → MRZ extraction → data export.

```
┌─────────────────────────────────────────────────────────────┐
│                    CLI Entry Point (index.js)               │
│                  scan | report commands                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│           PassportScanner (Orchestrator)                    │
│  • Initialize OCR engine & CSV database                     │
│  • Coordinate processing pipeline                           │
│  • Generate reports                                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
    Input Image  Preprocessing  OCR Engine
        │              │              │
        └──────────────┼──────────────┘
                       │
                       ▼
            ┌─────────────────────┐
            │   OCR Text Output   │
            │  (Full page + conf) │
            └─────────────────────┘
                       │
                       ▼
            ┌─────────────────────┐
            │  MRZ Extraction     │
            │  (2-line zone)      │
            └─────────────────────┘
                       │
                       ▼
            ┌─────────────────────┐
            │  MRZ Parser         │
            │  (Checksum + data)  │
            └─────────────────────┘
                       │
                       ▼
            ┌─────────────────────┐
            │  CSV Write          │
            │  (Async-locked)     │
            └─────────────────────┘
                       │
                       ▼
            ┌─────────────────────┐
            │  Output CSV Record  │
            │  (16 columns)       │
            └─────────────────────┘
```

## Module Breakdown

### 1. CLI Entry Point (`src/index.js`)

**Responsibility:** Parse command-line arguments and route to appropriate handlers

**Key Classes/Functions:**
- `program` (Commander instance)
- Commands:
  - `scan` – batch or single-file processing
  - `report` – display CSV summary

**Interface:**
```javascript
node src/index.js scan --input ./input --output ./output
node src/index.js scan -i ./input -f passport.jpg
node src/index.js report -o ./output
```

**Error Handling:**
- File path traversal validation for `--file` option
- Graceful shutdown on errors

---

### 2. Passport Scanner (`src/passport-scanner.js`)

**Responsibility:** Orchestrate the full scanning pipeline and track statistics

**Key Methods:**
- `initialize()` – Set up OCR engine and CSV database
- `scanDirectory()` – List image files matching supported formats
- `processOne(imagePath)` – Run full pipeline on single image
- `processAll()` – Batch process all images in directory
- `generateReport()` – Create summary statistics
- `shutdown()` – Clean up OCR worker

**State:**
```javascript
{
  inputDir,        // Path to input images
  outputDir,       // Path to output CSV + preprocessed/
  preprocessedDir, // Subdirectory for processed images
  csvPath,         // Full path to output CSV
  ocr,             // OcrEngine instance
  db,              // CsvDatabase instance
  results: {
    total: 0,
    success: 0,
    failed: 0,
    confidences: []  // Array of OCR confidence scores
  }
}
```

**Error Recovery:**
- If single file fails, record error to CSV and continue
- Partial batch completion supported

---

### 3. Image Validator (`src/utils/image-validator.js`)

**Responsibility:** Validate image format, resolution, and file size before processing

**Key Function:**
```javascript
validateImage(imagePath)
→ { valid: true/false, error?: string, metadata?: {} }
```

**Checks:**
- **Format**: .jpg, .jpeg, .png, .bmp, .tiff, .tif (case-insensitive)
- **Resolution**: Minimum 800x600 pixels
- **File Size**: Maximum 50 MB

**Used By:** `PassportScanner.processOne()`

---

### 4. Image Preprocessor (`src/image-preprocessor.js`)

**Responsibility:** Optimize images for OCR accuracy using Sharp pipeline

**Key Function:**
```javascript
preprocess(inputPath, outputDir) → outputPath
```

**Pipeline (in order):**
1. Resize to 1200px width (maintains aspect ratio)
2. Convert to grayscale
3. Normalize pixel values to full range [0, 255]
4. Sharpen with sigma 1.5 (enhance text edges)
5. Median blur with radius 3 (reduce noise)
6. Save as PNG to `outputDir/`

**Optimization Rationale:**
- Grayscale: Reduces noise, speeds up Tesseract
- Normalization: Handles poor lighting conditions
- Sharpening: Enhances MRZ text clarity
- Median blur: Removes salt-and-pepper noise

**Output:** PNG file with preprocessed image

**Used By:** `PassportScanner.processOne()`

---

### 5. OCR Engine (`src/ocr-engine.js`)

**Responsibility:** Wrap Tesseract.js for text recognition with confidence scoring

**Key Methods:**
```javascript
initialize()           // Load eng model, set PSM mode 6
recognize(imagePath)   // Full-page OCR → { text, confidence }
recognizeMrz(imagePath, rectangle)  // Region-based OCR with whitelist
shutdown()             // Terminate worker
```

**Configuration:**
- **Language Model:** eng (English only)
- **Segmentation Mode (PSM):** 6 – "Assume a single uniform block of text"
- **MRZ Mode:** Character whitelist "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<"

**Output:**
```javascript
{ text: string, confidence: 0-100 }
```

**State:**
- Single worker per instance (shared via PassportScanner)
- Thread-safe for sequential processing

**Used By:** `PassportScanner.processOne()`

---

### 6. MRZ Parser (`src/mrz-parser.js`)

**Responsibility:** Extract MRZ lines from OCR output, correct common errors, and validate checksums

**Key Functions:**

```javascript
extractMrzLines(ocrText)
→ [line1, line2] | null
```
- Filters lines >= 30 chars containing '<'
- Takes last 2 qualifying lines (MRZ at bottom of passport)
- Normalizes to 44 chars (TD3 format)

```javascript
fixOcrErrors(mrzLine)
→ correctedLine
```
- Replaces common OCR errors: O→0, I→1, B→8, S→5, G→6
- Only applies replacements between digits/chevrons (context-aware)

```javascript
parseMrz(mrzLines)
→ { valid, surname, givenNames, passportNumber, dateOfBirth, expiryDate, nationality, sex, issuingCountry, error? }
```
- Uses mrz library to validate ICAO 9303 checksums
- Returns structured passport data

```javascript
formatMrzDate(yymmdd)
→ "YYYY-MM-DD"
```
- Converts MRZ date format (YYMMDD) to ISO standard
- Century logic: 00-30 = 20xx, 31-99 = 19xx

**Used By:** `PassportScanner.processOne()`

---

### 7. CSV Database (`src/csv-database.js`)

**Responsibility:** Safely read and append records to CSV file with injection prevention

**Key Methods:**
```javascript
initialize()          // Create file or count existing records
appendRecord(data)    // Async-locked write of single record
getAllRecords()       // Parse and return all records as objects
findByPassportNumber(number) // Query by passport number
```

**Schema (16 columns):**
| Column | Type | Purpose |
|--------|------|---------|
| id | integer | Auto-incremented, 1-based |
| filename | string | Source image filename |
| passport_number | string | Extracted from MRZ |
| surname, given_names | string | Family + first names |
| date_of_birth, expiry_date | string | YYYY-MM-DD format |
| nationality, sex, issuing_country | string | Extracted from MRZ |
| mrz_valid | boolean | Checksum validation result |
| ocr_confidence | integer | 0-100 from Tesseract |
| raw_text | string | Full OCR output (escaped) |
| status | string | "SUCCESS" or "ERROR" |
| error_message | string | Error details if failed |
| processed_at | string | ISO 8601 UTC timestamp |

**Thread Safety:**
- Uses `async-lock` to serialize CSV writes
- Prevents concurrent appends corrupting file

**Security:**
- `sanitizeCsvValue()` prepends single quote to values starting with `=+−@\t\r` (formula injection prevention)

**CSV Parsing:**
- Custom `parseCsvLine()` respects quoted fields
- Handles escaped quotes as per RFC 4180

**Used By:** `PassportScanner.processOne()`

---

## Data Flow for Single Passport

```
Input File: passport.jpg
    │
    ├─→ validateImage()
    │   └─→ Check format, resolution, size
    │
    ├─→ preprocess()
    │   ├─→ Resize to 1200px
    │   ├─→ Grayscale + normalize + sharpen
    │   └─→ Save to ./output/preprocessed/passport.png
    │
    ├─→ ocr.recognize(preprocessedPath)
    │   └─→ { text: "P<USSMITH...", confidence: 92 }
    │
    ├─→ extractMrzLines(ocrText)
    │   └─→ [ "P<USSMITH<<JOHN<<A12345678...", "1950115M3005151US..." ]
    │
    ├─→ parseMrz(mrzLines)
    │   └─→ { valid: true, surname: "SMITH", givenNames: "JOHN", ... }
    │
    └─→ db.appendRecord({ filename, passport_number, surname, ... })
        └─→ passports.csv row appended
```

## Error Scenarios

### Validation Failures
- **Unsupported Format** → Caught at validateImage() → CSV error record
- **Low Resolution** → Caught at validateImage() → CSV error record
- **File Too Large** → Caught at validateImage() → CSV error record

### OCR Failures
- **No Text Detected** → extractMrzLines() returns null → CSV error record
- **Low Confidence** → Recorded in CSV but marked SUCCESS (user can filter)

### MRZ Failures
- **Invalid Checksum** → parseMrz() returns valid=false → CSV marked SUCCESS but flagged
- **Parse Error** → Try/catch in parseMrz() → CSV error record

### CSV Write Failures
- **Async-lock Timeout** → Error logged, file remains consistent
- **Disk Full** → Node throws error, caught by PassportScanner

## Performance Characteristics

| Operation | Time | Bottleneck |
|-----------|------|-----------|
| Image Validation | 10-50 ms | Sharp metadata read |
| Image Preprocessing | 100-200 ms | Sharp resize + filters |
| Full-page OCR | 800-1500 ms | Tesseract worker |
| MRZ Parsing | 1-5 ms | Checksum validation |
| CSV Write | 10-50 ms | Disk I/O |
| **Per Image Total** | **1-2 sec** | Tesseract OCR |

**Bottleneck:** Tesseract.js OCR (accounts for ~80% of total time)

**Memory Profile:**
- Tesseract worker: ~200 MB
- Image buffer (1200x1500 = 2.2 MP): ~8-12 MB per image
- CSV in memory: negligible
- **Total steady-state:** ~250 MB

## Extensibility Points

### Adding New Image Formats
- Update `SUPPORTED_FORMATS` in `image-validator.js`
- Sharp already supports most formats (AVIF, WebP, etc.)

### Parallel Processing
- Wrap PassportScanner loop in worker threads
- Each worker gets independent OCR engine + CSV lock
- Coordinate writes via async-lock (already in place)

### Alternative OCR Engines
- Replace OcrEngine with Google Vision API or local OpenCV
- Maintain same interface: `initialize()`, `recognize()`, `shutdown()`

### Database Backend
- Add SQLiteDatabase class mirroring CsvDatabase interface
- Switch via factory pattern

### Multi-language Support
- Load additional Tesseract models: `createWorker('ell')` for Greek, etc.
- Update MRZ parser to handle non-English names

---

## Technology Choices Rationale

| Choice | Alternative | Why Chosen |
|--------|-------------|-----------|
| Tesseract.js | Google Vision, AWS Textract | Offline, no API costs, local control |
| Sharp | ImageMagick, Canvas | Native perf, no external deps |
| mrz library | Custom parser | Tested ICAO implementation |
| Commander | yargs, minimist | Standard CLI framework |
| CSV | SQLite, JSON | Portable, BI-tool compatible |
| Async-lock | Redis, Mutex | Lightweight, no external service |

---

**Document Version:** 1.0.0
**Last Updated:** 2025-04-11
