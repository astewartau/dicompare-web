import { useState, useCallback } from 'react';
import { Acquisition, DicomField, Series } from '../types';
import { searchDicomFields, suggestDataType, suggestValidationConstraint } from '../services/dicomFieldService';

export const useAcquisitions = () => {
  const [acquisitions, setAcquisitions] = useState<Acquisition[]>([]);

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

  const updateField = useCallback((acquisitionId: string, fieldTag: string, updates: Partial<DicomField>) => {
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;

      return {
        ...acq,
        acquisitionFields: acq.acquisitionFields.map(f =>
          f.tag === fieldTag ? { ...f, ...updates } : f
        ),
        // Update series fields directly within series array
        series: acq.series?.map(s => ({
          ...s,
          fields: Array.isArray(s.fields)
            ? s.fields.map(f => f.tag === fieldTag ? { ...f, ...updates } : f)
            : []
        })),
      };
    }));
  }, []);

  const deleteField = useCallback((acquisitionId: string, fieldTag: string) => {
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;

      return {
        ...acq,
        acquisitionFields: acq.acquisitionFields.filter(f => f.tag !== fieldTag),
        series: acq.series?.map(s => ({
          ...s,
          fields: Array.isArray(s.fields)
            ? s.fields.filter(f => f.tag !== fieldTag)
            : []
        }))
      };
    }));
  }, []);

  const convertFieldLevel = useCallback((acquisitionId: string, fieldTag: string, toLevel: 'acquisition' | 'series') => {
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;

      const acquisitionField = acq.acquisitionFields.find(f => f.tag === fieldTag);
      // Find series field by searching through all series
      let seriesField = null;
      if (acq.series) {
        for (const series of acq.series) {
          if (Array.isArray(series.fields)) {
            const foundField = series.fields.find(f => f.tag === fieldTag);
            if (foundField) {
              seriesField = foundField;
              break;
            }
          }
        }
      }
      const field = acquisitionField || seriesField;

      if (!field) return acq;

      if (toLevel === 'acquisition') {
        return {
          ...acq,
          acquisitionFields: [...acq.acquisitionFields.filter(f => f.tag !== fieldTag), { ...field, level: 'acquisition' }],
          // Remove field from all series
          series: acq.series?.map(s => ({
            ...s,
            fields: Array.isArray(s.fields)
              ? s.fields.filter(f => f.tag !== fieldTag)
              : []
          }))
        };
      } else {
        // When converting to series level, ensure we have at least 2 series
        const currentSeries = acq.series || [];
        const seriesCount = Math.max(2, currentSeries.length);

        const updatedSeries = [];
        for (let i = 0; i < seriesCount; i++) {
          const existingSeries = currentSeries[i];
          const existingFields = Array.isArray(existingSeries?.fields) ? existingSeries.fields : [];

          // Remove any existing field with the same tag
          const fieldsWithoutTag = existingFields.filter(f => f.tag !== fieldTag);

          // Add the new field
          const newField = {
            name: field.name,
            tag: fieldTag,
            value: field.value,
            validationRule: field.validationRule,
          };

          updatedSeries.push({
            name: existingSeries?.name || `Series ${String(i + 1).padStart(2, '0')}`,
            fields: [...fieldsWithoutTag, newField]
          });
        }

        return {
          ...acq,
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
        const vm = fieldDef?.valueMultiplicity;
        const name = fieldDef?.name || tag;

        // Use suggestDataType to get the proper data type based on VR and VM
        const dataType = fieldDef ? suggestDataType(vr, vm) : 'string';

        // Set initial value based on data type
        let initialValue: any = '';
        if (dataType === 'list_number' || dataType === 'list_string') {
          initialValue = []; // Empty array for multi-value fields
        } else if (dataType === 'number') {
          initialValue = ''; // Keep as string for now, will be converted when user enters value
        } else if (dataType === 'json') {
          initialValue = {};
        }

        const validationRule = fieldDef ? {
          type: suggestValidationConstraint(fieldDef)
        } : { type: 'exact' as const };

        return {
          tag,
          name,
          keyword: fieldDef?.keyword,
          value: initialValue,
          vr,
          dataType, // Include the inferred data type
          level: 'acquisition' as const,
          validationRule
        };
      } catch (error) {
        // Fallback if field lookup fails
        return {
          tag,
          name: tag,
          value: '',
          vr: 'UN',
          dataType: 'string',
          level: 'acquisition' as const,
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
        updatedSeries[seriesIndex] = { name: `Series ${String(seriesIndex + 1).padStart(2, '0')}`, fields: [] };
      }

      const existingFields = Array.isArray(updatedSeries[seriesIndex].fields)
        ? updatedSeries[seriesIndex].fields
        : [];

      // Find and update existing field or add new one
      const fieldIndex = existingFields.findIndex(f => f.tag === fieldTag);
      if (fieldIndex >= 0) {
        // Update existing field
        const updatedFields = [...existingFields];
        updatedFields[fieldIndex] = { ...updatedFields[fieldIndex], value };
        updatedSeries[seriesIndex] = {
          ...updatedSeries[seriesIndex],
          fields: updatedFields
        };
      } else {
        // Add new field (this shouldn't normally happen as fields should be predefined)
        updatedSeries[seriesIndex] = {
          ...updatedSeries[seriesIndex],
          fields: [...existingFields, { name: fieldTag, tag: fieldTag, value }]
        };
      }

      return { ...acq, series: updatedSeries };
    }));
  }, []);

  const addSeries = useCallback((acquisitionId: string) => {
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;

      const currentSeries = acq.series || [];
      const newSeries: Series = {
        name: `Series ${String(currentSeries.length + 1).padStart(2, '0')}`,
        fields: []
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

  return {
    acquisitions,
    setAcquisitions,
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
    updateSeriesName
  };
};
