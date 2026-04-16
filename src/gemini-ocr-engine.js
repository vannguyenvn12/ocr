import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';

const PASSPORT_PROMPT = `You are a passport OCR system. Analyze this passport image and extract ALL fields.

Return ONLY a JSON object with these exact keys (no markdown, no explanation):
{
  "passport_number": "",
  "surname": "",
  "given_names": "",
  "date_of_birth": "YYYY-MM-DD",
  "expiry_date": "YYYY-MM-DD",
  "nationality": "3-letter code",
  "sex": "M or F",
  "issuing_country": "3-letter code",
  "mrz_line1": "44-char MRZ line 1 if visible",
  "mrz_line2": "44-char MRZ line 2 if visible",
  "confidence": 0-100
}

Rules:
- Read from BOTH the visual text fields AND the MRZ zone at the bottom
- Cross-check visual fields against MRZ data for accuracy
- Use ISO 3166-1 alpha-3 country codes (VNM, USA, GBR, etc.)
- Dates must be YYYY-MM-DD format
- If a field is unreadable, use empty string ""
- confidence: your estimated accuracy 0-100`;

export class GeminiOcrEngine {
  constructor(apiKey, model = 'gemini-2.5-flash') {
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is required. Set it as environment variable.');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model });
  }

  async initialize() {
    // No-op — Gemini SDK doesn't need worker initialization
  }

  async processPassport(imagePath, maxRetries = 3) {
    // Resize + compress to reduce token cost
    const compressed = await sharp(imagePath)
      .resize(800, null, { withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();

    const content = [
      PASSPORT_PROMPT,
      { inlineData: { mimeType: 'image/jpeg', data: compressed.toString('base64') } },
    ];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.model.generateContent(content);
        const text = result.response.text();
        return parseGeminiResponse(text);
      } catch (err) {
        const isRetryable = err.message?.includes('503') || err.message?.includes('429');
        if (!isRetryable || attempt === maxRetries) throw err;
        const delay = attempt * 5000;
        console.log(`\n  Retrying in ${delay / 1000}s (attempt ${attempt}/${maxRetries})...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  async shutdown() {
    // No-op — no workers to terminate
  }
}

function parseGeminiResponse(text) {
  // Strip markdown code fences if present
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  try {
    const data = JSON.parse(cleaned);
    return {
      passportNumber: data.passport_number || '',
      surname: data.surname || '',
      givenNames: data.given_names || '',
      dateOfBirth: data.date_of_birth || '',
      expiryDate: data.expiry_date || '',
      nationality: data.nationality || '',
      sex: data.sex || '',
      issuingCountry: data.issuing_country || '',
      mrzLine1: data.mrz_line1 || '',
      mrzLine2: data.mrz_line2 || '',
      confidence: data.confidence || 0,
      valid: !!(data.passport_number && data.surname && data.date_of_birth),
      raw: text,
    };
  } catch {
    return {
      passportNumber: '', surname: '', givenNames: '',
      dateOfBirth: '', expiryDate: '', nationality: '',
      sex: '', issuingCountry: '', mrzLine1: '', mrzLine2: '',
      confidence: 0, valid: false, raw: text,
      error: 'Failed to parse Gemini response as JSON',
    };
  }
}
