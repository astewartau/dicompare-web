import React from 'react';
import { Link } from 'react-router-dom';
import { Github, ShieldCheck, Layers } from 'lucide-react';
import ThemeToggle from '../components/common/ThemeToggle';

const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-surface-primary dark:from-surface dark:to-surface">
      {/* Header */}
      <header className="bg-surface-primary shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between">
          <Link to="/" className="flex items-center hover:opacity-80 transition-opacity">
            <ShieldCheck className="h-8 w-8 text-brand-600 mr-3" />
            <h1 className="text-2xl font-bold text-content-primary">dicompare</h1>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a
              href="https://github.com/astewartau/dicompare"
              target="_blank"
              rel="noopener noreferrer"
              className="text-content-secondary hover:text-content-primary transition-colors"
            >
              <Github className="h-6 w-6" />
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <h2 className="text-4xl font-bold text-content-primary mb-6">
            Imaging Protocol Validation for Global Collaboration
          </h2>
          <p className="text-xl text-content-secondary mb-12 max-w-3xl mx-auto">
            Build DICOM schemas for your study or validate data against existing standards — all locally, so your data never leaves your computer.
          </p>

          {/* Feature Card */}
          <div className="max-w-md mx-auto mb-16">
            <Link
              to="/workspace"
              className="block bg-surface-primary rounded-lg shadow-md hover:shadow-lg transition-shadow p-8 border-2 border-brand-200 hover:border-brand-400 dark:border-brand-800 dark:hover:border-brand-600"
            >
              <Layers className="h-12 w-12 text-brand-600 mx-auto mb-4" />
              <h3 className="text-2xl font-semibold text-content-primary mb-3">Open Workspace</h3>
              <p className="text-content-secondary">
                Build schemas and check compliance in one unified interface. Start from schemas, data, or scratch.
              </p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;