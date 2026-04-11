import { describe, it, expect } from 'vitest';
import { validateImage } from '../src/utils/image-validator.js';
import path from 'path';

describe('validateImage', () => {
  it('rejects unsupported formats', async () => {
    const result = await validateImage('photo.gif');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unsupported format');
  });

  it('rejects .txt files', async () => {
    const result = await validateImage('document.txt');
    expect(result.valid).toBe(false);
  });

  it('handles nonexistent files gracefully', async () => {
    const result = await validateImage(path.resolve('nonexistent.jpg'));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Cannot read image');
  });
});
