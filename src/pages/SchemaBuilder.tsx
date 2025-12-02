import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Blocks, ShieldCheck, Github } from 'lucide-react';
import { AcquisitionProvider } from '../contexts/AcquisitionContext';
import { SchemaProvider } from '../contexts/SchemaContext';
import SchemaStartPage from '../components/schema/SchemaStartPage';
import BuildSchema from '../components/schema/BuildSchema';
import EnterMetadata from '../components/schema/EnterMetadata';
import DownloadSchema from '../components/schema/DownloadSchema';

const SchemaBuilder: React.FC = () => {
  const location = useLocation();
  const currentStep = location.pathname.split('/').pop();

  const steps = [
    { id: 'start', name: 'Choose Starting Point', path: '/schema-builder/start' },
    { id: 'build-schema', name: 'Build Schema', path: '/schema-builder/build-schema' },
    { id: 'enter-metadata', name: 'Enter Metadata', path: '/schema-builder/enter-metadata' },
    { id: 'save-schema', name: 'Save Schema', path: '/schema-builder/save-schema' }
  ];

  const getCurrentStepIndex = () => {
    const stepIndex = steps.findIndex(step => step.path.includes(currentStep || ''));
    return stepIndex >= 0 ? stepIndex : 0;
  };

  return (
    <SchemaProvider>
      <AcquisitionProvider>
        <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between">
            <div className="flex items-center">
              <Link to="/" className="flex items-center hover:opacity-80 transition-opacity">
                <ShieldCheck className="h-8 w-8 text-medical-600 mr-2" />
                <span className="text-xl font-bold text-gray-900">dicompare</span>
              </Link>
              <span className="mx-4 text-gray-300">/</span>
              <Blocks className="h-6 w-6 text-medical-600 mr-2" />
              <h1 className="text-xl font-semibold text-gray-700">Schema Builder</h1>
            </div>
            <a
              href="https://github.com/astewartau/dicompare"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              <Github className="h-6 w-6" />
            </a>
          </div>
        </header>

        {/* Progress Steps */}
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <nav className="flex space-x-8">
              {steps.map((step, index) => {
                const isActive = index === getCurrentStepIndex();
                const isCompleted = index < getCurrentStepIndex();
                
                return (
                  <div key={step.id} className="flex items-center">
                    <div className={`flex items-center ${
                      isActive ? 'text-medical-600' : 
                      isCompleted ? 'text-green-600' : 'text-gray-400'
                    }`}>
                      <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-medium ${
                        isActive ? 'border-medical-600 bg-medical-50' :
                        isCompleted ? 'border-green-600 bg-green-50' : 'border-gray-300'
                      }`}>
                        {index + 1}
                      </div>
                      <span className="ml-2 text-sm font-medium">{step.name}</span>
                    </div>
                    {index < steps.length - 1 && (
                      <div className="ml-8 w-8 h-px bg-gray-300" />
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
            <Route path="/" element={<SchemaStartPage />} />
            <Route path="/start" element={<SchemaStartPage />} />
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