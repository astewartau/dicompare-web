import { test, expect } from '@playwright/test';

test('debug what we can access', async ({ page }) => {
  // Try different ports to see which one works  
  const ports = [2000];
  
  for (const port of ports) {
    try {
      console.log(`Trying port ${port}...`);
      await page.goto(`http://127.0.0.1:${port}/`, { timeout: 5000 });
      
      // Get page title and content
      const title = await page.title();
      const bodyText = await page.textContent('body');
      
      console.log(`✅ Port ${port} works!`);
      console.log(`Title: ${title}`);
      console.log(`Body starts with: ${bodyText?.substring(0, 200)}...`);
      
      // Check for any console messages
      const consoleMessages: string[] = [];
      page.on('console', msg => {
        consoleMessages.push(msg.text());
      });
      
      // Wait a bit for any initial console messages
      await page.waitForTimeout(3000);
      
      console.log(`Console messages: ${consoleMessages.slice(0, 5)}`);
      
      // Check if window.pyodide exists
      const hasPyodide = await page.evaluate(() => {
        return typeof window.pyodide !== 'undefined';
      });
      
      console.log(`Has window.pyodide: ${hasPyodide}`);
      
      // Success - end test
      expect(title).toBeTruthy();
      return;
      
    } catch (error) {
      console.log(`Port ${port} failed: ${error}`);
      continue;
    }
  }
  
  throw new Error('No working port found');
});

declare global {
  interface Window {
    pyodide: any;
  }
}