import React, { useState } from 'react';
import { Plus, Trash2, Copy, Settings, FileText, AlertCircle } from 'lucide-react';
import { DicomField, FieldDataType, ValidationConstraint, ValidationRule } from '../../types';
import DataTypeSelector from '../common/DataTypeSelector';
import ValidationConstraintSelector from '../common/ValidationConstraintSelector';
import ConstraintInputWidgets from '../common/ConstraintInputWidgets';
import TypeSpecificInputs from '../common/TypeSpecificInputs';

interface SeriesData {
  id: string;
  name: string;
  fields: { [fieldTag: string]: any };
}

interface SeriesFieldManagerProps {
  acquisitionId: string;
  seriesLevelFields: DicomField[];
  onSeriesFieldsChange: (fields: DicomField[]) => void;
  onConvertToAcquisition?: (fieldTag: string) => void;
  className?: string;
}

const SeriesFieldManager: React.FC<SeriesFieldManagerProps> = ({
  acquisitionId,
  seriesLevelFields,
  onSeriesFieldsChange,
  onConvertToAcquisition,
  className = ''
}) => {
  const [series, setSeries] = useState<SeriesData[]>([
    { id: 'series_1', name: 'Series 1', fields: {} },
    { id: 'series_2', name: 'Series 2', fields: {} }
  ]);
  const [expandedSeries, setExpandedSeries] = useState<Set<string>>(new Set(['series_1']));
  const [fieldConfigs, setFieldConfigs] = useState<{
    [fieldTag: string]: {
      dataType: FieldDataType;
      constraint: ValidationConstraint;
      validationRule: ValidationRule;
    }
  }>({});

  // Initialize field configs from existing fields
  React.useEffect(() => {
    const configs: typeof fieldConfigs = {};
    seriesLevelFields.forEach(field => {
      if (!fieldConfigs[field.tag]) {
        configs[field.tag] = {
          dataType: 'string',
          constraint: 'exact',
          validationRule: { type: 'exact', value: field.value }
        };
      }
    });
    if (Object.keys(configs).length > 0) {
      setFieldConfigs(prev => ({ ...prev, ...configs }));
    }
  }, [seriesLevelFields]);

  const addSeries = () => {
    const newSeriesId = `series_${series.length + 1}`;
    const newSeries: SeriesData = {
      id: newSeriesId,
      name: `Series ${series.length + 1}`,
      fields: {}
    };
    
    // Initialize new series with current field values
    seriesLevelFields.forEach(field => {
      newSeries.fields[field.tag] = field.value;
    });

    setSeries([...series, newSeries]);
    setExpandedSeries(prev => new Set([...prev, newSeriesId]));
  };

  const removeSeries = (seriesId: string) => {
    if (series.length <= 2) {
      // If we're down to 2 series and removing one, suggest converting back to acquisition level
      return;
    }
    
    setSeries(prev => prev.filter(s => s.id !== seriesId));
    setExpandedSeries(prev => {
      const newSet = new Set(prev);
      newSet.delete(seriesId);
      return newSet;
    });
  };

  const updateSeriesName = (seriesId: string, name: string) => {
    setSeries(prev => prev.map(s => 
      s.id === seriesId ? { ...s, name } : s
    ));
  };

  const updateSeriesFieldValue = (seriesId: string, fieldTag: string, value: any) => {
    setSeries(prev => prev.map(s => 
      s.id === seriesId 
        ? { ...s, fields: { ...s.fields, [fieldTag]: value } }
        : s
    ));
  };

  const updateFieldConfig = (fieldTag: string, updates: Partial<typeof fieldConfigs[string]>) => {
    setFieldConfigs(prev => ({
      ...prev,
      [fieldTag]: { ...prev[fieldTag], ...updates }
    }));
  };

  const toggleSeriesExpansion = (seriesId: string) => {
    setExpandedSeries(prev => {
      const newSet = new Set(prev);
      if (newSet.has(seriesId)) {
        newSet.delete(seriesId);
      } else {
        newSet.add(seriesId);
      }
      return newSet;
    });
  };

  const duplicateSeries = (seriesId: string) => {
    const seriesToDuplicate = series.find(s => s.id === seriesId);
    if (!seriesToDuplicate) return;

    const newSeriesId = `series_${Date.now()}`;
    const duplicatedSeries: SeriesData = {
      id: newSeriesId,
      name: `${seriesToDuplicate.name} (Copy)`,
      fields: { ...seriesToDuplicate.fields }
    };

    setSeries([...series, duplicatedSeries]);
  };

  const hasValidationErrors = () => {
    // Check if we have at least 2 series when series-level fields exist
    if (seriesLevelFields.length > 0 && series.length < 2) {
      return true;
    }

    // Check if all series have values for all series-level fields
    return seriesLevelFields.some(field => 
      series.some(s => s.fields[field.tag] === undefined || s.fields[field.tag] === '')
    );
  };

  if (seriesLevelFields.length === 0) {
    return (
      <div className={`bg-gray-50 rounded-lg p-6 text-center ${className}`}>
        <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h4 className="text-lg font-medium text-gray-900 mb-2">No Series-Level Fields</h4>
        <p className="text-gray-600 mb-4">
          All fields are currently at the acquisition level. Convert fields to series level when you need to specify different values for different series.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h4 className="text-lg font-medium text-gray-900 flex items-center">
            <FileText className="h-5 w-5 mr-2 text-medical-600" />
            Series-Level Fields
          </h4>
          <p className="text-sm text-gray-600 mt-1">
            Fields that vary between different series in this acquisition
          </p>
        </div>
        
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-500">
            {series.length} series
          </span>
          <button
            onClick={addSeries}
            className="inline-flex items-center px-3 py-1 text-sm bg-medical-600 text-white rounded-md hover:bg-medical-700"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Series
          </button>
        </div>
      </div>

      {hasValidationErrors() && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-amber-600 mr-2 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-700">
              <p className="font-medium">Series Configuration Issues:</p>
              <ul className="mt-1 list-disc list-inside space-y-1">
                {series.length < 2 && seriesLevelFields.length > 0 && (
                  <li>At least 2 series are required when series-level fields exist</li>
                )}
                {seriesLevelFields.some(field => 
                  series.some(s => s.fields[field.tag] === undefined || s.fields[field.tag] === '')
                ) && (
                  <li>All series must have values for all series-level fields</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Series Fields Configuration */}
      <div className="space-y-4 mb-6">
        {seriesLevelFields.map((field) => {
          const config = fieldConfigs[field.tag] || {
            dataType: 'string' as FieldDataType,
            constraint: 'exact' as ValidationConstraint,
            validationRule: { type: 'exact', value: field.value }
          };

          return (
            <div key={field.tag} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h5 className="font-medium text-gray-900">{field.name}</h5>
                  <p className="text-sm text-gray-500">{field.tag} • {field.vr}</p>
                </div>
                
                <div className="flex items-center space-x-2">
                  {onConvertToAcquisition && (
                    <button
                      onClick={() => onConvertToAcquisition(field.tag)}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Convert to Acquisition
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <DataTypeSelector
                  value={config.dataType}
                  onChange={(dataType) => updateFieldConfig(field.tag, { dataType })}
                />
                
                <ValidationConstraintSelector
                  value={config.constraint}
                  dataType={config.dataType}
                  onChange={(constraint) => updateFieldConfig(field.tag, { 
                    constraint, 
                    validationRule: { type: constraint } 
                  })}
                />
              </div>

              <ConstraintInputWidgets
                constraint={config.constraint}
                value={config.validationRule}
                onChange={(validationRule) => updateFieldConfig(field.tag, { validationRule })}
                className="mb-4"
              />
            </div>
          );
        })}
      </div>

      {/* Series Values */}
      <div className="space-y-4">
        {series.map((seriesData) => {
          const isExpanded = expandedSeries.has(seriesData.id);
          
          return (
            <div key={seriesData.id} className="border border-gray-200 rounded-lg">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => toggleSeriesExpansion(seriesData.id)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                  <input
                    type="text"
                    value={seriesData.name}
                    onChange={(e) => updateSeriesName(seriesData.id, e.target.value)}
                    className="font-medium text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-medical-500 rounded px-2 py-1"
                  />
                </div>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => duplicateSeries(seriesData.id)}
                    className="p-1 text-gray-400 hover:text-gray-600"
                    title="Duplicate series"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  
                  {series.length > 2 && (
                    <button
                      onClick={() => removeSeries(seriesData.id)}
                      className="p-1 text-red-400 hover:text-red-600"
                      title="Remove series"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="p-4 space-y-4">
                  {seriesLevelFields.map((field) => {
                    const config = fieldConfigs[field.tag];
                    if (!config) return null;

                    return (
                      <div key={field.tag}>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {field.name} ({field.tag})
                        </label>
                        
                        <TypeSpecificInputs
                          dataType={config.dataType}
                          value={seriesData.fields[field.tag]}
                          onChange={(value) => updateSeriesFieldValue(seriesData.id, field.tag, value)}
                          placeholder={`Value for ${field.name}`}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Series Summary */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h5 className="font-medium text-blue-900 mb-2">Series Summary</h5>
        <div className="text-sm text-blue-800">
          <p>{series.length} series configured with {seriesLevelFields.length} varying fields</p>
          {series.length >= 2 && seriesLevelFields.length > 0 && (
            <p className="text-green-700">✓ Valid series configuration</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SeriesFieldManager;