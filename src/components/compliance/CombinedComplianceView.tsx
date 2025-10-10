import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, HelpCircle, Loader } from 'lucide-react';
import { Acquisition } from '../../types';
import { ComplianceFieldResult } from '../../types/schema';
import { SchemaBinding } from '../../hooks/useSchemaService';
import { dicompareAPI } from '../../services/DicompareAPI';
import CustomTooltip from '../common/CustomTooltip';
import { formatFieldValue, formatFieldTypeInfo, formatSeriesFieldValue } from '../../utils/fieldFormatters';
import { inferDataTypeFromValue } from '../../utils/datatypeInference';

interface CombinedComplianceViewProps {
  acquisition: Acquisition;
  pairing?: SchemaBinding;
  getSchemaContent: (id: string) => Promise<string | null>;
  getSchemaAcquisition: (binding: SchemaBinding) => Promise<Acquisition | null>;
  printMode?: boolean; // Show messages inline instead of tooltips for printing
}

// Helper function to parse dicompare's expectedValue format
const parseExpectedValue = (expectedValue: string): string => {
  if (!expectedValue) return '—';

  // Handle formats like "value=3.0 ± 0.3" or "value=Generated Test Data"
  const valueMatch = expectedValue.match(/^value(?:\(list\))?=(.+)$/);
  if (valueMatch) {
    return valueMatch[1];
  }

  // Handle complex formats like "(value=None, tolerance=None, ...)"
  if (expectedValue.startsWith('(') && expectedValue.endsWith(')')) {
    return '—';
  }

  return expectedValue;
};

// Helper function to infer validation rule from expectedValue
const inferValidationRuleFromExpectedValue = (expectedValue: string): { type: string; isList: boolean } => {
  if (!expectedValue) return { type: 'exact', isList: false };

  // Check if it's a list
  const isList = expectedValue.includes('value(list)=') || (expectedValue.includes('[') && expectedValue.includes(']'));

  // Check for tolerance (±)
  if (expectedValue.includes('±')) {
    return { type: 'tolerance', isList };
  }

  // Check for range (to)
  if (expectedValue.includes(' to ')) {
    return { type: 'range', isList };
  }

  // Check for contains
  if (expectedValue.includes('contains all')) {
    return { type: 'contains_all', isList };
  }
  if (expectedValue.includes('contains any')) {
    return { type: 'contains_any', isList };
  }
  if (expectedValue.includes('contains')) {
    return { type: 'contains', isList };
  }

  // Default to exact
  return { type: 'exact', isList };
};

const CombinedComplianceView: React.FC<CombinedComplianceViewProps> = ({
  acquisition,
  pairing,
  getSchemaContent,
  getSchemaAcquisition,
  printMode = false
}) => {
  const [schemaAcquisition, setSchemaAcquisition] = useState<Acquisition | null>(null);
  const [complianceResults, setComplianceResults] = useState<ComplianceFieldResult[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [isLoadingSchema, setIsLoadingSchema] = useState(true);

  // Load schema acquisition
  useEffect(() => {
    if (!pairing) {
      setIsLoadingSchema(false);
      setSchemaAcquisition(null);
      return;
    }

    const loadSchema = async () => {
      setIsLoadingSchema(true);
      try {
        const schemaAcq = await getSchemaAcquisition(pairing);
        console.log('🔍 Loaded schemaAcquisition:', schemaAcq);
        console.log('🔍 schemaAcquisition.series:', schemaAcq?.series);
        console.log('🔍 schemaAcquisition.acquisitionFields:', schemaAcq?.acquisitionFields);
        setSchemaAcquisition(schemaAcq);
      } catch (error) {
        console.error('Failed to load schema:', error);
      }
      setIsLoadingSchema(false);
    };

    loadSchema();
  }, [pairing?.schemaId, pairing?.acquisitionId]);

  // Run validation
  useEffect(() => {
    if (!pairing || !schemaAcquisition) return;

    const runValidation = async () => {
      setIsValidating(true);
      try {
        const results = await dicompareAPI.validateAcquisitionAgainstSchema(
          acquisition,
          pairing.schemaId,
          getSchemaContent,
          pairing.acquisitionId
        );
        setComplianceResults(results);
      } catch (error) {
        console.error('Validation failed:', error);
      }
      setIsValidating(false);
    };

    runValidation();
  }, [acquisition, schemaAcquisition, pairing?.schemaId, pairing?.acquisitionId]);

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

  // Helper to render status with optional inline message for print mode
  const renderStatusWithMessage = (status: ComplianceFieldResult['status'], message: string) => {
    if (printMode) {
      return (
        <div className="flex items-start space-x-2">
          <div className="flex-shrink-0 mt-0.5">{getStatusIcon(status)}</div>
          <p className="text-xs text-gray-700">{message}</p>
        </div>
      );
    }
    return (
      <CustomTooltip content={message}>
        <div className="inline-flex items-center justify-center cursor-help">
          {getStatusIcon(status)}
        </div>
      </CustomTooltip>
    );
  };

  if (isLoadingSchema && pairing) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="h-8 w-8 animate-spin text-medical-600" />
        <span className="ml-3 text-gray-600">Loading schema...</span>
      </div>
    );
  }

  if (pairing && !schemaAcquisition) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Failed to load schema</p>
      </div>
    );
  }

  // Helper function to get status priority for sorting
  const getStatusPriority = (status?: string): number => {
    switch (status) {
      case 'pass': return 0;
      case 'fail': return 1;
      case 'warning': return 2;
      case 'na': return 3;
      default: return 4;
    }
  };

  const validationRules = schemaAcquisition?.validationFunctions || [];
  const validationRuleResults = complianceResults.filter(r => r.validationType === 'rule');

  // Sort validation rules by status
  const sortedValidationRules = [...validationRules].sort((a, b) => {
    const resultA = validationRuleResults.find(r => r.rule_name === (a.customName || a.name));
    const resultB = validationRuleResults.find(r => r.rule_name === (b.customName || b.name));
    return getStatusPriority(resultA?.status) - getStatusPriority(resultB?.status);
  });

  // Get all unique acquisition field tags from both data and schema
  const allAcquisitionFieldTags = new Set<string>();
  acquisition.acquisitionFields.forEach(f => allAcquisitionFieldTags.add(f.tag));
  schemaAcquisition?.acquisitionFields.forEach(f => allAcquisitionFieldTags.add(f.tag));

  // Sort acquisition field tags by status
  const sortedAcquisitionFieldTags = Array.from(allAcquisitionFieldTags).sort((tagA, tagB) => {
    const dataFieldA = acquisition.acquisitionFields.find(f => f.tag === tagA);
    const schemaFieldA = schemaAcquisition?.acquisitionFields.find(f => f.tag === tagA);
    const resultA = complianceResults.find(
      r => r.fieldName === (dataFieldA?.name || schemaFieldA?.name) &&
           r.validationType === 'field' &&
           !r.seriesName
    );

    const dataFieldB = acquisition.acquisitionFields.find(f => f.tag === tagB);
    const schemaFieldB = schemaAcquisition?.acquisitionFields.find(f => f.tag === tagB);
    const resultB = complianceResults.find(
      r => r.fieldName === (dataFieldB?.name || schemaFieldB?.name) &&
           r.validationType === 'field' &&
           !r.seriesName
    );

    return getStatusPriority(resultA?.status) - getStatusPriority(resultB?.status);
  });

  return (
    <div className="space-y-6">
      {/* Validation Rules Table */}
      {validationRules.length > 0 && (
        <div>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Rule
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Description
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-24">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedValidationRules.map((rule, idx) => {
                  const result = validationRuleResults.find(r => r.rule_name === (rule.customName || rule.name));

                  // Determine row background color based on status
                  let rowBgClass = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                  if (result) {
                    if (result.status === 'pass') rowBgClass = 'bg-green-50';
                    else if (result.status === 'fail') rowBgClass = 'bg-red-50';
                    else if (result.status === 'warning') rowBgClass = 'bg-yellow-50';
                  }

                  return (
                    <tr key={idx} className={rowBgClass}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{rule.customName || rule.name}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(rule.customFields || rule.fields).map(field => (
                            <span key={field} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                              {field}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{rule.customDescription || rule.description}</td>
                      <td className="px-4 py-3 text-center">
                        {isValidating ? (
                          <Loader className="h-4 w-4 animate-spin mx-auto text-gray-500" />
                        ) : result ? (
                          renderStatusWithMessage(result.status, result.message)
                        ) : (
                          <HelpCircle className="h-4 w-4 text-gray-400 mx-auto" />
                        )}
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
      <div>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-1/4">
                  Acquisition Field
                </th>
                {schemaAcquisition && (
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-1/4">
                    Expected Value
                  </th>
                )}
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-1/4">
                  Actual Value
                </th>
                {schemaAcquisition && (
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-24">
                    Status
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedAcquisitionFieldTags.map((tag, idx) => {
                const dataField = acquisition.acquisitionFields.find(f => f.tag === tag);
                const schemaField = schemaAcquisition?.acquisitionFields.find(f => f.tag === tag);
                const result = complianceResults.find(
                  r => r.fieldName === (dataField?.name || schemaField?.name) &&
                       r.validationType === 'field' &&
                       !r.seriesName
                );

                // Determine row background color based on status
                let rowBgClass = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                if (schemaAcquisition && result) {
                  if (result.status === 'pass') rowBgClass = 'bg-green-50';
                  else if (result.status === 'fail') rowBgClass = 'bg-red-50';
                  else if (result.status === 'warning') rowBgClass = 'bg-yellow-50';
                }

                return (
                  <tr key={tag} className={rowBgClass}>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{dataField?.name || schemaField?.name}</p>
                      <p className="text-xs text-gray-500">{tag}</p>
                    </td>
                    {schemaAcquisition && (
                      <td className="px-4 py-3">
                        {schemaField ? (
                          <div>
                            {/* Format value directly from schema field, like AcquisitionTable does */}
                            {console.log('Schema field for', schemaField.name, ':', schemaField)}
                            <p className="text-sm text-gray-900">
                              {formatFieldValue(schemaField)}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {formatFieldTypeInfo(
                                schemaField.dataType || inferDataTypeFromValue(schemaField.value),
                                schemaField.validationRule
                              )}
                            </p>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {dataField ? (
                        <p className="text-sm text-gray-900">{formatFieldValue(dataField)}</p>
                      ) : (
                        <span className="text-gray-400 italic">—</span>
                      )}
                    </td>
                    {schemaAcquisition && (
                      <td className="px-4 py-3 text-center">
                        {isValidating ? (
                          <Loader className="h-4 w-4 animate-spin mx-auto text-gray-500" />
                        ) : result ? (
                          renderStatusWithMessage(result.status, result.message)
                        ) : schemaField ? (
                          renderStatusWithMessage('unknown', "Field not found in data")
                        ) : (
                          renderStatusWithMessage('unknown', "Field not described in schema")
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Actual Series Table - from uploaded DICOM data */}
      {acquisition.series && acquisition.series.length > 0 && (
        <div>
          {renderActualSeriesTable(acquisition.series, complianceResults)}
        </div>
      )}

      {/* Expected Series Table - from schema */}
      {schemaAcquisition?.series && schemaAcquisition.series.length > 0 && (
        <div>
          {renderExpectedSeriesTable(complianceResults, schemaAcquisition.series)}
        </div>
      )}
    </div>
  );

  // Helper function to render actual series table (shows series from uploaded DICOM data)
  function renderActualSeriesTable(
    dataSeries: any[],
    results: ComplianceFieldResult[]
  ) {
    if (dataSeries.length === 0) {
      return null;
    }

    // Get all unique field names/tags across all data series
    const allFieldTags = new Set<string>();
    const fieldTagToName = new Map<string, string>();

    dataSeries.forEach(series => {
      if (typeof series.fields === 'object' && !Array.isArray(series.fields)) {
        // Object format: { "0018,0081": { value: ..., field: ... } }
        Object.entries(series.fields).forEach(([tag, fieldData]: [string, any]) => {
          allFieldTags.add(tag);
          if (!fieldTagToName.has(tag)) {
            fieldTagToName.set(tag, fieldData.field || fieldData.name || tag);
          }
        });
      } else if (Array.isArray(series.fields)) {
        // Array format: [{ tag: ..., name: ..., value: ... }]
        series.fields.forEach((f: any) => {
          allFieldTags.add(f.tag);
          if (!fieldTagToName.has(f.tag)) {
            fieldTagToName.set(f.tag, f.name || f.tag);
          }
        });
      }
    });

    const fieldTagsArray = Array.from(allFieldTags);

    return (
      <div className="border border-gray-200 rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Series
              </th>
              {fieldTagsArray.map(tag => (
                <th key={tag} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {fieldTagToName.get(tag)}
                  <div className="text-xs text-gray-400 font-mono normal-case font-normal">{tag}</div>
                </th>
              ))}
              {schemaAcquisition && (
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-24">
                  Status
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {dataSeries.map((series, idx) => {
              // Find validation results for this series
              const seriesResults = results.filter(r => {
                if (r.validationType !== 'series') return false;
                // Match by series name or index
                const resultIndex = parseInt(r.seriesName?.match(/\d+$/)?.[0] || '0') - 1;
                return resultIndex === idx || r.seriesName === series.name;
              });

              // Overall series status
              let overallStatus: ComplianceFieldResult['status'] = 'unknown';
              if (schemaAcquisition && seriesResults.length > 0) {
                const hasFailure = seriesResults.some(r => r.status === 'fail');
                const hasWarning = seriesResults.some(r => r.status === 'warning');
                const hasNA = seriesResults.some(r => r.status === 'na');

                if (hasFailure) overallStatus = 'fail';
                else if (hasWarning) overallStatus = 'warning';
                else if (hasNA) overallStatus = 'na';
                else overallStatus = 'pass';
              }

              // Determine row background color
              let rowBgClass = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
              if (schemaAcquisition && overallStatus !== 'unknown') {
                if (overallStatus === 'pass') rowBgClass = 'bg-green-50';
                else if (overallStatus === 'fail') rowBgClass = 'bg-red-50';
                else if (overallStatus === 'warning') rowBgClass = 'bg-yellow-50';
              }

              const statusMessage = seriesResults.length > 0
                ? seriesResults.map(r => r.message).join('; ')
                : 'No validation result';

              return (
                <tr key={idx} className={rowBgClass}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {series.name || `Series ${idx + 1}`}
                  </td>
                  {fieldTagsArray.map(tag => {
                    let fieldValue = '—';

                    if (typeof series.fields === 'object' && !Array.isArray(series.fields)) {
                      // Object format
                      const fieldData = series.fields[tag];
                      if (fieldData && fieldData.value !== undefined) {
                        fieldValue = formatSeriesFieldValue(fieldData.value);
                      }
                    } else if (Array.isArray(series.fields)) {
                      // Array format
                      const field = series.fields.find((f: any) => f.tag === tag);
                      if (field && field.value !== undefined) {
                        fieldValue = formatSeriesFieldValue(field.value);
                      }
                    }

                    return (
                      <td key={tag} className="px-4 py-3">
                        <p className="text-sm text-gray-900">{fieldValue}</p>
                      </td>
                    );
                  })}
                  {schemaAcquisition && (
                    <td className="px-4 py-3 text-center">
                      {isValidating ? (
                        <Loader className="h-4 w-4 animate-spin mx-auto text-gray-500" />
                      ) : seriesResults.length > 0 ? (
                        renderStatusWithMessage(overallStatus, statusMessage)
                      ) : (
                        <HelpCircle className="h-4 w-4 text-gray-400 mx-auto" />
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // Helper function to render expected series table (shows all series from schema)
  function renderExpectedSeriesTable(
    results: ComplianceFieldResult[],
    schemaSeries: any[]
  ) {
    if (schemaSeries.length === 0) {
      return null;
    }

    // Get all series validation results
    const seriesValidationResults = results.filter(r => r.validationType === 'series');

    // Get unique field names across all series
    const allFieldNames = new Set<string>();
    schemaSeries.forEach(series => {
      if (Array.isArray(series.fields)) {
        series.fields.forEach((f: any) => allFieldNames.add(f.name || f.field));
      }
    });
    const fieldNamesArray = Array.from(allFieldNames);

    return (
      <div className="border border-gray-200 rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Expected Series
              </th>
              {fieldNamesArray.map(fieldName => (
                <th key={fieldName} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {fieldName}
                </th>
              ))}
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-24">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {schemaSeries.map((series, idx) => {
              // Find validation results for this series by matching against series names in results
              const seriesResults = seriesValidationResults.filter(r => {
                // Match by index since series names might differ (Series_001 vs Series 1)
                const resultIndex = parseInt(r.seriesName?.match(/\d+$/)?.[0] || '0') - 1;
                return resultIndex === idx;
              });

              // Overall series status
              let overallStatus: ComplianceFieldResult['status'] = 'unknown';
              if (seriesResults.length > 0) {
                const hasFailure = seriesResults.some(r => r.status === 'fail');
                const hasWarning = seriesResults.some(r => r.status === 'warning');
                const hasNA = seriesResults.some(r => r.status === 'na');

                if (hasFailure) overallStatus = 'fail';
                else if (hasWarning) overallStatus = 'warning';
                else if (hasNA) overallStatus = 'na';
                else overallStatus = 'pass';
              } else {
                // No validation results means series is missing
                overallStatus = 'na';
              }

              // Determine row background color
              let rowBgClass = 'bg-white';
              if (overallStatus === 'pass') rowBgClass = 'bg-green-50';
              else if (overallStatus === 'fail') rowBgClass = 'bg-red-50';
              else if (overallStatus === 'warning') rowBgClass = 'bg-yellow-50';

              const statusMessage = seriesResults.length > 0
                ? seriesResults.map(r => r.message).join('; ')
                : `Required series "${series.name}" not found in data`;

              return (
                <tr key={idx} className={rowBgClass}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {series.name}
                  </td>
                  {fieldNamesArray.map(fieldName => {
                    // Get the expected value from schema series
                    let fieldValue = '—';
                    if (Array.isArray(series.fields)) {
                      const field = series.fields.find((f: any) =>
                        (f.name || f.field) === fieldName
                      );
                      if (field) {
                        fieldValue = formatSeriesFieldValue(field.value);
                      }
                    }

                    return (
                      <td key={fieldName} className="px-4 py-3">
                        <p className="text-sm text-gray-900">{fieldValue}</p>
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-center">
                    {isValidating ? (
                      <Loader className="h-4 w-4 animate-spin mx-auto text-gray-500" />
                    ) : (
                      renderStatusWithMessage(overallStatus, statusMessage)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // Helper function to render missing series table
  function renderMissingSeriesTable(
    dataSeries: any[],
    schemaSeries: any[],
    results: ComplianceFieldResult[]
  ) {
    // Find series that are missing based on validation results with status 'na'
    const missingSeriesNames = new Set(
      results
        .filter(r => r.validationType === 'series' && r.status === 'na' && r.seriesName)
        .map(r => r.seriesName)
    );

    // Get the schema series definitions for missing series
    const missingSeries = schemaSeries.filter(
      ss => missingSeriesNames.has(ss.name)
    );

    if (missingSeries.length === 0) return null;

    // Get all unique field tags from missing series
    const allFieldTags = new Set<string>();
    missingSeries.forEach(series => {
      if (Array.isArray(series.fields)) {
        series.fields.forEach((f: any) => allFieldTags.add(f.tag));
      }
    });

    const fieldTagsArray = Array.from(allFieldTags);

    return (
      <div>
        <div className="border border-red-200 rounded-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-red-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Missing Series
                </th>
                {fieldTagsArray.map(tag => {
                  const field = missingSeries.flatMap(s => s.fields || []).find((f: any) => f.tag === tag);
                  return (
                    <th key={tag} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {field?.name || tag}
                    </th>
                  );
                })}
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-24">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {missingSeries.map((series, idx) => {
                // Look for validation results for this missing series
                const seriesResults = results.filter(
                  r => r.seriesName === series.name && r.validationType === 'series'
                );

                // Construct tooltip message
                const tooltipMessage = seriesResults.length > 0
                  ? seriesResults.map(r => r.message).join('; ')
                  : `Required series "${series.name}" not found in data`;

                return (
                  <tr key={idx} className="bg-red-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {series.name || `Series ${idx + 1}`}
                    </td>
                    {fieldTagsArray.map(tag => {
                      const schemaField = Array.isArray(series.fields)
                        ? series.fields.find((f: any) => f.tag === tag)
                        : null;

                      return (
                        <td key={tag} className="px-4 py-3">
                          {schemaField ? (
                            <div>
                              <p className="text-sm text-gray-900">{formatSeriesFieldValue(schemaField.value)}</p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {formatFieldTypeInfo(
                                  inferDataTypeFromValue(schemaField.value),
                                  typeof schemaField.value === 'object' && 'validationRule' in schemaField.value
                                    ? schemaField.value.validationRule
                                    : undefined
                                )}
                              </p>
                            </div>
                          ) : (
                            <span className="text-gray-400 italic">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center">
                      {renderStatusWithMessage('fail', tooltipMessage)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
};

export default CombinedComplianceView;
