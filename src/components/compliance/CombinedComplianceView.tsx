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

  const validationRules = schemaAcquisition?.validationFunctions || [];
  const validationRuleResults = complianceResults.filter(r => r.validationType === 'rule');

  // Get all unique acquisition field tags from both data and schema
  const allAcquisitionFieldTags = new Set<string>();
  acquisition.acquisitionFields.forEach(f => allAcquisitionFieldTags.add(f.tag));
  schemaAcquisition?.acquisitionFields.forEach(f => allAcquisitionFieldTags.add(f.tag));

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
                {validationRules.map((rule, idx) => {
                  const result = validationRuleResults.find(r => r.rule_name === (rule.customName || rule.name));

                  // Determine row background color based on status
                  let rowBgClass = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                  if (result) {
                    if (result.status === 'fail') rowBgClass = 'bg-red-50';
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
              {Array.from(allAcquisitionFieldTags).map((tag, idx) => {
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
                  if (result.status === 'fail') rowBgClass = 'bg-red-50';
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

      {/* Series Tables */}
      {(acquisition.series?.length > 0 || schemaAcquisition?.series?.length > 0) && (
        <>
          {/* Identified Series Table */}
          {acquisition.series && acquisition.series.length > 0 && (
            <div>
              {renderSeriesTable(acquisition.series, schemaAcquisition?.series || [], complianceResults, false)}
            </div>
          )}

          {/* Missing Series Table */}
          {schemaAcquisition && renderMissingSeriesTable(acquisition.series || [], schemaAcquisition.series || [], complianceResults)}
        </>
      )}
    </div>
  );

  // Helper function to render series table
  function renderSeriesTable(
    dataSeries: any[],
    schemaSeries: any[],
    results: ComplianceFieldResult[],
    isMissing: boolean
  ) {
    // Get all unique field tags from all series
    const allFieldTags = new Set<string>();
    [...dataSeries, ...schemaSeries].forEach(series => {
      if (Array.isArray(series.fields)) {
        series.fields.forEach((f: any) => allFieldTags.add(f.tag));
      }
    });

    const fieldTagsArray = Array.from(allFieldTags);
    const hasSchema = schemaSeries.length > 0;

    return (
      <div className="border border-gray-200 rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Identified Series
              </th>
              {fieldTagsArray.map(tag => {
                const field = dataSeries.flatMap(s => s.fields || []).find((f: any) => f.tag === tag) ||
                             schemaSeries.flatMap(s => s.fields || []).find((f: any) => f.tag === tag);
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
            {dataSeries.map((series, idx) => {
              // Find validation results for this series from Python API
              const seriesResults = results.filter(
                r => r.seriesName === series.name && r.validationType === 'series'
              );

              // Overall series status: if any field fails/warns, show that; otherwise pass if matched, na if not
              let overallStatus: ComplianceFieldResult['status'] = 'pass';
              if (seriesResults.length > 0) {
                // Use the worst status from all series field validations
                const hasFailure = seriesResults.some(r => r.status === 'fail');
                const hasWarning = seriesResults.some(r => r.status === 'warning');
                const hasNA = seriesResults.some(r => r.status === 'na');

                if (hasFailure) overallStatus = 'fail';
                else if (hasWarning) overallStatus = 'warning';
                else if (hasNA) overallStatus = 'na';
                else overallStatus = 'pass';
              } else if (schemaSeries.length > 0) {
                // Schema exists but no validation results for this series = not in schema
                overallStatus = 'na';
              }

              // Determine row background color based on status
              let rowBgClass = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
              if (hasSchema) {
                if (overallStatus === 'fail') rowBgClass = 'bg-red-50';
                else if (overallStatus === 'warning') rowBgClass = 'bg-yellow-50';
              }

              return (
                <tr key={idx} className={rowBgClass}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {series.name || `Series ${idx + 1}`}
                  </td>
                  {fieldTagsArray.map(tag => {
                    const dataField = Array.isArray(series.fields)
                      ? series.fields.find((f: any) => f.tag === tag)
                      : null;

                    return (
                      <td key={tag} className="px-4 py-3">
                        {dataField ? (
                          <p className="text-sm text-gray-900">{formatSeriesFieldValue(dataField.value)}</p>
                        ) : (
                          <span className="text-gray-400 italic">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-center">
                    {isValidating ? (
                      <Loader className="h-4 w-4 animate-spin mx-auto text-gray-500" />
                    ) : hasSchema ? (
                      seriesResults.length > 0 ? (
                        renderStatusWithMessage(overallStatus, seriesResults.map(r => r.message).join('; '))
                      ) : (
                        renderStatusWithMessage(overallStatus, "Series not described in schema")
                      )
                    ) : (
                      renderStatusWithMessage('unknown', "Series not checked by schema")
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
