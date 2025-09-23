import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, HelpCircle, ChevronDown, ChevronUp, Loader } from 'lucide-react';
import { DicomField, Acquisition, SchemaField } from '../../types';
import { formatFieldValue, formatFieldTypeInfo } from '../../utils/fieldFormatters';
import { ComplianceFieldResult } from '../../types/schema';
import { dicompareAPI, FieldInfo } from '../../services/DicompareAPI';
import { useSchemaContext } from '../../contexts/SchemaContext';
import CustomTooltip from '../common/CustomTooltip';

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
  acquisitionId?: string;
  getSchemaContent?: (id: string) => Promise<string | null>;
}

const ComplianceFieldTable: React.FC<ComplianceFieldTableProps> = ({
  fields,
  acquisition,
  schemaFields,
  schemaId,
  acquisitionId,
  getSchemaContent: providedGetSchemaContent
}) => {
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [expandedCompliance, setExpandedCompliance] = useState<boolean>(false);
  const [complianceResults, setComplianceResults] = useState<ComplianceFieldResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedSchemaFields, setLoadedSchemaFields] = useState<DicomField[]>([]);
  const [validationRules, setValidationRules] = useState<any[]>([]);

  const { getSchemaContent: contextGetSchemaContent } = useSchemaContext();
  const getSchemaContent = providedGetSchemaContent || contextGetSchemaContent;

  // Load schema fields from API
  const loadSchemaFields = async () => {
    if (!schemaId) return;

    setIsLoading(true);
    setError(null);

    try {
      console.log('🔍 SCHEMA DEBUG: Loading schema fields');
      console.log('🔍 SCHEMA DEBUG: schemaId =', schemaId);
      console.log('🔍 SCHEMA DEBUG: acquisitionId =', acquisitionId);

      // Get schema fields from Python API, passing getSchemaContent for uploaded schemas
      const apiFields: FieldInfo[] = await dicompareAPI.getSchemaFields(schemaId, getSchemaContent, acquisitionId);

      console.log('🔍 SCHEMA DEBUG: Raw API returned', apiFields.length, 'fields');
      console.log('🔍 SCHEMA DEBUG: First few fields:', apiFields.slice(0, 3).map(f => ({ name: f.name, tag: f.tag, level: f.level })));

      // Convert API format to DicomField format
      const schemaFields: DicomField[] = apiFields.map(field => ({
        tag: field.tag,
        name: field.name,
        value: field.value,
        vr: field.vr,
        level: field.level,
        dataType: field.data_type,
        validationRule: field.validation_rule || { type: 'exact' as const },
        consistency: field.consistency,
        seriesName: field.seriesName // Pass through the series name
      }));

      console.log('🔍 SCHEMA DEBUG: Converted to', schemaFields.length, 'schema fields');
      setLoadedSchemaFields(schemaFields);

      // Extract validation rules if they exist
      const rules = (apiFields as any).validationRules || [];
      setValidationRules(rules);
      console.log('🔍 SCHEMA DEBUG: Found', rules.length, 'validation rules');
    } catch (err) {
      console.error('Failed to load schema fields:', err);
      setError('Failed to load schema fields from API');
      setLoadedSchemaFields([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Real compliance validation using dicompare
  const performComplianceCheck = async () => {
    if (!schemaId || fields.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      // Validating acquisition against schema
      
      // Use real dicompare validation against the selected schema
      const validationResults = await dicompareAPI.validateAcquisitionAgainstSchema(
        acquisition,
        schemaId,
        getSchemaContent,
        acquisitionId
      );

      // Convert validation results to UI format
      const complianceResults: ComplianceFieldResult[] = validationResults.map(result => ({
        fieldPath: result.fieldPath,
        fieldName: result.fieldName,
        status: result.status,
        message: result.message,
        actualValue: result.actualValue,
        expectedValue: result.expectedValue,
        validationType: result.validationType,
        seriesName: result.seriesName,
        rule_name: result.rule_name // Include rule_name for rule validation results
      }));

      setComplianceResults(complianceResults);
    } catch (err) {
      console.error('Compliance validation error:', err);
      setError(`Validation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setComplianceResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Load schema fields when we have a schema (always load for display)
  useEffect(() => {
    console.log('🔄 EFFECT DEBUG: useEffect triggered - schemaId =', schemaId, ', acquisitionId =', acquisitionId, ', isLoading =', isLoading, ', error =', error);
    if (schemaId && !isLoading && !error) {
      loadSchemaFields();
    }
  }, [schemaId, acquisitionId]); // Trigger when schema or acquisition changes

  // Only validate when compliance summary is expanded
  useEffect(() => {
    if (expandedCompliance && schemaId && fields.length > 0 && complianceResults.length === 0 && !isLoading && !error) {
      performComplianceCheck();
    }
  }, [expandedCompliance, schemaId, fields.length]); // Only trigger when expanded and schema/fields available

  // Find compliance result for a specific field
  const getFieldComplianceResult = (field: DicomField): ComplianceFieldResult => {
    // Match by field name since that's what the validation results use
    const result = complianceResults.find(r => 
      r.fieldPath === field.name || r.fieldName === field.name
    );
    return result || {
      fieldPath: field.tag,
      fieldName: field.name,
      status: 'unknown',
      message: schemaId ? 'Click "Compliance Summary" to validate' : 'No schema selected',
      actualValue: field.value
    };
  };

  // Find compliance result for a series field with series context
  const getSeriesFieldComplianceResult = (field: DicomField, seriesName: string): ComplianceFieldResult => {
    // First try to find series-specific result
    const seriesResult = complianceResults.find(r => 
      r.validationType === 'series' &&
      (r.fieldPath === field.name || r.fieldName === field.name) &&
      r.seriesName === seriesName
    );
    
    if (seriesResult) {
      return seriesResult;
    }
    
    // Fall back to acquisition-level result if no series result found
    return getFieldComplianceResult(field);
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
      case 'na':
        return <HelpCircle {...iconProps} className="h-4 w-4 text-gray-500" />;
      case 'unknown':
        return <HelpCircle {...iconProps} className="h-4 w-4 text-gray-400" />;
    }
  };

  // Calculate compliance statistics from results
  const getComplianceStats = () => {
    const passes = complianceResults.filter(r => r.status === 'pass').length;
    const fails = complianceResults.filter(r => r.status === 'fail').length;
    const warnings = complianceResults.filter(r => r.status === 'warning').length;
    const na = complianceResults.filter(r => r.status === 'na').length;
    
    return {
      passes,
      fails,
      warnings,
      na,
      total: complianceResults.length,
      percentage: complianceResults.length > 0 ? Math.round((passes / complianceResults.length) * 100) : 0
    };
  };

  const compliance = getComplianceStats();
  const compliancePercentage = compliance.percentage;

  // IMPORTANT FIX: Only show schema-defined fields, never DICOM fields as constraints
  // When a schema is loaded, only show fields that are actually defined in the schema
  const schemaDefinedFields = loadedSchemaFields;
  const acquisitionLevelFields = schemaDefinedFields.filter(field => field.level === 'acquisition');
  const seriesLevelFields = schemaDefinedFields.filter(field => field.level === 'series');
  
  const isSchemaOnlyMode = fields.length === 0 && loadedSchemaFields.length > 0;
  const hasAcquisitionData = fields.length > 0;


  // Check if we have any schema-defined fields or validation rules to display
  const hasSchemaContent = schemaDefinedFields.length > 0 || validationRules.length > 0;
  
  if (!hasSchemaContent && !isLoading) {
    return (
      <div className="border border-gray-200 rounded-md p-4 text-center">
        <p className="text-gray-500 text-xs">
          {schemaId ? 'Schema contains only validation rules (no field constraints)' : 'No schema selected'}
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

  const renderFieldTable = (fieldsToRender: DicomField[], title: string) => {
    if (fieldsToRender.length === 0) return null;

    return (
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
            {fieldsToRender.map((field, index) => {
              const complianceResult = getFieldComplianceResult(field);
              
              return (
                <tr
                  key={`${title}-${field.tag}-${index}`}
                  className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                  onMouseEnter={() => setHoveredRow(`${title}-${field.tag}-${index}`)}
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
                      <CustomTooltip 
                        content={complianceResult.message}
                        position="top"
                        delay={100}
                      >
                        <div className="inline-flex items-center justify-center cursor-help">
                          {getStatusIcon(complianceResult.status)}
                        </div>
                      </CustomTooltip>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderSeriesFieldTable = (fieldsToRender: DicomField[], title: string) => {
    if (fieldsToRender.length === 0) return null;

    // Group series fields by series and field using the actual seriesName from the field
    const seriesData: Record<string, Record<string, DicomField>> = {};
    
    fieldsToRender.forEach((field, index) => {
      // Use the actual series name from the field, or fallback to a generated name
      const seriesName = field.seriesName || `Series_${index + 1}`;
      
      if (!seriesData[seriesName]) {
        seriesData[seriesName] = {};
      }
      
      seriesData[seriesName][field.name] = field;
    });

    // Get all unique field names for column headers
    const allFieldNames = [...new Set(fieldsToRender.map(f => f.name))];
    const seriesNames = Object.keys(seriesData).sort(); // Sort series names for consistent order

    return (
      <div className="border border-gray-200 rounded-md overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10 min-w-[140px]">
                Series
              </th>
              {allFieldNames.map(fieldName => {
                // Get the field to access its tag
                const field = fieldsToRender.find(f => f.name === fieldName);
                return (
                  <th key={fieldName} className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{fieldName}</p>
                      {field && <p className="text-xs font-normal text-gray-400 font-mono">{field.tag}</p>}
                    </div>
                  </th>
                );
              })}
              {hasAcquisitionData && (
                <th className="px-2 py-1.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                  Status
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {seriesNames.map((seriesName, index) => (
              <tr
                key={seriesName}
                className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
              >
                <td className="px-2 py-1.5 whitespace-nowrap font-medium text-gray-900 sticky left-0 bg-inherit min-w-[140px]">
                  <span className="text-xs">{seriesName}</span>
                </td>
                {allFieldNames.map(fieldName => {
                  const field = seriesData[seriesName][fieldName];
                  return (
                    <td key={`${seriesName}-${fieldName}`} className="px-2 py-1.5">
                      {field ? (
                        <div>
                          <p className="text-xs text-gray-900 break-words">{formatFieldValue(field)}</p>
                          {field.dataType && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              {formatFieldTypeInfo(field.dataType, field.validationRule)}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">-</p>
                      )}
                    </td>
                  );
                })}
                {hasAcquisitionData && (
                  <td className="px-2 py-1.5 text-center">
                    {/* For now, show the status of the first field in this series */}
                    {allFieldNames.length > 0 && seriesData[seriesName][allFieldNames[0]] && (
                      <CustomTooltip 
                        content={getSeriesFieldComplianceResult(seriesData[seriesName][allFieldNames[0]], seriesName).message}
                        position="top"
                        delay={100}
                      >
                        <div className="inline-flex items-center justify-center cursor-help">
                          {getStatusIcon(getSeriesFieldComplianceResult(seriesData[seriesName][allFieldNames[0]], seriesName).status)}
                        </div>
                      </CustomTooltip>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const getRuleValidationResult = (rule: any): ComplianceFieldResult => {
    // Find compliance result for this specific rule
    const result = complianceResults.find(r => r.rule_name === rule.name);
    
    return result || {
      fieldPath: rule.id,
      fieldName: rule.name,
      status: 'unknown',
      message: hasAcquisitionData ? 'Click "Compliance Summary" to validate' : 'No data to validate against',
      actualValue: null
    };
  };

  const renderValidationRulesTable = () => {
    if (validationRules.length === 0) return null;

    return (
      <div className="mb-3">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Validator Rules</h4>
        <div className="border border-gray-200 rounded-md overflow-hidden">
          <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-700">
              <div className="col-span-3">Name</div>
              <div className="col-span-5">Description</div>
              <div className="col-span-3">Fields</div>
              {hasAcquisitionData && (
                <div className="col-span-1 text-center">Status</div>
              )}
            </div>
          </div>
          <div className="divide-y divide-gray-200">
            {validationRules.map((rule, index) => {
              const ruleResult = getRuleValidationResult(rule);
              
              return (
                <div key={`${rule.id}-${index}`} className="px-3 py-2 hover:bg-gray-50">
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-3">
                      <div className="text-sm font-medium text-gray-900">{rule.name}</div>
                    </div>
                    <div className="col-span-5">
                      <div className="text-sm text-gray-600">{rule.description}</div>
                    </div>
                    <div className="col-span-3">
                      <div className="flex flex-wrap gap-1">
                        {(rule.fields || []).map((field: string) => (
                          <span key={field} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                            {field}
                          </span>
                        ))}
                      </div>
                    </div>
                    {hasAcquisitionData && (
                      <div className="col-span-1 text-center">
                        <CustomTooltip 
                          content={ruleResult.message}
                          position="top"
                          delay={100}
                        >
                          <div className="inline-flex items-center justify-center cursor-help">
                            {getStatusIcon(ruleResult.status)}
                          </div>
                        </CustomTooltip>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {renderValidationRulesTable()}
      {acquisitionLevelFields.length > 0 && renderFieldTable(acquisitionLevelFields, "Acquisition-Level Fields")}
      {seriesLevelFields.length > 0 && renderSeriesFieldTable(seriesLevelFields, "Series-Level Fields")}

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
                <div className="grid grid-cols-3 gap-2 text-center">
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
                
                {/* Group and sort results by status: fails first, then warnings, then na */}
                {(() => {
                  const failResults = complianceResults.filter(result => result.status === 'fail');
                  const warningResults = complianceResults.filter(result => result.status === 'warning');
                  const naResults = complianceResults.filter(result => result.status === 'na');
                  
                  return (
                    <>
                      {/* Failed validations */}
                      {failResults.length > 0 && (
                        <>
                          <div className="text-xs font-medium text-red-700 mt-2 mb-1 flex items-center">
                            <XCircle className="h-3 w-3 mr-1" />
                            Failed ({failResults.length})
                          </div>
                          {failResults.map((result, index) => (
                            <div key={`fail-${result.fieldPath}-${index}`} className="flex items-start space-x-2 p-2 rounded text-xs bg-red-50">
                              {getStatusIcon(result.status)}
                              <div className="flex-1">
                                <div className="font-medium">
                                  {result.validationType === 'rule' && result.rule_name ? 
                                    result.rule_name : 
                                    result.validationType === 'series' && result.seriesName ? 
                                      `${result.seriesName}: ${result.fieldName}` :
                                      result.fieldName !== result.fieldPath ? 
                                        `${result.fieldName} (${result.fieldPath})` :
                                        result.fieldName
                                  }
                                </div>
                                <div className="text-gray-600">{result.message}</div>
                                {result.expectedValue && result.actualValue && (
                                  <div className="text-xs text-gray-500 mt-1">
                                    <div>Expected: {String(result.expectedValue)}</div>
                                    <div className="mt-0.5">Actual: {String(result.actualValue)}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                      
                      {/* Warning validations */}
                      {warningResults.length > 0 && (
                        <>
                          <div className="text-xs font-medium text-yellow-700 mt-2 mb-1 flex items-center">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Warnings ({warningResults.length})
                          </div>
                          {warningResults.map((result, index) => (
                            <div key={`warning-${result.fieldPath}-${index}`} className="flex items-start space-x-2 p-2 rounded text-xs bg-yellow-50">
                              {getStatusIcon(result.status)}
                              <div className="flex-1">
                                <div className="font-medium">
                                  {result.validationType === 'rule' && result.rule_name ? 
                                    result.rule_name : 
                                    result.validationType === 'series' && result.seriesName ? 
                                      `${result.seriesName}: ${result.fieldName}` :
                                      result.fieldName !== result.fieldPath ? 
                                        `${result.fieldName} (${result.fieldPath})` :
                                        result.fieldName
                                  }
                                </div>
                                <div className="text-gray-600">{result.message}</div>
                                {result.expectedValue && result.actualValue && (
                                  <div className="text-xs text-gray-500 mt-1">
                                    <div>Expected: {String(result.expectedValue)}</div>
                                    <div className="mt-0.5">Actual: {String(result.actualValue)}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                      
                      {/* Not applicable validations */}
                      {naResults.length > 0 && (
                        <>
                          <div className="text-xs font-medium text-gray-600 mt-2 mb-1 flex items-center">
                            <HelpCircle className="h-3 w-3 mr-1" />
                            Not Applicable ({naResults.length})
                          </div>
                          {naResults.map((result, index) => (
                            <div key={`na-${result.fieldPath}-${index}`} className="flex items-start space-x-2 p-2 rounded text-xs bg-gray-100">
                              {getStatusIcon(result.status)}
                              <div className="flex-1">
                                <div className="font-medium">
                                  {result.validationType === 'rule' && result.rule_name ? 
                                    result.rule_name : 
                                    result.validationType === 'series' && result.seriesName ? 
                                      `${result.seriesName}: ${result.fieldName}` :
                                      result.fieldName !== result.fieldPath ? 
                                        `${result.fieldName} (${result.fieldPath})` :
                                        result.fieldName
                                  }
                                </div>
                                <div className="text-gray-600">{result.message}</div>
                                {result.expectedValue && result.actualValue && (
                                  <div className="text-xs text-gray-500 mt-1">
                                    <div>Expected: {String(result.expectedValue)}</div>
                                    <div className="mt-0.5">Actual: {String(result.actualValue)}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </>
                  );
                })()}
                
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