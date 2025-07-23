import { test, expect } from '@playwright/test';

test.describe('DiCompare App Integration Tests', () => {
  test('loads the app and verifies Pyodide is working', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // Wait for the app to load - look for the main title
    await expect(page.locator('text=dicompare')).toBeVisible();

    // Wait for Pyodide to load by checking for the PyodideContext
    // This is a more robust way than waiting for a fixed time
    await page.waitForFunction(() => {
      return window.pyodide !== undefined;
    }, { timeout: 120000 }); // 2 minutes timeout for Pyodide loading

    // Verify we can execute Python code
    const pythonResult = await page.evaluate(async () => {
      // Access Pyodide through the global window object
      if (!window.pyodide) {
        throw new Error('Pyodide not available');
      }

      try {
        // Run a simple Python command
        await window.pyodide.runPython(`
import sys
print("hello world")
result = "Python execution successful"
        `);
        
        // Get the result variable we set
        const result = window.pyodide.globals.get('result');
        return result;
      } catch (error) {
        throw new Error(`Python execution failed: ${error}`);
      }
    });

    // Verify the Python code executed successfully
    expect(pythonResult).toBe('Python execution successful');

    // Verify we can also access Python's sys module
    const pythonVersion = await page.evaluate(async () => {
      return window.pyodide.runPython(`
import sys
sys.version_info.major
      `);
    });

    // Should be Python 3
    expect(pythonVersion).toBe(3);

    // Verify the main navigation sections are present
    await expect(page.locator('text=Check Compliance')).toBeVisible();
    await expect(page.locator('text=Create Report')).toBeVisible();

    console.log('✅ Pyodide is working correctly - Python executed successfully!');
  });

  test('verifies dicompare package is available in Pyodide', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // Wait for Pyodide to be ready
    await page.waitForFunction(() => {
      return window.pyodide !== undefined;
    }, { timeout: 120000 });

    // Test that we can import dicompare
    const dicompareImportResult = await page.evaluate(async () => {
      try {
        await window.pyodide.runPython(`
import dicompare
print("dicompare package imported successfully")
result = "dicompare import successful"
        `);
        
        return window.pyodide.globals.get('result');
      } catch (error) {
        return `Import failed: ${error}`;
      }
    });

    expect(dicompareImportResult).toBe('dicompare import successful');

    // Verify we can create a ComplianceSession
    const sessionResult = await page.evaluate(async () => {
      try {
        await window.pyodide.runPython(`
from dicompare.session import ComplianceSession
session = ComplianceSession()
result = "ComplianceSession created successfully"
        `);
        
        return window.pyodide.globals.get('result');
      } catch (error) {
        return `Session creation failed: ${error}`;
      }
    });

    expect(sessionResult).toBe('ComplianceSession created successfully');

    console.log('✅ DiCompare package is working correctly in Pyodide!');
  });

  test('verifies basic UI elements are functional', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // Wait for the app to load
    await expect(page.locator('text=dicompare')).toBeVisible();

    // Test navigation to Check Compliance page
    await page.click('text=Check Compliance');
    
    // Should see the compliance checking interface
    await expect(page.locator('text=Load DICOM files first')).toBeVisible();
    await expect(page.locator('text=Drop DICOM files here')).toBeVisible();

    // Test navigation to Create Report page
    await page.click('text=Create Report');
    
    // Should see the report creation interface
    await expect(page.locator('text=Generate Report')).toBeVisible();

    console.log('✅ Basic UI navigation is working correctly!');
  });
});

// Add global type declarations for Pyodide
declare global {
  interface Window {
    pyodide: any;
  }
}