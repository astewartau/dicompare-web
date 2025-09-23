import React, { useState, useEffect } from 'react';
import { Edit2, Trash2, ChevronDown, ChevronUp, Code, X, CheckCircle, XCircle, AlertTriangle, HelpCircle, Loader } from 'lucide-react';
import { Acquisition, DicomField, SelectedValidationFunction } from '../../types';
import { ComplianceFieldResult } from '../../types/schema';
import { dicompareAPI } from '../../services/DicompareAPI';
import FieldTable from './FieldTable';
import SeriesTable from './SeriesTable';
import DicomFieldSelector from '../common/DicomFieldSelector';
import ValidationFunctionLibraryModal from '../validation/ValidationFunctionLibraryModal';
import ValidationFunctionEditorModal from '../validation/ValidationFunctionEditorModal';
import FieldConversionModal from './FieldConversionModal';
import CustomTooltip from '../common/CustomTooltip';
import { ValidationFunction } from '../validation/ValidationFunctionLibraryModal';

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

  const isComplianceMode = mode === 'compliance';
  const isSchemaMode = isComplianceMode || Boolean(schemaId);
  const hasSeriesFields = acquisition.seriesFields && acquisition.seriesFields.length > 0;
  const validationFunctions = acquisition.validationFunctions || [];
  console.log('AcquisitionTable validation functions:', validationFunctions.length, 'functions');

  // Update expanded state when isCollapsed prop changes
  useEffect(() => {
    setIsExpanded(!isCollapsed);
  }, [isCollapsed]);

  // Validation rule compliance effect
  useEffect(() => {
    if (isComplianceMode && schemaId && realAcquisition && getSchemaContent && validationFunctions.length > 0) {
      performValidationRuleCompliance();
    }
  }, [isComplianceMode, schemaId, realAcquisition, schemaAcquisitionId, validationFunctions.length]);

  const performValidationRuleCompliance = async () => {
    if (!schemaId || !realAcquisition || !getSchemaContent || validationFunctions.length === 0) return;

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

      // Store all results for sharing between field and series tables
      setAllComplianceResults(validationResults);

      // Filter results to only include validation rule results
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
    <div className="border border-gray-300 rounded-lg bg-white shadow-sm h-fit">
      {/* Compact Header Bar */}
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            {isEditMode && !isSchemaMode ? (
              <div className="space-y-1">
                <input
                  type="text"
                  value={acquisition.protocolName}
                  onChange={(e) => onUpdate('protocolName', e.target.value)}
                  className="text-sm font-semibold text-gray-900 bg-white border border-gray-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-medical-500"
                  placeholder="Acquisition Name"
                />
                <input
                  type="text"
                  value={acquisition.seriesDescription}
                  onChange={(e) => onUpdate('seriesDescription', e.target.value)}
                  className="text-xs text-gray-600 bg-white border border-gray-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-medical-500"
                  placeholder="Description"
                />
              </div>
            ) : (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 truncate">
                  {title || acquisition.protocolName}
                </h3>
                <p className="text-xs text-gray-600 truncate">
                  {subtitle || (isSchemaMode ? 'Schema Requirements' : acquisition.seriesDescription)}
                </p>
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
            {onDeselect && (
              <button
                onClick={onDeselect}
                className="p-1 text-gray-600 hover:text-red-600 transition-colors"
                title="Deselect schema"
              >
                <X className="h-3 w-3" />
              </button>
            )}
            {isEditMode && !isSchemaMode && (
              <button
                onClick={onDelete}
                className="p-1 text-gray-600 hover:text-red-600 transition-colors"
                title="Delete acquisition"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}

            <button
              onClick={onToggleCollapse ? onToggleCollapse : () => setIsExpanded(!isExpanded)}
              className="p-1 text-gray-600 hover:text-gray-800 transition-colors"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>
        </div>
        
        {/* Schema info or stats row */}
        <div className="mt-1 text-xs text-gray-500">
          {isSchemaMode ? (
            <>
              v{version || '1.0.0'} • {authors?.join(', ') || 'Schema Template'}
              {schemaAcquisitionId && (
                <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                  Acquisition {schemaAcquisitionId}
                </span>
              )}
            </>
          ) : acquisition.totalFiles > 0 ? (
            <>
              {acquisition.totalFiles} files • {acquisition.acquisitionFields.length} fields
              {hasSeriesFields && ` • ${acquisition.seriesFields.length} varying`}
            </>
          ) : (
            <>
              {acquisition.acquisitionFields.length} fields
              {hasSeriesFields && ` • ${acquisition.seriesFields.length} varying`}
            </>
          )}
        </div>
      </div>

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
                    <div className="border border-red-200 rounded-md p-3 text-center mb-2">
                      <p className="text-red-600 text-xs">{validationRuleError}</p>
                    </div>
                  )}

                  {/* Loading state */}
                  {isComplianceMode && isValidatingRules && validationRuleResults.length === 0 && (
                    <div className="border border-gray-200 rounded-md p-3 text-center mb-2">
                      <Loader className="h-4 w-4 animate-spin mx-auto mb-2" />
                      <p className="text-gray-500 text-xs">Validating rules...</p>
                    </div>
                  )}
                  <div className="border border-gray-200 rounded-md overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">
                            Validation Rule
                          </th>
                          <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/2">
                            Description
                          </th>
                          {isComplianceMode && (
                            <th className="px-2 py-1.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                              Status
                            </th>
                          )}
                          {!isComplianceMode && (
                            <th className="px-2 py-1.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                              Actions
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {validationFunctions.map((func, index) => {
                          const ruleResult = isComplianceMode ? getValidationRuleResult(func) : null;

                          return (
                            <tr
                              key={`${func.id}-${index}`}
                              className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${
                                !isComplianceMode ? 'hover:bg-blue-50 transition-colors' : ''
                              }`}
                            >
                              <td className="px-2 py-1.5">
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-gray-900 break-words">{func.customName || func.name}</p>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {(func.customFields || func.fields).map(field => (
                                      <span key={field} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                                        {field}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </td>
                              <td className="px-2 py-1.5">
                                <p className="text-xs text-gray-900 break-words">{func.customDescription || func.description}</p>
                              </td>
                              {isComplianceMode && ruleResult && (
                                <td className="px-2 py-1.5 text-center">
                                  {isValidatingRules ? (
                                    <Loader className="h-4 w-4 animate-spin mx-auto text-gray-500" />
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
                                      className="p-1 text-gray-400 hover:text-blue-600"
                                      title="Edit function"
                                    >
                                      <Edit2 className="h-3 w-3" />
                                    </button>
                                    <button
                                      onClick={() => handleValidationFunctionDelete(index)}
                                      className="p-1 text-gray-400 hover:text-red-600"
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

                  {/* Validation Rules Compliance Status Summary */}
                  {isComplianceMode && validationRuleResults.length > 0 && (
                    <div className="mt-2 text-xs text-gray-600">
                      <span className="text-green-600">{validationRuleResults.filter(r => r.status === 'pass').length} passed</span>
                      {validationRuleResults.filter(r => r.status === 'fail').length > 0 && (
                        <span className="ml-2 text-red-600">{validationRuleResults.filter(r => r.status === 'fail').length} failed</span>
                      )}
                      {validationRuleResults.filter(r => r.status === 'warning').length > 0 && (
                        <span className="ml-2 text-yellow-600">{validationRuleResults.filter(r => r.status === 'warning').length} warnings</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Acquisition-Level Fields */}
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
              onComplianceResults={(results) => {
                console.log('📋 Received compliance results from FieldTable:', results.length);
                setAllComplianceResults(results);
              }}
              onFieldUpdate={onFieldUpdate}
              onFieldConvert={(fieldTag) => handleFieldConvert(fieldTag, 'series')}
              onFieldDelete={onFieldDelete}
            />
          </div>

          {/* Series-Level Fields */}
          {hasSeriesFields && (
            <div>
              <SeriesTable
                seriesFields={acquisition.seriesFields}
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
        </>
      )}
    </div>
  );
};

export default AcquisitionTable;