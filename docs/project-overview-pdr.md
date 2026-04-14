# Passport OCR Batch Scanner - Project Overview & PDR

## Executive Summary

**Project:** Passport OCR Batch Scanner
**Type:** Node.js CLI Tool
**Purpose:** Automate extraction of structured data from passport images via OCR and Machine Readable Zone (MRZ) parsing
**Status:** Complete
**Version:** 1.0.0

The system batch processes passport image files, performs optical character recognition using Tesseract.js, validates MRZ checksums, and exports results to CSV for downstream processing.

## Product Development Requirements (PDR)

### Functional Requirements

#### FR-1: Batch Image Processing
- **Description:** Scan directory for passport images and process sequentially
- **Acceptance Criteria:**
  - Support JPG, PNG, BMP, TIFF formats
  - Process 100+ images without memory leak
  - Generate report with success/failure counts
  - Minimum resolution 800x600, maximum file size 50 MB

#### FR-2: OCR Recognition
- **Description:** Extract text from preprocessed passport images
- **Acceptance Criteria:**
  - Full-page OCR with Tesseract.js
  - Return confidence score (0-100)
  - Confidence >80% for acceptable results
  - Support English language only (initial release)

#### FR-3: MRZ Parsing
- **Description:** Extract Machine Readable Zone data and validate
- **Acceptance Criteria:**
  - Identify and extract 2-line MRZ from OCR output
  - Validate checksums per ICAO 9303 standard
  - Parse: surname, given names, passport number, DOB, expiry, nationality, sex, issuing country
  - Mark records as valid/invalid based on checksum

#### FR-4: Image Preprocessing
- **Description:** Optimize images for OCR accuracy
- **Acceptance Criteria:**
  - Resize to 1200px width
  - Convert to grayscale
  - Normalize pixel distribution
  - Sharpen to enhance text clarity
  - Apply median filter for noise reduction

#### FR-5: CSV Data Export
- **Description:** Persist results in structured CSV format
- **Acceptance Criteria:**
  - Write 16 columns (id, filename, passport_number, surname, given_names, date_of_birth, expiry_date, nationality, sex, issuing_country, mrz_valid, ocr_confidence, raw_text, status, error_message, processed_at)
  - Append mode for incremental processing
  - Sanitize values to prevent CSV injection
  - Support concurrent writes via async-lock

#### FR-6: CLI Interface
- **Description:** Provide command-line commands for scanning and reporting
- **Acceptance Criteria:**
  - `scan` command: process directory or single file
  - `report` command: display summary of results
  - Support --input, --output, --file options
  - Print progress with file count and confidence scores

#### FR-7: Error Recovery
- **Description:** Continue processing on individual file failures
- **Acceptance Criteria:**
  - Log all errors to CSV error_message column
  - Include error type: validation, OCR, MRZ parse, write errors
  - Track failed count and display in report
  - Allow resumption of partial batches

### Non-Functional Requirements

#### NFR-1: Performance
- Process 50-100 passport images per hour (depends on hardware)
- CSV writes < 100ms per record
- Memory usage stable at < 500 MB during batch
- First-time setup < 5 minutes (Tesseract download)

#### NFR-2: Reliability
- OCR engine thread-safe via async-lock
- CSV format preserves record integrity
- No data loss on partial failures
- Graceful shutdown on SIGTERM

#### NFR-3: Security
- CSV injection prevention via value sanitization
- No plaintext credential storage
- File path traversal validation (--file option)

#### NFR-4: Usability
- Self-documenting CLI with --help
- Clear progress indicators during batch
- Actionable error messages (root cause + fix suggestion)
- Example usage in documentation

#### NFR-5: Maintainability
- Modular code: separate validation, preprocessing, OCR, parsing, CSV
- Clear separation of concerns
- < 200 LOC per module
- Comprehensive comments on complex logic

### Success Metrics

| Metric | Target | Threshold |
|--------|--------|-----------|
| OCR Confidence | 90% avg | >80% |
| MRZ Valid Rate | 95% of good-quality scans | >85% |
| CSV Data Integrity | 100% record preservation | No data loss |
| Error Recovery | 100% of files logged | 0 silent failures |
| Processing Speed | 1-2 img/min | <5 min/img |
| Memory Stability | < 500 MB | < 1 GB |

## Technical Constraints

### Dependencies
- Node.js 16+ (LTS)
- Tesseract.js 5.0+ (requires WASM)
- sharp 0.30+ (native image processing)
- mrz 5.0+ (ICAO 9303 parsing)
- commander 14.0+ (CLI)
- csv-writer 1.6+ (CSV export)
- async-lock 1.4+ (concurrency)

### Environment
- Windows, macOS, Linux support
- ~50-100 MB disk for Tesseract models (downloaded on first run)
- No external APIs or internet required (offline-capable)

### Data Format
- Input: JPG, PNG, BMP, TIFF
- Output: CSV (RFC 4180 compliant)
- MRZ Format: TD3 (Travel Document, 3-line format)

### Limitations
- Single-threaded batch processing (sequential)
- English OCR only
- No multi-page document support
- No real-time camera input

## Architecture Decisions

### Choice: Tesseract.js over Cloud APIs
**Rationale:** Offline capability, no API costs, full control over preprocessing pipeline
**Trade-off:** Slower than cloud (1-2 img/min vs 10/min), requires local computation

### Choice: Sequential Processing
**Rationale:** Simplifies state management, predictable memory usage
**Trade-off:** Slower than parallel; future enhancement via worker pools

### Choice: Sharp for Preprocessing
**Rationale:** Native performance, integrated pipeline, no external binary dependencies
**Trade-off:** Requires native module compilation

### Choice: Custom MRZ Extraction over Tesseract Region
**Rationale:** More robust; MRZ position predictable at bottom of passport
**Trade-off:** Requires knowledge of MRZ format

### Choice: CSV over Database
**Rationale:** Portable, human-readable, integrable with Excel/BI tools
**Trade-off:** Limited query capability; use SQLite if queries needed

## Roadmap & Phases

### Phase 1: Project Setup ✓
- Initialize Node.js project
- Install core dependencies
- Set up CLI structure with commander

### Phase 2: Image Preprocessing ✓
- Implement validation (format, resolution, size)
- Build preprocessing pipeline (resize, grayscale, normalize, sharpen)
- Test on sample passport images

### Phase 3: OCR Engine ✓
- Initialize Tesseract.js worker
- Implement full-page recognition
- Implement region-based (MRZ) recognition
- Test confidence scoring

### Phase 4: MRZ Parser ✓
- Extract MRZ lines from OCR output
- Fix common OCR errors (O→0, I→1)
- Parse using mrz library
- Validate checksums

### Phase 5: CSV Database ✓
- Design CSV schema
- Implement async-safe write
- Sanitize values for injection prevention
- Test concurrent writes

### Phase 6: Passport Scanner ✓
- Orchestrate full pipeline
- Implement batch processing
- Track statistics (success, failed, avg confidence)
- Generate report

### Phase 7: CLI Interface ✓
- Implement `scan` command
- Implement `report` command
- Add progress indicators
- Test help and error messages

### Phase 8: Testing ✓
- Unit tests for each module
- Integration tests for full pipeline
- Error scenario testing
- Performance benchmarking

## Known Issues & Future Enhancements

### Known Limitations
- No support for multi-page documents
- No parallel processing (sequential only)
- English language only
- MRZ errors still require manual review for mission-critical uses

### Future Enhancements (v2.0+)
- Parallel batch processing via Node.js worker threads
- Additional language support (French, Spanish, German)
- Real-time webcam scanning mode
- SQLite backend for large datasets (>100k records)
- Web UI for browser-based scanning
- Webhook notifications on completion
- Advanced image quality scoring

## Deployment Notes

### Local Development
```bash
npm install
npm start scan --input ./input --output ./output
npm test
```

### Production
- Bundle with `pkg` or `esbuild` for standalone executables
- Recommend running in containerized environment (Docker)
- Set resource limits (memory, CPU) for batch jobs
- Monitor CSV file growth (implement archiving at 1 GB)

## Support & Maintenance

### Support Contacts
- Bug Reports: GitHub Issues
- Documentation: README.md in root

### Maintenance Schedule
- Tesseract.js version updates: quarterly
- sharp version updates: as needed
- mrz library updates: annually (ICAO standards stable)

### Version History
- **1.0.0** (2025-04-11): Initial release
  - Batch scanning with OCR + MRZ parsing
  - CSV export with 16-column schema
  - CLI scan + report commands
  - Image preprocessing and validation

---

**Document Version:** 1.0.0
**Last Updated:** 2025-04-11
**Reviewed By:** Development Team
**Status:** Approved for Production
