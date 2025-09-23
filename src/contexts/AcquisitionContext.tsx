import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Acquisition, DicomField, Series, SelectedValidationFunction } from '../types';
import { searchDicomFields, suggestDataType, suggestValidationConstraint } from '../services/dicomFieldService';
import { getSuggestedToleranceValue } from '../utils/vrMapping';

interface SchemaMetadata {
  name: string;
  description: string;
  authors: string[];
  version: string;
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
  updateSeries: (acquisitionId: string, seriesIndex: number, fieldTag: string, value: any) => void;
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
      seriesFields: [],
      series: [],
      metadata: {}
    };
    setAcquisitions(prev => [...prev, newAcquisition]);
  }, []);

  const updateField = useCallback((acquisitionId: string, fieldTag: string, updates: Partial<DicomField>) => {
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;
      
      return {
        ...acq,
        acquisitionFields: acq.acquisitionFields.map(f => 
          f.tag === fieldTag ? { ...f, ...updates } : f
        ),
        seriesFields: acq.seriesFields.map(f => 
          f.tag === fieldTag ? { ...f, ...updates } : f
        ),
      };
    }));
  }, []);

  const deleteField = useCallback((acquisitionId: string, fieldTag: string) => {
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;
      
      return {
        ...acq,
        acquisitionFields: acq.acquisitionFields.filter(f => f.tag !== fieldTag),
        seriesFields: acq.seriesFields.filter(f => f.tag !== fieldTag),
        series: acq.series?.map(s => ({
          ...s,
          fields: Object.fromEntries(
            Object.entries(s.fields || {}).filter(([tag]) => tag !== fieldTag)
          )
        }))
      };
    }));
  }, []);

  const convertFieldLevel = useCallback((acquisitionId: string, fieldTag: string, toLevel: 'acquisition' | 'series', mode: 'separate-series' | 'single-series' = 'single-series') => {
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;
      
      const acquisitionField = acq.acquisitionFields.find(f => f.tag === fieldTag);
      const seriesField = acq.seriesFields.find(f => f.tag === fieldTag);
      const field = acquisitionField || seriesField;
      
      if (!field) return acq;
      
      if (toLevel === 'acquisition') {
        // Remove field from series level
        const updatedSeriesFields = acq.seriesFields.filter(f => f.tag !== fieldTag);
        
        // Clean up series data if no series-level fields remain
        const updatedSeries = updatedSeriesFields.length > 0 
          ? (acq.series || []).map(series => ({
              ...series,
              fields: Object.fromEntries(
                Object.entries(series.fields || {}).filter(([tag]) => tag !== fieldTag)
              )
            }))
          : []; // Clear all series if no series-level fields exist
        
        return {
          ...acq,
          acquisitionFields: [...acq.acquisitionFields.filter(f => f.tag !== fieldTag), { ...field, level: 'acquisition' }],
          seriesFields: updatedSeriesFields,
          series: updatedSeries
        };
      } else {
        // When converting to series level, handle different modes for list values
        const currentSeries = acq.series || [];
        let updatedSeries = [];
        
        if (Array.isArray(field.value) && mode === 'separate-series') {
          // Create permutations of existing series with new field values
          if (currentSeries.length > 0) {
            // Generate permutations: existing series × new field values
            let seriesCounter = 1;
            for (const existingSeries of currentSeries) {
              for (let i = 0; i < field.value.length; i++) {
                updatedSeries.push({
                  name: `Series ${seriesCounter}`,
                  fields: {
                    ...existingSeries.fields,
                    [fieldTag]: {
                      value: field.value[i],
                      dataType: field.dataType === 'list_number' ? 'number' : 
                               field.dataType === 'list_string' ? 'string' : field.dataType,
                      validationRule: field.validationRule,
                    }
                  }
                });
                seriesCounter++;
              }
            }
          } else {
            // No existing series - create one series per value
            for (let i = 0; i < field.value.length; i++) {
              updatedSeries.push({
                name: `Series ${i + 1}`,
                fields: {
                  [fieldTag]: {
                    value: field.value[i],
                    dataType: field.dataType === 'list_number' ? 'number' : 
                             field.dataType === 'list_string' ? 'string' : field.dataType,
                    validationRule: field.validationRule,
                  }
                }
              });
            }
          }
        } else {
          // Single series mode - add field to all existing series or create minimum 2
          const seriesCount = Math.max(2, currentSeries.length);
          for (let i = 0; i < seriesCount; i++) {
            const existingSeries = currentSeries[i];
            updatedSeries.push({
              name: existingSeries?.name || `Series ${i + 1}`,
              fields: {
                ...(existingSeries?.fields || {}),
                [fieldTag]: {
                  value: field.value,
                  dataType: field.dataType,
                  validationRule: field.validationRule,
                }
              }
            });
          }
        }

        return {
          ...acq,
          seriesFields: [...acq.seriesFields.filter(f => f.tag !== fieldTag), { ...field, level: 'series' }],
          acquisitionFields: acq.acquisitionFields.filter(f => f.tag !== fieldTag),
          series: updatedSeries
        };
      }
    }));
  }, []);

  const addFields = useCallback(async (acquisitionId: string, fieldTags: string[]) => {
    if (fieldTags.length === 0) return;
    
    // Process each field tag to get enhanced field data from local service
    const newFieldsPromises = fieldTags.map(async tag => {
      try {
        // Use local DICOM field service (no Pyodide needed!)
        const results = await searchDicomFields(tag, 1);
        const fieldDef = results.find(f => f.tag.replace(/[()]/g, '') === tag);
        
        const vr = fieldDef?.vr || fieldDef?.valueRepresentation || 'UN';
        const name = fieldDef?.name || tag;
        const keyword = fieldDef?.keyword || name;
        const dataType = fieldDef ? suggestDataType(vr, fieldDef.valueMultiplicity) : 'string' as const;
        const constraintType = fieldDef ? suggestValidationConstraint(fieldDef) : 'exact' as const;
        
        let validationRule: any = { type: constraintType };
        
        // Add tolerance value for fields that use tolerance validation
        if (constraintType === 'tolerance') {
          const toleranceValue = getSuggestedToleranceValue(name, tag);
          if (toleranceValue !== undefined) {
            validationRule.tolerance = toleranceValue;
          }
        }
        
        return {
          tag,
          name,
          keyword,
          value: '',
          vr,
          level: 'acquisition' as const,
          dataType,
          validationRule
        };
      } catch (error) {
        // Fallback if field lookup fails
        return {
          tag,
          name: tag,
          keyword: tag,
          value: '',
          vr: 'UN',
          level: 'acquisition' as const,
          dataType: 'string' as const,
          validationRule: { type: 'exact' as const }
        };
      }
    });
    
    const newFields = await Promise.all(newFieldsPromises);
    
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;
      
      return {
        ...acq,
        acquisitionFields: [...acq.acquisitionFields, ...newFields]
      };
    }));
  }, []);

  const updateSeries = useCallback((acquisitionId: string, seriesIndex: number, fieldTag: string, value: any) => {
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;
      
      const updatedSeries = [...(acq.series || [])];
      if (!updatedSeries[seriesIndex]) {
        updatedSeries[seriesIndex] = { name: `Series ${seriesIndex + 1}`, fields: {} };
      }
      
      updatedSeries[seriesIndex] = {
        ...updatedSeries[seriesIndex],
        fields: {
          ...updatedSeries[seriesIndex].fields,
          [fieldTag]: value
        }
      };
      
      return { ...acq, series: updatedSeries };
    }));
  }, []);

  const addSeries = useCallback((acquisitionId: string) => {
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;
      
      const currentSeries = acq.series || [];
      const newSeries: Series = {
        name: `Series ${currentSeries.length + 1}`,
        fields: {}
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
