import React, { useState, useEffect, useRef } from 'react';
import { HelpCircle, Loader } from 'lucide-react';
import { Acquisition } from '../../types';
import { ComplianceFieldResult } from '../../types/schema';
import { SchemaBinding } from '../../hooks/useSchemaService';
import { dicompareAPI } from '../../services/DicompareAPI';
import CustomTooltip from '../common/CustomTooltip';
import StatusIcon from '../common/StatusIcon';
import { formatFieldValue, formatFieldTypeInfo, formatSeriesFieldValue, buildValidationRuleFromField } from '../../utils/fieldFormatters';
import { inferDataTypeFromValue } from '../../utils/datatypeInference';

interface CombinedComplianceViewProps {
  acquisition: Acquisition;
  pairing?: SchemaBinding;
  getSchemaContent: (id: string) => Promise<string | null>;
  getSchemaAcquisition: (binding: SchemaBinding) => Promise<Acquisition | null>;
  printMode?: boolean; // Show messages inline instead of tooltips for printing
  hideUnknownStatus?: boolean; // Hide rows with unknown status (for print/export)
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
  printMode = false,
  hideUnknownStatus = false
}) => {
  const [schemaAcquisition, setSchemaAcquisition] = useState<Acquisition | null>(null);
  const [complianceResults, setComplianceResults] = useState<ComplianceFieldResult[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [isLoadingSchema, setIsLoadingSchema] = useState(true);
  const mountIdRef = useRef(0);
  const validationRunRef = useRef(false);

  // Track component mount for debugging
  useEffect(() => {
    mountIdRef.current += 1;
    const mountId = mountIdRef.current;
    console.log(`🔄 CombinedComplianceView mounted (id: ${mountId}) for acquisition: ${acquisition.id}`);
    validationRunRef.current = false;

    return () => {
      console.log(`🔄 CombinedComplianceView unmounting (id: ${mountId}) for acquisition: ${acquisition.id}`);
    };
  }, [acquisition.id]);

  // Load schema acquisition
  useEffect(() => {
    if (!pairing) {
      setIsLoadingSchema(false);
      setSchemaAcquisition(null);
      return;
    }

    let isCancelled = false;
    const loadSchema = async () => {
      setIsLoadingSchema(true);
      try {
        console.log(`📥 Loading schema for acquisition: ${acquisition.id}, schema: ${pairing.schemaId}`);
        const schemaAcq = await getSchemaAcquisition(pairing);
        if (!isCancelled) {
          console.log('📥 Schema loaded successfully:', schemaAcq?.id);
          setSchemaAcquisition(schemaAcq);
        }
      } catch (error) {
        console.error('Failed to load schema:', error);
      }
      if (!isCancelled) {
        setIsLoadingSchema(false);
      }
    };

    loadSchema();

    return () => {
      isCancelled = true;
    };
  }, [pairing?.schemaId, pairing?.acquisitionId, acquisition.id, getSchemaAcquisition]);

  // Run validation - triggered by schemaAcquisition change or acquisition change
  useEffect(() => {
    if (!pairing || !schemaAcquisition) {
      console.log(`⏭️ Skipping validation: pairing=${!!pairing}, schemaAcquisition=${!!schemaAcquisition}`);
      return;
    }

    let isCancelled = false;
    const runValidation = async () => {
      console.log(`🔬 Running validation for acquisition: ${acquisition.id}`);
      setIsValidating(true);
      try {
        const results = await dicompareAPI.validateAcquisitionAgainstSchema(
          acquisition,
          pairing.schemaId,
          getSchemaContent,
          pairing.acquisitionId
        );
        if (!isCancelled) {
          console.log(`✅ Validation complete for ${acquisition.id}: ${results.length} results`);
          setComplianceResults(results);
          validationRunRef.current = true;
        }
      } catch (error) {
        console.error('Validation failed:', error);
        if (!isCancelled) {
          setComplianceResults([]);
        }
      }
      if (!isCancelled) {
        setIsValidating(false);
      }
    };

    runValidation();

    return () => {
      isCancelled = true;
    };
  }, [acquisition.id, schemaAcquisition, pairing?.schemaId, pairing?.acquisitionId, getSchemaContent]);

  // Helper to render status with optional inline message for print mode
  const renderStatusWithMessage = (status: ComplianceFieldResult['status'], message: string) => {
    if (printMode) {
      return (
        <div className="flex items-start space-x-2">
          <div className="flex-shrink-0 mt-0.5"><StatusIcon status={status} /></div>
          <p className="text-xs text-content-secondary">{message}</p>
        </div>
      );
    }
    return (
      <CustomTooltip content={message}>
        <div className="inline-flex items-center justify-center cursor-help">
          <StatusIcon status={status} />
        </div>
      </CustomTooltip>
    );
  };

  if (isLoadingSchema && pairing) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="h-8 w-8 animate-spin text-brand-600" />
        <span className="ml-3 text-content-secondary">Loading schema...</span>
      </div>
    );
  }

  if (pairing && !schemaAcquisition) {
    return (
      <div className="text-center py-12">
        <p className="text-status-error">Failed to load schema</p>
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

  // Helper to get status for an acquisition field tag
  const getAcquisitionFieldStatus = (tag: string): string => {
    const dataField = acquisition.acquisitionFields.find(f => f.tag === tag);
    const schemaField = schemaAcquisition?.acquisitionFields.find(f => f.tag === tag);
    const result = complianceResults.find(
      r => r.fieldName === (dataField?.name || schemaField?.name) &&
           r.validationType === 'field' &&
           !r.seriesName
    );
    if (result) return result.status;
    return 'unknown'; // No result means unknown status
  };

  // Sort acquisition field tags by status
  const sortedAcquisitionFieldTags = Array.from(allAcquisitionFieldTags)
    .filter(tag => {
      // Filter out unknown status rows if hideUnknownStatus is enabled
      if (hideUnknownStatus) {
        const status = getAcquisitionFieldStatus(tag);
        return status !== 'unknown';
      }
      return true;
    })
    .sort((tagA, tagB) => {
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
    <div className="p-3 space-y-3">
      {/* Validation Rules Table */}
      {validationRules.length > 0 && (
        <div>
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full divide-y divide-border table-fixed">
              <thead className="bg-surface-secondary">
                <tr>
                  <th className="px-2 py-1.5 text-left text-xs font-medium text-content-tertiary uppercase w-1/3">
                    Rule
                  </th>
                  <th className="px-2 py-1.5 text-left text-xs font-medium text-content-tertiary uppercase w-1/3">
                    Description
                  </th>
                  <th className="px-2 py-1.5 text-center text-xs font-medium text-content-tertiary uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-surface-primary divide-y divide-border">
                {sortedValidationRules.map((rule, idx) => {
                  const result = validationRuleResults.find(r => r.rule_name === (rule.customName || rule.name));

                  // Determine row background color based on status
                  let rowBgClass = idx % 2 === 0 ? 'bg-surface-primary' : 'bg-surface-alt';
                  if (result) {
                    if (result.status === 'pass') rowBgClass = 'bg-green-500/10 dark:bg-green-500/20';
                    else if (result.status === 'fail') rowBgClass = 'bg-red-500/10 dark:bg-red-500/20';
                    else if (result.status === 'warning') rowBgClass = 'bg-yellow-500/10 dark:bg-yellow-500/20';
                  }

                  return (
                    <tr key={idx} className={rowBgClass}>
                      <td className="px-2 py-1.5">
                        <p className="text-xs font-medium text-content-primary">{rule.customName || rule.name}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(rule.customFields || rule.fields).map(field => (
                            <span key={field} className="px-2 py-0.5 bg-blue-500/10 text-blue-700 dark:text-blue-400 text-xs rounded">
                              {field}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-xs text-content-primary">{rule.customDescription || rule.description}</td>
                      <td className="px-2 py-1.5 text-center">
                        {isValidating ? (
                          <Loader className="h-4 w-4 animate-spin mx-auto text-content-tertiary" />
                        ) : result ? (
                          renderStatusWithMessage(result.status, result.message)
                        ) : (
                          <HelpCircle className="h-4 w-4 text-content-muted mx-auto" />
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
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full divide-y divide-border table-fixed">
            <thead className="bg-surface-secondary">
              <tr>
                <th className="px-2 py-1.5 text-left text-xs font-medium text-content-tertiary uppercase w-1/4">
                  Acquisition Field
                </th>
                {schemaAcquisition && (
                  <th className="px-2 py-1.5 text-left text-xs font-medium text-content-tertiary uppercase w-1/4">
                    Expected Value
                  </th>
                )}
                <th className="px-2 py-1.5 text-left text-xs font-medium text-content-tertiary uppercase w-1/4">
                  Actual Value
                </th>
                {schemaAcquisition && (
                  <th className="px-2 py-1.5 text-center text-xs font-medium text-content-tertiary uppercase w-24">
                    Status
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-surface-primary divide-y divide-border">
              {sortedAcquisitionFieldTags.map((tag, idx) => {
                const dataField = acquisition.acquisitionFields.find(f => f.tag === tag);
                const schemaField = schemaAcquisition?.acquisitionFields.find(f => f.tag === tag);
                const result = complianceResults.find(
                  r => r.fieldName === (dataField?.name || schemaField?.name) &&
                       r.validationType === 'field' &&
                       !r.seriesName
                );

                // Determine row background color based on status
                let rowBgClass = idx % 2 === 0 ? 'bg-surface-primary' : 'bg-surface-alt';
                if (schemaAcquisition && result) {
                  if (result.status === 'pass') rowBgClass = 'bg-green-500/10 dark:bg-green-500/20';
                  else if (result.status === 'fail') rowBgClass = 'bg-red-500/10 dark:bg-red-500/20';
                  else if (result.status === 'warning') rowBgClass = 'bg-yellow-500/10 dark:bg-yellow-500/20';
                }

                return (
                  <tr key={tag} className={rowBgClass}>
                    <td className="px-2 py-1.5">
                      <p className="text-xs font-medium text-content-primary">{dataField?.name || schemaField?.name}</p>
                      <p className="text-xs text-content-tertiary">{tag}</p>
                    </td>
                    {schemaAcquisition && (
                      <td className="px-2 py-1.5">
                        {schemaField ? (
                          <div>
                            {/* Format value directly from schema field, like AcquisitionTable does */}
                            {console.log('Schema field for', schemaField.name, ':', schemaField)}
                            <p className="text-xs text-content-primary">
                              {formatFieldValue(schemaField)}
                            </p>
                            <p className="text-xs text-content-tertiary mt-0.5">
                              {formatFieldTypeInfo(
                                schemaField.dataType || inferDataTypeFromValue(schemaField.value),
                                schemaField.validationRule
                              )}
                            </p>
                          </div>
                        ) : (
                          <span className="text-content-muted italic">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-2 py-1.5">
                      {dataField ? (
                        <p className="text-xs text-content-primary">{formatFieldValue(dataField)}</p>
                      ) : (
                        <span className="text-content-muted italic">—</span>
                      )}
                    </td>
                    {schemaAcquisition && (
                      <td className="px-2 py-1.5 text-center">
                        {isValidating ? (
                          <Loader className="h-4 w-4 animate-spin mx-auto text-content-tertiary" />
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

    // Filter series based on hideUnknownStatus
    const filteredDataSeries = hideUnknownStatus
      ? dataSeries.filter((series, idx) => {
          const seriesResults = results.filter(r => {
            if (r.validationType !== 'series') return false;
            const resultIndex = parseInt(r.seriesName?.match(/\d+$/)?.[0] || '0') - 1;
            return resultIndex === idx || r.seriesName === series.name;
          });
          // Determine overall status
          if (!schemaAcquisition || seriesResults.length === 0) {
            return false; // unknown status, filter out
          }
          return true;
        })
      : dataSeries;

    if (filteredDataSeries.length === 0) {
      return null;
    }


    // Get all unique field names/tags across all data series (use filtered list)
    const allFieldTags = new Set<string>();
    const fieldTagToName = new Map<string, string>();

    filteredDataSeries.forEach(series => {
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
      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full divide-y divide-border table-fixed">
          <thead className="bg-surface-secondary">
            <tr>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-content-tertiary uppercase">
                Series
              </th>
              {fieldTagsArray.map(tag => (
                <th key={tag} className="px-2 py-1.5 text-left text-xs font-medium text-content-tertiary uppercase">
                  {fieldTagToName.get(tag)}
                  <div className="text-xs text-content-muted font-mono normal-case font-normal">{tag}</div>
                </th>
              ))}
              {schemaAcquisition && (
                <th className="px-2 py-1.5 text-center text-xs font-medium text-content-tertiary uppercase w-24">
                  Status
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-surface-primary divide-y divide-border">
            {filteredDataSeries.map((series, idx) => {
              // Find validation results for this series (use original index for matching)
              const originalIdx = dataSeries.indexOf(series);
              const seriesResults = results.filter(r => {
                if (r.validationType !== 'series') return false;
                // Match by series name or index (use original index)
                const resultIndex = parseInt(r.seriesName?.match(/\d+$/)?.[0] || '0') - 1;
                return resultIndex === originalIdx || r.seriesName === series.name;
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
              let rowBgClass = idx % 2 === 0 ? 'bg-surface-primary' : 'bg-surface-alt';
              if (schemaAcquisition && overallStatus !== 'unknown') {
                if (overallStatus === 'pass') rowBgClass = 'bg-green-500/10 dark:bg-green-500/20';
                else if (overallStatus === 'fail') rowBgClass = 'bg-red-500/10 dark:bg-red-500/20';
                else if (overallStatus === 'warning') rowBgClass = 'bg-yellow-500/10 dark:bg-yellow-500/20';
              }

              const statusMessage = seriesResults.length > 0
                ? seriesResults.map(r => r.message).join('; ')
                : 'Series not directly checked by schema';

              return (
                <tr key={idx} className={rowBgClass}>
                  <td className="px-2 py-1.5 text-xs font-medium text-content-primary">
                    {series.name || `Series ${idx + 1}`}
                  </td>
                  {fieldTagsArray.map(tag => {
                    let fieldValue = '—';

                    if (typeof series.fields === 'object' && !Array.isArray(series.fields)) {
                      // Object format
                      const fieldData = series.fields[tag];
                      if (fieldData && fieldData.value !== undefined) {
                        fieldValue = formatSeriesFieldValue(fieldData.value, fieldData.validationRule);
                      }
                    } else if (Array.isArray(series.fields)) {
                      // Array format
                      const field = series.fields.find((f: any) => f.tag === tag);
                      if (field && field.value !== undefined) {
                        fieldValue = formatSeriesFieldValue(field.value, field.validationRule);
                      }
                    }

                    return (
                      <td key={tag} className="px-2 py-1.5">
                        <p className="text-xs text-content-primary">{fieldValue}</p>
                      </td>
                    );
                  })}
                  {schemaAcquisition && (
                    <td className="px-2 py-1.5 text-center">
                      {isValidating ? (
                        <Loader className="h-4 w-4 animate-spin mx-auto text-content-tertiary" />
                      ) : (
                        renderStatusWithMessage(overallStatus, statusMessage)
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

    // Get unique fields (name + tag) across all series
    const allFields = new Map<string, { name: string; tag: string }>();
    schemaSeries.forEach(series => {
      if (Array.isArray(series.fields)) {
        series.fields.forEach((f: any) => {
          const name = f.name || f.field;
          if (!allFields.has(name)) {
            allFields.set(name, { name, tag: f.tag || '' });
          }
        });
      }
    });
    const fieldsArray = Array.from(allFields.values());

    return (
      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full divide-y divide-border table-fixed">
          <thead className="bg-surface-secondary">
            <tr>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-content-tertiary uppercase">
                Expected Series
              </th>
              {fieldsArray.map(field => (
                <th key={field.name} className="px-2 py-1.5 text-left text-xs font-medium text-content-tertiary uppercase">
                  <div>
                    <p className="font-medium">{field.name}</p>
                    {field.tag && <p className="text-xs font-normal text-content-muted font-mono">{field.tag}</p>}
                  </div>
                </th>
              ))}
              <th className="px-2 py-1.5 text-center text-xs font-medium text-content-tertiary uppercase w-24">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-surface-primary divide-y divide-border">
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
              let rowBgClass = 'bg-surface-primary';
              if (overallStatus === 'pass') rowBgClass = 'bg-green-500/10 dark:bg-green-500/20';
              else if (overallStatus === 'fail') rowBgClass = 'bg-red-500/10 dark:bg-red-500/20';
              else if (overallStatus === 'warning') rowBgClass = 'bg-yellow-500/10 dark:bg-yellow-500/20';

              const statusMessage = seriesResults.length > 0
                ? seriesResults.map(r => r.message).join('; ')
                : `Required series "${series.name}" not found in data`;

              return (
                <tr key={idx} className={rowBgClass}>
                  <td className="px-2 py-1.5 text-xs font-medium text-content-primary">
                    {series.name}
                  </td>
                  {fieldsArray.map(headerField => {
                    // Get the expected value from schema series
                    let fieldValue = '—';
                    let fieldTypeInfo = '';
                    if (Array.isArray(series.fields)) {
                      const field = series.fields.find((f: any) =>
                        (f.name || f.field) === headerField.name
                      );
                      if (field) {
                        // Build validationRule from raw schema properties if not present
                        const validationRule = buildValidationRuleFromField(field);
                        fieldValue = formatSeriesFieldValue(field.value, validationRule);
                        // Show data type and constraint info (same as Schema Builder)
                        const dataType = inferDataTypeFromValue(field.value);
                        fieldTypeInfo = formatFieldTypeInfo(dataType, validationRule);
                      }
                    }

                    return (
                      <td key={headerField.name} className="px-2 py-1.5">
                        <p className="text-xs text-content-primary">{fieldValue}</p>
                        {fieldTypeInfo && (
                          <p className="text-xs text-content-tertiary">{fieldTypeInfo}</p>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-center">
                    {isValidating ? (
                      <Loader className="h-4 w-4 animate-spin mx-auto text-content-tertiary" />
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
        <div className="border border-red-500/30 dark:border-red-500/50 rounded-md overflow-hidden">
          <table className="w-full divide-y divide-border table-fixed">
            <thead className="bg-red-500/10 dark:bg-red-500/20">
              <tr>
                <th className="px-2 py-1.5 text-left text-xs font-medium text-content-tertiary uppercase">
                  Missing Series
                </th>
                {fieldTagsArray.map(tag => {
                  const field = missingSeries.flatMap(s => s.fields || []).find((f: any) => f.tag === tag);
                  return (
                    <th key={tag} className="px-2 py-1.5 text-left text-xs font-medium text-content-tertiary uppercase">
                      {field?.name || tag}
                    </th>
                  );
                })}
                <th className="px-2 py-1.5 text-center text-xs font-medium text-content-tertiary uppercase w-24">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-surface-primary divide-y divide-border">
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
                  <tr key={idx} className="bg-red-500/10 dark:bg-red-500/20">
                    <td className="px-2 py-1.5 text-xs font-medium text-content-primary">
                      {series.name || `Series ${idx + 1}`}
                    </td>
                    {fieldTagsArray.map(tag => {
                      const schemaField = Array.isArray(series.fields)
                        ? series.fields.find((f: any) => f.tag === tag)
                        : null;

                      return (
                        <td key={tag} className="px-2 py-1.5">
                          {schemaField ? (
                            <div>
                              <p className="text-xs text-content-primary">{formatSeriesFieldValue(schemaField.value, schemaField.validationRule)}</p>
                              <p className="text-xs text-content-tertiary mt-0.5">
                                {formatFieldTypeInfo(
                                  inferDataTypeFromValue(schemaField.value),
                                  schemaField.validationRule
                                )}
                              </p>
                            </div>
                          ) : (
                            <span className="text-content-muted italic">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-center">
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
