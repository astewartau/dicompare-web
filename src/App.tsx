import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import SchemaBuilder from './pages/SchemaBuilder';
import ComplianceChecker from './pages/ComplianceChecker';
import PythonSchemaBuilder from './pages/PythonSchemaBuilder';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/schema-builder/*" element={<SchemaBuilder />} />
          <Route path="/compliance-checker/*" element={<ComplianceChecker />} />
          <Route path="/python-schema-builder" element={<PythonSchemaBuilder />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
