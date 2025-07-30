import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import DataLoading from '../components/compliance/DataLoading';
import SchemaSelection from '../components/compliance/SchemaSelection';
import ComplianceAnalysis from '../components/compliance/ComplianceAnalysis';

const CheckCompliance: React.FC = () => {
  const location = useLocation();
  const currentStep = location.pathname.split('/').pop();

  const steps = [
    { id: 'data-loading', name: 'Load DICOM Data', path: '/check-compliance/data-loading' },
    { id: 'schema-selection', name: 'Select Schema', path: '/check-compliance/schema-selection' },
    { id: 'analysis', name: 'Compliance Analysis', path: '/check-compliance/analysis' }
  ];

  const getCurrentStepIndex = () => {
    const stepIndex = steps.findIndex(step => step.path.includes(currentStep || ''));
    return stepIndex >= 0 ? stepIndex : 0;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center">
            <Link to="/" className="flex items-center text-gray-600 hover:text-gray-900 mr-6">
              <ArrowLeft className="h-5 w-5 mr-1" />
              Back to Home
            </Link>
            <CheckCircle className="h-8 w-8 text-medical-600 mr-3" />
            <h1 className="text-2xl font-bold text-gray-900">Check Compliance</h1>
          </div>
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
          <Route path="/" element={<DataLoading />} />
          <Route path="/data-loading" element={<DataLoading />} />
          <Route path="/schema-selection" element={<SchemaSelection />} />
          <Route path="/analysis" element={<ComplianceAnalysis />} />
        </Routes>
      </div>
    </div>
  );
};

export default CheckCompliance;