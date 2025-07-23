import { test, expect } from '@playwright/test';

test.describe('Flexible Pyodide Test', () => {
  test('executes print("hello world") against any URL', async ({ page }) => {
    // You can run this test by setting TEST_URL environment variable
    // Example: TEST_URL=http://localhost:3000 npm run test:flexible
    
    const testUrl = process.env.TEST_URL || 'http://localhost:2000';
    
    console.log(`🚀 Testing against: ${testUrl}`);
    
    try {
      // Try to navigate to the URL
      await page.goto(testUrl, { timeout: 10000 });
      
      // Check if we got the React app or a directory listing
      const title = await page.title();
      const bodyText = await page.textContent('body');
      
      console.log(`📄 Page title: ${title}`);
      console.log(`📄 Page content preview: ${bodyText?.substring(0, 100)}...`);
      
      // Check if this looks like the React app
      const isReactApp = title.includes('dicompare') || 
                        bodyText?.includes('dicompare') ||
                        bodyText?.includes('Check Compliance');
      
      if (!isReactApp) {
        console.log('❌ This doesn\'t look like the React app. Got directory listing or wrong content.');
        console.log('💡 Try running: npm run dev (in a separate terminal) and then run this test with TEST_URL=http://localhost:2000');
        test.skip();
      }
      
      console.log('✅ React app detected!');
      
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
      
      // Wait for console output
      await page.waitForTimeout(2000);
      
      // Check for "hello world" in console
      const helloWorldMessages = consoleMessages.filter(msg => 
        msg.toLowerCase().includes('hello world')
      );
      
      console.log('📝 Messages containing "hello world":', helloWorldMessages);
      
      // Test success criteria
      expect(result).toMatch(/^success/);
      console.log('🎉 Test passed! Python code executed successfully in Pyodide!');
      
    } catch (error) {
      console.log(`❌ Test failed: ${error}`);
      console.log('💡 Make sure the React app is running and accessible at the test URL');
      throw error;
    }
  });
});

declare global {
  interface Window {
    pyodide: any;
  }
}