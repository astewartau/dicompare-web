import React, { useState } from 'react';
import { Edit2, Trash2, ChevronDown, ChevronUp, Code } from 'lucide-react';
import { Acquisition, DicomField, SelectedValidationFunction } from '../../types';
import FieldTable from './FieldTable';
import SeriesTable from './SeriesTable';
import DicomFieldSelector from '../common/DicomFieldSelector';
import ValidationFunctionLibraryModal from '../validation/ValidationFunctionLibraryModal';
import ValidationFunctionEditorModal from '../validation/ValidationFunctionEditorModal';
import { ValidationFunction } from '../validation/ValidationFunctionLibraryModal';

interface AcquisitionTableProps {
  acquisition: Acquisition;
  isEditMode: boolean;
  incompleteFields?: Set<string>;
  onUpdate: (field: keyof Acquisition, value: any) => void;
  onDelete: () => void;
  onFieldUpdate: (fieldTag: string, updates: Partial<DicomField>) => void;
  onFieldConvert: (fieldTag: string, toLevel: 'acquisition' | 'series') => void;
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
  const [isExpanded, setIsExpanded] = useState(true);
  const [showValidationLibrary, setShowValidationLibrary] = useState(false);
  const [showValidationEditor, setShowValidationEditor] = useState(false);
  const [editingValidationIndex, setEditingValidationIndex] = useState<number | null>(null);

  const hasSeriesFields = acquisition.seriesFields && acquisition.seriesFields.length > 0;
  const validationFunctions = acquisition.validationFunctions || [];

  // Validation function handlers
  const handleValidationFunctionSelect = (func: ValidationFunction) => {
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
    if (onValidationFunctionDelete) {
      onValidationFunctionDelete(index);
    }
  };

  const handleCreateNewValidationFunction = () => {
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

  return (
    <div className="border border-gray-300 rounded-lg bg-white shadow-sm h-fit">
      {/* Compact Header Bar */}
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            {isEditMode ? (
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
                <h3 className="text-sm font-semibold text-gray-900 truncate">{acquisition.protocolName}</h3>
                <p className="text-xs text-gray-600 truncate">{acquisition.seriesDescription}</p>
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
            {isEditMode && (
              <button
                onClick={onDelete}
                className="p-1 text-gray-600 hover:text-red-600 transition-colors"
                title="Delete acquisition"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
            
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 text-gray-600 hover:text-gray-800 transition-colors"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>
        </div>
        
        {/* Compact stats row */}
        {acquisition.totalFiles > 0 && (
          <div className="mt-1 text-xs text-gray-500">
            {acquisition.totalFiles} files • {acquisition.acquisitionFields.length} fields
            {hasSeriesFields && ` • ${acquisition.seriesFields.length} varying`}
          </div>
        )}
      </div>

      {/* Compact Body Content */}
      {isExpanded && (
        <div className="p-3 space-y-3">
          {/* Validation Functions */}
          {isEditMode && (
            <div>
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
              
              {/* Validation Functions Table */}
              {validationFunctions.length > 0 && (
                <div className="mb-3">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Validator Rules</h4>
                  <div className="border border-gray-200 rounded-md overflow-hidden">
                    <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
                      <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-700">
                        <div className="col-span-4">Name</div>
                        <div className="col-span-6">Description</div>
                        <div className="col-span-2 text-right">Actions</div>
                      </div>
                    </div>
                    <div className="divide-y divide-gray-200">
                      {validationFunctions.map((func, index) => (
                        <div key={`${func.id}-${index}`} className="px-3 py-2 hover:bg-gray-50">
                          <div className="grid grid-cols-12 gap-2 items-center">
                            <div className="col-span-4">
                              <div className="text-sm font-medium text-gray-900">{func.customName || func.name}</div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {(func.customFields || func.fields).map(field => (
                                  <span key={field} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                                    {field}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="col-span-6">
                              <div className="text-sm text-gray-600">{func.customDescription || func.description}</div>
                            </div>
                            <div className="col-span-2 text-right">
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
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Acquisition-Level Fields */}
          <div>
            
            <FieldTable
              fields={acquisition.acquisitionFields}
              isEditMode={isEditMode}
              incompleteFields={incompleteFields}
              acquisitionId={acquisition.id}
              onFieldUpdate={onFieldUpdate}
              onFieldConvert={(fieldTag) => onFieldConvert(fieldTag, 'series')}
              onFieldDelete={onFieldDelete}
            />
          </div>

          {/* Series-Level Fields */}
          {hasSeriesFields && (
            <div>
              <SeriesTable
                seriesFields={acquisition.seriesFields}
                series={acquisition.series || []}
                isEditMode={isEditMode}
                incompleteFields={incompleteFields}
                acquisitionId={acquisition.id}
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
      
      {/* Validation Function Library Modal */}
      <ValidationFunctionLibraryModal
        isOpen={showValidationLibrary}
        onClose={() => setShowValidationLibrary(false)}
        onSelectFunction={handleValidationFunctionSelect}
        onCreateNewFunction={handleCreateNewValidationFunction}
      />
      
      {/* Validation Function Editor Modal */}
      <ValidationFunctionEditorModal
        isOpen={showValidationEditor}
        func={editingValidationIndex !== null ? validationFunctions[editingValidationIndex] : null}
        onClose={() => {
          setShowValidationEditor(false);
          setEditingValidationIndex(null);
        }}
        onSave={handleValidationFunctionSave}
      />
    </div>
  );
};

export default AcquisitionTable;