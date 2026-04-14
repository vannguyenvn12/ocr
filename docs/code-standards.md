# Code Standards & Structure

## Codebase Organization

```
ocr/
├── src/
│   ├── index.js                    # CLI entry point (91 LOC)
│   ├── passport-scanner.js         # Main orchestrator (165 LOC)
│   ├── ocr-engine.js               # Tesseract.js wrapper (63 LOC)
│   ├── image-preprocessor.js       # Sharp pipeline (27 LOC)
│   ├── mrz-parser.js               # MRZ extraction & parsing (95 LOC)
│   ├── csv-database.js             # CSV read/write (132 LOC)
│   └── utils/
│       └── image-validator.js      # Image validation (44 LOC)
├── docs/
│   ├── project-overview-pdr.md     # Requirements & decisions
│   ├── system-architecture.md      # Architecture overview
│   ├── code-standards.md           # This document
│   └── codebase-summary.md         # Auto-generated summary
├── test/
│   ├── passport-scanner.test.js    # Integration tests
│   ├── ocr-engine.test.js          # OCR tests
│   ├── mrz-parser.test.js          # MRZ logic tests
│   ├── image-validator.test.js     # Validation tests
│   └── csv-database.test.js        # CSV read/write tests
├── .gitignore                       # Ignore node_modules, output/
├── package.json                     # Dependencies (7 main, 1 dev)
├── package-lock.json                # Locked versions
├── README.md                        # User documentation
└── input/ & output/                 # Example directories (gitignored)
```

## Code Style Guidelines

### JavaScript Standards

**Standard:** ECMAScript 2022 (ES12) with ES Modules

**Format & Linting:**
- Indentation: 2 spaces (no tabs)
- Line length: 100 chars soft limit, 120 hard limit
- Semicolons: Required
- Quotes: Single quotes for strings, backticks for templates
- Comments: JSDoc for functions, inline for complex logic

**Example:**
```javascript
/**
 * Extract MRZ lines from OCR output.
 * Takes last 2 lines with 30+ chars containing '<'.
 *
 * @param {string} ocrText - Full OCR text from Tesseract
 * @returns {string[]|null} Two MRZ lines or null if not found
 */
export function extractMrzLines(ocrText) {
  const lines = ocrText
    .split('\n')
    .map((l) => l.replace(/\s/g, '').toUpperCase())
    .filter((l) => l.length >= 30 && l.includes('<'));

  return lines.length >= 2 ? lines.slice(-2) : null;
}
```

### Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Files | kebab-case | `image-validator.js` |
| Classes | PascalCase | `PassportScanner`, `OcrEngine` |
| Functions | camelCase | `extractMrzLines()`, `validateImage()` |
| Constants | UPPER_SNAKE_CASE | `SUPPORTED_FORMATS`, `TARGET_WIDTH` |
| Variables | camelCase | `imagePath`, `ocrResult` |
| Private | Prefix underscore (convention) | `_sanitizeValue()` |
| Booleans | Prefix is/has/should | `isValid`, `hasError`, `shouldRetry` |

### Module Exports

Use named exports for clarity:

```javascript
// ✓ Good
export class OcrEngine { /* ... */ }
export async function preprocess(inputPath, outputDir) { /* ... */ }
export const SUPPORTED_FORMATS = ['.jpg', '.png'];

// ✗ Avoid
module.exports = { OcrEngine, preprocess };
```

## Error Handling

### Pattern: Try-Catch with Meaningful Messages

```javascript
try {
  const validation = await validateImage(imagePath);
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.error}`);
  }
} catch (err) {
  // Log with context, not just error
  console.error(`Failed to process ${filename}: ${err.message}`);

  // Store in CSV for audit trail
  await db.appendRecord({
    filename,
    status: 'ERROR',
    error_message: err.message,
  });
}
```

### Pattern: Null Checks for Optional Returns

```javascript
export function extractMrzLines(ocrText) {
  const lines = ocrText.split('\n').filter(l => l.length > 30);

  // Early return for null, not undefined
  if (lines.length < 2) {
    return null;  // Not undefined
  }

  return lines.slice(-2);
}

// Caller checks explicitly:
const mrzLines = extractMrzLines(ocrText);
if (!mrzLines) {
  throw new Error('MRZ lines not found in OCR output');
}
```

### Pattern: Async Error Handling

```javascript
async function processOne(imagePath) {
  const filename = path.basename(imagePath);

  try {
    const result = await pipeline(imagePath);
    return { status: 'SUCCESS', result };
  } catch (err) {
    // Log error, attempt recovery/cleanup
    console.error(`Error processing ${filename}: ${err.message}`);

    // Attempt to save error state
    try {
      await db.appendRecord({ filename, status: 'ERROR', error: err.message });
    } catch (dbErr) {
      console.error(`Failed to log error: ${dbErr.message}`);
    }

    return { status: 'ERROR', error: err.message };
  }
}
```

## Concurrency & Thread Safety

### Pattern: Async-Lock for CSV Writes

All CSV writes must acquire lock to prevent concurrent corruption:

```javascript
async appendRecord(data) {
  return this.lock.acquire('csv-write', async () => {
    // Critical section: only one writer at a time
    const record = {
      id: this.nextId++,
      ...data,
      processed_at: new Date().toISOString(),
    };

    const writer = createObjectCsvWriter({
      path: this.filePath,
      append: true,
    });

    await writer.writeRecords([record]);
    return record;
  });
}
```

### Pattern: Promise Sequencing (not Parallel)

ProcessAll uses sequential loop, not Promise.all():

```javascript
// ✓ Good: Sequential, predictable memory
for (let i = 0; i < images.length; i++) {
  const result = await this.processOne(images[i]);
  results.push(result);
}

// ✗ Avoid: Parallel OCR consumes too much memory
const results = await Promise.all(
  images.map(img => this.processOne(img))
);
```

## Code Organization Principles

### Module Responsibilities (Single Responsibility Principle)

| Module | Does | Doesn't Do |
|--------|------|-----------|
| index.js | Parse CLI args, route commands | OCR, validation, CSV writing |
| PassportScanner | Orchestrate pipeline, track stats | Preprocessing, OCR, parsing |
| ImageValidator | Check format/size/resolution | Preprocess, OCR, parse MRZ |
| ImagePreprocessor | Resize, grayscale, sharpen | Validate, OCR, MRZ parsing |
| OcrEngine | Initialize Tesseract, recognize text | Validation, preprocessing, parsing |
| MrzParser | Extract, fix, parse MRZ | OCR, validation, database writes |
| CsvDatabase | Read, write, sanitize CSV | Validation, OCR, MRZ parsing |

### Separation of Concerns

**Data Validation** → Separate from Processing:
- `validateImage()` checks before any processing
- Invalid images skip to error record
- Prevents cascading failures

**Image Transformation** → Separate from Recognition:
- `preprocess()` only transforms, returns path
- `ocr.recognize()` only reads file and recognizes
- OcrEngine doesn't know about input formats

**Data Extraction** → Separate from Parsing:
- `extractMrzLines()` finds zone from text
- `parseMrz()` parses lines into data
- Can test independently

**Storage** → Separate from Business Logic:
- `CsvDatabase` only handles CSV I/O
- PassportScanner only calls append/read
- Can swap for SQLite without touching logic

## Testing Standards

### Test Structure

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseFunction } from '../src/module.js';

describe('parseFunction', () => {
  describe('happy path', () => {
    it('should parse valid input correctly', () => {
      const input = 'valid data';
      const result = parseFunction(input);
      expect(result).toEqual({ success: true });
    });
  });

  describe('error cases', () => {
    it('should return null for empty input', () => {
      const result = parseFunction('');
      expect(result).toBeNull();
    });

    it('should throw on invalid format', () => {
      expect(() => parseFunction(null)).toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle maximum length input', () => {
      const input = 'x'.repeat(10000);
      expect(() => parseFunction(input)).not.toThrow();
    });
  });
});
```

### Coverage Targets

| Module | Target | Reasoning |
|--------|--------|-----------|
| mrz-parser.js | 90%+ | Core business logic, many branches |
| csv-database.js | 85%+ | CSV parsing, multiple formats |
| ocr-engine.js | 70%+ | Hard to mock Tesseract fully |
| image-validator.js | 95%+ | Simple logic, exhaustive cases |
| PassportScanner | 60%+ | Integration-heavy, hard to unit test |

**Run tests:**
```bash
npm test                 # Run all tests
npm test -- --ui        # Interactive mode
npm test -- --coverage  # Coverage report
```

## Performance Guidelines

### Avoid in Hot Paths

- **Reading entire CSV into memory** – Use streaming for large files
- **Deep cloning objects** – Use shallow spread if possible
- **Regex in loops** – Compile regex outside loop
- **Blocking I/O** – Always use async/await

**Example (Bad → Good):**

```javascript
// ✗ Bad: Reads entire CSV for each query
async function processAll() {
  for (let image of images) {
    const existing = await db.getAllRecords(); // Rereads every iteration!
    if (existing.find(r => r.filename === image)) continue;
    // ...
  }
}

// ✓ Good: Cache or use proper query
const existing = await db.getAllRecords();
const existingSet = new Set(existing.map(r => r.filename));
for (let image of images) {
  if (existingSet.has(image)) continue;
  // ...
}
```

### Optimization Strategies

1. **Preprocessing Tuning:** Adjust sharpen sigma and median radius for your image quality
2. **Batch Size:** Process 50-100 images before monitoring memory
3. **CSV Archiving:** Split CSV at 1 GB size for faster reads
4. **Tesseract Model:** Use 'osd' (auto-detect script) + 'eng' if documents mixed language

## Security Practices

### Input Validation

- Always validate image paths (prevent directory traversal)
- Validate file extensions (whitelist, not blacklist)
- Check file size before reading

```javascript
// Validate --file option to prevent traversal
const inputDir = path.resolve(opts.input);
const filePath = path.resolve(path.join(inputDir, opts.file));
if (!filePath.startsWith(inputDir + path.sep)) {
  throw new Error('file must be inside input directory');
}
```

### CSV Injection Prevention

Sanitize all values before writing to CSV:

```javascript
function sanitizeCsvValue(value) {
  if (typeof value !== 'string') return value;
  // Prefix dangerous chars with single quote
  if (/^[=+\-@\t\r]/.test(value)) return `'${value}`;
  return value;
}
```

### Secrets & Credentials

- Never hardcode API keys
- No plaintext passwords in logs
- Git-ignore: .env, .env.local, secrets/

## Documentation Standards

### Code Comments

**When to Comment:**
- **Complex algorithms:** Explain the "why", not the "what"
- **Non-obvious domain logic:** MRZ format, checksum validation
- **Performance decisions:** Why sequential not parallel
- **Workarounds:** Explain bug being worked around

**When NOT to Comment:**
- Self-documenting code: `const valid = mrz.valid;` doesn't need "// check if valid"
- Obvious loops: `for (let i = 0; i < items.length; i++)` is clear

**Example:**
```javascript
/**
 * Extract MRZ lines from full-page OCR text.
 * MRZ (Machine Readable Zone) is a 2-line zone at bottom of passport.
 * Each line has 44 characters (TD3 format), contains '<' delimiters.
 *
 * @param {string} ocrText - Raw OCR output from Tesseract
 * @returns {string[]|null} Two normalized MRZ lines or null
 */
export function extractMrzLines(ocrText) {
  // Filter to lines >= 30 chars (account for OCR errors)
  // and containing '<' (MRZ-specific separator)
  const lines = ocrText
    .split('\n')
    .map((l) => l.replace(/\s/g, '').toUpperCase())
    .filter((l) => l.length >= 30 && l.includes('<'));

  if (lines.length < 2) {
    return null;
  }

  // Take last 2 qualifying lines because MRZ is at bottom of passport
  // (handles cases where OCR mistakenly identifies other text zones)
  const mrzLines = lines.slice(-2);

  // Normalize to TD3 format (44 chars): pad or truncate
  return mrzLines.map((line) => {
    if (line.length < 44) return line.padEnd(44, '<');
    if (line.length > 44) return line.slice(0, 44);
    return line;
  });
}
```

### Function Documentation

```javascript
/**
 * Process a single passport image through the OCR pipeline.
 *
 * @param {string} imagePath - Absolute path to passport image
 * @returns {Promise<{status: string, filename: string, record?: Object, error?: string}>}
 *   On success: { status: 'SUCCESS', filename, record: { id, passport_number, ... } }
 *   On failure: { status: 'ERROR', filename, error: 'description' }
 *
 * @throws {Error} Only if database write fails (processed image is lost)
 *
 * @example
 * const result = await scanner.processOne('./input/passport.jpg');
 * if (result.status === 'SUCCESS') {
 *   console.log(`Passport: ${result.record.passport_number}`);
 * }
 */
async processOne(imagePath) {
  // Implementation
}
```

## File Size Targets

| File | Target | Current | Status |
|------|--------|---------|--------|
| index.js | <120 LOC | 91 | ✓ |
| passport-scanner.js | <200 LOC | 165 | ✓ |
| ocr-engine.js | <100 LOC | 63 | ✓ |
| image-preprocessor.js | <50 LOC | 27 | ✓ |
| mrz-parser.js | <150 LOC | 95 | ✓ |
| csv-database.js | <150 LOC | 132 | ✓ |
| image-validator.js | <60 LOC | 44 | ✓ |

**Rationale:** Smaller files easier to understand, maintain, and test independently.

## Dependency Management

### Current Stack
- **tesseract.js** – OCR engine (npm outdated quarterly)
- **mrz** – MRZ parsing (stable, ICAO 9303)
- **sharp** – Image processing (security updates monthly)
- **commander** – CLI framework (minor updates quarterly)
- **csv-writer** – CSV export (stable, minimal changes)
- **async-lock** – Concurrency (stable, no active development)
- **vitest** – Testing (updates quarterly)

### Upgrade Policy
- **Security updates:** Apply immediately
- **Minor versions:** Apply monthly
- **Major versions:** Test thoroughly before applying
- **Pin exact versions:** Use package-lock.json to ensure consistency

---

**Document Version:** 1.0.0
**Last Updated:** 2025-04-11
**Applies to:** passport-ocr v1.0.0+
