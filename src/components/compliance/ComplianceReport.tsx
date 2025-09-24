import React from 'react';
import { CheckCircle, XCircle, AlertTriangle, HelpCircle, Calendar, User, FileText } from 'lucide-react';
import { Acquisition } from '../../types';
import { ComplianceFieldResult } from '../../types/schema';
import { SchemaBinding } from '../../hooks/useSchemaService';

interface ComplianceReportProps {
  acquisitions: Acquisition[];
  schemaPairings: Map<string, SchemaBinding>;
  complianceResults: Map<string, ComplianceFieldResult[]>;
  className?: string;
}

const ComplianceReport: React.FC<ComplianceReportProps> = ({
  acquisitions,
  schemaPairings,
  complianceResults,
  className = ''
}) => {
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const getStatusIcon = (status: ComplianceFieldResult['status'], size = 'h-4 w-4') => {
    const iconProps = { className: size };

    switch (status) {
      case 'pass':
        return <CheckCircle {...iconProps} className={`${size} text-green-600`} />;
      case 'fail':
        return <XCircle {...iconProps} className={`${size} text-red-600`} />;
      case 'warning':
        return <AlertTriangle {...iconProps} className={`${size} text-yellow-600`} />;
      case 'na':
        return <HelpCircle {...iconProps} className={`${size} text-gray-500`} />;
      case 'unknown':
        return <HelpCircle {...iconProps} className={`${size} text-gray-400`} />;
    }
  };

  const calculateOverallStats = () => {
    let totalPass = 0;
    let totalFail = 0;
    let totalWarning = 0;
    let totalNA = 0;
    let totalUnknown = 0;

    complianceResults.forEach((results) => {
      results.forEach((result) => {
        switch (result.status) {
          case 'pass': totalPass++; break;
          case 'fail': totalFail++; break;
          case 'warning': totalWarning++; break;
          case 'na': totalNA++; break;
          case 'unknown': totalUnknown++; break;
        }
      });
    });

    return { totalPass, totalFail, totalWarning, totalNA, totalUnknown };
  };

  const overallStats = calculateOverallStats();
  const totalChecks = overallStats.totalPass + overallStats.totalFail + overallStats.totalWarning + overallStats.totalNA + overallStats.totalUnknown;
  const compliancePercentage = totalChecks > 0 ? Math.round((overallStats.totalPass / totalChecks) * 100) : 0;

  return (
    <div className={`bg-white ${className}`}>
      {/* Report Header */}
      <div className="border-b-2 border-gray-200 pb-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">DICOM Compliance Report</h1>
            <div className="flex items-center space-x-6 text-sm text-gray-600">
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4" />
                <span>Generated: {currentDate}</span>
              </div>
              <div className="flex items-center space-x-2">
                <FileText className="h-4 w-4" />
                <span>{acquisitions.length} acquisition{acquisitions.length !== 1 ? 's' : ''} analyzed</span>
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-3xl font-bold text-gray-900 mb-1">{compliancePercentage}%</div>
            <div className="text-sm text-gray-600">Overall Compliance</div>
          </div>
        </div>

        {/* Overall Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center mb-1">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div className="text-lg font-semibold text-green-900">{overallStats.totalPass}</div>
            <div className="text-xs text-green-700">Passed</div>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center mb-1">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
            <div className="text-lg font-semibold text-red-900">{overallStats.totalFail}</div>
            <div className="text-xs text-red-700">Failed</div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center mb-1">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
            </div>
            <div className="text-lg font-semibold text-yellow-900">{overallStats.totalWarning}</div>
            <div className="text-xs text-yellow-700">Warnings</div>
          </div>

          <div className="bg-gray-100 border border-gray-200 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center mb-1">
              <HelpCircle className="h-5 w-5 text-gray-500" />
            </div>
            <div className="text-lg font-semibold text-gray-700">{overallStats.totalNA}</div>
            <div className="text-xs text-gray-600">N/A</div>
          </div>
        </div>
      </div>

      {/* Acquisition Details */}
      <div className="space-y-8">
        {acquisitions.map((acquisition) => {
          const pairing = schemaPairings.get(acquisition.id);
          const results = complianceResults.get(acquisition.id) || [];

          if (!pairing) return null;

          const statusCounts = {
            pass: results.filter(r => r.status === 'pass').length,
            fail: results.filter(r => r.status === 'fail').length,
            warning: results.filter(r => r.status === 'warning').length,
            na: results.filter(r => r.status === 'na').length,
            unknown: results.filter(r => r.status === 'unknown').length
          };

          const errors = results.filter(r => r.status === 'fail');
          const warnings = results.filter(r => r.status === 'warning');
          const acquisitionTotal = Object.values(statusCounts).reduce((a, b) => a + b, 0);
          const acquisitionCompliance = acquisitionTotal > 0 ? Math.round((statusCounts.pass / acquisitionTotal) * 100) : 0;

          return (
            <div key={acquisition.id} className="border border-gray-200 rounded-lg p-6 break-inside-avoid">
              {/* Acquisition Header */}
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-1">{acquisition.protocolName}</h2>
                  <p className="text-sm text-gray-600">{acquisition.seriesDescription}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Schema: {pairing.schema.name} v{pairing.schema.version}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-900 mb-1">{acquisitionCompliance}%</div>
                  <div className="text-xs text-gray-600">Compliance</div>
                </div>
              </div>

              {/* Acquisition Statistics */}
              <div className="grid grid-cols-4 gap-3 mb-6">
                <div className="text-center">
                  <div className="flex items-center justify-center mb-1">
                    {getStatusIcon('pass')}
                  </div>
                  <div className="text-sm font-semibold text-green-900">{statusCounts.pass}</div>
                  <div className="text-xs text-green-700">Passed</div>
                </div>

                <div className="text-center">
                  <div className="flex items-center justify-center mb-1">
                    {getStatusIcon('fail')}
                  </div>
                  <div className="text-sm font-semibold text-red-900">{statusCounts.fail}</div>
                  <div className="text-xs text-red-700">Failed</div>
                </div>

                <div className="text-center">
                  <div className="flex items-center justify-center mb-1">
                    {getStatusIcon('warning')}
                  </div>
                  <div className="text-sm font-semibold text-yellow-900">{statusCounts.warning}</div>
                  <div className="text-xs text-yellow-700">Warnings</div>
                </div>

                <div className="text-center">
                  <div className="flex items-center justify-center mb-1">
                    {getStatusIcon('na')}
                  </div>
                  <div className="text-sm font-semibold text-gray-700">{statusCounts.na}</div>
                  <div className="text-xs text-gray-600">N/A</div>
                </div>
              </div>

              {/* Issues Section */}
              {(errors.length > 0 || warnings.length > 0) && (
                <div className="space-y-4">
                  {/* Errors */}
                  {errors.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-red-700 mb-2 flex items-center">
                        <XCircle className="h-4 w-4 mr-1" />
                        Errors ({errors.length})
                      </h3>
                      <div className="space-y-2">
                        {errors.map((error, idx) => (
                          <div key={idx} className="bg-red-50 border border-red-200 rounded p-3">
                            <div className="flex items-start">
                              <XCircle className="h-4 w-4 text-red-600 mt-0.5 mr-2 flex-shrink-0" />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-red-900">
                                  {error.fieldName || error.rule_name}
                                  {error.seriesName && (
                                    <span className="ml-2 text-red-700">({error.seriesName})</span>
                                  )}
                                </p>
                                <p className="text-sm text-red-700 mt-1">{error.message}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Warnings */}
                  {warnings.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-yellow-700 mb-2 flex items-center">
                        <AlertTriangle className="h-4 w-4 mr-1" />
                        Warnings ({warnings.length})
                      </h3>
                      <div className="space-y-2">
                        {warnings.map((warning, idx) => (
                          <div key={idx} className="bg-yellow-50 border border-yellow-200 rounded p-3">
                            <div className="flex items-start">
                              <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 mr-2 flex-shrink-0" />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-yellow-900">
                                  {warning.fieldName || warning.rule_name}
                                  {warning.seriesName && (
                                    <span className="ml-2 text-yellow-700">({warning.seriesName})</span>
                                  )}
                                </p>
                                <p className="text-sm text-yellow-700 mt-1">{warning.message}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Success Message */}
              {errors.length === 0 && warnings.length === 0 && statusCounts.pass > 0 && (
                <div className="bg-green-50 border border-green-200 rounded p-4">
                  <div className="flex items-center">
                    <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                    <p className="text-sm text-green-800 font-medium">
                      All compliance checks passed successfully!
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Report Footer */}
      <div className="mt-8 pt-6 border-t border-gray-200 text-center text-xs text-gray-500">
        <p>This report was generated by DICOM Compare on {currentDate}</p>
        <p className="mt-1">For questions or support, please contact your system administrator</p>
      </div>
    </div>
  );
};

export default ComplianceReport;