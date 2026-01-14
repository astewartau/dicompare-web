import React, { useState, useEffect } from 'react';
import { Edit2, Trash2, ChevronDown, ChevronUp, Code, X, CheckCircle, XCircle, AlertTriangle, HelpCircle, Loader, FileDown, FileText, Eye, EyeOff } from 'lucide-react';
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
  schemaAcquisition?: Acquisition; // For data-as-schema mode: the acquisition to use as schema (when no schemaId)
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
  schemaAcquisition,
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
  const [showTestDicomGenerator, setShowTestDicomGenerator] = useState(false);
  const [showDetailedDescription, setShowDetailedDescription] = useState(false);
  const [showRuleStatusMessages, setShowRuleStatusMessages] = useState(false);
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
  // Can validate with either schemaId (external schema) or schemaAcquisition (data-as-schema)
  const hasSchemaForValidation = schemaId || schemaAcquisition;
  useEffect(() => {
    if (isComplianceMode && hasSchemaForValidation && realAcquisition && !isDataProcessing) {
      performValidationRuleCompliance();
    }
  }, [isComplianceMode, schemaId, schemaAcquisition, realAcquisition, schemaAcquisitionId, validationFunctions.length, isDataProcessing]);

  const performValidationRuleCompliance = async () => {
    if (!realAcquisition || (!schemaId && !schemaAcquisition)) return;

    setIsValidatingRules(true);
    setValidationRuleError(null);
    // Clear old results to prevent showing stale data from previous item
    setAllComplianceResults([]);
    setValidationRuleResults([]);

    try {
      // For validation rules, we need to validate the actual functions against the real data
      let validationResults;
      if (schemaAcquisition) {
        // Data-as-schema mode: validate using the acquisition object directly
        validationResults = await dicompareAPI.validateAcquisitionAgainstAcquisition(
          realAcquisition,
          schemaAcquisition
        );
      } else if (schemaId && getSchemaContent) {
        // Normal mode: validate using schema ID
        validationResults = await dicompareAPI.validateAcquisitionAgainstSchema(
          realAcquisition,
          schemaId,
          getSchemaContent,
          schemaAcquisitionId
        );
      } else {
        throw new Error('No schema available for validation');
      }

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
          {((isEditMode && !isComplianceMode) || validationFunctions.length > 0) && (
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
                            <th className="px-2 py-1.5 text-center text-xs font-medium text-content-tertiary uppercase tracking-wider">
                              <div className="flex items-center justify-center gap-1">
                                <span>Status</span>
                                <button
                                  onClick={() => setShowRuleStatusMessages(!showRuleStatusMessages)}
                                  className="p-0.5 text-content-tertiary hover:text-brand-600 transition-colors"
                                  title={showRuleStatusMessages ? "Hide status messages" : "Show status messages"}
                                >
                                  {showRuleStatusMessages ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                </button>
                              </div>
                            </th>
                          )}
                          {isEditMode && !isComplianceMode && (
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
                                <td className="px-2 py-1.5">
                                  {isValidatingRules ? (
                                    <div className="flex justify-center">
                                      <Loader className="h-4 w-4 animate-spin text-content-tertiary" />
                                    </div>
                                  ) : (
                                    <div className={`flex items-center gap-2 ${showRuleStatusMessages ? 'justify-start' : 'justify-center'}`}>
                                      <CustomTooltip
                                        content={ruleResult.message}
                                        position="top"
                                        delay={100}
                                      >
                                        <div className="inline-flex items-center justify-center cursor-help flex-shrink-0">
                                          {getStatusIcon(ruleResult.status)}
                                        </div>
                                      </CustomTooltip>
                                      {showRuleStatusMessages && ruleResult.message && (
                                        <span className="text-xs text-content-secondary break-words">
                                          {ruleResult.message}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </td>
                              )}
                              {isEditMode && !isComplianceMode && (
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