# TransiSafe 2.1

Version 2.1 focuses on maintainability, testability, and clearer communication of the engineering model.

## Highlights

- modularized the former monolithic C application into focused components for analysis, CSV I/O, configuration, database access, logging, statistics, and application flow
- added automated unit tests for core calculations, boundary classification, numeric validation, maximum allowable current, and critical-point selection
- extended GitHub Actions to run the unit-test suite before the existing 500-point smoke test
- clarified that TransiSafe performs a simplified thermal and power-based assessment rather than a complete manufacturer-defined Safe Operating Area evaluation

## Validation

- Windows/MSVC build: passed
- automated unit tests: passed
- 500-point smoke test: 231 SAFE, 69 CRITICAL, 200 NOT SAFE
