import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Acquisition, DicomField, Series, SeriesField, SelectedValidationFunction } from '../types';
import { searchDicomFields, suggestDataType, suggestValidationConstraint, isValidDicomTag } from '../services/dicomFieldService';
import { convertValueToDataType, inferDataTypeFromValue } from '../utils/datatypeInference';
import { getSuggestedToleranceValue } from '../utils/vrMapping';

interface SchemaMetadata {
  name: string;
  description: string;
  authors: string[];
  version: string;
  tags?: string[];
}

interface AcquisitionContextType {
  acquisitions: Acquisition[];
  setAcquisitions: (acquisitions: Acquisition[]) => void;
  schemaMetadata: SchemaMetadata | null;
  setSchemaMetadata: (metadata: SchemaMetadata) => void;
  updateAcquisition: (id: string, updates: Partial<Acquisition>) => void;
  deleteAcquisition: (id: string) => void;
  addNewAcquisition: () => void;
  updateField: (acquisitionId: string, fieldTag: string, updates: Partial<DicomField>) => void;
  deleteField: (acquisitionId: string, fieldTag: string) => void;
  convertFieldLevel: (acquisitionId: string, fieldTag: string, toLevel: 'acquisition' | 'series', mode?: 'separate-series' | 'single-series') => void;
  addFields: (acquisitionId: string, fieldTags: string[]) => Promise<void>;
  updateSeries: (acquisitionId: string, seriesIndex: number, fieldTag: string, updates: Partial<SeriesField>) => void;
  addSeries: (acquisitionId: string) => void;
  deleteSeries: (acquisitionId: string, seriesIndex: number) => void;
  updateSeriesName: (acquisitionId: string, seriesIndex: number, name: string) => void;
  // Validation function methods
  addValidationFunction: (acquisitionId: string, func: SelectedValidationFunction) => void;
  updateValidationFunction: (acquisitionId: string, index: number, func: SelectedValidationFunction) => void;
  deleteValidationFunction: (acquisitionId: string, index: number) => void;
}

const AcquisitionContext = createContext<AcquisitionContextType | undefined>(undefined);

interface AcquisitionProviderProps {
  children: ReactNode;
}

export const AcquisitionProvider: React.FC<AcquisitionProviderProps> = ({ children }) => {
  const [acquisitions, setAcquisitions] = useState<Acquisition[]>([]);
  const [schemaMetadata, setSchemaMetadata] = useState<SchemaMetadata | null>(null);

  const updateAcquisition = useCallback((id: string, updates: Partial<Acquisition>) => {
    setAcquisitions(prev => prev.map(acq =>
      acq.id === id ? { ...acq, ...updates } : acq
    ));
  }, []);

  const deleteAcquisition = useCallback((id: string) => {
    setAcquisitions(prev => prev.filter(acq => acq.id !== id));
  }, []);

  const addNewAcquisition = useCallback(() => {
    const newAcquisition: Acquisition = {
      id: `acq_${Date.now()}`,
      protocolName: 'New Acquisition',
      seriesDescription: '',
      totalFiles: 0,
      acquisitionFields: [],
      series: [],
      metadata: {}
    };
    setAcquisitions(prev => [...prev, newAcquisition]);
  }, []);

  const updateField = useCallback((acquisitionId: string, fieldTagOrName: string, updates: Partial<DicomField>) => {
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;

      return {
        ...acq,
        // Match by tag OR name to handle custom/derived fields with null tags
        acquisitionFields: acq.acquisitionFields.map(f =>
          (f.tag === fieldTagOrName || f.name === fieldTagOrName) ? { ...f, ...updates } : f
        ),
        // Update field in all series (new array format)
        series: acq.series?.map(s => ({
          ...s,
          fields: Array.isArray(s.fields) ? s.fields.map(f =>
            (f.tag === fieldTagOrName || f.name === fieldTagOrName) ? { ...f, ...updates } : f
          ) : []
        }))
      };
    }));
  }, []);

  const deleteField = useCallback((acquisitionId: string, fieldTagOrName: string) => {
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;

      return {
        ...acq,
        // Filter by tag OR name to handle custom/derived fields with null tags
        acquisitionFields: acq.acquisitionFields.filter(f => f.tag !== fieldTagOrName && f.name !== fieldTagOrName),
        // Remove field from all series (new array format)
        series: acq.series?.map(s => ({
          ...s,
          fields: Array.isArray(s.fields) ? s.fields.filter(f => f.tag !== fieldTagOrName && f.name !== fieldTagOrName) : []
        }))
      };
    }));
  }, []);

  const convertFieldLevel = useCallback((acquisitionId: string, fieldTagOrName: string, toLevel: 'acquisition' | 'series', mode: 'separate-series' | 'single-series' = 'single-series') => {
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;

      // Find field in acquisition level (by tag or name for derived fields)
      const acquisitionField = acq.acquisitionFields.find(f => f.tag === fieldTagOrName || f.name === fieldTagOrName);
      // Find field in any series (handle both old and new formats)
      let seriesField: SeriesField | undefined;
      for (const series of acq.series || []) {
        if (Array.isArray(series.fields)) {
          // New format: fields is an array of SeriesField
          // Search by tag first, then by name (for derived fields with null tags)
          seriesField = series.fields.find(f => f.tag === fieldTagOrName || f.name === fieldTagOrName);
        } else if (series.fields && typeof series.fields === 'object') {
          // Old format: fields is an object {tag: value}
          const fieldValue = (series.fields as any)[fieldTagOrName];
          if (fieldValue !== undefined) {
            // Convert old format to SeriesField
            seriesField = {
              name: fieldTagOrName, // We'll use tag as name for now
              tag: fieldTagOrName,
              value: typeof fieldValue === 'object' && fieldValue.value !== undefined ? fieldValue.value : fieldValue,
              validationRule: typeof fieldValue === 'object' && fieldValue.validationRule ? fieldValue.validationRule : undefined
            };
          }
        }
        if (seriesField) break;
      }

      const field = acquisitionField || (seriesField ? {
        tag: seriesField.tag,
        name: seriesField.name,
        keyword: seriesField.keyword,
        value: seriesField.value,
        vr: 'UN',
        level: 'series' as const,
        validationRule: seriesField.validationRule,
        fieldType: seriesField.fieldType  // Preserve field type (standard/derived)
      } : null);

      if (!field) return acq;

      if (toLevel === 'acquisition') {
        // Remove field from all series and add to acquisition level
        // Use tag-or-name matching for derived fields with null tags
        const updatedSeries = (acq.series || []).map(series => ({
          ...series,
          fields: Array.isArray(series.fields)
            ? series.fields.filter(f => f.tag !== fieldTagOrName && f.name !== fieldTagOrName)
            : [] // Convert old object format to new array format
        }));

        return {
          ...acq,
          acquisitionFields: [...acq.acquisitionFields.filter(f => f.tag !== fieldTagOrName && f.name !== fieldTagOrName), { ...field, level: 'acquisition' }],
          series: updatedSeries
        };
      } else {
        // Converting to series level
        const currentSeries = acq.series || [];
        let updatedSeries: Series[] = [];

        if (Array.isArray(field.value) && mode === 'separate-series') {
          // Create separate series for each value
          if (currentSeries.length > 0) {
            // Multiply existing series by field values
            let seriesCounter = 1;
            for (const existingSeries of currentSeries) {
              for (let i = 0; i < field.value.length; i++) {
                updatedSeries.push({
                  name: `Series ${String(seriesCounter).padStart(2, '0')}`,
                  fields: [
                    ...(Array.isArray(existingSeries.fields)
                        ? existingSeries.fields.filter(f => f.tag !== fieldTagOrName && f.name !== fieldTagOrName)
                        : []), // Handle old object format
                    {
                      name: field.name,
                      keyword: field.keyword,
                      tag: field.tag,
                      value: field.value[i],
                      validationRule: field.validationRule,
                      fieldType: field.fieldType
                    }
                  ]
                });
                seriesCounter++;
              }
            }
          } else {
            // No existing series - create one per value
            for (let i = 0; i < field.value.length; i++) {
              updatedSeries.push({
                name: `Series ${String(i + 1).padStart(2, '0')}`,
                fields: [{
                  name: field.name,
                  keyword: field.keyword,
                  tag: field.tag,
                  value: field.value[i],
                  validationRule: field.validationRule,
                  fieldType: field.fieldType
                }]
              });
            }
          }
        } else {
          // Single series mode - add field to existing series or create one if none exist
          const seriesCount = Math.max(1, currentSeries.length);
          for (let i = 0; i < seriesCount; i++) {
            const existingSeries = currentSeries[i];
            updatedSeries.push({
              name: existingSeries?.name || `Series ${String(i + 1).padStart(2, '0')}`,
              fields: [
                ...(existingSeries && Array.isArray(existingSeries.fields)
                    ? existingSeries.fields.filter(f => f.tag !== fieldTagOrName && f.name !== fieldTagOrName)
                    : []), // Handle old object format
                {
                  name: field.name,
                  keyword: field.keyword,
                  tag: field.tag,
                  value: field.value,
                  validationRule: field.validationRule,
                  fieldType: field.fieldType
                }
              ]
            });
          }
        }

        return {
          ...acq,
          acquisitionFields: acq.acquisitionFields.filter(f => f.tag !== fieldTagOrName && f.name !== fieldTagOrName),
          series: updatedSeries
        };
      }
    }));
  }, []);

  const addFields = useCallback(async (acquisitionId: string, fieldTags: string[]) => {
    if (fieldTags.length === 0) return;

    // Process each field tag/name to get enhanced field data from local service
    const newFieldsPromises = fieldTags.map(async (tagOrName) => {
      try {
        const isDicomFormat = isValidDicomTag(tagOrName);

        // Use local DICOM field service (no Pyodide needed!)
        const results = await searchDicomFields(tagOrName, 1);
        const fieldDef = isDicomFormat
          ? results.find(f => f.tag.replace(/[()]/g, '') === tagOrName)
          : results.find(f => f.keyword?.toLowerCase() === tagOrName.toLowerCase() || f.name?.toLowerCase() === tagOrName.toLowerCase());

        // Determine field type:
        // - standard: known DICOM tag found in dictionary
        // - private: DICOM tag format but not in dictionary
        // - custom: user-defined name (not DICOM format)
        let fieldType: 'standard' | 'private' | 'custom';
        if (fieldDef) {
          fieldType = 'standard';
        } else if (isDicomFormat) {
          fieldType = 'private';
        } else {
          fieldType = 'custom';
        }

        const vr = fieldDef?.vr || fieldDef?.valueRepresentation || 'UN';
        const tag = fieldDef?.tag?.replace(/[()]/g, '') || (isDicomFormat ? tagOrName : null);
        const name = fieldDef?.name || tagOrName;
        const keyword = fieldDef?.keyword || name;
        const suggestedDataType = fieldDef ? suggestDataType(vr, fieldDef.valueMultiplicity) : 'string' as const;
        const constraintType = fieldDef ? suggestValidationConstraint(fieldDef) : 'exact' as const;

        // Set appropriate default value based on suggested dataType
        const defaultValue = convertValueToDataType('', suggestedDataType);

        let validationRule: any = { type: constraintType };

        // Add tolerance value for fields that use tolerance validation
        if (constraintType === 'tolerance') {
          const toleranceValue = getSuggestedToleranceValue(name, tag || '');
          if (toleranceValue !== undefined) {
            validationRule.tolerance = toleranceValue;
            validationRule.value = defaultValue; // Include value for tolerance validation check
          }
        }

        return {
          tag,
          name,
          keyword,
          value: defaultValue,
          vr,
          dataType: suggestedDataType, // Include the properly inferred data type
          level: 'acquisition' as const,
          validationRule,
          fieldType
        };
      } catch (error) {
        // Fallback if field lookup fails - determine type based on format
        const isDicomFormat = isValidDicomTag(tagOrName);
        return {
          tag: isDicomFormat ? tagOrName : null,
          name: tagOrName,
          keyword: tagOrName,
          value: '', // Keep as empty string for unknown fields
          vr: 'UN',
          dataType: 'string', // Default data type for unknown fields
          level: 'acquisition' as const,
          validationRule: { type: 'exact' as const },
          fieldType: isDicomFormat ? 'private' as const : 'custom' as const
        };
      }
    });

    const newFields = await Promise.all(newFieldsPromises);

    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;

      // Filter out duplicates - don't add fields that already exist (by tag or name)
      const existingTags = new Set(acq.acquisitionFields.map(f => f.tag).filter(Boolean));
      const existingNames = new Set(acq.acquisitionFields.map(f => f.name.toLowerCase()));

      const uniqueNewFields = newFields.filter(newField => {
        // Check if tag already exists (for standard/private fields)
        if (newField.tag && existingTags.has(newField.tag)) return false;
        // Check if name already exists (for all fields, case-insensitive)
        if (existingNames.has(newField.name.toLowerCase())) return false;
        return true;
      });

      return {
        ...acq,
        acquisitionFields: [...acq.acquisitionFields, ...uniqueNewFields]
      };
    }));
  }, []);

  const updateSeries = useCallback((acquisitionId: string, seriesIndex: number, fieldTag: string, updates: Partial<SeriesField>) => {
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;

      const updatedSeries = [...(acq.series || [])];
      if (!updatedSeries[seriesIndex]) {
        updatedSeries[seriesIndex] = { name: `Series ${String(seriesIndex + 1).padStart(2, '0')}`, fields: [] };
      }

      // Find the field in the series
      const existingFieldIndex = updatedSeries[seriesIndex].fields.findIndex(f => f.tag === fieldTag);

      if (existingFieldIndex >= 0) {
        // Update existing field
        updatedSeries[seriesIndex].fields[existingFieldIndex] = {
          ...updatedSeries[seriesIndex].fields[existingFieldIndex],
          ...updates
        };
      } else {
        // Create new field (should have name and tag at minimum)
        const newField: SeriesField = {
          tag: fieldTag,
          name: updates.name || fieldTag,
          value: updates.value || '',
          validationRule: updates.validationRule
        };
        updatedSeries[seriesIndex].fields.push(newField);
      }

      return { ...acq, series: updatedSeries };
    }));
  }, []);

  const addSeries = useCallback((acquisitionId: string) => {
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;

      const currentSeries = acq.series || [];

      // Copy fields from the last series (if exists) or create defaults
      let newFields: SeriesField[] = [];

      // First, try to copy from the last series with fields
      if (currentSeries.length > 0) {
        // Look for the most recent series with fields
        for (let i = currentSeries.length - 1; i >= 0; i--) {
          if (currentSeries[i].fields.length > 0) {
            newFields = currentSeries[i].fields.map(field => ({
              ...field,
              value: field.value // Copy the actual value
            }));
            break;
          }
        }
      }

      // If no series with fields exist, create defaults based on all unique fields across all series
      if (newFields.length === 0 && currentSeries.length > 0) {
        const allFieldTags = new Set<string>();
        const fieldMap = new Map<string, SeriesField>();

        // Collect all unique fields from all series
        currentSeries.forEach(s => {
          s.fields.forEach(f => {
            const fieldKey = f.tag || f.name;  // Use name as key for derived fields with null tags
            if (!fieldMap.has(fieldKey)) {
              fieldMap.set(fieldKey, f);
            }
          });
        });

        // Create default fields with appropriate default values based on type
        fieldMap.forEach((field) => {
          const defaultValue = inferDataTypeFromValue(field.value) === 'number' ? 0 :
                              inferDataTypeFromValue(field.value) === 'list_number' ? [] :
                              inferDataTypeFromValue(field.value) === 'list_string' ? [] :
                              '';

          newFields.push({
            ...field,
            value: defaultValue
          });
        });
      }

      const newSeries: Series = {
        name: `Series ${String(currentSeries.length + 1).padStart(2, '0')}`,
        fields: newFields
      };

      return { ...acq, series: [...currentSeries, newSeries] };
    }));
  }, []);

  const deleteSeries = useCallback((acquisitionId: string, seriesIndex: number) => {
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;

      const updatedSeries = [...(acq.series || [])];
      updatedSeries.splice(seriesIndex, 1);

      return { ...acq, series: updatedSeries };
    }));
  }, []);

  const updateSeriesName = useCallback((acquisitionId: string, seriesIndex: number, name: string) => {
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;

      const updatedSeries = [...(acq.series || [])];
      if (updatedSeries[seriesIndex]) {
        updatedSeries[seriesIndex] = {
          ...updatedSeries[seriesIndex],
          name
        };
      }

      return { ...acq, series: updatedSeries };
    }));
  }, []);

  // Validation function handlers
  const addValidationFunction = useCallback((acquisitionId: string, func: SelectedValidationFunction) => {
    setAcquisitions(prev => prev.map(acq =>
      acq.id === acquisitionId ? {
        ...acq,
        validationFunctions: [...(acq.validationFunctions || []), func]
      } : acq
    ));
  }, []);

  const updateValidationFunction = useCallback((acquisitionId: string, index: number, func: SelectedValidationFunction) => {
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;

      const updatedFunctions = [...(acq.validationFunctions || [])];
      if (updatedFunctions[index]) {
        updatedFunctions[index] = func;
      }

      return { ...acq, validationFunctions: updatedFunctions };
    }));
  }, []);

  const deleteValidationFunction = useCallback((acquisitionId: string, index: number) => {
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;

      const updatedFunctions = [...(acq.validationFunctions || [])];
      updatedFunctions.splice(index, 1);

      return { ...acq, validationFunctions: updatedFunctions };
    }));
  }, []);

  const value: AcquisitionContextType = {
    acquisitions,
    setAcquisitions,
    schemaMetadata,
    setSchemaMetadata,
    updateAcquisition,
    deleteAcquisition,
    addNewAcquisition,
    updateField,
    deleteField,
    convertFieldLevel,
    addFields,
    updateSeries,
    addSeries,
    deleteSeries,
    updateSeriesName,
    addValidationFunction,
    updateValidationFunction,
    deleteValidationFunction
  };

  return (
    <AcquisitionContext.Provider value={value}>
      {children}
    </AcquisitionContext.Provider>
  );
};

export const useAcquisitions = (): AcquisitionContextType => {
  const context = useContext(AcquisitionContext);
  if (context === undefined) {
    throw new Error('useAcquisitions must be used within an AcquisitionProvider');
  }
  return context;
};
