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
      (typeof value === 'object' && value?.dataType ? value.dataType : (field.dataType || 'string')) :
      (field.dataType || 'string') as FieldDataType,
    value: isSeriesValue ? 
      (typeof value === 'object' && value?.value !== undefined ? value.value : (value || '')) : 
      field.value,
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
        case 'custom':
          if (!formData.validationRule.customLogic?.trim()) {
            newErrors.constraint = 'Custom logic is required for custom constraint';
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
    setFormData(prev => ({
      ...prev,
      validationRule: {
        type: newConstraint,
        // Reset constraint-specific values and clear any previous constraint values
        ...(newConstraint === 'tolerance' && { value: 0, tolerance: 0 }),
        ...(newConstraint === 'range' && { min: 0, max: 100 }),
        ...(newConstraint === 'contains' && { contains: '' }),
        ...(newConstraint === 'custom' && { customLogic: '' }),
        // For exact constraint, no additional fields needed
      },
    }));
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
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {isSeriesValue ? `Edit Series Value: ${field.name}` : `Edit Field: ${field.name}`}
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Field Name (read-only) */}
          {!isSeriesValue && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Field Name
              </label>
              <input
                type="text"
                value={formData.name}
                readOnly
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
              />
            </div>
          )}

          {/* Field Tag (read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              DICOM Tag
            </label>
            <input
              type="text"
              value={field.tag}
              readOnly
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
            />
          </div>

          {/* Data Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Data Type
            </label>
            <DataTypeSelector
              value={formData.dataType}
              onChange={handleDataTypeChange}
              hideLabel={true}
            />
          </div>

          {/* Validation Constraint - Show first to prevent jumping */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Validation Constraint
            </label>
            <ValidationConstraintSelector
              value={formData.validationRule.type}
              onChange={handleConstraintChange}
              dataType={formData.dataType}
              hideLabel={true}
            />
          </div>

          {/* Field Value - Only show when constraint is 'exact' */}
          {formData.validationRule.type === 'exact' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Value
              </label>
              <TypeSpecificInputs
                dataType={formData.dataType}
                value={formData.value}
                onChange={(newValue) => setFormData(prev => ({ ...prev, value: newValue }))}
                error={errors.value}
              />
              {errors.value && <p className="text-red-500 text-sm mt-1">{errors.value}</p>}
            </div>
          )}

          {/* Constraint-specific parameters (for non-exact constraints) */}
          {formData.validationRule.type !== 'exact' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Constraint Parameters
              </label>
              <ConstraintInputWidgets
                constraint={formData.validationRule.type}
                value={formData.validationRule}
                onChange={handleConstraintValueChange}
              />
              {errors.constraint && <p className="text-red-500 text-sm mt-1">{errors.constraint}</p>}
            </div>
          )}

          {/* Preview */}
          <div className="bg-gray-50 p-4 rounded-md">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Preview</h4>
            <div className="text-sm text-gray-600">
              <p><strong>Field:</strong> {formData.name} ({field.tag})</p>
              <p><strong>Type:</strong> {formData.dataType}</p>
              
              {/* Show value based on constraint type */}
              <p><strong>Value:</strong> {
                formData.validationRule.type === 'exact' ? 
                  (Array.isArray(formData.value) ? formData.value.join(', ') : String(formData.value)) :
                formData.validationRule.type === 'tolerance' ? 
                  `${formData.validationRule.value || 0} ±${formData.validationRule.tolerance || 0}` :
                formData.validationRule.type === 'range' ? 
                  `${formData.validationRule.min ?? '-∞'} to ${formData.validationRule.max ?? '∞'}` :
                formData.validationRule.type === 'contains' ? 
                  `contains "${formData.validationRule.contains || ''}"` :
                formData.validationRule.type === 'custom' ? 
                  'Custom validation logic' :
                  'Not specified'
              }</p>
              
              {!isSeriesValue && (
                <p><strong>Constraint:</strong> {formData.validationRule.type}</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="inline-flex items-center px-4 py-2 bg-medical-600 text-white rounded-md hover:bg-medical-700 transition-colors"
          >
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default FieldEditModal;