import React, { createContext, useState, useEffect, useContext, useRef } from 'react';

interface PyodideContextType {
  pyodide: any;
  pyodideReady: boolean;
  runPythonCode: (code: string) => Promise<any>;
  setPythonGlobal: (globalName: string, value: any) => Promise<void>;
  writePythonFile: (filePath: string, content: string | Uint8Array) => Promise<void>;
}

const PyodideContext = createContext<PyodideContextType>({
  pyodide: null,
  pyodideReady: false,
  runPythonCode: async () => {},
  setPythonGlobal: async () => {},
  writePythonFile: async () => {},
});

export const usePyodide = () => useContext(PyodideContext);

export const PyodideProvider: React.FC = ({ children }) => {
  const [pyodide, setPyodide] = useState<any>(null);
  const [pyodideLoading, setPyodideLoading] = useState(false);
  const [pyodideReady, setPyodideReady] = useState(false);
  const loadedRef = useRef(false);

  // Create a deferred promise for Pyodide readiness that resolves with the instance.
  const pyodideReadyPromiseRef = useRef<Promise<any>>();
  const pyodideReadyResolveRef = useRef<(py: any) => void>();

  if (!pyodideReadyPromiseRef.current) {
    pyodideReadyPromiseRef.current = new Promise((resolve) => {
      pyodideReadyResolveRef.current = resolve;
    });
  }

  const loadPyodide = async () => {
    if (pyodide || pyodideLoading || loadedRef.current) {
      console.log("Already loading or loaded.");
      return;
    }
    loadedRef.current = true;
    setPyodideLoading(true);
    console.log("Loading Pyodide and dicompare...");

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
      console.log("Type of pyodideInstance.runPythonAsync:", typeof pyodideInstance.runPythonAsync);

      console.log("Loading micropip...");
      await pyodideInstance.loadPackage("micropip");
      console.log("micropip loaded! Installing dicompare...");
      await pyodideInstance.runPythonAsync(`
        import micropip
        #await micropip.install("dicompare==0.1.17")
        await micropip.install("http://localhost:8000/dist/dicompare-0.1.17-py3-none-any.whl")
      `);
      console.log("dicompare installed! Setting Pyodide and dicompare...");
      setPyodide(pyodideInstance);
      setPyodideReady(true);
      if (pyodideReadyResolveRef.current) {
        pyodideReadyResolveRef.current(pyodideInstance);
      }
      console.log("Pyodide and dicompare loaded successfully!");
    } catch (error) {
      console.error("Error in loadPyodide:", error);
    } finally {
      setPyodideLoading(false);
    }
  };

  useEffect(() => {
    loadPyodide();
  }, []);

  // Wait for Pyodide to load and resolve with the instance.
  const waitForPyodide = async (): Promise<any> => {
    return pyodideReadyPromiseRef.current;
  };

  const runPythonCode = async (code: string) => {
    const instance = await waitForPyodide();
    try {
      console.log("Executing Python code...");
      const result = await instance.runPythonAsync(code);
      console.log("Python code executed. Result:", result);
      return result;
    } catch (error) {
      console.error("Python Execution Error:", error);
      return `Error: ${error}`;
    }
  };

  const setPythonGlobal = async (globalName: string, value: any) => {
    const instance = await waitForPyodide();
    console.log(`Setting Python global ${globalName}...`);
    instance.globals.set(globalName, value);
  };

  const writePythonFile = async (filePath: string, content: string | Uint8Array) => {
    const instance = await waitForPyodide();
    console.log(`Writing file to Pyodide FS: ${filePath}`);
    instance.FS.writeFile(filePath, content);
  };

  return (
    <PyodideContext.Provider
      value={{
        pyodide,
        pyodideReady,
        runPythonCode,
        setPythonGlobal,
        writePythonFile,
      }}
    >
      {children}
    </PyodideContext.Provider>
  );
};

export default PyodideProvider;
