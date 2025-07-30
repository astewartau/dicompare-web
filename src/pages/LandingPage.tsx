import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, CheckCircle } from 'lucide-react';
import PublicReports from '../components/common/PublicReports';

const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-medical-50 to-white">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center">
            <FileText className="h-8 w-8 text-medical-600 mr-3" />
            <h1 className="text-2xl font-bold text-gray-900">DICOMpare</h1>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-6">
            Privacy-First DICOM Data Validation
          </h2>
          <p className="text-xl text-gray-600 mb-12 max-w-3xl mx-auto">
            Generate standardized DICOM templates and validate data compliance across multi-site studies 
            while ensuring sensitive medical data never leaves your environment.
          </p>

          {/* Feature Cards */}
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-16">
            <Link 
              to="/generate-template" 
              className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-8 border-2 border-transparent hover:border-medical-200"
            >
              <FileText className="h-12 w-12 text-medical-600 mx-auto mb-4" />
              <h3 className="text-2xl font-semibold text-gray-900 mb-4">Generate Template</h3>
              <p className="text-gray-600">
                Create DICOM compliance templates from your reference datasets. 
                Upload files, select validation fields, and generate reusable schemas.
              </p>
            </Link>

            <Link 
              to="/check-compliance" 
              className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-8 border-2 border-transparent hover:border-medical-200"
            >
              <CheckCircle className="h-12 w-12 text-medical-600 mx-auto mb-4" />
              <h3 className="text-2xl font-semibold text-gray-900 mb-4">Check Compliance</h3>
              <p className="text-gray-600">
                Validate DICOM files against existing templates. 
                Get detailed compliance reports and identify data issues.
              </p>
            </Link>
          </div>

          {/* Public Data Reports Section */}
          <div className="bg-white rounded-lg shadow-md p-8">
            <PublicReports />
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;