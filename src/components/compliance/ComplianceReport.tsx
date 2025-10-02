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
          const naResults = results.filter(r => r.status === 'na');
          const passedResults = results.filter(r => r.status === 'pass');
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

              {/* Schema Requirements Section */}
              {pairing.schemaAcquisition && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Schema Requirements</h3>

                  {/* Validation Rules Table */}
                  {pairing.schemaAcquisition.validationFunctions && pairing.schemaAcquisition.validationFunctions.length > 0 && (
                    <div className="mb-4">
                      <div className="border border-gray-200 rounded overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                Validation Rule
                              </th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                Description
                              </th>
                              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                                Status
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {pairing.schemaAcquisition.validationFunctions.map((func, idx) => {
                              const funcResult = results.find(r => r.rule_name === (func.customName || func.name));
                              return (
                                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                  <td className="px-3 py-2">
                                    <p className="text-xs font-medium text-gray-900">{func.customName || func.name}</p>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {(func.customFields || func.fields).map(field => (
                                        <span key={field} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                                          {field}
                                        </span>
                                      ))}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2">
                                    <p className="text-xs text-gray-900">{func.customDescription || func.description}</p>
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {funcResult ? getStatusIcon(funcResult.status, 'h-4 w-4') : <HelpCircle className="h-4 w-4 text-gray-400 inline-block" />}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Acquisition-Level Fields Table */}
                  {pairing.schemaAcquisition.acquisitionFields && pairing.schemaAcquisition.acquisitionFields.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Acquisition-Level Fields</h4>
                      <div className="border border-gray-200 rounded overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                Field
                              </th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                Tag
                              </th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                Expected Value
                              </th>
                              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                                Status
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {pairing.schemaAcquisition.acquisitionFields.map((field, idx) => {
                              const fieldResult = results.find(r => r.fieldName === field.name && !r.seriesName);
                              return (
                                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                  <td className="px-3 py-2">
                                    <p className="text-xs font-medium text-gray-900">{field.name}</p>
                                  </td>
                                  <td className="px-3 py-2">
                                    <p className="text-xs text-gray-600">{field.tag || 'N/A'}</p>
                                  </td>
                                  <td className="px-3 py-2">
                                    <p className="text-xs text-gray-900">
                                      {field.value !== undefined && field.value !== null && field.value !== ''
                                        ? (typeof field.value === 'object' ? JSON.stringify(field.value) : String(field.value))
                                        : 'Any'}
                                    </p>
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {fieldResult ? getStatusIcon(fieldResult.status, 'h-4 w-4') : <HelpCircle className="h-4 w-4 text-gray-400 inline-block" />}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Series-Level Fields Table */}
                  {pairing.schemaAcquisition.series && pairing.schemaAcquisition.series.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Series-Level Fields</h4>
                      {pairing.schemaAcquisition.series.map((series, seriesIdx) => (
                        <div key={seriesIdx} className="mb-3">
                          <p className="text-xs font-semibold text-gray-800 mb-1 px-2">{series.name || `Series ${seriesIdx + 1}`}</p>
                          <div className="border border-gray-200 rounded overflow-hidden">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                    Field
                                  </th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                    Tag
                                  </th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                    Expected Value
                                  </th>
                                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                                    Status
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {series.fields && series.fields.map((field, fieldIdx) => {
                                  const fieldResult = results.find(r => r.fieldName === field.name && r.seriesName === series.name);
                                  return (
                                    <tr key={fieldIdx} className={fieldIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                      <td className="px-3 py-2">
                                        <p className="text-xs font-medium text-gray-900">{field.name}</p>
                                      </td>
                                      <td className="px-3 py-2">
                                        <p className="text-xs text-gray-600">{field.tag || 'N/A'}</p>
                                      </td>
                                      <td className="px-3 py-2">
                                        <p className="text-xs text-gray-900">
                                          {field.value !== undefined && field.value !== null && field.value !== ''
                                            ? (typeof field.value === 'object' ? JSON.stringify(field.value) : String(field.value))
                                            : 'Any'}
                                        </p>
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        {fieldResult ? getStatusIcon(fieldResult.status, 'h-4 w-4') : <HelpCircle className="h-4 w-4 text-gray-400 inline-block" />}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Compliance Results Section */}
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
                                {error.rule_name || error.fieldName}
                                {error.seriesName && (
                                  <span className="ml-2 text-red-700">({error.seriesName})</span>
                                )}
                              </p>
                              {error.rule_name && error.fieldName && (
                                <p className="text-xs text-red-600 mt-0.5">{error.fieldName}</p>
                              )}
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
                                {warning.rule_name || warning.fieldName}
                                {warning.seriesName && (
                                  <span className="ml-2 text-yellow-700">({warning.seriesName})</span>
                                )}
                              </p>
                              {warning.rule_name && warning.fieldName && (
                                <p className="text-xs text-yellow-600 mt-0.5">{warning.fieldName}</p>
                              )}
                              <p className="text-sm text-yellow-700 mt-1">{warning.message}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* N/A Results */}
                {naResults.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                      <HelpCircle className="h-4 w-4 mr-1" />
                      N/A ({naResults.length})
                    </h3>
                    <div className="space-y-2">
                      {naResults.map((naResult, idx) => (
                        <div key={idx} className="bg-gray-50 border border-gray-200 rounded p-3">
                          <div className="flex items-start">
                            <HelpCircle className="h-4 w-4 text-gray-500 mt-0.5 mr-2 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">
                                {naResult.seriesName ? naResult.seriesName : (naResult.rule_name || naResult.fieldName)}
                              </p>
                              {!naResult.seriesName && naResult.rule_name && naResult.fieldName && (
                                <p className="text-xs text-gray-600 mt-0.5">{naResult.fieldName}</p>
                              )}
                              <p className="text-sm text-gray-700 mt-1">{naResult.message}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Passed Results */}
                {passedResults.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-green-700 mb-2 flex items-center">
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Passed ({passedResults.length})
                    </h3>
                    <div className="space-y-2">
                      {passedResults.map((passedResult, idx) => (
                        <div key={idx} className="bg-green-50 border border-green-200 rounded p-3">
                          <div className="flex items-start">
                            <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 mr-2 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-green-900">
                                {passedResult.seriesName ? passedResult.seriesName : (passedResult.rule_name || passedResult.fieldName)}
                              </p>
                              {!passedResult.seriesName && passedResult.rule_name && passedResult.fieldName && (
                                <p className="text-xs text-green-600 mt-0.5">{passedResult.fieldName}</p>
                              )}
                              <p className="text-sm text-green-700 mt-1">{passedResult.message}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

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