import { useEffect, useState } from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage/LandingPage';
import GenerateTemplate from './pages/GenerateTemplate/GenerateTemplate';
import CheckCompliance from './pages/CheckCompliance/CheckCompliance';

const AppContent = () => {
    const [pyodide, setPyodide] = useState<any>(null);
    const [pyodideReady, setPyodideReady] = useState(false);
    const [output, setOutput] = useState("");

    useEffect(() => {
        const loadPyodide = async () => {
            try {
                const script = document.createElement("script");
                script.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
                script.onload = async () => {
                    const pyodideInstance = await (window as any).loadPyodide();
                    setPyodide(pyodideInstance);
                    setPyodideReady(true);
                    console.log("Pyodide Loaded Successfully!");
                };
                document.body.appendChild(script);
            } catch (error) {
                console.error("Error loading Pyodide:", error);
            }
        };

        loadPyodide();
    }, []);

    const runPythonCode = async (code: string) => {
        if (!pyodide || !pyodideReady) {
            console.error("Pyodide is not ready yet!");
            return;
        }
        try {
            const result = await pyodide.runPythonAsync(code);
            setOutput(result);
        } catch (error) {
            console.error("Python Execution Error:", error);
            setOutput(`Error: ${error}`);
        }
    };

    return (
        <>
            <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/generate-template" element={<GenerateTemplate />} />
                <Route path="/check-compliance" element={<CheckCompliance />} />
            </Routes>
        </>
    );
};

const App = () => {
    return (
        <ChakraProvider>
            <BrowserRouter>
                <AppContent />
            </BrowserRouter>
        </ChakraProvider>
    );
};

export default App;
