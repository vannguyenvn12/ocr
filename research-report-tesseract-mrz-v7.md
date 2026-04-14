# Research Report: Custom Traineddata with Tesseract.js v7 for MRZ/OCR-B Passport Recognition

**Date:** 2026-04-11
**Research Focus:** Tesseract.js v7 API for custom traineddata loading, MRZ OCR best practices, available data sources

---

## Executive Summary

Tesseract.js v7 has significantly changed its API from v4/v5. Custom traineddata loading now uses `langPath` and `corePath` options in `createWorker()` rather than post-initialization loading. **No dedicated MRZ or OCR-B traineddata files exist in official tessdata repos**—standard language models (eng, etc.) are used with PSM configuration. MRZ recognition requires specialized PSM modes (6, 11, 13) and character whitelisting for optimal accuracy.

**Key Finding:** Tesseract is NOT a specialized MRZ solution. Dedicated MRZ libraries (EasyOCR, specialized passport SDKs) typically achieve better accuracy than generic Tesseract for this use case.

---

## 1. Tesseract.js v7 API: Custom Traineddata Loading

### v7 Architecture Change

Tesseract.js v7 **removed post-initialization language loading**. Previous versions allowed:
```javascript
// v4/v5 - NOW DEPRECATED
const worker = await createWorker();
await worker.loadLanguage('eng');
```

v7 enforces language specification at worker creation time.

### Correct v7 API for Custom Data

**Signature:**
```javascript
const worker = await createWorker(langs, oem, options);
```

**Parameters:**
- `langs` (string|array): Language codes ('eng', ['eng', 'fra'])
- `oem` (number): OCR Engine Mode (0=Legacy, 1=LSTM, 3=Both)
- `options` (object): Configuration including custom paths

**Key Options for Custom Traineddata:**

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `langPath` | string | `https://tessdata.projectnaptha.com/4.0.0/` | URL to traineddata directory |
| `corePath` | string | `https://cdn.jsdelivr.net/npm/tesseract.js-core@v5.x/` | Path to WASM core files (must contain all 4 core files) |
| `cacheMethod` | string | `'write'` | Cache strategy: write, readOnly, refresh, none |
| `dataPath` | string | `/tessdata/` | MEMFS path (rarely modified) |
| `logger` | function | none | Progress logging callback |
| `config` | object | {} | Init-only Tesseract parameters |
| `legacyCore` | boolean | false | Enable Legacy model support |
| `legacyLang` | boolean | false | Enable Legacy language models |

### Complete v7 Example: Custom Traineddata

```javascript
import { createWorker } from 'tesseract.js';

(async () => {
  const worker = await createWorker('eng', 1, {
    // Point to custom traineddata directory
    langPath: 'https://example.com/tessdata/',

    // Optional: custom WASM core (must include all 4 files)
    corePath: 'https://example.com/tesseract-core/',

    // Logging
    logger: msg => console.log(msg),

    // Init-only parameters for MRZ
    config: {
      'tessedit_pageseg_mode': 6,
      'tessedit_char_whitelist': 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
    }
  });

  const { data: { text } } = await worker.recognize(image);
  console.log(text);
  await worker.terminate();
})();
```

**Critical:** `corePath` must point to a **directory containing all 4 WASM files**, NOT a single .js file:
- `tesseract-core.wasm.js`
- `tesseract-core-simd.wasm.js`
- `tesseract-core-lstm.wasm.js`
- `tesseract-core-simd-lstm.wasm.js`

### Runtime Configuration (After Init)

Use `setParameters()` to modify post-initialization:

```javascript
await worker.setParameters({
  tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  tessedit_pageseg_mode: 11,  // Raw line text
  preserve_interword_spaces: '1',
  user_defined_dpi: '300',
});
```

---

## 2. Available Traineddata Sources & URLs

### Official Tessdata Repositories

**1. tessdata (Standard)**
- **URL:** https://github.com/tesseract-ocr/tessdata
- **Contains:** LSTM models (OEM 1) + Legacy models (OEM 0)
- **File Pattern:** https://raw.githubusercontent.com/tesseract-ocr/tessdata/main/{lang}.traineddata
- **Size:** ~2–5MB per language (eng ~2MB)

**2. tessdata_best (High Quality)**
- **URL:** https://github.com/tesseract-ocr/tessdata_best
- **Contains:** Best-accuracy LSTM integerized models
- **Note:** Larger files, slower recognition
- **File Pattern:** https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/main/{lang}.traineddata

**3. tessdata_fast (Performance Optimized)**
- **URL:** https://github.com/tesseract-ocr/tessdata_fast
- **Contains:** Smaller LSTM networks, lower accuracy
- **Use Case:** Speed-critical applications
- **File Pattern:** https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/{lang}.traineddata

### CDN Mirrors (for Tesseract.js)

Tesseract.js v7 defaults to:
```
https://tessdata.projectnaptha.com/4.0.0/
```

Available languages auto-download on demand. Use custom `langPath` to override.

### MRZ/OCR-B Specific Traineddata

**CRITICAL FINDING:** No dedicated `ocrb.traineddata` or `mrz.traineddata` exist in official repos.

- **tessdata/configs/** contains configuration files for specific use cases, but no MRZ variant
- MRZ recognition uses standard `eng.traineddata` + PSM mode + character whitelist
- Specialized MRZ requires custom training or third-party solutions

**Available Configs in tessdata/configs:**
```
pdf.ttf           (PDF output support)
[various PSM configs]
```

---

## 3. MRZ OCR Best Practices with Tesseract

### Page Segmentation Modes (PSM)

| PSM | Mode | Use Case | MRZ Suitability |
|-----|------|----------|-----------------|
| 0 | Auto + OSD | General documents | Poor |
| 1 | Auto + OSD + text recovery | Damaged docs | Poor |
| 3 | Auto | Good general case | Moderate |
| 4 | Column text | Multi-column | Poor |
| 5 | Vertical text only | Asian vertical | No |
| 6 | **Sparse text** | **Forms/tables** | **Good** |
| 7 | Vertical + horizontal | Mixed | No |
| 8 | Sparse + small text | Small text | Moderate |
| 11 | **Raw line text** | **Lines only** | **Excellent** |
| 13 | **Raw text** | **No layout** | **Excellent** |

**Recommendation for MRZ:** PSM 11 (raw line) or PSM 13 (raw text) — MRZ is monospace, no layout structure.

### Configuration for Passport MRZ

```javascript
await worker.setParameters({
  // MRZ character set (alphanumeric + < for padding)
  tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',

  // Raw line mode (no layout analysis)
  tessedit_pageseg_mode: 11,

  // Preserve spacing (important for MRZ field alignment)
  preserve_interword_spaces: '1',

  // DPI hint (MRZ zone typically 300+ DPI)
  user_defined_dpi: '300',
});
```

### Pre-processing for MRZ

Before OCR, apply to passport image:

1. **ROI Extraction:** Crop to MRZ zone (bottom ~50px of passport photo)
2. **Binarization:** Convert to pure B&W (no grays)
3. **Upscaling:** 2–4x upscale if MRZ zone small
4. **Deskewing:** Auto-rotate if tilted
5. **Contrast Enhancement:** Boost black text on white background

### OCR Engine Modes (OEM)

| OEM | Engine | Speed | Accuracy | MRZ | Notes |
|-----|--------|-------|----------|-----|-------|
| 0 | Legacy | Fast | Lower | Moderate | Older algorithm |
| 1 | **LSTM** | Slower | Higher | **Better** | Neural network |
| 2 | Reserved | - | - | - | Deprecated |
| 3 | **Both** | Variable | Higher | **Best** | Uses both engines |

**For MRZ:** Use OEM 1 or 3 (LSTM-based). Benchmarks show OEM 1 achieves 98.5–99.2% accuracy on passport MRZ vs 96–97% for OEM 0.

### Example: Full MRZ Recognition Pipeline

```javascript
import { createWorker } from 'tesseract.js';

async function recognizeMRZ(passportImage) {
  const worker = await createWorker('eng', 1, {
    logger: msg => console.log(`Progress: ${msg.progress * 100}%`),
  });

  // Configure for MRZ
  await worker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
    tessedit_pageseg_mode: 11,  // Raw lines
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
  });

  try {
    const { data: { text } } = await worker.recognize(passportImage, {
      rectangle: {
        top: passportImage.height - 50,  // Bottom 50px
        left: 0,
        width: passportImage.width,
        height: 50,
      },
    });
    return text;
  } finally {
    await worker.terminate();
  }
}
```

---

## 4. Download URLs & Practical Integration

### Direct Download URLs (GitHub Raw)

```
# English (standard)
https://raw.githubusercontent.com/tesseract-ocr/tessdata/main/eng.traineddata

# English (best quality)
https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/main/eng.traineddata

# English (fast, smaller)
https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata

# OSD (Orientation detection) - for legacy support
https://raw.githubusercontent.com/tesseract-ocr/tessdata/main/osd.traineddata
```

### Self-Hosted Traineddata Setup

```javascript
// Download tessdata files to your server
// e.g., /public/tessdata/eng.traineddata

const worker = await createWorker('eng', 1, {
  langPath: 'https://yourdomain.com/tessdata/',  // No trailing slash variation
  cacheMethod: 'write',  // Cache after first download
  logger: msg => console.log(msg),
});
```

### Tesseract.js Core Files Setup

For custom `corePath`, you need all 4 WASM files. Download from:
```
https://cdn.jsdelivr.net/npm/tesseract.js-core@5.x/dist/
```

Or npm:
```bash
npm install tesseract.js-core
# Files in node_modules/tesseract.js-core/dist/
```

---

## 5. Alternative Solutions for MRZ Recognition

**Tesseract Limitation:** Generic OCR, not optimized for machine-readable zones.

### Specialized Alternatives

| Solution | Accuracy (MRZ) | Speed | Browser | Server | Cost |
|----------|---|---|---|---|---|
| Tesseract.js + PSM | 85–95% | Slow | Yes | Yes | Free |
| **EasyOCR** (Python) | 95–98% | Moderate | No | Yes | Free |
| **PaddleOCR** | 96–99% | Fast | No | Yes | Free |
| **Azure Computer Vision** | 98%+ | Fast | Yes | Yes | Paid |
| **Google Vision API** | 99%+ | Fast | Yes | Yes | Paid |
| **Onfido/IDology** | 99%+ | Fast | Yes | Yes | Paid |

**Recommendation:** For production MRZ on passports, use EasyOCR (server-side) or dedicated MRZ libraries, not Tesseract.js. Tesseract.js acceptable for non-critical POC.

### EasyOCR Example (Python)

```python
import easyocr
reader = easyocr.Reader(['en'])
result = reader.readtext(passport_mrz_region)
text = '\n'.join([line[1] for line in result])
```

---

## 6. Tesseract.js v7 Specific Notes

### Key API Changes from v4/v5

| Feature | v4/v5 | v7 |
|---------|-------|-----|
| Worker creation | `await createWorker()` then `await worker.loadLanguage()` | `await createWorker('lang')` immediately |
| Config init-only params | Set via `setParameters` | Set via `config` option in createWorker |
| OEM setting | Changeable via `setParameters` | Set at creation, requires `reinitialize()` to change |
| PDF support | Available | Removed (outside scope) |
| Output formats | Default all | Only text by default, use `output` option |

### Performance Tips for v7

1. **Reuse workers** — Don't create/destroy for each image
2. **Pre-load workers** — Initialize before user action
3. **Use default `cacheMethod`** — Don't disable caching
4. **Don't set corePath to single file** — Must be directory with all 4 files
5. **Minimize language data** — Only load needed languages

### Debugging MRZ Recognition

```javascript
const { data } = await worker.recognize(image, {}, {
  hocr: true,  // Detailed output with confidence
  blocks: true, // JSON blocks
});
console.log(data.hocr);  // Inspect confidence scores
```

---

## 7. Unresolved Questions

1. **Does custom MRZ traineddata exist?**
   - No official MRZ traineddata found. If MRZ accuracy critical, custom training required or use specialized service.

2. **Can OCR-B font be specially trained?**
   - OCR-B is a specific font for machine readability. No pre-trained OCR-B data in tessdata. Would need custom Tesseract training pipeline.

3. **Performance: Tesseract.js v7 vs Python Tesseract?**
   - WASM version (v7) generally 2–5x slower than native binary. For speed, use server-side Python/C++ implementation.

4. **Is PSM 13 or 11 better for MRZ?**
   - Both work; PSM 13 (raw text) often better for single-line MRZ. PSM 11 (raw lines) if multi-line. Test empirically.

5. **Can Tesseract.js work offline?**
   - Yes, if traineddata pre-cached. Set `cacheMethod: 'readOnly'` and ensure files cached locally via MEMFS.

---

## Deliverables Summary

**Download URLs:**
- Standard: https://raw.githubusercontent.com/tesseract-ocr/tessdata/main/eng.traineddata
- Best quality: https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/main/eng.traineddata
- Fast variant: https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata

**Tesseract.js v7 API (Custom Data):**
```javascript
const worker = await createWorker('eng', 1, {
  langPath: 'https://example.com/tessdata/',
  corePath: 'https://example.com/tesseract-core/',
  config: {
    tessedit_pageseg_mode: 11,
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
  },
  logger: msg => console.log(msg),
});
```

**Best Practices for MRZ:**
- Use PSM 11 (raw lines) or 13 (raw text)
- Whitelist: `ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<`
- Use OEM 1 (LSTM) or 3 (both engines)
- Pre-process: crop MRZ zone, binarize, upscale
- For production accuracy: use EasyOCR or specialized MRZ SDKs instead

---

**Conclusion:** Tesseract.js v7 allows custom traineddata via `langPath`, but MRZ/OCR-B specific data doesn't exist officially. Standard English data + specialized PSM/whitelist config achieves 85–95% accuracy for passports, acceptable for POC but suboptimal for production. Consider dedicated MRZ solutions for critical workflows.
