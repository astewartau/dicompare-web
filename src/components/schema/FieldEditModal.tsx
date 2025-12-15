import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { DicomField, FieldDataType, ValidationConstraint, ValidationRule } from '../../types';
import { inferDataTypeFromValue, convertValueToDataType } from '../../utils/datatypeInference';
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
  const [formData, setFormData] = useState(() => {
    // Determine the initial value - for contains_any/contains_all, use the constraint values
    let initialValue: any;
    if (field.validationRule.type === 'contains_any' && field.validationRule.contains_any) {
      initialValue = field.validationRule.contains_any;
    } else if (field.validationRule.type === 'contains_all' && field.validationRule.contains_all) {
      initialValue = field.validationRule.contains_all;
    } else if (isSeriesValue) {
      initialValue = typeof value === 'object' && value?.value !== undefined ? value.value : (value ?? '');
    } else {
      initialValue = field.value;
    }

    return {
      name: field.name,
      dataType: isSeriesValue ?
        inferDataTypeFromValue(typeof value === 'object' && value?.value !== undefined ? value.value : value) :
        (field.dataType || inferDataTypeFromValue(field.value)) as FieldDataType,
      value: initialValue,
      validationRule: field.validationRule,
    };
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
          // Values are stored in formData.value (single source of truth)
          if (!formData.value || (Array.isArray(formData.value) && formData.value.length === 0)) {
            newErrors.constraint = 'At least one value is required for contains any constraint';
          }
          break;
        case 'contains_all':
          // Values are stored in formData.value (single source of truth)
          if (!formData.value || (Array.isArray(formData.value) && formData.value.length === 0)) {
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

    // formData.value is the single source of truth for list values
    // We need to copy it to the appropriate validation rule property for the schema

    let fieldValue = formData.value;
    let validationRule = { ...formData.validationRule };

    switch (formData.validationRule.type) {
      case 'tolerance':
        fieldValue = formData.validationRule.value;
        break;
      case 'range':
        fieldValue = formData.validationRule.min;
        break;
      case 'contains_any':
        // Copy formData.value to validationRule.contains_any
        validationRule.contains_any = Array.isArray(formData.value)
          ? formData.value
          : (formData.value ? [formData.value] : []);
        break;
      case 'contains_all':
        // Copy formData.value to validationRule.contains_all
        validationRule.contains_all = Array.isArray(formData.value)
          ? formData.value
          : (formData.value ? [formData.value] : []);
        break;
      // 'exact' and 'contains' use fieldValue directly
    }

    updates.value = fieldValue;
    updates.validationRule = validationRule;

    onSave(updates);
  };

  const handleDataTypeChange = (newDataType: FieldDataType) => {
    setFormData(prev => ({
      ...prev,
      dataType: newDataType,
      // Convert current value to the new data type
      value: convertValueToDataType(prev.value, newDataType),
    }));
  };

  const handleConstraintChange = (newConstraint: ValidationConstraint) => {
    setFormData(prev => {
      // SIMPLE APPROACH: formData.value is the single source of truth for list values
      // Just change the constraint type - don't copy/move values around

      let newValidationRule: ValidationRule = { type: newConstraint };

      // For numeric constraints, initialize with current value if numeric
      const numericValue = prev.value !== null && !isNaN(Number(prev.value)) ? Number(prev.value) : undefined;

      switch (newConstraint) {
        case 'tolerance':
          newValidationRule = {
            type: 'tolerance',
            value: numericValue,
            tolerance: prev.validationRule.tolerance // preserve if switching from tolerance
          };
          break;
        case 'range':
          newValidationRule = {
            type: 'range',
            min: prev.validationRule.min ?? numericValue,
            max: prev.validationRule.max
          };
          break;
        case 'contains':
          // For substring contains, use first element if array, or the string value
          const containsValue = Array.isArray(prev.value) ? prev.value[0] : prev.value;
          newValidationRule = {
            type: 'contains',
            contains: typeof containsValue === 'string' ? containsValue : String(containsValue || '')
          };
          break;
        case 'contains_any':
        case 'contains_all':
        case 'exact':
          // These all use formData.value as the source of truth
          // Just set the type, value stays in formData.value
          newValidationRule = { type: newConstraint };
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
      <div className="bg-surface-primary rounded-lg shadow-xl max-w-xl w-full mx-4 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h3 className="text-lg font-semibold text-content-primary">
              {isSeriesValue ? 'Edit Series Value' : 'Edit Field'}
            </h3>
            <p className="text-sm text-content-secondary">{field.name} ({field.tag})</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-content-tertiary hover:text-content-primary transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Data Type and Constraint - Side by side for compactness */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">
                Data Type
              </label>
              <DataTypeSelector
                value={formData.dataType}
                onChange={handleDataTypeChange}
                hideLabel={true}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">
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

          {/* Field Value - Show for exact, contains_any, contains_all (they all use formData.value) */}
          {['exact', 'contains_any', 'contains_all'].includes(formData.validationRule.type) && (
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">
                {formData.validationRule.type === 'exact' ? 'Value' :
                 formData.validationRule.type === 'contains_any' ? 'Values to Search For (must contain any)' :
                 'Required Elements (must contain all)'}
              </label>
              <TypeSpecificInputs
                dataType={formData.dataType}
                value={formData.value}
                onChange={(newValue) => setFormData(prev => ({ ...prev, value: newValue }))}
                error={errors.value}
                forceListInput={formData.validationRule.type === 'contains_any' || formData.validationRule.type === 'contains_all'}
              />
              {errors.value && <p className="text-red-600 dark:text-red-400 text-xs mt-1">{errors.value}</p>}
              {formData.validationRule.type !== 'exact' && (
                <p className="mt-1 text-xs text-content-tertiary">
                  {formData.validationRule.type === 'contains_any'
                    ? 'Field must contain at least one of these values'
                    : 'Field must contain all of these values'}
                </p>
              )}
            </div>
          )}

          {/* Constraint-specific parameters (for tolerance, range, contains only) */}
          {['tolerance', 'range', 'contains'].includes(formData.validationRule.type) && (
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">
                Parameters
              </label>
              <ConstraintInputWidgets
                constraint={formData.validationRule.type}
                value={formData.validationRule}
                onChange={handleConstraintValueChange}
              />
              {errors.constraint && <p className="text-red-600 dark:text-red-400 text-xs mt-1">{errors.constraint}</p>}
            </div>
          )}

          {/* Compact Preview */}
          <div className="bg-surface-secondary p-3 rounded border border-border">
            <div className="text-xs text-content-secondary space-y-1">
              <div className="flex justify-between">
                <span className="font-medium">Type:</span>
                <span>{formData.dataType}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Value:</span>
                <span className="text-right max-w-[200px] truncate">{
                  formData.validationRule.type === 'exact' ?
                    (Array.isArray(formData.value) ? `[${formData.value.join(', ')}]` : String(formData.value ?? '')) :
                  formData.validationRule.type === 'tolerance' ?
                    (formData.validationRule.value !== undefined && formData.validationRule.value !== null
                      ? `${formData.validationRule.value} ±${formData.validationRule.tolerance ?? 0}`
                      : 'Not set') :
                  formData.validationRule.type === 'range' ?
                    (formData.validationRule.min !== undefined || formData.validationRule.max !== undefined
                      ? `${formData.validationRule.min ?? '-∞'} to ${formData.validationRule.max ?? '∞'}`
                      : 'Not set') :
                  formData.validationRule.type === 'contains' ?
                    (formData.validationRule.contains ? `contains "${formData.validationRule.contains}"` : 'Not set') :
                  formData.validationRule.type === 'contains_any' ?
                    (Array.isArray(formData.value) && formData.value.length > 0
                      ? `contains any [${formData.value.slice(0, 3).join(', ')}${formData.value.length > 3 ? '...' : ''}]`
                      : 'Not set') :
                  formData.validationRule.type === 'contains_all' ?
                    (Array.isArray(formData.value) && formData.value.length > 0
                      ? `contains all [${formData.value.slice(0, 3).join(', ')}${formData.value.length > 3 ? '...' : ''}]`
                      : 'Not set') :
                    'Not specified'
                }</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-2 p-4 border-t border-border bg-surface-secondary">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-content-primary border border-border-secondary rounded hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="inline-flex items-center px-3 py-1.5 text-sm bg-brand-600 text-white rounded hover:bg-brand-700 transition-colors"
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