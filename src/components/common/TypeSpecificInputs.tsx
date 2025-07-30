import React, { useState } from 'react';
import { FieldDataType } from '../../types';

interface TypeSpecificInputsProps {
  dataType: FieldDataType;
  value: any;
  onChange: (value: any) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const TypeSpecificInputs: React.FC<TypeSpecificInputsProps> = ({
  dataType,
  value,
  onChange,
  placeholder,
  className = '',
  disabled = false
}) => {
  const [stringListInput, setStringListInput] = useState('');
  const [numberListInput, setNumberListInput] = useState('');
  const [jsonError, setJsonError] = useState('');

  const handleStringListChange = (input: string) => {
    setStringListInput(input);
    // Parse comma-separated values
    const values = input.split(',').map(v => v.trim()).filter(v => v.length > 0);
    onChange(values);
  };

  const handleNumberListChange = (input: string) => {
    setNumberListInput(input);
    try {
      // Parse comma-separated numbers
      const values = input.split(',')
        .map(v => v.trim())
        .filter(v => v.length > 0)
        .map(v => {
          const num = parseFloat(v);
          if (isNaN(num)) throw new Error(`Invalid number: ${v}`);
          return num;
        });
      onChange(values);
    } catch (error) {
      // Keep the input but don't update the value
      console.warn('Invalid number list:', error);
    }
  };

  const handleJsonChange = (input: string) => {
    try {
      if (input.trim() === '') {
        onChange(null);
        setJsonError('');
        return;
      }
      const parsed = JSON.parse(input);
      onChange(parsed);
      setJsonError('');
    } catch (error) {
      setJsonError(`Invalid JSON: ${(error as Error).message}`);
    }
  };

  // Initialize string list display
  React.useEffect(() => {
    if (dataType === 'list_string' && Array.isArray(value) && stringListInput === '') {
      setStringListInput(value.join(', '));
    }
  }, [dataType, value, stringListInput]);

  // Initialize number list display
  React.useEffect(() => {
    if (dataType === 'list_number' && Array.isArray(value) && numberListInput === '') {
      setNumberListInput(value.join(', '));
    }
  }, [dataType, value, numberListInput]);

  switch (dataType) {
    case 'string':
      return (
        <div className={className}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            String Value
          </label>
          <input
            type="text"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder={placeholder || 'Enter string value'}
            className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
            }`}
          />
          <p className="mt-1 text-xs text-gray-500">
            Example: "SIEMENS", "T1_MPRAGE", "BOLD_task"
          </p>
        </div>
      );

    case 'number':
      return (
        <div className={className}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Numeric Value
          </label>
          <input
            type="number"
            value={value || ''}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            disabled={disabled}
            placeholder={placeholder || 'Enter number'}
            step="any"
            className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
            }`}
          />
          <p className="mt-1 text-xs text-gray-500">
            Example: 3.0, 2000, 0.5, 12
          </p>
        </div>
      );

    case 'list_string':
      return (
        <div className={className}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            String List (comma-separated)
          </label>
          <input
            type="text"
            value={stringListInput}
            onChange={(e) => handleStringListChange(e.target.value)}
            disabled={disabled}
            placeholder={placeholder || 'value1, value2, value3'}
            className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
            }`}
          />
          <p className="mt-1 text-xs text-gray-500">
            Example: "ORIGINAL, PRIMARY, M" or "T1, T2, FLAIR"
          </p>
          {Array.isArray(value) && value.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-gray-600">Preview:</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {value.map((item: string, index: number) => (
                  <span key={index} className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                    "{item}"
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      );

    case 'list_number':
      return (
        <div className={className}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Number List (comma-separated)
          </label>
          <input
            type="text"
            value={numberListInput}
            onChange={(e) => handleNumberListChange(e.target.value)}
            disabled={disabled}
            placeholder={placeholder || '1.25, 1.25, 2.5'}
            className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
            }`}
          />
          <p className="mt-1 text-xs text-gray-500">
            Example: "1.25, 1.25" or "10, 20, 30"
          </p>
          {Array.isArray(value) && value.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-gray-600">Preview:</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {value.map((item: number, index: number) => (
                  <span key={index} className="inline-block px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      );

    case 'json':
      return (
        <div className={className}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            JSON Value
          </label>
          <textarea
            value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
            onChange={(e) => handleJsonChange(e.target.value)}
            disabled={disabled}
            placeholder={placeholder || '{"key": "value"}'}
            rows={4}
            className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm ${
              disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
            } ${jsonError ? 'border-red-300 focus:border-red-500' : ''}`}
          />
          {jsonError && (
            <p className="mt-1 text-xs text-red-600">
              {jsonError}
            </p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Enter valid JSON for complex nested data structures
          </p>
        </div>
      );

    default:
      return (
        <div className={className}>
          <p className="text-sm text-gray-500">
            Unsupported data type: {dataType}
          </p>
        </div>
      );
  }
};

export default TypeSpecificInputs;