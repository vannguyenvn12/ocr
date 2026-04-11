# Phase 1: Project Setup

**Priority:** High | **Effort:** 15min | **Status:** completed

## Overview
Initialize Node.js project, install dependencies, create directory structure.

## Implementation Steps

1. `npm init -y` in `d:/Văn/ocr`
2. Install production deps: `tesseract.js`, `mrz`, `sharp`, `async-lock`, `commander`
3. Install dev deps: `vitest`
4. Create directory structure: `src/`, `src/utils/`, `input/`, `output/preprocessed/`, `tests/`
5. Configure `package.json` scripts: `start`, `test`
6. Create `.gitignore` (node_modules, output/, input/)

## Success Criteria
- `npm install` completes without errors
- All directories exist
- `node src/index.js --help` runs without crash
