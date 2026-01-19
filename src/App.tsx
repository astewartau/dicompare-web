import React from 'react';
import { HashRouter, BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import LandingPage from './pages/LandingPage';
import UnifiedWorkspacePage from './pages/UnifiedWorkspacePage';

// Use HashRouter for Electron (file:// protocol), BrowserRouter for web
const isElectron = typeof window !== 'undefined' &&
  (window.location.protocol === 'file:' || navigator.userAgent.includes('Electron'));
const Router = isElectron ? HashRouter : BrowserRouter;

function App() {
  return (
    <ThemeProvider>
      <Router>
        <div className="min-h-screen bg-surface text-content-primary">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/workspace/*" element={<UnifiedWorkspacePage />} />
            {/* Redirect legacy routes to workspace */}
            <Route path="/schema-builder/*" element={<Navigate to="/workspace" replace />} />
            <Route path="/compliance-checker/*" element={<Navigate to="/workspace" replace />} />
          </Routes>
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App;
