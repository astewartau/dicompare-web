import React from 'react';
import { ArrowRightLeft, Settings, FileText } from 'lucide-react';
import { DicomField } from '../../types';

interface FieldLevelConverterProps {
  field: DicomField;
  currentLevel: 'acquisition' | 'series';
  onConvert: (fieldTag: string, toLevel: 'acquisition' | 'series') => void;
  canConvert?: boolean;
  disabled?: boolean;
  className?: string;
}

const FieldLevelConverter: React.FC<FieldLevelConverterProps> = ({
  field,
  currentLevel,
  onConvert,
  canConvert = true,
  disabled = false,
  className = ''
}) => {
  const targetLevel = currentLevel === 'acquisition' ? 'series' : 'acquisition';
  const isAcquisitionLevel = currentLevel === 'acquisition';

  const handleConvert = () => {
    if (!disabled && canConvert) {
      onConvert(field.tag, targetLevel);
    }
  };

  const getConversionDescription = () => {
    if (isAcquisitionLevel) {
      return 'Convert to series-level to specify different values for different series';
    } else {
      return 'Convert to acquisition-level if this field has the same value across all series';
    }
  };

  const getButtonText = () => {
    return isAcquisitionLevel ? 'Convert to Series' : 'Convert to Acquisition';
  };

  const getIcon = () => {
    return isAcquisitionLevel ? FileText : Settings;
  };

  const Icon = getIcon();

  return (
    <div className={`${className}`}>
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center space-x-3">
          <div className={`p-2 rounded-full ${
            isAcquisitionLevel 
              ? 'bg-blue-100 text-blue-600' 
              : 'bg-purple-100 text-purple-600'
          }`}>
            <Icon className="h-4 w-4" />
          </div>
          
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-medium text-gray-900">{field.name}</span>
              <span className={`px-2 py-1 text-xs rounded-full ${
                isAcquisitionLevel 
                  ? 'bg-blue-100 text-blue-800' 
                  : 'bg-purple-100 text-purple-800'
              }`}>
                {currentLevel}
              </span>
            </div>
            <p className="text-sm text-gray-500">{field.tag} • {field.vr}</p>
          </div>
        </div>

        {canConvert && (
          <button
            onClick={handleConvert}
            disabled={disabled}
            className={`inline-flex items-center px-3 py-1 text-sm rounded-md transition-colors ${
              disabled
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : isAcquisitionLevel
                  ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                  : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            }`}
            title={getConversionDescription()}
          >
            <ArrowRightLeft className="h-3 w-3 mr-1" />
            {getButtonText()}
          </button>
        )}
      </div>

      {canConvert && (
        <p className="mt-2 text-xs text-gray-500">
          {getConversionDescription()}
        </p>
      )}
    </div>
  );
};

// Component for showing field level conversion options within a field configuration
interface InlineFieldConverterProps {
  field: DicomField;
  currentLevel: 'acquisition' | 'series';
  onConvert: (fieldTag: string, toLevel: 'acquisition' | 'series') => void;
  showDescription?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export const InlineFieldConverter: React.FC<InlineFieldConverterProps> = ({
  field,
  currentLevel,
  onConvert,
  showDescription = false,
  size = 'sm',
  className = ''
}) => {
  const targetLevel = currentLevel === 'acquisition' ? 'series' : 'acquisition';
  const isAcquisitionLevel = currentLevel === 'acquisition';

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-2 text-sm'
  };

  return (
    <div className={`inline-flex items-center space-x-2 ${className}`}>
      <button
        onClick={() => onConvert(field.tag, targetLevel)}
        className={`inline-flex items-center rounded-md transition-colors ${sizeClasses[size]} ${
          isAcquisitionLevel
            ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
            : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
        }`}
      >
        <ArrowRightLeft className="h-3 w-3 mr-1" />
        Convert to {targetLevel}
      </button>
      
      {showDescription && (
        <span className="text-xs text-gray-500">
          {isAcquisitionLevel 
            ? 'Use when values vary between series'
            : 'Use when value is the same across all series'
          }
        </span>
      )}
    </div>
  );
};

export default FieldLevelConverter;