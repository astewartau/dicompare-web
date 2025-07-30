import React, { useState } from 'react';
import { ValidationConstraint, ValidationRule } from '../../types';

interface ConstraintInputWidgetsProps {
  constraint: ValidationConstraint;
  value: ValidationRule;
  onChange: (rule: ValidationRule) => void;
  className?: string;
  disabled?: boolean;
}

const ConstraintInputWidgets: React.FC<ConstraintInputWidgetsProps> = ({
  constraint,
  value,
  onChange,
  className = '',
  disabled = false
}) => {
  const updateRule = (updates: Partial<ValidationRule>) => {
    onChange({ ...value, ...updates });
  };

  switch (constraint) {
    case 'exact':
      return (
        <div className={className}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Expected Value
          </label>
          <input
            type="text"
            value={value.value || ''}
            onChange={(e) => updateRule({ value: e.target.value })}
            disabled={disabled}
            placeholder="Enter exact value to match"
            className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
            }`}
          />
        </div>
      );

    case 'tolerance':
      return (
        <div className={className}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Expected Value
              </label>
              <input
                type="number"
                value={value.value || ''}
                onChange={(e) => updateRule({ value: parseFloat(e.target.value) || 0 })}
                disabled={disabled}
                placeholder="2000"
                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
                }`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tolerance (±)
              </label>
              <input
                type="number"
                value={value.tolerance || ''}
                onChange={(e) => updateRule({ tolerance: parseFloat(e.target.value) || 0 })}
                disabled={disabled}
                placeholder="50"
                min="0"
                step="0.1"
                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
                }`}
              />
            </div>
          </div>
          {value.value && value.tolerance && (
            <p className="mt-2 text-sm text-gray-600">
              Range: {(value.value as number) - (value.tolerance || 0)} to {(value.value as number) + (value.tolerance || 0)}
            </p>
          )}
        </div>
      );

    case 'contains':
      return (
        <div className={className}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Substring to Find
          </label>
          <input
            type="text"
            value={value.contains || ''}
            onChange={(e) => updateRule({ contains: e.target.value })}
            disabled={disabled}
            placeholder="BOLD"
            className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
            }`}
          />
          <p className="mt-1 text-xs text-gray-500">
            Field value must contain this substring (case-insensitive)
          </p>
        </div>
      );

    case 'range':
      return (
        <div className={className}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum Value
              </label>
              <input
                type="number"
                value={value.min || ''}
                onChange={(e) => updateRule({ min: parseFloat(e.target.value) || undefined })}
                disabled={disabled}
                placeholder="8"
                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
                }`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Maximum Value
              </label>
              <input
                type="number"
                value={value.max || ''}
                onChange={(e) => updateRule({ max: parseFloat(e.target.value) || undefined })}
                disabled={disabled}
                placeholder="12"
                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
                }`}
              />
            </div>
          </div>
          {(value.min !== undefined || value.max !== undefined) && (
            <p className="mt-2 text-sm text-gray-600">
              Valid range: {value.min ?? '-∞'} to {value.max ?? '∞'}
            </p>
          )}
        </div>
      );

    case 'custom':
      return (
        <div className={className}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Custom Python Logic
          </label>
          <textarea
            value={value.customLogic || ''}
            onChange={(e) => updateRule({ customLogic: e.target.value })}
            disabled={disabled}
            placeholder="# Python validation logic&#10;# Available variables: field_value, expected_value&#10;# Return True for pass, False for fail&#10;&#10;def validate(field_value, expected_value):&#10;    return field_value == expected_value"
            rows={6}
            className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm ${
              disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
            }`}
          />
          <p className="mt-1 text-xs text-gray-500">
            Write Python code to define custom validation logic. Use <code>field_value</code> and <code>expected_value</code> variables.
          </p>
        </div>
      );

    default:
      return null;
  }
};

export default ConstraintInputWidgets;