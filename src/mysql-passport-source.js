import mysql from 'mysql2/promise';

/**
 * Manages 2 MySQL connections:
 * - sourcePool: reads file paths from g_ticket_pax
 * - sharedPool: writes OCR results to passport_ocr
 */
export class MysqlPassportSource {
  constructor(sourceConfig, sharedConfig) {
    this.sourceConfig = sourceConfig;
    this.sharedConfig = sharedConfig;
    this.sourcePool = null;
    this.sharedPool = null;
  }

  async initialize() {
    this.sourcePool = mysql.createPool({ ...this.sourceConfig, waitForConnections: true, connectionLimit: 5 });
    this.sharedPool = mysql.createPool({ ...this.sharedConfig, waitForConnections: true, connectionLimit: 5 });
    await this.ensureResultTable();
  }

  async ensureResultTable() {
    await this.sharedPool.execute(`
      CREATE TABLE IF NOT EXISTS passport_ocr (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ticket_id VARCHAR(255) NOT NULL,
        passport_type ENUM('us','vn') NOT NULL,
        source_path VARCHAR(500),
        passport_number VARCHAR(50),
        surname VARCHAR(255),
        given_names VARCHAR(255),
        date_of_birth DATE,
        expiry_date DATE,
        nationality VARCHAR(10),
        sex CHAR(1),
        issuing_country VARCHAR(10),
        mrz_line1 VARCHAR(100),
        mrz_line2 VARCHAR(100),
        mrz_valid TINYINT(1) DEFAULT 0,
        ocr_confidence INT DEFAULT 0,
        status ENUM('SUCCESS','ERROR') NOT NULL,
        error_message TEXT,
        processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ticket (ticket_id),
        INDEX idx_status (status)
      )
    `);
  }

  /**
   * Fetch unprocessed passport rows from g_ticket_pax.
   * Returns rows that have file_passport_us or file_passport_vn
   * but haven't been scanned yet (not in passport_ocr).
   */
  async fetchPendingPassports(limit = 100) {
    const [rows] = await this.sourcePool.execute(
      `SELECT id_ticket, pax_name, file_passport_us, file_passport_vn
       FROM g_ticket_pax
       WHERE (file_passport_us IS NOT NULL AND file_passport_us != '')
          OR (file_passport_vn IS NOT NULL AND file_passport_vn != '')
       LIMIT ?`,
      [limit],
    );

    // Expand into individual tasks (us + vn separately)
    const tasks = [];
    for (const row of rows) {
      if (row.file_passport_us) {
        tasks.push({ ticketId: row.id_ticket, paxName: row.pax_name, type: 'us', path: row.file_passport_us });
      }
      if (row.file_passport_vn) {
        tasks.push({ ticketId: row.id_ticket, paxName: row.pax_name, type: 'vn', path: row.file_passport_vn });
      }
    }

    // Filter out already processed
    if (tasks.length === 0) return tasks;

    const ticketIds = [...new Set(tasks.map((t) => t.ticketId))];
    const placeholders = ticketIds.map(() => '?').join(',');
    const [existing] = await this.sharedPool.execute(
      `SELECT ticket_id, passport_type FROM passport_ocr WHERE ticket_id IN (${placeholders})`,
      ticketIds,
    );

    const processed = new Set(existing.map((e) => `${e.ticket_id}:${e.passport_type}`));
    return tasks.filter((t) => !processed.has(`${t.ticketId}:${t.type}`));
  }

  /**
   * Insert OCR result into passport_ocr.
   */
  async insertResult(result) {
    await this.sharedPool.execute(
      `INSERT INTO passport_ocr
        (ticket_id, passport_type, source_path, passport_number, surname, given_names,
         date_of_birth, expiry_date, nationality, sex, issuing_country,
         mrz_line1, mrz_line2, mrz_valid, ocr_confidence, status, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        result.ticketId,
        result.passportType,
        result.sourcePath,
        result.passportNumber || null,
        result.surname || null,
        result.givenNames || null,
        result.dateOfBirth || null,
        result.expiryDate || null,
        result.nationality || null,
        result.sex || null,
        result.issuingCountry || null,
        result.mrzLine1 || null,
        result.mrzLine2 || null,
        result.mrzValid ? 1 : 0,
        result.ocrConfidence || 0,
        result.status,
        result.errorMessage || null,
      ],
    );
  }

  async shutdown() {
    if (this.sourcePool) await this.sourcePool.end();
    if (this.sharedPool) await this.sharedPool.end();
  }
}
