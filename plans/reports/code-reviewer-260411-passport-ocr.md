## Code Review Summary

### Scope
- Files: 7 source files + 3 test files
- LOC: ~400 (source), ~160 (tests)
- Focus: full codebase review

### Overall Assessment

**Quality Rating: 7/10**

Well-structured, modular codebase with clear separation of concerns. Good use of async/await, proper worker lifecycle management, and reasonable error handling. Issues found are mostly medium-severity: CSV injection vulnerability, incomplete edge case handling in MRZ parsing, missing test coverage for core modules, and a few logic bugs.

---

### Critical Issues

#### 1. CSV Injection (Security) -- `csv-database.js`

**Problem:** User-controlled data (filenames, raw OCR text, error messages) is written to CSV without sanitization. If a filename or OCR-extracted field starts with `=`, `+`, `-`, or `@`, spreadsheet applications will execute it as a formula when opened.

**Impact:** An attacker could craft a passport image whose OCR output injects formulas (e.g., `=CMD|'/C calc'!A0`) -- a known CSV injection / formula injection attack.

**File:** `src/csv-database.js`, line 49-62

**Fix:**
```js
function sanitizeCsvValue(value) {
  if (typeof value !== 'string') return value;
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`; // prefix with single quote to neutralize formula
  }
  return value;
}

// In appendRecord, sanitize all string fields before writing
const record = {
  id: this.nextId++,
  ...Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, sanitizeCsvValue(v)])
  ),
  processed_at: new Date().toISOString(),
};
```

#### 2. Path Traversal via `--file` flag (Security) -- `index.js`

**Problem:** `opts.file` is joined with `inputDir` via `path.join()` without validation. A user passing `--file "../../etc/passwd"` or `--file "../../../sensitive.jpg"` can read files outside the input directory.

**Impact:** Arbitrary file read on the filesystem (limited to image formats that pass validation, but Sharp can still leak metadata).

**File:** `src/index.js`, line 31

**Fix:**
```js
const filePath = path.join(inputDir, opts.file);
const resolved = path.resolve(filePath);
if (!resolved.startsWith(path.resolve(inputDir) + path.sep)) {
  console.error('Error: file must be inside input directory');
  process.exit(1);
}
```

---

### High Priority

#### 3. `processOne` silently swallows `appendRecord` failure -- `passport-scanner.js`

**Problem:** In the catch block (line 84-99), if `db.appendRecord()` throws during error logging, the exception is unhandled and the error record is silently lost.

**File:** `src/passport-scanner.js`, line 82-103

**Fix:** Wrap the error-path `appendRecord` in its own try/catch:
```js
} catch (err) {
  try {
    await this.db.appendRecord({ /* error record */ });
  } catch (dbErr) {
    console.error(`Warning: failed to log error to CSV: ${dbErr.message}`);
  }
  this.results.failed++;
  return { status: 'ERROR', filename, error: err.message };
}
```

#### 4. `recognizeMrz` whitelist not reset on error -- `ocr-engine.js`

**Problem:** If `worker.recognize()` throws inside `recognizeMrz()` (line 44), the whitelist parameter is never reset (line 47-49). All subsequent `recognize()` calls will only return chars matching `A-Z0-9<`, silently corrupting results.

**File:** `src/ocr-engine.js`, line 35-55

**Fix:** Use try/finally:
```js
async recognizeMrz(imagePath, rectangle) {
  // ...
  await this.worker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
  });
  try {
    const { data } = await this.worker.recognize(imagePath, { rectangle });
    return { text: data.text, confidence: data.confidence };
  } finally {
    await this.worker.setParameters({ tessedit_char_whitelist: '' });
  }
}
```

#### 5. `processOne` total count not incremented for single-file mode -- `passport-scanner.js`

**Problem:** `this.results.total` is only set in `processAll()` (line 108). When using `--file` (single file), `processOne()` is called directly from `index.js` without updating `total`, so the report shows `Total: 0`.

**File:** `src/passport-scanner.js`, line 34 and `src/index.js`, line 33

**Fix:** Increment `this.results.total++` at the start of `processOne()`.

#### 6. OCR substitution map has dangerous entry `D -> 0` -- `mrz-parser.js`

**Problem:** The substitution `D: '0'` (line 9) will corrupt valid MRZ data. The letter D appears frequently in passport numbers and country codes (e.g., "DEU" for Germany). When D appears between digits or chevrons (e.g., `123D<<`), it gets replaced with `1230<<`.

**Impact:** Corrupted passport numbers and nationality codes for a non-trivial percentage of passports.

**File:** `src/mrz-parser.js`, line 9

**Fix:** Remove the `D: '0'` entry. D/0 confusion is rare enough that the contextual heuristic is insufficient to handle it safely.

---

### Medium Priority

#### 7. `getAllRecords` header parsing fragile -- `csv-database.js`

**Problem:** `lines[0].split(',')` on line 73 does not handle quoted headers. While current headers have no commas, this is a latent bug if headers ever change. More importantly, the same naive split is used for the header line while the data lines use the proper `parseCsvLine()` -- inconsistent.

**File:** `src/csv-database.js`, line 73

**Fix:** Use `parseCsvLine()` for the header line too:
```js
const headers = parseCsvLine(lines[0]);
```

#### 8. `nextId` calculation fragile on re-initialization -- `csv-database.js`

**Problem:** `this.nextId = records.length + 1` (line 36) assumes IDs are always 1-indexed and sequential. If records are deleted manually or IDs skip, new records will collide with existing IDs.

**Fix:** Parse the actual max ID:
```js
const maxId = records.reduce((max, r) => Math.max(max, parseInt(r.id, 10) || 0), 0);
this.nextId = maxId + 1;
```

#### 9. Resize logic inverted -- `image-preprocessor.js`

**Problem:** Line 18: `const needsResize = metadata.width < TARGET_WIDTH` only resizes images *smaller* than 1200px. Large images (e.g., 4000px from a DSLR scan) pass through at full resolution, increasing OCR processing time without benefit.

For OCR, you typically want to downscale large images *and* upscale small ones to a target DPI. Currently, large images are untouched.

**File:** `src/image-preprocessor.js`, line 18

**Fix:** Resize if width differs significantly from target:
```js
const needsResize = metadata.width < TARGET_WIDTH || metadata.width > TARGET_WIDTH * 2;
```
Or always resize to target width (simpler, consistent):
```js
pipeline = pipeline.resize({ width: TARGET_WIDTH });
```

#### 10. No duplicate detection -- `passport-scanner.js`

**Problem:** Processing the same image twice appends a duplicate record. `findByPassportNumber()` exists but is never called. Should check before appending.

#### 11. `raw_text` newline encoding -- `passport-scanner.js`

**Problem:** Line 74: `ocrResult.text.replace(/\n/g, '\\n')` replaces newlines with literal backslash-n. When read back via `getAllRecords()`, the field contains literal `\n` strings, not newlines. This is fine for CSV storage but confusing for downstream consumers. Consider whether this is intentional.

#### 12. Missing `metadata.size` reliability -- `image-validator.js`

**Problem:** Line 26: `metadata.size` from Sharp may be undefined for certain formats/pipelines. The `&&` guard handles this, but it means the file size check is silently skipped for some formats. Use `fs.stat()` for reliable file size.

---

### Low Priority

#### 13. Commander async error handling -- `index.js`

Commander does not natively catch async action errors in all versions. If `scanner.initialize()` throws before the try block, or if the promise is rejected asynchronously, it may result in an unhandled rejection instead of a clean exit. Consider adding a top-level `.catch()`.

#### 14. No `.gitignore` or input validation on directory existence

The `scan` command does not verify `inputDir` exists before calling `readdir()`, which will throw an opaque ENOENT error.

#### 15. Test coverage gaps

- No tests for `OcrEngine`, `PassportScanner`, or `image-preprocessor.js`
- MRZ parser tests cover happy path but not edge cases (3-line MRZ, TD1/TD2 card formats, lines with extreme OCR noise)
- CSV tests don't cover fields containing commas, quotes, or newlines
- No integration tests

---

### Positive Observations

- Clean module separation: each file has a single responsibility
- Proper use of `AsyncLock` for CSV write concurrency
- Worker lifecycle well-managed (initialize/shutdown pattern in scanner)
- `parseCsvLine()` correctly handles RFC 4180 quoted fields with escaped quotes
- OCR substitution approach is contextually aware (only replaces between digits/chevrons)
- Image validation catches common issues (format, resolution, size) early
- Error records are logged to CSV alongside successes (good for audit trails)
- Consistent use of ESM modules throughout

---

### Recommended Actions (Priority Order)

1. **Remove `D: '0'` from OCR substitutions** -- actively corrupts valid data (HIGH, easy fix)
2. **Add CSV value sanitization** -- prevents formula injection (CRITICAL, ~10 lines)
3. **Add path traversal guard on `--file`** -- prevents directory escape (CRITICAL, ~5 lines)
4. **Add try/finally in `recognizeMrz`** -- prevents state corruption (HIGH, ~3 lines)
5. **Fix `appendRecord` error swallowing** -- prevents silent data loss (HIGH, ~5 lines)
6. **Fix `nextId` to use max(id)** -- prevents ID collision (MEDIUM, ~2 lines)
7. **Use `parseCsvLine` for header parsing** -- consistency (MEDIUM, 1 line)
8. **Add resize for large images** -- performance improvement (MEDIUM, 1 line)
9. **Increment `total` in `processOne`** -- report accuracy (HIGH, 1 line)
10. **Add tests for CSV edge cases and core modules** -- coverage (MEDIUM, ongoing)

---

### Metrics

| Metric | Value |
|--------|-------|
| Type Coverage | N/A (plain JS, no TypeScript) |
| Test Coverage | ~30% (3/7 modules have tests) |
| Linting Issues | Not configured (no ESLint/Prettier in devDeps) |
| Security Issues | 2 critical (CSV injection, path traversal) |
| Logic Bugs | 2 (D->0 substitution, resize inversion) |

---

### Unresolved Questions

1. Is `recognizeMrz()` intended to be used? It's defined in `OcrEngine` but never called by `PassportScanner`. If the plan is to use it for second-pass MRZ-region OCR, the try/finally fix becomes even more important.
2. Should the tool support TD1/TD2 (ID card) formats? Currently hardcoded to 44-char TD3 lines only.
3. Is the `raw_text` `\n` encoding intentional, or should it use a different escaping strategy?
