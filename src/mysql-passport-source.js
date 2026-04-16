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
        passport_type VARCHAR(10),
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
        INDEX idx_status (status),
        INDEX idx_source_path (source_path)
      )
    `);
  }

  /**
   * Fetch unprocessed passport rows joined with g_ticket_flight.
   * Ordered by pay_date DESC (newest paid tickets first).
   * Excludes already-processed source_paths via cross-DB check.
   */
  async fetchPendingPassports(limit = 100) {
    // 1. Get already processed paths
    const [processed] = await this.sharedPool.execute(
      `SELECT source_path FROM passport_ocr`,
    );
    const processedSet = new Set(processed.map((r) => r.source_path));

    // 2. Fetch source rows (over-fetch to account for filtering)
    const fetchLimit = limit * 3;
    const [rows] = await this.sourcePool.execute(
      `SELECT p.id_ticket, p.pax_name, p.file_passport_us, p.file_passport_vn,
              f.pay_date, f.pnr, f.airlines
       FROM g_ticket_pax p
       JOIN g_ticket_flight f ON p.flight_id = f.id_flight
       WHERE (p.file_passport_us IS NOT NULL AND p.file_passport_us != '')
          OR (p.file_passport_vn IS NOT NULL AND p.file_passport_vn != '')
       ORDER BY f.pay_date DESC
       LIMIT ?`,
      [fetchLimit],
    );

    // 3. Expand + filter out already processed
    const tasks = [];
    for (const row of rows) {
      if (row.file_passport_us && !processedSet.has(row.file_passport_us)) {
        tasks.push({ ticketId: row.id_ticket, paxName: row.pax_name, path: row.file_passport_us });
      }
      if (row.file_passport_vn && !processedSet.has(row.file_passport_vn)) {
        tasks.push({ ticketId: row.id_ticket, paxName: row.pax_name, path: row.file_passport_vn });
      }
      if (tasks.length >= limit) break;
    }

    return tasks.slice(0, limit);
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
        result.passportType || null,
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

  /**
   * Fetch failed passport records for retry.
   * Deletes the ERROR rows so they can be re-inserted on success.
   */
  async fetchFailedPassports() {
    const [rows] = await this.sharedPool.execute(
      `SELECT id, ticket_id, source_path FROM passport_ocr WHERE status = 'ERROR'`,
    );

    if (rows.length === 0) return [];

    // Delete error rows so retry can insert fresh
    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    await this.sharedPool.execute(
      `DELETE FROM passport_ocr WHERE id IN (${placeholders})`,
      ids,
    );

    return rows.map((r) => ({
      ticketId: r.ticket_id,
      paxName: '',
      path: r.source_path,
    }));
  }

  async shutdown() {
    if (this.sourcePool) await this.sourcePool.end();
    if (this.sharedPool) await this.sharedPool.end();
  }
}
