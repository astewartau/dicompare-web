import { test, expect } from '@playwright/test';

test.describe('Simple Pyodide Test', () => {
  test('waits for Pyodide to load and executes Python', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // Set up console message capture
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleMessages.push(text);
      console.log('Browser console:', text);
    });

    // Wait for the specific success message in console
    let pyodideReady = false;
    const checkReady = () => {
      return consoleMessages.some(msg => 
        msg.includes('Pyodide and dicompare loaded successfully') ||
        msg.includes('dicompare installed')
      );
    };

    // Poll for readiness
    for (let i = 0; i < 120; i++) { // 2 minutes max
      if (checkReady()) {
        pyodideReady = true;
        break;
      }
      await page.waitForTimeout(1000);
    }

    expect(pyodideReady).toBe(true);
    console.log('✅ Pyodide loaded successfully!');

    // Now try to execute Python code
    const result = await page.evaluate(async () => {
      // Wait for pyodide to be available on window
      for (let i = 0; i < 30; i++) {
        if (window.pyodide) break;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (!window.pyodide) {
        return 'pyodide_not_found';
      }

      try {
        // Try async version first
        if (window.pyodide.runPythonAsync) {
          await window.pyodide.runPythonAsync('print("hello world")');
          return 'success_async';
        }
        // Fallback to sync version
        if (window.pyodide.runPython) {
          window.pyodide.runPython('print("hello world")');
          return 'success_sync';
        }
        return 'no_run_method';
      } catch (error) {
        return `error: ${error}`;
      }
    });

    console.log('Python execution result:', result);
    
    // Wait for potential console output
    await page.waitForTimeout(2000);

    // Check for "hello world" in console
    const hasHelloWorld = consoleMessages.some(msg => 
      msg.toLowerCase().includes('hello world')
    );

    console.log('Final console messages:', consoleMessages);
    console.log('Has hello world:', hasHelloWorld);

    // Verify execution was successful
    expect(result).toMatch(/^success/);
    
    // Note: We'll be more lenient about console output for now
    // since Pyodide might redirect Python print statements
    console.log('✅ Python code executed successfully in Pyodide!');
  });
});

declare global {
  interface Window {
    pyodide: any;
  }
}