# Phase 5: CSV Database

**Priority:** Medium | **Effort:** 20min | **Status:** completed

## Overview
CSV file as passport data storage with append-safe writes and async locking.

## Related Files
- Create: `src/csv-database.js`

## Implementation Steps

1. `CsvDatabase` class:
   - `constructor(filePath)` → set headers matching CSV schema from plan.md
   - `initialize()` → create CSV file with headers if not exists
   - `appendRecord(data)` → async-lock protected append
   - `getAllRecords()` → read and parse all records
   - `findByPassportNumber(number)` → search for duplicate
2. Use `async-lock` for write safety
3. Proper CSV escaping for fields containing commas/quotes
4. Auto-increment ID based on existing record count

## Success Criteria
- Records appended without corruption
- Duplicate detection by passport_number
- CSV openable in Excel with correct columns
