# Playwright Tests

This directory contains end-to-end tests for the DiCompare application using Playwright.

## Tests Overview

- **app.spec.ts**: High-level integration tests that verify:
  - App loads correctly
  - Pyodide is available and working
  - Python code execution via `print("hello world")`
  - DiCompare package imports correctly
  - Basic UI navigation functions

## Running Tests

```bash
# Run all tests
npm test

# Run tests with UI mode (interactive)
npm run test:ui

# Run tests in headed mode (browser visible)
npm run test:headed

# Run tests in debug mode
npm run test:debug
```

## Test Configuration

The tests are configured to:
- Start the dev server automatically before running tests
- Wait up to 2 minutes for Pyodide to load
- Test against Chromium, Firefox, and WebKit browsers
- Run at the highest level with no mocks - testing the real application

## What These Tests Verify

1. **Pyodide Integration**: Ensures Python runtime is loaded and functional
2. **DiCompare Package**: Verifies the dicompare-pip package is available
3. **Python Execution**: Tests actual Python code execution via `print("hello world")`
4. **UI Functionality**: Basic navigation and component rendering
5. **Real Environment**: No mocking - tests the actual application as users would experience it