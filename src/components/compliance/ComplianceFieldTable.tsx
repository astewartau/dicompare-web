import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, HelpCircle, ChevronDown, ChevronUp, Loader } from 'lucide-react';
import { DicomField, Acquisition, SchemaField } from '../../types';
import { formatFieldValue, formatFieldTypeInfo } from '../../utils/fieldFormatters';
import { ComplianceFieldResult } from '../../types/schema';
import { dicompareAPI, FieldInfo } from '../../services/DicompareAPI';

/**
 * ComplianceFieldTable - UI PROTOTYPE ONLY
 * 
 * This component provides MOCK compliance validation for UI demonstration.
 * It does NOT perform real DICOM validation - all results are randomly generated
 * for prototyping purposes only.
 */

interface ComplianceFieldTableProps {
  fields: DicomField[];
  acquisition: Acquisition;
  schemaFields: SchemaField[];
  schemaId?: string;
}

const ComplianceFieldTable: React.FC<ComplianceFieldTableProps> = ({
  fields,
  acquisition,
  schemaFields,
  schemaId
}) => {
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [expandedCompliance, setExpandedCompliance] = useState<boolean>(false);
  const [complianceResults, setComplianceResults] = useState<ComplianceFieldResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedSchemaFields, setLoadedSchemaFields] = useState<DicomField[]>([]);

  // Load schema fields from API
  const loadSchemaFields = async () => {
    if (!schemaId) return;

    setIsLoading(true);
    setError(null);

    try {
      // Get schema fields from Python API
      const apiFields: FieldInfo[] = await dicompareAPI.getSchemaFields(schemaId);
      
      // Convert API format to DicomField format
      const schemaFields: DicomField[] = apiFields.map(field => ({
        tag: field.tag,
        name: field.name,
        value: field.value,
        vr: field.vr,
        level: field.level,
        dataType: field.data_type,
        validationRule: field.validation_rule || { type: 'exact' as const },
        consistency: field.consistency
      }));

      setLoadedSchemaFields(schemaFields);
    } catch (err) {
      console.error('Failed to load schema fields:', err);
      setError('Failed to load schema fields from API');
      setLoadedSchemaFields([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Mock compliance validation - UI prototype only
  const performComplianceCheck = async () => {
    if (!schemaId || fields.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 800));

      // Generate mock compliance results for UI demonstration
      const mockResults: ComplianceFieldResult[] = fields.map((field, index) => {
        // Mock different compliance statuses for demonstration
        const rand = Math.random();
        let status: 'pass' | 'fail' | 'warning';
        let message: string;
        
        if (rand < 0.7) {
          status = 'pass';
          message = 'Field meets requirements';
        } else if (rand < 0.9) {
          status = 'warning';
          message = 'Field value should be verified';
        } else {
          status = 'fail';
          message = 'Field does not meet requirements';
        }

        return {
          fieldPath: field.tag,
          fieldName: field.name,
          status,
          message,
          actualValue: field.value,
          expectedValue: status === 'fail' ? 'Expected value differs' : undefined
        };
      });

      setComplianceResults(mockResults);
    } catch (err) {
      console.error('Mock validation error:', err);
      setError('Mock validation failed');
      setComplianceResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Load schema fields when we have a schema (always load for display)
  useEffect(() => {
    if (schemaId && loadedSchemaFields.length === 0 && !isLoading && !error) {
      loadSchemaFields();
    }
  }, [schemaId]); // Trigger when schema changes

  // Only validate when compliance summary is expanded
  useEffect(() => {
    if (expandedCompliance && schemaId && fields.length > 0 && complianceResults.length === 0 && !isLoading && !error) {
      performComplianceCheck();
    }
  }, [expandedCompliance, schemaId, fields.length]); // Only trigger when expanded and schema/fields available

  // Find compliance result for a specific field
  const getFieldComplianceResult = (field: DicomField): ComplianceFieldResult => {
    const result = complianceResults.find(r => r.fieldPath === field.tag);
    return result || {
      fieldPath: field.tag,
      fieldName: field.name,
      status: 'unknown',
      message: schemaId ? 'Click "Compliance Summary" to validate' : 'No schema selected',
      actualValue: field.value
    };
  };

  const getStatusIcon = (status: ComplianceFieldResult['status']) => {
    const iconProps = { className: "h-4 w-4" };
    
    switch (status) {
      case 'pass':
        return <CheckCircle {...iconProps} className="h-4 w-4 text-green-600" />;
      case 'fail':
        return <XCircle {...iconProps} className="h-4 w-4 text-red-600" />;
      case 'warning':
        return <AlertTriangle {...iconProps} className="h-4 w-4 text-yellow-600" />;
      case 'unknown':
        return <HelpCircle {...iconProps} className="h-4 w-4 text-gray-400" />;
    }
  };

  // Calculate compliance statistics from results
  const getComplianceStats = () => {
    const passes = complianceResults.filter(r => r.status === 'pass').length;
    const fails = complianceResults.filter(r => r.status === 'fail').length;
    const warnings = complianceResults.filter(r => r.status === 'warning').length;
    const unknown = complianceResults.filter(r => r.status === 'unknown').length;
    
    return {
      passes,
      fails,
      warnings,
      unknown,
      total: complianceResults.length,
      percentage: complianceResults.length > 0 ? Math.round((passes / complianceResults.length) * 100) : 0
    };
  };

  const compliance = getComplianceStats();
  const compliancePercentage = compliance.percentage;

  // Always display schema fields when available
  const fieldsToDisplay = loadedSchemaFields.length > 0 ? loadedSchemaFields : fields;
  const isSchemaOnlyMode = fields.length === 0 && loadedSchemaFields.length > 0;
  const hasAcquisitionData = fields.length > 0;


  if (fieldsToDisplay.length === 0 && !isLoading) {
    return (
      <div className="border border-gray-200 rounded-md p-4 text-center">
        <p className="text-gray-500 text-xs">
          {schemaId ? 'Loading schema fields...' : 'No fields to display'}
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="border border-gray-200 rounded-md p-4 text-center">
        <Loader className="h-4 w-4 animate-spin mx-auto mb-2" />
        <p className="text-gray-500 text-xs">Validating compliance...</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="border border-gray-200 rounded-md overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Field
              </th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Expected Value
              </th>
              {hasAcquisitionData && (
                <th className="px-2 py-1.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                  Status
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {fieldsToDisplay.map((field, index) => {
              const complianceResult = getFieldComplianceResult(field);
              
              return (
                <tr
                  key={field.tag}
                  className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                  onMouseEnter={() => setHoveredRow(field.tag)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <div className="max-w-32">
                      <p className="text-xs font-medium text-gray-900 truncate">{field.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{field.tag}</p>
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <div>
                      <p className="text-xs text-gray-900 break-words">{formatFieldValue(field)}</p>
                      {field.dataType && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatFieldTypeInfo(field.dataType, field.validationRule)}
                        </p>
                      )}
                    </div>
                  </td>
                  {hasAcquisitionData && (
                    <td className="px-2 py-1.5 text-center">
                      <div 
                        className="inline-flex items-center justify-center cursor-help"
                        title={complianceResult.message}
                      >
                        {getStatusIcon(complianceResult.status)}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Compliance Summary - only show when we have acquisition data to validate */}
      {hasAcquisitionData && (
        <div className="border border-gray-200 rounded-md overflow-hidden">
          <button
            onClick={() => setExpandedCompliance(!expandedCompliance)}
            className="w-full px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium text-gray-900">Compliance Summary</span>
              <div className="flex items-center space-x-2 text-xs">
                {complianceResults.length > 0 ? (
                  <span className={`px-2 py-1 rounded-full ${
                    compliancePercentage >= 90 ? 'bg-green-100 text-green-800' :
                    compliancePercentage >= 70 ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {compliancePercentage}% compliant
                  </span>
                ) : (
                  <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                    Click to validate
                  </span>
                )}
              </div>
            </div>
            {expandedCompliance ? (
              <ChevronUp className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            )}
          </button>
        
        {expandedCompliance && (
          <div className="p-3 bg-white space-y-3">
            {isLoading ? (
              <div className="text-center py-4">
                <Loader className="h-5 w-5 animate-spin mx-auto mb-2" />
                <p className="text-sm text-gray-600">Validating compliance...</p>
              </div>
            ) : complianceResults.length > 0 ? (
              <>
                {/* Summary Stats */}
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-2 bg-green-50 rounded">
                    <div className="text-lg font-semibold text-green-700">{compliance.passes}</div>
                    <div className="text-xs text-green-600">Passed</div>
                  </div>
                  <div className="p-2 bg-red-50 rounded">
                    <div className="text-lg font-semibold text-red-700">{compliance.fails}</div>
                    <div className="text-xs text-red-600">Failed</div>
                  </div>
                  <div className="p-2 bg-yellow-50 rounded">
                    <div className="text-lg font-semibold text-yellow-700">{compliance.warnings}</div>
                    <div className="text-xs text-yellow-600">Warnings</div>
                  </div>
                  <div className="p-2 bg-gray-50 rounded">
                    <div className="text-lg font-semibold text-gray-700">{compliance.unknown}</div>
                    <div className="text-xs text-gray-600">Unknown</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-gray-600">
                  {schemaId ? 'Validation will start automatically...' : 'No schema selected for validation'}
                </p>
              </div>
            )}

            {/* Detailed Issues - only show when we have results or errors */}
            {(complianceResults.length > 0 || error) && (
              <div className="space-y-2">
                {error && (
                  <div className="flex items-start space-x-2 p-2 rounded text-xs bg-red-50">
                    <XCircle className="h-4 w-4 text-red-600 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-medium">Validation Error</div>
                      <div className="text-gray-600">{error}</div>
                    </div>
                  </div>
                )}
                
                {complianceResults.map(result => {
                  if (result.status === 'pass') return null;
                  
                  return (
                    <div key={result.fieldPath} className={`flex items-start space-x-2 p-2 rounded text-xs ${
                      result.status === 'fail' ? 'bg-red-50' :
                      result.status === 'warning' ? 'bg-yellow-50' :
                      'bg-gray-50'
                    }`}>
                      {getStatusIcon(result.status)}
                      <div className="flex-1">
                        <div className="font-medium">{result.fieldName} ({result.fieldPath})</div>
                        <div className="text-gray-600">{result.message}</div>
                        {result.expectedValue && result.actualValue && (
                          <div className="text-xs text-gray-500 mt-1">
                            Expected: {String(result.expectedValue)} | Actual: {String(result.actualValue)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                
                {complianceResults.length > 0 && compliance.fails === 0 && compliance.warnings === 0 && compliance.unknown === 0 && (
                  <div className="text-center text-green-600 text-sm py-2">
                    ✅ All fields are compliant with the schema requirements
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        </div>
      )}
    </div>
  );
};

export default ComplianceFieldTable;