import { test, expect } from '@playwright/test';

test.describe('Pyodide Basic Functionality', () => {
  test('executes print("hello world") in Pyodide', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // Set up console message capture early
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      consoleMessages.push(msg.text());
    });

    // Wait for the specific success message that indicates Pyodide is fully ready
    console.log('Waiting for Pyodide to load...');
    await page.waitForFunction(() => {
      // Look for the specific console messages that indicate successful loading
      const logs = Array.from(document.querySelectorAll('*')).some(el => 
        el.textContent?.includes('Pyodide and dicompare loaded successfully')
      );
      return logs || window.pyodide !== undefined;
    }, { timeout: 180000 }); // 3 minutes for full loading

    // Additional wait to ensure everything is stabilized
    await page.waitForTimeout(3000);

    console.log('Pyodide loaded! Executing Python code...');

    // Try to execute Python code using the global pyodide instance
    const result = await page.evaluate(async () => {
      try {
        // First try using the global pyodide instance
        if (window.pyodide && window.pyodide.runPythonAsync) {
          await window.pyodide.runPythonAsync('print("hello world")');
          return 'success_global';
        }
        
        // Fallback: try runPython if runPythonAsync doesn't exist
        if (window.pyodide && window.pyodide.runPython) {
          window.pyodide.runPython('print("hello world")');
          return 'success_sync';
        }
        
        return 'pyodide_not_available';
      } catch (error) {
        return `error: ${error}`;
      }
    });

    console.log('Python execution result:', result);

    // Wait for console output to appear
    await page.waitForTimeout(2000);

    // Check if "hello world" appeared in console
    const hasHelloWorld = consoleMessages.some(msg => msg.includes('hello world'));
    
    console.log('Console messages containing "hello":', 
      consoleMessages.filter(msg => msg.toLowerCase().includes('hello'))
    );

    // Verify the test passed
    expect(result).toMatch(/^success/);
    expect(hasHelloWorld).toBe(true);

    console.log('✅ Successfully executed print("hello world") in Pyodide!');
  });
});

// Global type declaration for Pyodide
declare global {
  interface Window {
    pyodide: any;
  }
}