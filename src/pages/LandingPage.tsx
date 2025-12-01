import React from 'react';
import { Link } from 'react-router-dom';
import { Blocks, CheckCircle, Github, ShieldCheck } from 'lucide-react';

const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-medical-50 to-white">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between">
          <Link to="/" className="flex items-center hover:opacity-80 transition-opacity">
            <ShieldCheck className="h-8 w-8 text-medical-600 mr-3" />
            <h1 className="text-2xl font-bold text-gray-900">dicompare</h1>
          </Link>
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

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-6">
            Imaging Protocol Validation for Global Collaboration
          </h2>
          <p className="text-xl text-gray-600 mb-12 max-w-3xl mx-auto">
            Build DICOM schemas for your study or validate data against existing standards — all locally, so your data never leaves your computer.
          </p>

          {/* Feature Cards */}
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-16">
            <Link
              to="/schema-builder"
              className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6 border-2 border-transparent hover:border-medical-200"
            >
              <Blocks className="h-10 w-10 text-medical-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Schema Builder</h3>
              <p className="text-gray-600 text-sm">
                Use reference DICOMs to build a schema for your study.
              </p>
            </Link>

            <Link
              to="/compliance-checker"
              className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6 border-2 border-transparent hover:border-medical-200"
            >
              <CheckCircle className="h-10 w-10 text-medical-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Compliance Checker</h3>
              <p className="text-gray-600 text-sm">
                Validate incoming DICOMs against a schema.
              </p>
            </Link>

          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;