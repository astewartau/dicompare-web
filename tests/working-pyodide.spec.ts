import { test, expect } from '@playwright/test';

test.describe('Working Pyodide Test', () => {
  test('loads app and executes print("hello world")', async ({ page }) => {
    // Skip if not running against a live server
    test.skip(!process.env.TEST_URL, 'Set TEST_URL environment variable to run this test');
    
    const testUrl = process.env.TEST_URL || 'http://localhost:2000';
    
    console.log(`Testing against: ${testUrl}`);
    
    // Navigate to the app
    await page.goto(testUrl);

    // Capture all console messages
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleMessages.push(text);
      console.log(`Browser: ${text}`);
    });

    // Wait for the page to load and show dicompare title
    await expect(page.locator('text=dicompare')).toBeVisible({ timeout: 30000 });
    console.log('✅ App loaded successfully!');

    // Wait for Pyodide loading to complete by checking console messages
    let pyodideReady = false;
    for (let i = 0; i < 180; i++) { // 3 minutes max
      if (consoleMessages.some(msg => 
        msg.includes('Pyodide and dicompare loaded successfully') ||
        msg.includes('dicompare installed') ||
        msg.includes('ComplianceSession initialized')
      )) {
        pyodideReady = true;
        console.log('✅ Pyodide loading detected in console!');
        break;
      }
      await page.waitForTimeout(1000);
    }

    expect(pyodideReady).toBe(true);

    // Give it a moment more to fully settle
    await page.waitForTimeout(3000);

    // Now try to execute Python code
    const result = await page.evaluate(async () => {
      // Check if pyodide is available globally
      if (window.pyodide) {
        try {
          // Execute print statement
          if (window.pyodide.runPythonAsync) {
            await window.pyodide.runPythonAsync('print("hello world")');
            return 'success_async';
          } else if (window.pyodide.runPython) {
            window.pyodide.runPython('print("hello world")');
            return 'success_sync';
          } else {
            return 'no_run_method';
          }
        } catch (error) {
          return `error: ${error}`;
        }
      } else {
        return 'pyodide_not_available';
      }
    });

    console.log(`Python execution result: ${result}`);

    // Wait for console output
    await page.waitForTimeout(2000);

    // Log all console messages that might contain our output
    const relevantMessages = consoleMessages.filter(msg => 
      msg.toLowerCase().includes('hello') || 
      msg.toLowerCase().includes('world')
    );
    console.log('Messages containing "hello" or "world":', relevantMessages);

    // Test passes if we successfully executed Python code
    expect(result).toMatch(/^success/);
    
    console.log('✅ Python print("hello world") executed successfully!');
  });
});

declare global {
  interface Window {
    pyodide: any;
  }
}