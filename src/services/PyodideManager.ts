// Load Pyodide from CDN instead of bundling

export interface PyodideInstance {
  runPython: (code: string) => any;
  runPythonAsync: (code: string) => Promise<any>;
  globals: {
    get: (name: string) => any;
    set: (name: string, value: any) => void;
  };
  loadPackage: (packages: string | string[]) => Promise<void>;
}

class PyodideManager {
  private pyodide: PyodideInstance | null = null;
  private isLoading = false;
  private loadPromise: Promise<PyodideInstance> | null = null;

  async initialize(): Promise<PyodideInstance> {
    if (this.pyodide) {
      return this.pyodide;
    }

    if (this.isLoading && this.loadPromise) {
      return this.loadPromise;
    }

    this.isLoading = true;
    this.loadPromise = this.loadPyodide();
    
    try {
      this.pyodide = await this.loadPromise;
      return this.pyodide;
    } finally {
      this.isLoading = false;
    }
  }

  private async loadPyodide(): Promise<PyodideInstance> {
    console.log('🐍 Initializing Pyodide...');
    const startTime = Date.now();

    // Load Pyodide from CDN
    const pyodide = await window.loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/',
    });

    const loadTime = Date.now() - startTime;
    console.log(`🐍 Pyodide loaded in ${loadTime}ms`);

    // Install and load the real dicompare package
    await this.setupRealDicompare(pyodide);

    return pyodide;
  }

  private async setupRealDicompare(pyodide: PyodideInstance): Promise<void> {
    console.log('📦 Installing real dicompare package...');
    
    // Install the real dicompare wheel from local CORS server
    await pyodide.loadPackage(['micropip']);
    
    await pyodide.runPythonAsync(`
import micropip

# Install dicompare from local wheel
#await micropip.install('http://localhost:8000/dist/dicompare-0.1.32-py3-none-any.whl')
await micropip.install('dicompare=0.1.32')

# Import the real dicompare modules
import dicompare
import dicompare.web_utils
import dicompare.compliance
import dicompare.generate_schema
import dicompare.io
import json
from typing import List, Dict, Any

print("✅ Successfully imported real dicompare modules")
    `);

    console.log('✅ Real dicompare package installed and imported');
  }

  isInitialized(): boolean {
    return this.pyodide !== null;
  }

  async runPython(code: string): Promise<any> {
    const pyodide = await this.initialize();
    return pyodide.runPython(code);
  }

  async loadPackage(packages: string | string[]): Promise<void> {
    const pyodide = await this.initialize();
    return pyodide.loadPackage(packages);
  }

  async runPythonAsync(code: string): Promise<any> {
    const pyodide = await this.initialize();
    // For async Python code, we need to wrap it in an async function and use runPythonAsync
    const wrappedCode = `
import asyncio

async def __main__():
${code.split('\n').map(line => '    ' + line).join('\n')}

# Run the async function
await __main__()
    `;
    return await pyodide.runPythonAsync(wrappedCode);
  }

  async setPythonGlobal(name: string, value: any): Promise<void> {
    const pyodide = await this.initialize();
    pyodide.globals.set(name, value);
  }
}

// Create singleton instance
export const pyodideManager = new PyodideManager();