import React, { createContext, useState, useEffect, useContext, useRef } from 'react';

interface PyodideContextType {
  pyodide: any;
  pyodideReady: boolean;
  runPythonCode: (code: string) => Promise<any>;
  setPythonGlobal: (globalName: string, value: any) => void;
  writePythonFile: (filePath: string, content: string | Uint8Array) => void;
}

const PyodideContext = createContext<PyodideContextType>({
  pyodide: null,
  pyodideReady: false,
  runPythonCode: async () => {},
  setPythonGlobal: () => {},
  writePythonFile: () => {},
});

export const usePyodide = () => useContext(PyodideContext);

export const PyodideProvider: React.FC = ({ children }) => {
  const [pyodide, setPyodide] = useState<any>(null);
  const [pyodideLoading, setPyodideLoading] = useState(false);
  const [pyodideReady, setPyodideReady] = useState(false);
  const loadedRef = useRef(false);

  const loadPyodide = async () => {
    if (pyodide || pyodideLoading || loadedRef.current) {
      console.log("Already loading or loaded.");
      return;
    }
    loadedRef.current = true;
    setPyodideLoading(true);
    console.log("Loading Pyodide and dicompare...");

    // Check if the Pyodide script already exists
    if (!document.querySelector('script[src="https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js"]')) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
        script.async = true;
        script.defer = true;
        script.onload = () => {
          console.log("Pyodide script loaded.");
          resolve();
        };
        script.onerror = (e) => {
          console.error("Failed to load Pyodide script.", e);
          reject(new Error("Failed to load Pyodide script."));
        };
        document.body.appendChild(script);
      });
    } else {
      console.log("Pyodide script already exists.");
    }

    const loadPyodideFunc = (window as any).loadPyodide;
    console.log("window.loadPyodide:", loadPyodideFunc);
    if (typeof loadPyodideFunc !== "function") {
      console.error("window.loadPyodide is not a function!");
      setPyodideLoading(false);
      return;
    }
    try {
      console.log("Calling window.loadPyodide with indexURL...");
      const loadPromise = loadPyodideFunc({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/" });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout waiting for loadPyodide")), 30000)
      );
      const pyodideInstance = await Promise.race([loadPromise, timeoutPromise]);
      console.log("pyodideInstance returned:", pyodideInstance);
      if (!pyodideInstance) {
        console.error("pyodideInstance is null or undefined.");
      } else {
        console.log("Type of pyodideInstance.runPythonAsync:", typeof pyodideInstance.runPythonAsync);
      }
      console.log("Loading micropip...");
      await pyodideInstance.loadPackage("micropip");
      console.log("micropip loaded! Installing dicompare...");
      await pyodideInstance.runPythonAsync(`
        import micropip
        #await micropip.install("dicompare==0.1.16")
        await micropip.install("http://localhost:8000/dist/dicompare-0.1.16-py3-none-any.whl")
      `);
      console.log("dicompare installed! Setting Pyodide and dicompare...");
      setPyodide(pyodideInstance);
      setPyodideReady(true);
      console.log("Pyodide and dicompare loaded successfully!");
    } catch (error) {
      console.error("Error in loadPyodide:", error);
    } finally {
      setPyodideLoading(false);
    }
  };

  // Only call loadPyodide once on mount
  useEffect(() => {
    loadPyodide();
  }, []);

  const waitForPyodide = async () => {
    while (!pyodideReady) {
      console.log("Waiting for Pyodide to be ready...");
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  };

  const runPythonCode = async (code: string) => {
    await waitForPyodide();
    try {
      console.log("Executing Python code...");
      const result = await pyodide.runPythonAsync(code);
      console.log("Python code executed. Result:", result);
      return result;
    } catch (error) {
      console.error("Python Execution Error:", error);
      return `Error: ${error}`;
    }
  };

  const setPythonGlobal = async (globalName: string, value: any) => {
    await waitForPyodide();
    console.log(`Setting Python global ${globalName}...`);
    pyodide.globals.set(globalName, value);
  };

  const writePythonFile = async (filePath: string, content: string | Uint8Array) => {
    await waitForPyodide();
    console.log(`Writing file to Pyodide FS: ${filePath}`);
    pyodide.FS.writeFile(filePath, content);
  };

  return (
    <PyodideContext.Provider value={{ pyodide, pyodideReady, runPythonCode, setPythonGlobal, writePythonFile }}>
      {children}
    </PyodideContext.Provider>
  );
};

export default PyodideProvider;
