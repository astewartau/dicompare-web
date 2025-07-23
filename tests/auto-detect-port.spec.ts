import { test, expect } from '@playwright/test';

test.describe('Auto-detect Port Test', () => {
  test('finds the React app and runs Pyodide test', async ({ page }) => {
    // Try common development ports
    const commonPorts = [2000, 3000, 5173, 4173, 8080, 8000];
    
    let workingPort = null;
    let workingUrl = null;
    
    console.log('🔍 Scanning for React app on common ports...');
    
    for (const port of commonPorts) {
      const url = `http://localhost:${port}`;
      
      try {
        console.log(`  Trying ${url}...`);
        await page.goto(url, { timeout: 3000 });
        
        const title = await page.title();
        const bodyText = await page.textContent('body');
        
        // Check if this looks like the React app
        const isReactApp = title.includes('dicompare') || 
                          bodyText?.includes('dicompare') ||
                          bodyText?.includes('Check Compliance') ||
                          bodyText?.includes('Create Report');
        
        if (isReactApp) {
          workingPort = port;
          workingUrl = url;
          console.log(`  ✅ Found React app on port ${port}!`);
          break;
        } else {
          console.log(`  ❌ Port ${port} has content but not the React app`);
        }
        
      } catch (error) {
        console.log(`  ❌ Port ${port} not accessible`);
      }
    }
    
    if (!workingPort) {
      console.log('❌ No React app found on any common port');
      console.log('💡 Make sure "npm run dev" is running in another terminal');
      console.log('💡 Check the terminal output to see what port Vite is using');
      throw new Error('React app not found on any common port');
    }
    
    console.log(`🎯 Using React app at: ${workingUrl}`);
    
    // Now run the actual test
    await page.goto(workingUrl);
    
    // Capture console messages
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleMessages.push(text);
      if (text.includes('Pyodide') || text.includes('dicompare') || text.includes('hello')) {
        console.log(`🖥️  Browser: ${text}`);
      }
    });
    
    // Wait for Pyodide to load
    console.log('⏳ Waiting for Pyodide to load...');
    let pyodideReady = false;
    
    for (let i = 0; i < 180; i++) { // 3 minutes max
      if (consoleMessages.some(msg => 
        msg.includes('Pyodide and dicompare loaded successfully') ||
        msg.includes('ComplianceSession initialized') ||
        msg.includes('dicompare installed')
      )) {
        pyodideReady = true;
        console.log('✅ Pyodide loaded successfully!');
        break;
      }
      await page.waitForTimeout(1000);
    }
    
    if (!pyodideReady) {
      console.log('❌ Pyodide didn\'t load within 3 minutes');
      console.log('Recent console messages:', consoleMessages.slice(-10));
      throw new Error('Pyodide loading timeout');
    }
    
    // Give it a moment to settle
    await page.waitForTimeout(2000);
    
    // Execute Python code
    console.log('🐍 Executing Python code...');
    const result = await page.evaluate(async () => {
      if (window.pyodide) {
        try {
          if (window.pyodide.runPythonAsync) {
            await window.pyodide.runPythonAsync('print("hello world")');
            return 'success_async';
          } else if (window.pyodide.runPython) {
            window.pyodide.runPython('print("hello world")');
            return 'success_sync';
          }
        } catch (error) {
          return `error: ${error}`;
        }
      }
      return 'pyodide_not_available';
    });
    
    console.log(`🎯 Python execution result: ${result}`);
    
    // Test success
    expect(result).toMatch(/^success/);
    console.log('🎉 SUCCESS! Python print("hello world") executed in Pyodide!');
  });
});

declare global {
  interface Window {
    pyodide: any;
  }
}