import React from 'react';
import { FieldDataType } from '../../types';

interface DataTypeSelectorProps {
  value: FieldDataType;
  onChange: (dataType: FieldDataType) => void;
  className?: string;
  disabled?: boolean;
  hideLabel?: boolean;
}

const DATA_TYPE_OPTIONS: { value: FieldDataType; label: string; description: string }[] = [
  {
    value: 'string',
    label: 'String',
    description: 'Text value (e.g., "SIEMENS", "T1_MPRAGE")'
  },
  {
    value: 'number',
    label: 'Number',
    description: 'Numeric value (e.g., 3.0, 2000, 0.5)'
  },
  {
    value: 'list_string',
    label: 'String List',
    description: 'Array of text values (e.g., ["ORIGINAL", "PRIMARY", "M"])'
  },
  {
    value: 'list_number',
    label: 'Number List',
    description: 'Array of numbers (e.g., [1.25, 1.25], [10, 20, 30])'
  },
  {
    value: 'json',
    label: 'Raw JSON',
    description: 'Complex nested data structure'
  }
];

const DataTypeSelector: React.FC<DataTypeSelectorProps> = ({
  value,
  onChange,
  className = '',
  disabled = false,
  hideLabel = false
}) => {
  const selectedOption = DATA_TYPE_OPTIONS.find(option => option.value === value);

  return (
    <div className={`${className}`}>
      {!hideLabel && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Data Type
        </label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as FieldDataType)}
        disabled={disabled}
        className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
          disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
        }`}
      >
        {DATA_TYPE_OPTIONS.map((option) => (
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
    </div>
  );
};

export default DataTypeSelector;