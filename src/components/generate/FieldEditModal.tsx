import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { DicomField, FieldDataType, ValidationConstraint, ValidationRule } from '../../types';
import DataTypeSelector from '../common/DataTypeSelector';
import ValidationConstraintSelector from '../common/ValidationConstraintSelector';
import TypeSpecificInputs from '../common/TypeSpecificInputs';
import ConstraintInputWidgets from '../common/ConstraintInputWidgets';

interface FieldEditModalProps {
  field: DicomField;
  value?: any; // For series-specific value editing
  onSave: (updates: Partial<DicomField> & { value?: any }) => void;
  onClose: () => void;
  isSeriesValue?: boolean; // True when editing a series-specific value
}

const FieldEditModal: React.FC<FieldEditModalProps> = ({
  field,
  value,
  onSave,
  onClose,
  isSeriesValue = false,
}) => {
  const [formData, setFormData] = useState({
    name: field.name,
    dataType: isSeriesValue ? 
      (typeof value === 'object' && value?.dataType ? value.dataType : 
        // Auto-detect list type if value is an array and field type allows it
        (Array.isArray(value) && field.dataType?.startsWith('list_') ? field.dataType : 
          (Array.isArray(value) ? 'list_string' : (field.dataType || 'string')))) :
      (field.dataType || 'string') as FieldDataType,
    value: isSeriesValue ? 
      (typeof value === 'object' && value?.value !== undefined ? value.value : (value || '')) : 
      // For acquisition fields, check if field.values exists (varying field) and use it for list types
      (field.values && (field.dataType === 'list_string' || field.dataType === 'list_number') ? field.values : field.value),
    validationRule: isSeriesValue ?
      (typeof value === 'object' && value?.validationRule ? value.validationRule : { type: 'exact' as ValidationConstraint }) :
      (field.validationRule || { type: 'exact' as ValidationConstraint }),
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscKey);
    return () => document.removeEventListener('keydown', handleEscKey);
  }, [onClose]);

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    // Field name is read-only, so no need to validate it

    // Only validate the main value field when constraint is exact
    const shouldValidateMainValue = formData.validationRule.type === 'exact';
    
    if (shouldValidateMainValue) {
      if (formData.value === '' || formData.value === null || formData.value === undefined) {
        newErrors.value = 'Field value is required';
      }

      // Validate based on data type
      if (formData.dataType === 'number' && formData.value !== '' && isNaN(Number(formData.value))) {
        newErrors.value = 'Value must be a number';
      }

      // Validate list types
      if ((formData.dataType === 'list_string' || formData.dataType === 'list_number') && !Array.isArray(formData.value)) {
        if (formData.dataType === 'list_number' && Array.isArray(formData.value)) {
          const hasInvalidNumbers = formData.value.some(v => isNaN(Number(v)));
          if (hasInvalidNumbers) {
            newErrors.value = 'All list values must be numbers';
          }
        }
      }
    }

    // Validate constraint-specific values (for both field editing and series value editing when not exact)
    if (formData.validationRule.type !== 'exact') {
      switch (formData.validationRule.type) {
        case 'tolerance':
          if (!formData.validationRule.value && formData.validationRule.value !== 0) {
            newErrors.constraint = 'Expected value is required for tolerance constraint';
          }
          if (!formData.validationRule.tolerance && formData.validationRule.tolerance !== 0) {
            newErrors.constraint = 'Tolerance value is required';
          }
          break;
        case 'range':
          if (formData.validationRule.min === undefined && formData.validationRule.max === undefined) {
            newErrors.constraint = 'At least one of min or max value is required for range constraint';
          }
          break;
        case 'contains':
          if (!formData.validationRule.contains?.trim()) {
            newErrors.constraint = 'Substring is required for contains constraint';
          }
          break;
        case 'contains_any':
          if (!formData.validationRule.contains_any || formData.validationRule.contains_any.length === 0) {
            newErrors.constraint = 'At least one value is required for contains any constraint';
          }
          break;
        case 'contains_all':
          if (!formData.validationRule.contains_all || formData.validationRule.contains_all.length === 0) {
            newErrors.constraint = 'At least one value is required for contains all constraint';
          }
          break;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validateForm()) {
      return;
    }

    const updates: Partial<DicomField> & { value?: any } = {};

    if (isSeriesValue) {
      // For series values, save as an object with value, dataType, and validationRule
      updates.value = {
        // Only include the main value for exact constraints
        ...(formData.validationRule.type === 'exact' && { value: formData.value }),
        dataType: formData.dataType,
        validationRule: formData.validationRule,
      };
    } else {
      // For field editing, update the field definition
      // Only include the main value for exact constraints
      if (formData.validationRule.type === 'exact') {
        updates.value = formData.value;
      }
      updates.dataType = formData.dataType;
      updates.validationRule = formData.validationRule;
    }

    onSave(updates);
  };

  const handleDataTypeChange = (newDataType: FieldDataType) => {
    setFormData(prev => ({
      ...prev,
      dataType: newDataType,
      // Reset value when changing data type to avoid type mismatches
      value: newDataType === 'list_string' || newDataType === 'list_number' ? [] : '',
    }));
  };

  const handleConstraintChange = (newConstraint: ValidationConstraint) => {
    setFormData(prev => {
      // Extract current value from different constraint types to reuse intelligently
      let extractedValue: any = null;
      
      if (prev.validationRule.type === 'exact') {
        extractedValue = prev.value;
      } else if (prev.validationRule.type === 'tolerance') {
        extractedValue = prev.validationRule.value;
      } else if (prev.validationRule.type === 'range') {
        // For range, use min as the extracted value if available
        extractedValue = prev.validationRule.min;
      }
      
      // Convert extracted value to number if needed for numeric constraints
      const numericValue = extractedValue !== null && !isNaN(Number(extractedValue)) ? Number(extractedValue) : null;
      
      let newValidationRule: ValidationRule = { type: newConstraint };
      
      switch (newConstraint) {
        case 'tolerance':
          newValidationRule = {
            type: 'tolerance',
            value: numericValue !== null ? numericValue : 0,
            tolerance: 0
          };
          break;
        case 'range':
          newValidationRule = {
            type: 'range',
            min: numericValue !== null ? numericValue : 0,
            max: numericValue !== null ? numericValue + 100 : 100
          };
          break;
        case 'contains':
          newValidationRule = {
            type: 'contains',
            contains: extractedValue && typeof extractedValue === 'string' ? extractedValue : ''
          };
          break;
        case 'contains_any':
          // If extractedValue is already a comma-separated string, split it
          let containsAnyValues: any[] = [];
          if (extractedValue) {
            if (typeof extractedValue === 'string' && extractedValue.includes(',')) {
              // Split comma-separated string and trim each value
              containsAnyValues = extractedValue.split(',').map(v => v.trim()).filter(v => v !== '');
            } else if (Array.isArray(extractedValue)) {
              containsAnyValues = extractedValue;
            } else {
              containsAnyValues = [extractedValue];
            }
          }
          newValidationRule = {
            type: 'contains_any',
            contains_any: containsAnyValues
          };
          break;
        case 'contains_all':
          // If extractedValue is already a comma-separated string, split it
          let containsAllValues: any[] = [];
          if (extractedValue) {
            if (typeof extractedValue === 'string' && extractedValue.includes(',')) {
              // Split comma-separated string and trim each value
              containsAllValues = extractedValue.split(',').map(v => v.trim()).filter(v => v !== '');
            } else if (Array.isArray(extractedValue)) {
              containsAllValues = extractedValue;
            } else {
              containsAllValues = [extractedValue];
            }
          }
          newValidationRule = {
            type: 'contains_all',
            contains_all: containsAllValues
          };
          break;
        case 'exact':
          // For exact, no additional properties needed
          break;
      }
      
      return {
        ...prev,
        validationRule: newValidationRule,
      };
    });
  };

  const handleConstraintValueChange = (updates: Partial<ValidationRule>) => {
    setFormData(prev => ({
      ...prev,
      validationRule: {
        ...prev.validationRule,
        ...updates,
      },
    }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-xl w-full mx-4 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {isSeriesValue ? 'Edit Series Value' : 'Edit Field'}
            </h3>
            <p className="text-sm text-gray-600">{field.name} ({field.tag})</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Data Type and Constraint - Side by side for compactness */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data Type
              </label>
              <DataTypeSelector
                value={formData.dataType}
                onChange={handleDataTypeChange}
                hideLabel={true}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Validation
              </label>
              <ValidationConstraintSelector
                value={formData.validationRule.type}
                onChange={handleConstraintChange}
                dataType={formData.dataType}
                hideLabel={true}
              />
            </div>
          </div>

          {/* Field Value - Only show when constraint is 'exact' */}
          {formData.validationRule.type === 'exact' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Value
              </label>
              <TypeSpecificInputs
                dataType={formData.dataType}
                value={formData.value}
                onChange={(newValue) => setFormData(prev => ({ ...prev, value: newValue }))}
                error={errors.value}
              />
              {errors.value && <p className="text-red-500 text-xs mt-1">{errors.value}</p>}
            </div>
          )}

          {/* Constraint-specific parameters (for non-exact constraints) */}
          {formData.validationRule.type !== 'exact' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Parameters
              </label>
              <ConstraintInputWidgets
                constraint={formData.validationRule.type}
                value={formData.validationRule}
                onChange={handleConstraintValueChange}
              />
              {errors.constraint && <p className="text-red-500 text-xs mt-1">{errors.constraint}</p>}
            </div>
          )}

          {/* Compact Preview */}
          <div className="bg-gray-50 p-3 rounded border">
            <div className="text-xs text-gray-600 space-y-1">
              <div className="flex justify-between">
                <span className="font-medium">Type:</span>
                <span>{formData.dataType}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Value:</span>
                <span className="text-right max-w-[200px] truncate">{
                  formData.validationRule.type === 'exact' ? 
                    (Array.isArray(formData.value) ? formData.value.join(', ') : String(formData.value || '')) :
                  formData.validationRule.type === 'tolerance' ? 
                    `${formData.validationRule.value || 0} ±${formData.validationRule.tolerance || 0}` :
                  formData.validationRule.type === 'range' ? 
                    `${formData.validationRule.min ?? '-∞'} to ${formData.validationRule.max ?? '∞'}` :
                  formData.validationRule.type === 'contains' ? 
                    `contains "${formData.validationRule.contains || ''}"` :
                  formData.validationRule.type === 'contains_any' ? 
                    `contains any [${(formData.validationRule.contains_any || []).slice(0, 3).join(', ')}${(formData.validationRule.contains_any || []).length > 3 ? '...' : ''}]` :
                  formData.validationRule.type === 'contains_all' ? 
                    `contains all [${(formData.validationRule.contains_all || []).slice(0, 3).join(', ')}${(formData.validationRule.contains_all || []).length > 3 ? '...' : ''}]` :
                    'Not specified'
                }</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-2 p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="inline-flex items-center px-3 py-1.5 text-sm bg-medical-600 text-white rounded hover:bg-medical-700 transition-colors"
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default FieldEditModal;