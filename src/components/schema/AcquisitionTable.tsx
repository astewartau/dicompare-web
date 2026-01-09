import React, { useState, useEffect } from 'react';
import { Edit2, Trash2, ChevronDown, ChevronUp, Code, X, CheckCircle, XCircle, AlertTriangle, HelpCircle, Loader, FileDown, FileText } from 'lucide-react';
import { Acquisition, DicomField, SelectedValidationFunction } from '../../types';
import { ComplianceFieldResult } from '../../types/schema';
import { dicompareAPI } from '../../services/DicompareAPI';
import FieldTable from './FieldTable';
import SeriesTable from './SeriesTable';
import DicomFieldSelector from '../common/DicomFieldSelector';
import InlineTagInput from '../common/InlineTagInput';
import { useTagSuggestions } from '../../hooks/useTagSuggestions';
import ValidationFunctionLibraryModal from '../validation/ValidationFunctionLibraryModal';
import ValidationFunctionEditorModal from '../validation/ValidationFunctionEditorModal';
import FieldConversionModal from './FieldConversionModal';
import DetailedDescriptionModal from './DetailedDescriptionModal';
import CustomTooltip from '../common/CustomTooltip';
import { ValidationFunction } from '../validation/ValidationFunctionLibraryModal';
import TestDicomGeneratorModal from './TestDicomGeneratorModal';

interface AcquisitionTableProps {
  acquisition: Acquisition;
  isEditMode: boolean;
  incompleteFields?: Set<string>;
  mode?: 'edit' | 'view' | 'compliance';
  realAcquisition?: Acquisition; // The actual DICOM data for compliance validation
  isDataProcessing?: boolean; // Prevent validation during DICOM upload
  // Schema/compliance specific props
  schemaId?: string;
  schemaAcquisitionId?: string;
  getSchemaContent?: (id: string) => Promise<string | null>;
  title?: string;
  subtitle?: string;
  version?: string;
  authors?: string[];
  hideHeader?: boolean; // Hide the header section (title, version, authors)
  // Collapse/deselect handlers
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onDeselect?: () => void;
  // Edit mode handlers
  onUpdate: (field: keyof Acquisition, value: any) => void;
  onDelete: () => void;
  onFieldUpdate: (fieldTag: string, updates: Partial<DicomField>) => void;
  onFieldConvert: (fieldTag: string, toLevel: 'acquisition' | 'series', mode?: 'separate-series' | 'single-series') => void;
  onFieldDelete: (fieldTag: string) => void;
  onFieldAdd: (fields: string[]) => void;
  onSeriesUpdate: (seriesIndex: number, fieldTag: string, value: any) => void;
  onSeriesAdd: () => void;
  onSeriesDelete: (seriesIndex: number) => void;
  onSeriesNameUpdate: (seriesIndex: number, name: string) => void;
  // New validation function handlers
  onValidationFunctionAdd?: (func: SelectedValidationFunction) => void;
  onValidationFunctionUpdate?: (index: number, func: SelectedValidationFunction) => void;
  onValidationFunctionDelete?: (index: number) => void;
}

const AcquisitionTable: React.FC<AcquisitionTableProps> = ({
  acquisition,
  isEditMode,
  incompleteFields = new Set(),
  mode = 'edit',
  realAcquisition,
  isDataProcessing = false,
  schemaId,
  schemaAcquisitionId,
  getSchemaContent,
  title,
  subtitle,
  version,
  authors,
  hideHeader = false,
  isCollapsed = false,
  onToggleCollapse,
  onDeselect,
  onUpdate,
  onDelete,
  onFieldUpdate,
  onFieldConvert,
  onFieldDelete,
  onFieldAdd,
  onSeriesUpdate,
  onSeriesAdd,
  onSeriesDelete,
  onSeriesNameUpdate,
  onValidationFunctionAdd,
  onValidationFunctionUpdate,
  onValidationFunctionDelete,
}) => {
  const [isExpanded, setIsExpanded] = useState(!isCollapsed);
  const [showValidationLibrary, setShowValidationLibrary] = useState(false);
  const [showValidationEditor, setShowValidationEditor] = useState(false);
  const [editingValidationIndex, setEditingValidationIndex] = useState<number | null>(null);
  const [showConversionModal, setShowConversionModal] = useState(false);
  const [conversionField, setConversionField] = useState<DicomField | null>(null);
  const [validationRuleResults, setValidationRuleResults] = useState<ComplianceFieldResult[]>([]);
  const [isValidatingRules, setIsValidatingRules] = useState(false);
  const [validationRuleError, setValidationRuleError] = useState<string | null>(null);
  const [allComplianceResults, setAllComplianceResults] = useState<ComplianceFieldResult[]>([]);
  const [isComplianceSummaryExpanded, setIsComplianceSummaryExpanded] = useState(false);
  const [isErrorsExpanded, setIsErrorsExpanded] = useState(true);
  const [isWarningsExpanded, setIsWarningsExpanded] = useState(true);
  const [isNaExpanded, setIsNaExpanded] = useState(true);
  const [isPassedExpanded, setIsPassedExpanded] = useState(false);
  const [showTestDicomGenerator, setShowTestDicomGenerator] = useState(false);
  const [showDetailedDescription, setShowDetailedDescription] = useState(false);
  const { allTags } = useTagSuggestions();

  const isComplianceMode = mode === 'compliance';
  const isSchemaMode = isComplianceMode || Boolean(schemaId);
  const hasSeriesFields = acquisition.series && acquisition.series.length > 0 &&
    acquisition.series.some(s => {
      if (!s.fields) return false;
      // Handle both array format (from DICOM) and object format (from .pro files)
      if (Array.isArray(s.fields)) {
        return s.fields.length > 0;
      } else {
        return Object.keys(s.fields).length > 0;
      }
    });

  const validationFunctions = acquisition.validationFunctions || [];

  // Update expanded state when isCollapsed prop changes
  useEffect(() => {
    setIsExpanded(!isCollapsed);
  }, [isCollapsed]);

  // Validation rule compliance effect
  useEffect(() => {
    if (isComplianceMode && schemaId && realAcquisition && getSchemaContent && !isDataProcessing) {
      performValidationRuleCompliance();
    }
  }, [isComplianceMode, schemaId, realAcquisition, schemaAcquisitionId, validationFunctions.length, isDataProcessing]);

  const performValidationRuleCompliance = async () => {
    if (!schemaId || !realAcquisition || !getSchemaContent) return;

    setIsValidatingRules(true);
    setValidationRuleError(null);

    try {
      // For validation rules, we need to validate the actual functions against the real data
      const validationResults = await dicompareAPI.validateAcquisitionAgainstSchema(
        realAcquisition,
        schemaId,
        getSchemaContent,
        schemaAcquisitionId
      );

      // Store ALL validation results
      setAllComplianceResults(validationResults);

      // Filter to get validation rule results only
      const ruleResults = validationResults.filter(result =>
        result.validationType === 'validation_rule' ||
        validationFunctions.some(func =>
          result.rule_name === (func.customName || func.name) ||
          result.fieldName === (func.customName || func.name)
        )
      );

      setValidationRuleResults(ruleResults);
    } catch (err) {
      console.error('Validation rule compliance error:', err);
      setValidationRuleError(`Rule validation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setValidationRuleResults([]);
    } finally {
      setIsValidatingRules(false);
    }
  };

  const getValidationRuleResult = (func: SelectedValidationFunction): ComplianceFieldResult => {
    const result = validationRuleResults.find(r =>
      r.rule_name === (func.customName || func.name) ||
      r.fieldName === (func.customName || func.name)
    );
    return result || {
      fieldPath: func.id,
      fieldName: func.customName || func.name,
      status: 'unknown',
      message: 'No validation result available',
      actualValue: '',
      expectedValue: '',
      validationType: 'validation_rule',
      seriesName: undefined,
      rule_name: func.customName || func.name
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
      case 'na':
        return <HelpCircle {...iconProps} className="h-4 w-4 text-gray-500" />;
      case 'unknown':
        return <HelpCircle {...iconProps} className="h-4 w-4 text-gray-400" />;
    }
  };

  // Validation function handlers
  const handleValidationFunctionSelect = (func: ValidationFunction) => {
    if (isComplianceMode) return; // No validation function editing in compliance mode

    const selectedFunc: SelectedValidationFunction = {
      ...func,
      customName: func.name,
      customDescription: func.description,
      customFields: [...func.fields],
      customImplementation: func.implementation,
      customTestCases: func.testCases || [],
      enabledSystemFields: func.requiredSystemFields || []
    };

    if (onValidationFunctionAdd) {
      onValidationFunctionAdd(selectedFunc);
    }
    setShowValidationLibrary(false);
  };

  const handleValidationFunctionEdit = (index: number) => {
    if (isComplianceMode) return;
    setEditingValidationIndex(index);
    setShowValidationEditor(true);
  };

  const handleValidationFunctionSave = (func: SelectedValidationFunction) => {
    if (editingValidationIndex !== null && onValidationFunctionUpdate) {
      onValidationFunctionUpdate(editingValidationIndex, func);
    }
    setShowValidationEditor(false);
    setEditingValidationIndex(null);
  };

  const handleValidationFunctionDelete = (index: number) => {
    if (isComplianceMode) return;
    if (onValidationFunctionDelete) {
      onValidationFunctionDelete(index);
    }
  };

  const handleCreateNewValidationFunction = () => {
    if (isComplianceMode) return;

    const newFunction: SelectedValidationFunction = {
      id: `custom_${Date.now()}`,
      name: 'New Validation Function',
      description: 'Custom validation function',
      category: 'Custom',
      fields: ['FieldName'],
      implementation: `# Custom validation logic\n# Access field data with value["FieldName"]\n# Raise ValidationError for failures\n# Function should not return anything`,
      customName: 'New Validation Function',
      customDescription: 'Custom validation function',
      customFields: ['FieldName'],
      customImplementation: `# Custom validation logic\n# Access field data with value["FieldName"]\n# Raise ValidationError for failures\n# Function should not return anything`,
      customTestCases: [],
      enabledSystemFields: []
    };

    if (onValidationFunctionAdd) {
      onValidationFunctionAdd(newFunction);
    }
    setShowValidationLibrary(false);

    // Open the editor for the newly created function
    setTimeout(() => {
      setEditingValidationIndex(validationFunctions.length);
      setShowValidationEditor(true);
    }, 100);
  };

  // Enhanced field conversion handler
  const handleFieldConvert = (fieldTag: string, toLevel: 'acquisition' | 'series') => {
    if (isComplianceMode) return; // No field conversion in compliance mode

    if (toLevel === 'series') {
      // Find the field being converted
      const field = acquisition.acquisitionFields.find(f => f.tag === fieldTag);
      if (field && Array.isArray(field.value)) {
        // Field has list value - show conversion modal
        setConversionField(field);
        setShowConversionModal(true);
        return;
      }
    }

    // For non-list fields or converting to acquisition, use existing logic
    onFieldConvert(fieldTag, toLevel);
  };

  const handleConversionChoice = (mode: 'separate-series' | 'single-series') => {
    if (!conversionField) return;
    
    // Pass the mode to the parent component - we'll need to update the interface
    onFieldConvert(conversionField.tag, 'series', mode);
  };

  return (
    <div className={hideHeader ? 'bg-surface-primary h-fit' : 'border border-border-secondary rounded-lg bg-surface-primary shadow-sm h-fit'}>
      {/* Compact Header Bar */}
      {!hideHeader && (
      <div className="px-3 py-2 bg-surface-secondary border-b border-border rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            {isEditMode && !isSchemaMode ? (
              <div className="space-y-1">
                <input
                  type="text"
                  value={acquisition.protocolName}
                  onChange={(e) => onUpdate('protocolName', e.target.value)}
                  className="text-sm font-semibold text-content-primary bg-surface-primary border border-border-secondary rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Acquisition Name"
                />
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={acquisition.seriesDescription}
                    onChange={(e) => onUpdate('seriesDescription', e.target.value)}
                    className="text-xs text-content-secondary bg-surface-primary border border-border-secondary rounded px-2 py-1 flex-1 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="Short description"
                  />
                  <button
                    onClick={() => setShowDetailedDescription(true)}
                    className={`flex items-center px-2 py-1 text-xs rounded border transition-colors flex-shrink-0 ${
                      acquisition.detailedDescription
                        ? 'text-brand-700 border-brand-500/30 bg-brand-50 hover:bg-brand-100'
                        : 'text-content-tertiary border-border-secondary hover:bg-surface-secondary'
                    }`}
                    title={acquisition.detailedDescription ? 'View/Edit detailed description' : 'Add detailed description'}
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    README
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-semibold text-content-primary truncate">
                    {title || acquisition.protocolName}
                  </h3>
                  {acquisition.detailedDescription && (
                    <button
                      onClick={() => setShowDetailedDescription(true)}
                      className="flex items-center px-1.5 py-0.5 text-xs text-brand-600 hover:text-brand-700 rounded hover:bg-brand-50 transition-colors"
                      title="View detailed description"
                    >
                      <FileText className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {(subtitle || (!isSchemaMode && acquisition.seriesDescription)) && (
                  <p className="text-xs text-content-secondary truncate">
                    {subtitle || acquisition.seriesDescription}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
            {/* Generate Test DICOMs button - show in schema edit mode or schema builder */}
            {isEditMode && !isComplianceMode && (
              <button
                onClick={() => setShowTestDicomGenerator(true)}
                className="p-1 text-content-secondary hover:text-brand-600 transition-colors"
                title="Generate test DICOMs from schema"
              >
                <FileDown className="h-3 w-3" />
              </button>
            )}
            {onDeselect && (
              <button
                onClick={onDeselect}
                className="p-1 text-content-secondary hover:text-status-error transition-colors"
                title="Deselect schema"
              >
                <X className="h-3 w-3" />
              </button>
            )}
            {isEditMode && !isSchemaMode && (
              <button
                onClick={onDelete}
                className="p-1 text-content-secondary hover:text-status-error transition-colors"
                title="Delete acquisition"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}

            <button
              onClick={onToggleCollapse ? onToggleCollapse : () => setIsExpanded(!isExpanded)}
              className="p-1 text-content-secondary hover:text-content-primary transition-colors"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>
        </div>

        {/* Tags row - always visible, inline editable in edit mode */}
        {!isSchemaMode && (
          <div className="mt-2">
            <InlineTagInput
              tags={acquisition.tags || []}
              onChange={(tags) => onUpdate('tags', tags)}
              suggestions={allTags}
              placeholder="Add..."
              disabled={!isEditMode}
            />
          </div>
        )}

        {/* Schema info or stats row */}
        <div className="mt-1 text-xs text-content-tertiary">
          {isSchemaMode ? (
            <>
              v{version || '1.0.0'} • {authors?.join(', ') || 'Schema Template'}
            </>
          ) : acquisition.totalFiles > 0 ? (
            <>
              {acquisition.totalFiles} files • {acquisition.acquisitionFields.length} fields
              {hasSeriesFields && ` • ${acquisition.series?.reduce((count, s) => {
                if (Array.isArray(s.fields)) return count + s.fields.length;
                return count + (s.fields ? Object.keys(s.fields).length : 0);
              }, 0) || 0} varying`}
            </>
          ) : (
            <>
              {acquisition.acquisitionFields.length} fields
              {hasSeriesFields && ` • ${acquisition.series?.reduce((count, s) => {
                if (Array.isArray(s.fields)) return count + s.fields.length;
                return count + (s.fields ? Object.keys(s.fields).length : 0);
              }, 0) || 0} varying`}
            </>
          )}
        </div>
      </div>
      )}

      {/* Compact Body Content */}
      {isExpanded && (
        <div className="p-3 space-y-3">
          {/* Validation Functions */}
          {((isEditMode && !isComplianceMode) || (isComplianceMode && validationFunctions.length > 0)) && (
            <div>
              {isEditMode && !isComplianceMode && (
                <div className="flex items-center space-x-2 mb-2">
                  <DicomFieldSelector
                    selectedFields={[]}
                    onFieldsChange={(fields) => onFieldAdd(fields)}
                    placeholder="Add DICOM fields..."
                    className="flex-1 text-sm"
                  />
                  <button
                    onClick={() => setShowValidationLibrary(true)}
                    className="flex items-center px-3 py-2 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 flex-shrink-0"
                  >
                    <Code className="h-4 w-4 mr-1" />
                    Add Validator Function
                  </button>
                </div>
              )}

              {/* Validation Functions Table */}
              {validationFunctions.length > 0 && (
                <div className="mb-3">

                  {/* Validation error display */}
                  {isComplianceMode && validationRuleError && (
                    <div className="border border-status-error/30 rounded-md p-3 text-center mb-2">
                      <p className="text-status-error text-xs">{validationRuleError}</p>
                    </div>
                  )}

                  {/* Loading state */}
                  {isComplianceMode && isValidatingRules && validationRuleResults.length === 0 && (
                    <div className="border border-border rounded-md p-3 text-center mb-2">
                      <Loader className="h-4 w-4 animate-spin mx-auto mb-2" />
                      <p className="text-content-tertiary text-xs">Validating rules...</p>
                    </div>
                  )}
                  <div className="border border-border rounded-md overflow-hidden">
                    <table className="min-w-full divide-y divide-border">
                      <thead className="bg-surface-secondary">
                        <tr>
                          <th className="px-2 py-1.5 text-left text-xs font-medium text-content-tertiary uppercase tracking-wider w-1/3">
                            Validation Rule
                          </th>
                          <th className="px-2 py-1.5 text-left text-xs font-medium text-content-tertiary uppercase tracking-wider w-1/2">
                            Description
                          </th>
                          {isComplianceMode && (
                            <th className="px-2 py-1.5 text-center text-xs font-medium text-content-tertiary uppercase tracking-wider w-16">
                              Status
                            </th>
                          )}
                          {!isComplianceMode && (
                            <th className="px-2 py-1.5 text-right text-xs font-medium text-content-tertiary uppercase tracking-wider w-16">
                              Actions
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="bg-surface-primary divide-y divide-border">
                        {validationFunctions.map((func, index) => {
                          const ruleResult = isComplianceMode ? getValidationRuleResult(func) : null;

                          return (
                            <tr
                              key={`${func.id}-${index}`}
                              className={`${index % 2 === 0 ? 'bg-surface-primary' : 'bg-surface-alt'} ${
                                !isComplianceMode ? 'hover:bg-surface-hover transition-colors' : ''
                              }`}
                            >
                              <td className="px-2 py-1.5">
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-content-primary break-words">{func.customName || func.name}</p>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {(func.customFields || func.fields).map(field => (
                                      <span key={field} className="px-1.5 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs rounded">
                                        {field}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </td>
                              <td className="px-2 py-1.5">
                                <p className="text-xs text-content-primary break-words">{func.customDescription || func.description}</p>
                              </td>
                              {isComplianceMode && ruleResult && (
                                <td className="px-2 py-1.5 text-center">
                                  {isValidatingRules ? (
                                    <Loader className="h-4 w-4 animate-spin mx-auto text-content-tertiary" />
                                  ) : (
                                    <CustomTooltip
                                      content={ruleResult.message}
                                      position="top"
                                      delay={100}
                                    >
                                      <div className="inline-flex items-center justify-center cursor-help">
                                        {getStatusIcon(ruleResult.status)}
                                      </div>
                                    </CustomTooltip>
                                  )}
                                </td>
                              )}
                              {!isComplianceMode && (
                                <td className="px-2 py-1.5 text-right">
                                  <div className="flex items-center justify-end space-x-1">
                                    <button
                                      onClick={() => handleValidationFunctionEdit(index)}
                                      className="p-1 text-content-muted hover:text-brand-600"
                                      title="Edit function"
                                    >
                                      <Edit2 className="h-3 w-3" />
                                    </button>
                                    <button
                                      onClick={() => handleValidationFunctionDelete(index)}
                                      className="p-1 text-content-muted hover:text-status-error"
                                      title="Remove function"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                </div>
              )}
            </div>
          )}

          {/* Acquisition-Level Fields */}
          {acquisition.acquisitionFields.length > 0 && (
            <div>
              <FieldTable
                fields={acquisition.acquisitionFields}
                isEditMode={isEditMode && !isComplianceMode}
                incompleteFields={incompleteFields}
                acquisitionId={acquisition.id}
                mode={mode}
                schemaId={schemaId}
                schemaAcquisitionId={schemaAcquisitionId}
                acquisition={acquisition}
                realAcquisition={realAcquisition}
                getSchemaContent={getSchemaContent}
                isDataProcessing={isDataProcessing}
                complianceResultsProp={allComplianceResults.filter(r =>
                  r.validationType !== 'validation_rule' &&
                  r.validationType !== 'series' &&
                  acquisition.acquisitionFields.some(f => r.fieldPath === f.tag || r.fieldName === (f.keyword || f.name))
                )}
                onFieldUpdate={onFieldUpdate}
                onFieldConvert={(fieldTag) => handleFieldConvert(fieldTag, 'series')}
                onFieldDelete={onFieldDelete}
              />
            </div>
          )}

          {/* Series-Level Fields */}
          {hasSeriesFields && (
            <div>
              <SeriesTable
                series={acquisition.series || []}
                isEditMode={isEditMode && !isComplianceMode}
                incompleteFields={incompleteFields}
                acquisitionId={acquisition.id}
                mode={mode}
                complianceResults={allComplianceResults.filter(r => r.validationType === 'series')}
                onSeriesUpdate={onSeriesUpdate}
                onSeriesAdd={onSeriesAdd}
                onSeriesDelete={onSeriesDelete}
                onFieldConvert={(fieldTag) => onFieldConvert(fieldTag, 'acquisition')}
                onSeriesNameUpdate={onSeriesNameUpdate}
              />
            </div>
          )}

          {/* Compliance Summary - Only show in compliance mode */}
          {isComplianceMode && realAcquisition && (
            <div className="mt-4 border-t border-border pt-4">
              {(() => {
                // Use all compliance results directly (no combination needed)
                const allResults = allComplianceResults;

                // Count by status
                const statusCounts = {
                  pass: allResults.filter(r => r.status === 'pass').length,
                  fail: allResults.filter(r => r.status === 'fail').length,
                  warning: allResults.filter(r => r.status === 'warning').length,
                  na: allResults.filter(r => r.status === 'na').length,
                  unknown: allResults.filter(r => r.status === 'unknown').length
                };

                // Get errors, warnings, N/A, and passed for detailed list
                const errors = allResults.filter(r => r.status === 'fail');
                const warnings = allResults.filter(r => r.status === 'warning');
                const naResults = allResults.filter(r => r.status === 'na');
                const passedResults = allResults.filter(r => r.status === 'pass');

                return (
                  <>
                    {/* Summary Header with Toggle */}
                    <div
                      className="flex items-center justify-between cursor-pointer hover:bg-surface-secondary -mx-2 px-2 py-1 rounded"
                      onClick={() => setIsComplianceSummaryExpanded(!isComplianceSummaryExpanded)}
                    >
                      <div className="flex items-center space-x-2">
                        <button
                          className="p-0.5 text-content-tertiary hover:text-content-secondary"
                          aria-label={isComplianceSummaryExpanded ? "Collapse summary" : "Expand summary"}
                        >
                          {isComplianceSummaryExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                        <h4 className="text-sm font-semibold text-content-primary">Compliance Summary</h4>
                      </div>

                      {/* Always show status counts in header */}
                      <div className="flex items-center gap-2">
                        {statusCounts.fail > 0 && (
                          <div className="flex items-center space-x-1 bg-red-500/10 px-2 py-0.5 rounded-full">
                            <XCircle className="h-3 w-3 text-red-600 dark:text-red-400" />
                            <span className="text-xs font-medium text-red-700 dark:text-red-300">{statusCounts.fail}</span>
                          </div>
                        )}
                        {statusCounts.warning > 0 && (
                          <div className="flex items-center space-x-1 bg-yellow-500/10 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="h-3 w-3 text-yellow-600 dark:text-yellow-400" />
                            <span className="text-xs font-medium text-yellow-700 dark:text-yellow-300">{statusCounts.warning}</span>
                          </div>
                        )}
                        {statusCounts.pass > 0 && (
                          <div className="flex items-center space-x-1 bg-green-500/10 px-2 py-0.5 rounded-full">
                            <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
                            <span className="text-xs font-medium text-green-700 dark:text-green-300">{statusCounts.pass}</span>
                          </div>
                        )}
                        {statusCounts.na > 0 && (
                          <div className="flex items-center space-x-1 bg-surface-secondary px-2 py-0.5 rounded-full">
                            <HelpCircle className="h-3 w-3 text-content-tertiary" />
                            <span className="text-xs font-medium text-content-secondary">{statusCounts.na}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Expandable Content */}
                    {isComplianceSummaryExpanded && (
                      <div className="mt-3">
                        {/* Detailed Status Counts */}
                        <div className="flex flex-wrap gap-3 mb-4">
                          <div className="flex items-center space-x-1.5 bg-green-500/10 px-3 py-1.5 rounded-full">
                            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                            <span className="text-sm font-medium text-green-700 dark:text-green-300">{statusCounts.pass} Passed</span>
                          </div>
                          <div className="flex items-center space-x-1.5 bg-red-500/10 px-3 py-1.5 rounded-full">
                            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                            <span className="text-sm font-medium text-red-700 dark:text-red-300">{statusCounts.fail} Failed</span>
                          </div>
                          <div className="flex items-center space-x-1.5 bg-yellow-500/10 px-3 py-1.5 rounded-full">
                            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                            <span className="text-sm font-medium text-yellow-700 dark:text-yellow-300">{statusCounts.warning} Warnings</span>
                          </div>
                          <div className="flex items-center space-x-1.5 bg-surface-secondary px-3 py-1.5 rounded-full">
                            <HelpCircle className="h-4 w-4 text-content-tertiary" />
                            <span className="text-sm font-medium text-content-secondary">{statusCounts.na} N/A</span>
                          </div>
                        </div>

                        {/* Errors List */}
                        {errors.length > 0 && (
                          <div className="mb-3">
                            <div
                              className="flex items-center justify-between cursor-pointer hover:bg-red-500/10 -mx-2 px-2 py-1 rounded mb-2"
                              onClick={() => setIsErrorsExpanded(!isErrorsExpanded)}
                            >
                              <h5 className="text-xs font-semibold text-red-700 dark:text-red-400 flex items-center">
                                <button
                                  className="p-0.5 text-red-600 dark:text-red-400 hover:text-red-800 mr-1"
                                  aria-label={isErrorsExpanded ? "Collapse errors" : "Expand errors"}
                                >
                                  {isErrorsExpanded ? (
                                    <ChevronUp className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  )}
                                </button>
                                <XCircle className="h-3.5 w-3.5 mr-1" />
                                Errors ({errors.length})
                              </h5>
                            </div>
                            {isErrorsExpanded && (
                              <div className="space-y-1">
                                {errors.map((error, idx) => (
                                  <div key={idx} className="bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
                                    <div className="flex items-start">
                                      <div className="flex-1">
                                        <p className="text-xs font-medium text-red-800 dark:text-red-300">
                                          {error.rule_name || error.fieldName}
                                          {error.seriesName && (
                                            <span className="ml-2 text-red-700 dark:text-red-400">({error.seriesName})</span>
                                          )}
                                        </p>
                                        {error.rule_name && error.fieldName && (
                                          <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{error.fieldName}</p>
                                        )}
                                        <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">{error.message}</p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Warnings List */}
                        {warnings.length > 0 && (
                          <div className="mb-3">
                            <div
                              className="flex items-center justify-between cursor-pointer hover:bg-yellow-500/10 -mx-2 px-2 py-1 rounded mb-2"
                              onClick={() => setIsWarningsExpanded(!isWarningsExpanded)}
                            >
                              <h5 className="text-xs font-semibold text-yellow-700 dark:text-yellow-400 flex items-center">
                                <button
                                  className="p-0.5 text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 mr-1"
                                  aria-label={isWarningsExpanded ? "Collapse warnings" : "Expand warnings"}
                                >
                                  {isWarningsExpanded ? (
                                    <ChevronUp className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  )}
                                </button>
                                <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                                Warnings ({warnings.length})
                              </h5>
                            </div>
                            {isWarningsExpanded && (
                              <div className="space-y-1">
                                {warnings.map((warning, idx) => (
                                  <div key={idx} className="bg-yellow-500/10 border border-yellow-500/20 rounded px-3 py-2">
                                    <div className="flex items-start">
                                      <div className="flex-1">
                                        <p className="text-xs font-medium text-yellow-800 dark:text-yellow-300">
                                          {warning.rule_name || warning.fieldName}
                                          {warning.seriesName && (
                                            <span className="ml-2 text-yellow-700 dark:text-yellow-400">({warning.seriesName})</span>
                                          )}
                                        </p>
                                        {warning.rule_name && warning.fieldName && (
                                          <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-0.5">{warning.fieldName}</p>
                                        )}
                                        <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-0.5">{warning.message}</p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* N/A List */}
                        {naResults.length > 0 && (
                          <div className="mb-3">
                            <div
                              className="flex items-center justify-between cursor-pointer hover:bg-surface-secondary -mx-2 px-2 py-1 rounded mb-2"
                              onClick={() => setIsNaExpanded(!isNaExpanded)}
                            >
                              <h5 className="text-xs font-semibold text-content-secondary flex items-center">
                                <button
                                  className="p-0.5 text-content-tertiary hover:text-content-secondary mr-1"
                                  aria-label={isNaExpanded ? "Collapse N/A" : "Expand N/A"}
                                >
                                  {isNaExpanded ? (
                                    <ChevronUp className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  )}
                                </button>
                                <HelpCircle className="h-3.5 w-3.5 mr-1" />
                                N/A ({naResults.length})
                              </h5>
                            </div>
                            {isNaExpanded && (
                              <div className="space-y-1">
                                {naResults.map((naResult, idx) => (
                                  <div key={idx} className="bg-surface-secondary border border-border rounded px-3 py-2">
                                    <div className="flex items-start">
                                      <div className="flex-1">
                                        <p className="text-xs font-medium text-content-primary">
                                          {naResult.seriesName ? `Series ${naResult.seriesName}:` : (naResult.rule_name || naResult.fieldName)}
                                        </p>
                                        {naResult.rule_name && naResult.fieldName && (
                                          <p className="text-xs text-content-secondary mt-0.5">{naResult.fieldName}</p>
                                        )}
                                        <p className="text-xs text-content-secondary mt-0.5">{naResult.message}</p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Passed List */}
                        {passedResults.length > 0 && (
                          <div className="mb-3">
                            <div
                              className="flex items-center justify-between cursor-pointer hover:bg-green-500/10 -mx-2 px-2 py-1 rounded mb-2"
                              onClick={() => setIsPassedExpanded(!isPassedExpanded)}
                            >
                              <h5 className="text-xs font-semibold text-green-700 dark:text-green-400 flex items-center">
                                <button
                                  className="p-0.5 text-green-600 dark:text-green-400 hover:text-green-800 mr-1"
                                  aria-label={isPassedExpanded ? "Collapse passed" : "Expand passed"}
                                >
                                  {isPassedExpanded ? (
                                    <ChevronUp className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  )}
                                </button>
                                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                                Passed ({passedResults.length})
                              </h5>
                            </div>
                            {isPassedExpanded && (
                              <div className="space-y-1">
                                {passedResults.map((passedResult, idx) => (
                                  <div key={idx} className="bg-green-500/10 border border-green-500/20 rounded px-3 py-2">
                                    <div className="flex items-start">
                                      <div className="flex-1">
                                        <p className="text-xs font-medium text-green-800 dark:text-green-300">
                                          {passedResult.seriesName ? passedResult.seriesName : (passedResult.rule_name || passedResult.fieldName)}
                                        </p>
                                        {!passedResult.seriesName && passedResult.rule_name && passedResult.fieldName && (
                                          <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">{passedResult.fieldName}</p>
                                        )}
                                        <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">{passedResult.message}</p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Success message if all pass */}
                        {errors.length === 0 && warnings.length === 0 && naResults.length === 0 && statusCounts.pass > 0 && (
                          <div className="bg-green-500/10 border border-green-500/20 rounded px-4 py-3">
                            <div className="flex items-center">
                              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mr-2" />
                              <p className="text-sm text-green-800 dark:text-green-300 font-medium">
                                All compliance checks passed successfully!
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Edit mode modals only */}
      {isEditMode && !isComplianceMode && (
        <>
          <ValidationFunctionLibraryModal
            isOpen={showValidationLibrary}
            onClose={() => setShowValidationLibrary(false)}
            onSelectFunction={handleValidationFunctionSelect}
            onCreateNewFunction={handleCreateNewValidationFunction}
          />

          <ValidationFunctionEditorModal
            isOpen={showValidationEditor}
            func={editingValidationIndex !== null ? validationFunctions[editingValidationIndex] : null}
            onClose={() => {
              setShowValidationEditor(false);
              setEditingValidationIndex(null);
            }}
            onSave={handleValidationFunctionSave}
          />

          <FieldConversionModal
            isOpen={showConversionModal}
            fieldName={conversionField?.name || ''}
            fieldValue={conversionField?.value || []}
            onClose={() => {
              setShowConversionModal(false);
              setConversionField(null);
            }}
            onConvert={handleConversionChoice}
          />

          <TestDicomGeneratorModal
            isOpen={showTestDicomGenerator}
            onClose={() => setShowTestDicomGenerator(false)}
            acquisition={acquisition}
            schemaId={schemaId}
            getSchemaContent={getSchemaContent}
          />

        </>
      )}

      {/* Detailed Description Modal - available in all modes */}
      <DetailedDescriptionModal
        isOpen={showDetailedDescription}
        onClose={() => setShowDetailedDescription(false)}
        title={acquisition.protocolName || 'Acquisition'}
        description={acquisition.detailedDescription || ''}
        onSave={isEditMode && !isComplianceMode ? (description) => onUpdate('detailedDescription', description) : undefined}
        isReadOnly={!isEditMode || isComplianceMode}
      />
    </div>
  );
};

export default AcquisitionTable;