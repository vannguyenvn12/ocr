# Passport OCR Batch Scanner - Documentation Index

Welcome to the Passport OCR documentation hub. Start here to find the right guide for your role.

## Quick Navigation

### I'm a...

**New User / Getting Started**
→ Read [README.md](../README.md) first
- 5-minute quick start
- Installation instructions
- Copy-paste command examples
- Troubleshooting common errors

**Developer / Contributor**
→ Read [system-architecture.md](system-architecture.md)
- Understand how modules work together
- See data flow diagrams
- Learn error handling strategy
- Identify extension points

**Code Reviewer**
→ Read [code-standards.md](code-standards.md)
- Coding style and naming conventions
- Error handling patterns
- Testing standards
- Performance guidelines

**Project Manager / PM**
→ Read [project-overview-pdr.md](project-overview-pdr.md)
- Functional requirements
- Success metrics
- Architecture decisions
- Development roadmap

**Maintenance / Reference**
→ Read [codebase-summary.md](codebase-summary.md)
- Module overview
- Dependency tree
- Performance profile
- Known limitations

---

## Document Overview

### [README.md](../README.md) - 290 lines
**For:** Users, getting started
**Contains:**
- Quick start guide
- Tech stack
- Installation steps
- Usage examples (scan, single-file, report)
- CSV output schema (16 columns)
- Architecture overview
- Supported formats
- Error handling guide
- Performance tips

**Read time:** 10-15 minutes

---

### [docs/project-overview-pdr.md](project-overview-pdr.md) - 268 lines
**For:** Project managers, architects, stakeholders
**Contains:**
- Executive summary
- 7 Functional Requirements with acceptance criteria
- 5 Non-Functional Requirements
- 6 Success metrics (with targets)
- Technical constraints
- 5 Architecture decisions with rationale
- 8-phase development roadmap
- Known limitations
- Future enhancements (v2.0+)

**Read time:** 15-20 minutes

---

### [docs/system-architecture.md](system-architecture.md) - 383 lines
**For:** Developers, architects, code reviewers
**Contains:**
- High-level system overview
- 7 core module breakdowns:
  - CLI Entry Point (index.js)
  - Passport Scanner (orchestrator)
  - Image Validator
  - Image Preprocessor
  - OCR Engine
  - MRZ Parser
  - CSV Database
- Processing pipeline for single passport
- Data flow diagrams
- Error scenarios and recovery paths
- Performance characteristics
- Extensibility points
- Technology choices rationale

**Read time:** 20-25 minutes

---

### [docs/code-standards.md](code-standards.md) - 476 lines
**For:** Developers, code contributors
**Contains:**
- Codebase organization
- JavaScript style guidelines (ES2022)
- Naming conventions (files, classes, functions)
- Error handling patterns
- Concurrency & thread safety
- Single Responsibility Principle
- Separation of concerns
- Testing standards and coverage targets
- Performance guidelines
- Security practices
- Documentation standards
- File size targets
- Dependency management

**Read time:** 25-30 minutes

---

### [docs/codebase-summary.md](codebase-summary.md) - 597 lines
**For:** Maintainers, quick reference, code reviewers
**Contains:**
- Executive overview with statistics (620 LOC total)
- Project metrics table
- Detailed component breakdown
- Dependency tree
- Data flow diagrams
- Error handling strategy
- Configuration constants
- Testing coverage approach
- Performance profile (timing, memory)
- Technology stack rationale
- Extension points (easy vs hard)
- Development workflow commands
- Deployment options
- Known limitations
- v2.0 roadmap
- File structure summary

**Read time:** 30-40 minutes (reference document)

---

## Quick Reference

### Common Tasks

**I need to...**

**Install and run the tool**
→ README.md → Quick Start → Installation

**Understand how OCR works**
→ system-architecture.md → 3. OCR Engine

**Write code that follows standards**
→ code-standards.md → Naming Conventions & Error Handling

**Debug a CSV write error**
→ system-architecture.md → Error Scenarios
→ code-standards.md → Error Handling

**Add parallel processing**
→ codebase-summary.md → Extension Points
→ system-architecture.md → Extensibility Points

**Check performance expectations**
→ codebase-summary.md → Performance Profile
→ README.md → Performance Tips

**Understand MRZ parsing**
→ system-architecture.md → 6. MRZ Parser
→ code-standards.md → Module Responsibilities

**Review requirements**
→ project-overview-pdr.md → Functional/Non-Functional Requirements

---

## Key Statistics

| Metric | Value |
|--------|-------|
| **Total Documentation** | 2,014 lines |
| **Total Size** | 73.6 KB |
| **Modules Documented** | 7 core + 1 utility |
| **Dependency Count** | 7 production + 1 dev |
| **Total Source LOC** | ~620 lines |
| **CLI Commands** | 2 (scan, report) |
| **CSV Columns** | 16 |
| **Supported Formats** | 5 (JPG, PNG, BMP, TIFF) |
| **Architecture Decisions** | 5 documented |
| **FRs Documented** | 7 |
| **NFRs Documented** | 5 |
| **Success Metrics** | 6 |

---

## Documentation Structure

```
D:\Văn\ocr
├── README.md                               # Start here!
│
└── docs/
    ├── codebase-summary.md                 # Reference for developers
    ├── code-standards.md                   # Guidelines for contributors
    ├── project-overview-pdr.md             # Requirements & strategy
    ├── system-architecture.md              # Technical design
    └── INDEX.md (this file)                # Navigation hub
```

---

## How to Update Documentation

### When Code Changes
1. Identify which docs are affected
2. Update relevant sections
3. Verify code references still match
4. Re-read section to ensure clarity

### When Adding Features
1. Update project-overview-pdr.md roadmap
2. Add to system-architecture.md if new module
3. Add code examples to code-standards.md
4. Update codebase-summary.md statistics

### When Fixing Bugs
1. Update error scenarios if behavior changed
2. Note in troubleshooting section of README.md
3. Document workaround if temporary

### Before Release
1. Verify all version numbers match
2. Update "Last Updated" dates
3. Run link check
4. Proof-read for typos

---

## Verification Checklist

Use this when reviewing documentation:

- [ ] All code references verified against source files
- [ ] All function signatures match actual code
- [ ] All command examples tested and work
- [ ] All links between documents valid
- [ ] No broken cross-references
- [ ] Performance numbers up-to-date
- [ ] Architecture diagrams accurate
- [ ] Error messages match current implementation
- [ ] CSV schema matches csv-database.js
- [ ] Package dependencies match package.json

---

## FAQ: Which Document Should I Read?

**Q: I'm deploying this for the first time**
A: README.md → Installation → Usage Examples

**Q: I need to debug why OCR failed**
A: README.md → Error Handling → system-architecture.md → Error Scenarios

**Q: I want to add parallel processing**
A: system-architecture.md → Extensibility Points → code-standards.md → Concurrency & Thread Safety

**Q: What are the project requirements?**
A: project-overview-pdr.md → Functional Requirements

**Q: How much memory does this use?**
A: codebase-summary.md → Memory Profile OR README.md → Performance Tips

**Q: What's the architecture of the system?**
A: system-architecture.md → High-Level Overview

**Q: Can I extend this tool?**
A: codebase-summary.md → Extension Points (with difficulty assessment)

**Q: What coding style should I follow?**
A: code-standards.md → JavaScript Standards & Naming Conventions

**Q: Are there any known bugs or limitations?**
A: codebase-summary.md → Known Limitations & TODOs

**Q: How long does it take to scan a passport?**
A: codebase-summary.md → Performance Profile (1-2 seconds per image)

---

## Document Maintenance Schedule

- **Monthly:** Review for accuracy against latest code
- **Quarterly:** Update dependency versions
- **With each feature:** Add to roadmap and enhancement docs
- **With each bug fix:** Update troubleshooting if user-facing
- **Annually:** Full review and refresh

---

## Contributing to Documentation

When adding or updating docs:

1. **Be concise** – Avoid fluff, prioritize clarity
2. **Be accurate** – Verify against actual code
3. **Be practical** – Include copy-paste examples
4. **Be consistent** – Follow established style
5. **Be complete** – Cover happy paths and errors

---

## Support

**Found an issue or gap in documentation?**

1. Check if it's covered in another document
2. If not found, create an issue or PR with:
   - What's missing
   - Where it should go
   - Draft content if possible

**Have questions?**
- For usage: See README.md
- For architecture: See system-architecture.md
- For code: See code-standards.md
- For requirements: See project-overview-pdr.md
- For overview: See codebase-summary.md

---

**Documentation Index Version:** 1.0.0
**Last Updated:** 2025-04-11
**Total Documents:** 5 (README + 4 docs)
**Total Coverage:** 2,014 lines, 100% of project scope
