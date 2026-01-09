import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Blocks, ShieldCheck, Github } from 'lucide-react';
import { AcquisitionProvider } from '../contexts/AcquisitionContext';
import { SchemaProvider } from '../contexts/SchemaContext';
import ThemeToggle from '../components/common/ThemeToggle';
import BuildSchema from '../components/schema/BuildSchema';
import EnterMetadata from '../components/schema/EnterMetadata';
import DownloadSchema from '../components/schema/DownloadSchema';

const SchemaBuilder: React.FC = () => {
  const location = useLocation();
  const currentStep = location.pathname.split('/').pop();

  const steps = [
    { id: 'build-schema', name: 'Schema Builder', path: '/schema-builder' },
    { id: 'enter-metadata', name: 'Enter Metadata', path: '/schema-builder/enter-metadata' },
    { id: 'save-schema', name: 'Save Schema', path: '/schema-builder/save-schema' }
  ];

  const getCurrentStepIndex = () => {
    // Check for exact matches or partial matches
    if (location.pathname === '/schema-builder' || location.pathname === '/schema-builder/' || location.pathname.endsWith('/build-schema')) {
      return 0;
    }
    if (location.pathname.includes('enter-metadata')) {
      return 1;
    }
    if (location.pathname.includes('save-schema')) {
      return 2;
    }
    return 0;
  };

  return (
    <SchemaProvider>
      <AcquisitionProvider>
        <div className="min-h-screen bg-surface">
        {/* Header */}
        <header className="bg-surface-primary shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between">
            <div className="flex items-center">
              <Link to="/" className="flex items-center hover:opacity-80 transition-opacity">
                <ShieldCheck className="h-8 w-8 text-brand-600 mr-2" />
                <span className="text-xl font-bold text-content-primary">dicompare</span>
              </Link>
              <span className="mx-4 text-content-muted">/</span>
              <Blocks className="h-6 w-6 text-brand-600 mr-2" />
              <h1 className="text-xl font-semibold text-content-secondary">Schema Builder</h1>
            </div>
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

        {/* Progress Steps */}
        <div className="bg-surface-primary border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <nav className="flex space-x-8">
              {steps.map((step, index) => {
                const isActive = index === getCurrentStepIndex();
                const isCompleted = index < getCurrentStepIndex();

                return (
                  <div key={step.id} className="flex items-center">
                    <div className={`flex items-center ${
                      isActive ? 'text-brand-600' :
                      isCompleted ? 'text-status-success' : 'text-content-muted'
                    }`}>
                      <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-medium ${
                        isActive ? 'border-brand-600 bg-brand-50' :
                        isCompleted ? 'border-status-success bg-status-success-bg' : 'border-border-secondary'
                      }`}>
                        {index + 1}
                      </div>
                      <span className="ml-2 text-sm font-medium">{step.name}</span>
                    </div>
                    {index < steps.length - 1 && (
                      <div className="ml-8 w-8 h-px bg-border-secondary" />
                    )}
                  </div>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Routes>
            <Route path="/" element={<BuildSchema />} />
            <Route path="/build-schema" element={<BuildSchema />} />
            <Route path="/enter-metadata" element={<EnterMetadata />} />
            <Route path="/save-schema" element={<DownloadSchema />} />
          </Routes>
        </div>
        </div>
      </AcquisitionProvider>
    </SchemaProvider>
  );
};

export default SchemaBuilder;