import { google } from 'googleapis';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

export class GoogleDriveClient {
  constructor(credentialsPath) {
    this.credentialsPath = credentialsPath || './credentials.json';
    this.drive = null;
  }

  async initialize() {
    const keyFile = JSON.parse(await readFile(this.credentialsPath, 'utf-8'));
    const auth = new google.auth.GoogleAuth({
      credentials: keyFile,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    this.drive = google.drive({ version: 'v3', auth });
  }

  /**
   * Search file by filename across all shared folders.
   * Service account only sees folders shared with it, so no root ID needed.
   */
  async findFileByName(filename) {
    const res = await this.drive.files.list({
      q: `name = '${filename}' and trashed = false`,
      fields: 'files(id, name, mimeType)',
      pageSize: 1,
    });

    if (!res.data.files || res.data.files.length === 0) {
      throw new Error(`Not found in Drive: ${filename}`);
    }
    return res.data.files[0].id;
  }

  /**
   * Download a file by its Drive file ID to a local temp path.
   */
  async downloadFile(fileId, destDir, filename) {
    if (!existsSync(destDir)) {
      await mkdir(destDir, { recursive: true });
    }

    const destPath = path.join(destDir, filename);
    const res = await this.drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' },
    );

    await writeFile(destPath, Buffer.from(res.data));
    return destPath;
  }

  /**
   * Download file by relative path from DB.
   * Extracts filename, searches Drive, downloads to temp.
   */
  async downloadByPath(relativePath, destDir) {
    const filename = path.basename(relativePath);
    const fileId = await this.findFileByName(filename);
    return this.downloadFile(fileId, destDir, filename);
  }
}
