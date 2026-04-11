# Passport OCR Batch Scanner

**Project:** `passport-ocr` (Node.js)
**Goal:** Batch scan passport images from a local folder, extract personal data via OCR + MRZ parsing, store results in CSV.
**Created:** 2026-04-11

## Tech Stack

| Component | Package | Version |
|-----------|---------|---------|
| OCR Engine | tesseract.js | ^5.0.0 |
| MRZ Parser | mrz | ^1.4.0 |
| Image Preprocessing | sharp | ^0.33.0 |
| CSV Database | csv-writer + async-lock | ^1.6.0 / ^1.4.0 |
| CLI Interface | commander | ^12.0.0 |
| Testing | vitest | ^3.0.0 |

## Architecture

```
d:/Văn/ocr/
├── src/
│   ├── index.js                    # CLI entry point
│   ├── ocr-engine.js               # Tesseract.js worker pool
│   ├── image-preprocessor.js       # Sharp preprocessing pipeline
│   ├── mrz-parser.js               # MRZ extraction & parsing
│   ├── passport-scanner.js         # Main orchestrator
│   ├── csv-database.js             # CSV read/write with locking
│   └── utils/
│       └── image-validator.js      # Image quality validation
├── input/                          # Drop passport images here
├── output/
│   ├── preprocessed/               # Preprocessed images
│   └── passports.csv               # Results database
├── tests/
│   └── *.test.js
├── package.json
└── README.md
```

## Phases

| # | Phase | Status | Priority | Effort |
|---|-------|--------|----------|--------|
| 1 | [Project Setup](phase-01-project-setup.md) | completed | high | 15min |
| 2 | [Image Preprocessing](phase-02-image-preprocessing.md) | completed | high | 30min |
| 3 | [OCR Engine](phase-03-ocr-engine.md) | completed | high | 30min |
| 4 | [MRZ Parser](phase-04-mrz-parser.md) | completed | high | 20min |
| 5 | [CSV Database](phase-05-csv-database.md) | completed | medium | 20min |
| 6 | [Passport Scanner Orchestrator](phase-06-passport-scanner.md) | completed | high | 30min |
| 7 | [CLI Interface](phase-07-cli-interface.md) | completed | medium | 15min |
| 8 | [Testing](phase-08-testing.md) | completed | medium | 30min |

## Data Flow

```
Input Folder → Image Validator → Sharp Preprocessing → Tesseract OCR
    → MRZ Extraction → MRZ Parser → CSV Database → Console Report
```

## CSV Schema

| Field | Type | Description |
|-------|------|-------------|
| id | number | Auto-increment |
| filename | string | Source image filename |
| passport_number | string | Document number from MRZ |
| surname | string | Last name |
| given_names | string | First + middle names |
| date_of_birth | string | YYYY-MM-DD |
| expiry_date | string | YYYY-MM-DD |
| nationality | string | 3-letter country code |
| sex | string | M/F |
| issuing_country | string | 3-letter country code |
| mrz_valid | boolean | MRZ checksum passed |
| ocr_confidence | number | 0-100 |
| raw_text | string | Full OCR output |
| status | string | SUCCESS/ERROR |
| error_message | string | Error details if failed |
| processed_at | string | ISO timestamp |

## Key Decisions

1. **Tesseract.js** over Google Vision: free, offline, no API key needed
2. **Sharp** for preprocessing: fastest Node.js image library, native bindings
3. **CSV** over SQLite: simpler, user requirement, easy to open in Excel
4. **Sequential processing** (not parallel workers): simpler for MVP, avoid memory issues with large images
5. **Full page OCR + MRZ parsing**: extract everything, then parse MRZ specifically

## Reports

- [Researcher Report](../reports/researcher-passport-ocr-report.md)
