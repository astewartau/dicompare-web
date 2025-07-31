import React from 'react';
import { ValidationConstraint } from '../../types';

interface ValidationConstraintSelectorProps {
  value: ValidationConstraint;
  onChange: (constraint: ValidationConstraint) => void;
  dataType?: string;
  className?: string;
  disabled?: boolean;
  hideLabel?: boolean;
}

const CONSTRAINT_OPTIONS: { 
  value: ValidationConstraint; 
  label: string; 
  description: string;
  supportedTypes: string[];
}[] = [
  {
    value: 'exact',
    label: 'Exact Match',
    description: 'Field must match exactly (case-insensitive, whitespace-trimmed)',
    supportedTypes: ['string', 'number', 'list_string', 'list_number', 'json']
  },
  {
    value: 'tolerance',
    label: 'Tolerance',
    description: 'Numeric fields allow ±tolerance difference (e.g., 2000 ± 50)',
    supportedTypes: ['number', 'list_number']
  },
  {
    value: 'contains',
    label: 'Contains',
    description: 'String fields must contain substring (e.g., "BOLD" in "BOLD_task")',
    supportedTypes: ['string', 'list_string']
  },
  {
    value: 'range',
    label: 'Range',
    description: 'Numeric fields within min/max bounds',
    supportedTypes: ['number', 'list_number']
  },
];

const ValidationConstraintSelector: React.FC<ValidationConstraintSelectorProps> = ({
  value,
  onChange,
  dataType = 'string',
  className = '',
  disabled = false,
  hideLabel = false
}) => {
  // Filter options based on supported data types
  const availableOptions = CONSTRAINT_OPTIONS.filter(option => 
    option.supportedTypes.includes(dataType)
  );

  const selectedOption = availableOptions.find(option => option.value === value);

  // If current value is not supported by data type, default to 'exact'
  React.useEffect(() => {
    if (!availableOptions.some(option => option.value === value)) {
      onChange('exact');
    }
  }, [dataType, value, onChange, availableOptions]);

  return (
    <div className={`${className}`}>
      {!hideLabel && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Validation Constraint
        </label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ValidationConstraint)}
        disabled={disabled}
        className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
          disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
        }`}
      >
        {availableOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      
      {selectedOption && (
        <p className="mt-1 text-xs text-gray-500">
          {selectedOption.description}
        </p>
      )}

      {dataType && availableOptions.length < CONSTRAINT_OPTIONS.length && (
        <p className="mt-1 text-xs text-amber-600">
          Some constraints are not available for {dataType} data type
        </p>
      )}
    </div>
  );
};

export default ValidationConstraintSelector;