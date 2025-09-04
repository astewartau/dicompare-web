import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, AlertTriangle, Download, ArrowLeft, BarChart3, FileText } from 'lucide-react';
import { ComplianceReport, AcquisitionComplianceResult } from '../../types';
import { mockComplianceReport } from '../../data/mockData';

const ComplianceAnalysis: React.FC = () => {
  const navigate = useNavigate();
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [selectedAcquisition, setSelectedAcquisition] = useState<string | null>(null);

  useEffect(() => {
    // Simulate analysis process
    const runAnalysis = async () => {
      await new Promise(resolve => setTimeout(resolve, 3000));
      setReport(mockComplianceReport);
      setIsAnalyzing(false);
    };

    runAnalysis();
  }, []);

  const handleBack = () => {
    navigate('/check-compliance/load-and-match');
  };

  const handleDownloadReport = () => {
    if (!report) return;

    const reportContent = JSON.stringify(report, null, 2);
    const blob = new Blob([reportContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance_report_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getStatusIcon = (status: 'pass' | 'fail' | 'warning' | 'na') => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'fail':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'na':
        return <AlertTriangle className="h-5 w-5 text-gray-500" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: 'pass' | 'fail' | 'warning' | 'na') => {
    switch (status) {
      case 'pass':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'fail':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'na':
        return 'bg-gray-50 border-gray-200 text-gray-600';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-600';
    }
  };

  if (isAnalyzing) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Running Compliance Analysis</h2>
          <p className="text-gray-600">
            Validating DICOM data against selected templates...
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-medical-600 mx-auto mb-6"></div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Analyzing Compliance
            </h3>
            <p className="text-gray-600">
              This may take a few moments depending on the size of your dataset...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <XCircle className="h-16 w-16 text-red-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Analysis Failed</h3>
          <p className="text-gray-600">
            Unable to generate compliance report. Please try again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Compliance Analysis Results</h2>
            <p className="text-gray-600">
              Validation completed for {report.templateName} v{report.templateVersion}
            </p>
          </div>
          
          <button
            onClick={handleDownloadReport}
            className="flex items-center px-4 py-2 bg-medical-600 text-white rounded-lg hover:bg-medical-700"
          >
            <Download className="h-4 w-4 mr-2" />
            Download Report
          </button>
        </div>
      </div>

      {/* Overall Status */}
      <div className={`rounded-lg border-2 p-6 mb-8 ${getStatusColor(report.overallStatus)}`}>
        <div className="flex items-center">
          {getStatusIcon(report.overallStatus)}
          <div className="ml-3">
            <h3 className="text-lg font-semibold">
              Overall Status: {report.overallStatus.toUpperCase()}
            </h3>
            <p className="text-sm opacity-90">
              Analysis completed on {new Date(report.analysisDate).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Summary Statistics */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <BarChart3 className="h-6 w-6 mr-2 text-medical-600" />
          Summary Statistics
        </h3>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900 mb-1">
              {report.summary.totalAcquisitions}
            </div>
            <div className="text-sm text-gray-600">Total Acquisitions</div>
          </div>
          
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600 mb-1">
              {report.summary.passedAcquisitions}
            </div>
            <div className="text-sm text-gray-600">Passed</div>
          </div>
          
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600 mb-1">
              {report.summary.failedAcquisitions}
            </div>
            <div className="text-sm text-gray-600">Failed</div>
          </div>
          
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900 mb-1">
              {report.summary.totalSeries}
            </div>
            <div className="text-sm text-gray-600">Total Series</div>
          </div>
          
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600 mb-1">
              {report.summary.passedSeries}
            </div>
            <div className="text-sm text-gray-600">Series Passed</div>
          </div>
          
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600 mb-1">
              {report.summary.failedSeries}
            </div>
            <div className="text-sm text-gray-600">Series Failed</div>
          </div>
        </div>
      </div>

      {/* Detailed Results */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
          <FileText className="h-6 w-6 mr-2 text-medical-600" />
          Detailed Results
        </h3>
        
        <div className="space-y-6">
          {report.acquisitionResults.map((acquisitionResult) => (
            <div
              key={acquisitionResult.acquisitionId}
              className="border border-gray-200 rounded-lg overflow-hidden"
            >
              {/* Acquisition Header */}
              <div
                className={`px-6 py-4 cursor-pointer ${
                  selectedAcquisition === acquisitionResult.acquisitionId
                    ? 'bg-medical-50'
                    : 'bg-gray-50 hover:bg-gray-100'
                }`}
                onClick={() => setSelectedAcquisition(
                  selectedAcquisition === acquisitionResult.acquisitionId
                    ? null
                    : acquisitionResult.acquisitionId
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(acquisitionResult.overallStatus)}
                    <div>
                      <h4 className="font-medium text-gray-900">
                        {acquisitionResult.acquisitionName}
                      </h4>
                      <p className="text-sm text-gray-600">
                        {acquisitionResult.seriesResults.length} series • 
                        {acquisitionResult.acquisitionFieldResults.length} acquisition fields
                      </p>
                    </div>
                  </div>
                  
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(acquisitionResult.overallStatus)}`}>
                    {acquisitionResult.overallStatus.toUpperCase()}
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {selectedAcquisition === acquisitionResult.acquisitionId && (
                <div className="px-6 py-4 border-t border-gray-200">
                  {/* Acquisition-level Fields */}
                  {acquisitionResult.acquisitionFieldResults.length > 0 && (
                    <div className="mb-6">
                      <h5 className="font-medium text-gray-900 mb-3">Acquisition-Level Fields</h5>
                      <div className="space-y-2">
                        {acquisitionResult.acquisitionFieldResults.map((fieldResult, index) => (
                          <div
                            key={index}
                            className={`p-3 rounded-lg border ${
                              fieldResult.status === 'pass'
                                ? 'border-green-200 bg-green-50'
                                : fieldResult.status === 'fail'
                                ? 'border-red-200 bg-red-50'
                                : fieldResult.status === 'warning'
                                ? 'border-yellow-200 bg-yellow-50'
                                : 'border-gray-200 bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                {getStatusIcon(fieldResult.status)}
                                <span className="font-medium text-gray-900">
                                  {fieldResult.fieldName}
                                </span>
                                <span className="text-sm text-gray-500">
                                  ({fieldResult.fieldTag})
                                </span>
                              </div>
                              
                              <div className="text-sm text-gray-600">
                                Expected: {String(fieldResult.expected)} | 
                                Actual: {String(fieldResult.actual)}
                              </div>
                            </div>
                            
                            {fieldResult.message && (
                              <p className="text-sm text-gray-700 mt-2">
                                {fieldResult.message}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Series Results */}
                  {acquisitionResult.seriesResults.length > 0 && (
                    <div>
                      <h5 className="font-medium text-gray-900 mb-3">Series Results</h5>
                      <div className="space-y-3">
                        {acquisitionResult.seriesResults.map((seriesResult) => (
                          <div
                            key={seriesResult.seriesId}
                            className="border border-gray-200 rounded-lg p-4"
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center space-x-2">
                                {getStatusIcon(seriesResult.overallStatus)}
                                <span className="font-medium text-gray-900">
                                  {seriesResult.seriesDescription}
                                </span>
                              </div>
                              
                              <div className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(seriesResult.overallStatus)}`}>
                                {seriesResult.overallStatus.toUpperCase()}
                              </div>
                            </div>
                            
                            <div className="space-y-2">
                              {seriesResult.fieldResults.map((fieldResult, index) => (
                                <div
                                  key={index}
                                  className="flex items-center justify-between text-sm"
                                >
                                  <div className="flex items-center space-x-2">
                                    {getStatusIcon(fieldResult.status)}
                                    <span>{fieldResult.fieldName}</span>
                                  </div>
                                  
                                  <span className="text-gray-600">
                                    {fieldResult.message}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="mt-8 flex justify-between">
        <button
          onClick={handleBack}
          className="flex items-center px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Back to Schema Selection
        </button>
        
        <div className="space-x-4">
          <button
            onClick={() => navigate('/check-compliance/load-and-match')}
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Analyze New Data
          </button>
          
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-medical-600 text-white rounded-lg hover:bg-medical-700"
          >
            Return to Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default ComplianceAnalysis;