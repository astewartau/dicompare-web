import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import LandingPage from './pages/LandingPage';
import SchemaBuilder from './pages/SchemaBuilder';
import ComplianceChecker from './pages/ComplianceChecker';

function App() {
  return (
    <ThemeProvider>
      <Router>
        <div className="min-h-screen bg-surface text-content-primary">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/schema-builder/*" element={<SchemaBuilder />} />
            <Route path="/compliance-checker/*" element={<ComplianceChecker />} />
          </Routes>
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App;
