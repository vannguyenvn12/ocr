# Passport OCR Batch Scanner

A Node.js CLI tool for batch scanning passport images using Tesseract.js OCR and MRZ (Machine Readable Zone) parsing. Automatically extracts structured passport data and stores results in CSV format.

## Quick Start

```bash
npm install
node src/index.js scan --input ./input --output ./output
```

## Tech Stack

| Component | Package | Purpose |
|-----------|---------|---------|
| OCR Engine | tesseract.js | Optical character recognition on passport images |
| MRZ Parser | mrz | Parse and validate Machine Readable Zone data |
| Image Processing | sharp | Resize, grayscale, normalize, sharpen passport images |
| CLI Framework | commander | Command-line interface and argument parsing |
| CSV Output | csv-writer | Write and manage structured result data |
| Concurrency | async-lock | Thread-safe CSV write operations |
| Testing | vitest | Unit and integration test runner |

## Installation

### Requirements
- Node.js 16+ (LTS recommended)
- npm or yarn

### Setup

```bash
git clone <repository>
cd ocr
npm install
```

The first run may take a few minutes to download Tesseract language models (eng) to `node_modules/tesseract.js-core/`.

## Usage

### Scan Passport Directory

Batch process all passport images in a directory:

```bash
node src/index.js scan --input ./input --output ./output
```

**Options:**
- `-i, --input <dir>` – Input directory containing passport images (default: `./input`)
- `-o, --output <dir>` – Output directory for CSV and preprocessed images (default: `./output`)

**Output:**
- `output/passports.csv` – Structured passport data
- `output/preprocessed/` – Grayscale, normalized images used for OCR

**Example:**
```bash
$ node src/index.js scan -i ~/documents/passports -o ~/results
Found 5 image(s) to process.

[1/5] Processing passport_001.jpg... SUCCESS (confidence: 92%)
[2/5] Processing passport_002.png... SUCCESS (confidence: 87%)
[3/5] Processing passport_003.jpg... ERROR: MRZ lines not found in OCR output
[4/5] Processing passport_004.jpg... SUCCESS (confidence: 94%)
[5/5] Processing passport_005.jpg... SUCCESS (confidence: 89%)

=== Scan Report ===
Total:      5
Success:    4
Failed:     1
Avg Confidence: 90%
CSV Output: /home/user/results/passports.csv
===================
```

### Process Single File

Extract data from a specific passport image:

```bash
node src/index.js scan -i ./input -f passport.jpg
```

Returns the same format as batch processing but only for one file. Useful for testing or reprocessing individual documents.

### View Results Report

Display summary of processed passports from CSV:

```bash
node src/index.js report -o ./output
```

**Output:**
```
Total records: 5
Success: 4
Failed: 1

Recent entries:
  1. passport_001.jpg - SUCCESS (Smith, John)
  2. passport_002.png - SUCCESS (Doe, Jane)
  3. passport_003.jpg - ERROR (Invalid MRZ checksum)
  4. passport_004.jpg - SUCCESS (Johnson, Robert)
  5. passport_005.jpg - SUCCESS (Williams, Michael)
```

## CSV Output Schema

Results are written to `passports.csv` in the output directory.

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `id` | integer | Auto-incremented record ID | 1 |
| `filename` | string | Source image filename | passport_001.jpg |
| `passport_number` | string | Extracted passport number | A12345678 |
| `surname` | string | Family name from MRZ | SMITH |
| `given_names` | string | First/given names from MRZ | JOHN |
| `date_of_birth` | string | Date in YYYY-MM-DD format | 1990-05-15 |
| `expiry_date` | string | Passport expiration date YYYY-MM-DD | 2030-05-14 |
| `nationality` | string | Country code (ISO 3166-1) | US |
| `sex` | string | Gender: M or F | M |
| `issuing_country` | string | Issuing country code | US |
| `mrz_valid` | boolean | MRZ checksum validation result | true |
| `ocr_confidence` | integer | Tesseract confidence 0-100 | 92 |
| `raw_text` | string | Full OCR output (newlines escaped) | "P<USSMITH<<JOHN<<..." |
| `status` | string | SUCCESS or ERROR | SUCCESS |
| `error_message` | string | Error details (empty if success) | MRZ lines not found in OCR output |
| `processed_at` | string | UTC ISO timestamp | 2025-04-11T14:30:45.123Z |

**Example CSV:**
```csv
id,filename,passport_number,surname,given_names,date_of_birth,expiry_date,nationality,sex,issuing_country,mrz_valid,ocr_confidence,raw_text,status,error_message,processed_at
1,passport_001.jpg,A12345678,SMITH,JOHN,1990-05-15,2030-05-14,US,M,US,true,92,"P<USSMITH<<JOHN<<A12345678...",SUCCESS,,2025-04-11T14:30:45.123Z
2,passport_002.png,B87654321,DOE,JANE,1985-03-22,2035-03-21,UK,F,UK,true,89,"P<GBDOE<<JANE<<B87654321...",SUCCESS,,2025-04-11T14:30:46.456Z
3,passport_003.jpg,,,,,,,,,false,0,,ERROR,MRZ lines not found in OCR output,2025-04-11T14:30:47.789Z
```

## Architecture

### Directory Structure

```
src/
├── index.js                 # CLI entry point (scan, report commands)
├── passport-scanner.js      # Main orchestrator (initialize, process, report)
├── ocr-engine.js            # Tesseract.js wrapper (full page + MRZ OCR)
├── image-preprocessor.js    # Sharp pipeline (resize, grayscale, normalize, sharpen)
├── mrz-parser.js            # Extract & parse Machine Readable Zone lines
├── csv-database.js          # CSV reader/writer with thread-safety
└── utils/
    └── image-validator.js   # Format, resolution, file size validation
```

### Processing Pipeline

```
Input Image
    ↓
[Validation] – format, resolution, file size checks
    ↓
[Preprocessing] – resize to 1200px, grayscale, normalize, sharpen
    ↓
[Full-Page OCR] – Tesseract.js (PSM mode 6: "Assume single block of text")
    ↓
[MRZ Extraction] – locate and extract 2-line MRZ from bottom of passport
    ↓
[OCR Correction] – fix common letter-digit confusions (O→0, I→1, etc.)
    ↓
[MRZ Parse] – mrz library validates checksum and extracts fields
    ↓
[CSV Write] – append record (async-lock prevents concurrent writes)
    ↓
Output: passports.csv + preprocessed image
```

### Key Classes

**PassportScanner**
- Orchestrates the full batch processing workflow
- Manages OCR engine lifecycle and CSV database
- Tracks results (total, success, failed, confidence averages)

**OcrEngine**
- Wraps Tesseract.js Worker for full-page and region-based OCR
- PSM mode 6: treats image as single uniform text block
- Character whitelist for MRZ-only mode

**CsvDatabase**
- Reads/writes CSV with async-lock to prevent corruption
- Auto-sanitizes values to prevent CSV formula injection
- Maintains record ID sequence across runs

**ImageValidator**
- Checks format: jpg, jpeg, png, bmp, tiff, tif only
- Minimum resolution: 800x600 pixels
- Maximum file size: 50 MB

**Image Preprocessor**
- Resize to 1200px width (maintains aspect ratio)
- Convert to grayscale
- Normalize pixel values
- Sharpen with sigma 1.5
- Median blur (radius 3) to reduce noise

## Supported Image Formats

| Format | Extension | Notes |
|--------|-----------|-------|
| JPEG | `.jpg`, `.jpeg` | Recommended; good balance of quality and file size |
| PNG | `.png` | Lossless; larger files |
| BMP | `.bmp` | Uncompressed; very large files |
| TIFF | `.tiff`, `.tif` | Lossless; used in archival/professional scanning |

Minimum resolution: **800x600 pixels**
Recommended resolution: **1200x1500 pixels or higher**
Maximum file size: **50 MB**

## Error Handling

### Common Errors

**"Validation failed: Unsupported format"**
- Cause: Image format not in supported list
- Fix: Convert to JPG or PNG using ImageMagick or similar

**"Validation failed: Resolution below minimum"**
- Cause: Image width < 800 or height < 600
- Fix: Increase scan resolution or upscale image

**"MRZ lines not found in OCR output"**
- Cause: OCR failed to recognize MRZ region
- Fix: Improve image quality, lighting, or passport orientation

**"MRZ parse error: Invalid checksum"**
- Cause: OCR errors in MRZ digits
- Fix: Check image clarity; preprocessing may need tuning

### CSV Safety

All user-generated values are sanitized to prevent CSV formula injection:
- Strings starting with `=`, `+`, `-`, `@`, tab, or newline are prefixed with single quote
- Quoted field escaping is handled by csv-writer

## Development

### Running Tests

```bash
npm test
```

Uses Vitest for fast, parallel test execution.

### Testing Locally

Create input directory and add test images:

```bash
mkdir -p input output
# Add passport images to ./input/
npm start scan --input ./input --output ./output
```

Check results:

```bash
npm start report --output ./output
cat output/passports.csv
```

## Limitations

- **Language**: English OCR only (Tesseract eng model)
- **MRZ Format**: TD3 (travel document, 3-line format for 44-char lines)
- **Concurrency**: Sequential processing; parallel support requires worker pool refactor
- **Performance**: First run downloads ~50-100 MB of Tesseract language models

## Performance Tips

1. **Batch Size**: Process in batches of 50-100 images to avoid memory bloat
2. **Image Quality**: High-resolution, well-lit passport scans yield better OCR
3. **Preprocessing**: Slight blur + sharpening combination optimizes for MRZ
4. **CSV Size**: For >10,000 records, consider splitting CSV by date or passport country

## License

ISC
