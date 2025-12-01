import { UnifiedSchema } from '../hooks/useSchemaService';
import { Acquisition, DicomField } from '../types';
import { inferDataTypeFromValue, processSchemaFieldForUI } from './datatypeInference';

/**
 * Converts a UnifiedSchema and specific acquisition to a full Acquisition object
 * that can be used with AcquisitionTable
 */
export const convertSchemaToAcquisition = async (
  schema: UnifiedSchema,
  acquisitionId: string,
  getSchemaContent: (schemaId: string) => Promise<string | null>
): Promise<Acquisition | null> => {
  try {
    const content = await getSchemaContent(schema.id);
    if (!content) return null;

    const schemaData = JSON.parse(content);

    // Find the specific acquisition in the schema
    const acquisitionEntries = Object.entries(schemaData.acquisitions || {});
    let acquisitionEntry;

    if (acquisitionId === '0' && acquisitionEntries.length > 0) {
      // Default to first acquisition if ID is '0'
      acquisitionEntry = acquisitionEntries[0];
    } else {
      // Try to find by acquisition ID or index
      acquisitionEntry = acquisitionEntries.find(([_, data]: [string, any]) =>
        data.id === acquisitionId
      ) || acquisitionEntries[parseInt(acquisitionId) || 0];
    }

    if (!acquisitionEntry) return null;

    const [acquisitionName, acquisitionData] = acquisitionEntry as [string, any];

    // Convert schema fields to DicomField format using proper inference
    const convertFields = (fields: any[] = [], level: 'acquisition' | 'series'): DicomField[] => {
      return fields.map(field => {
        const processedField = processSchemaFieldForUI(field);
        return {
          ...processedField,
          level, // Override level from parameter
          value: processedField.value ?? field.defaultValue ?? ''
        };
      });
    };

    // Only use actual defined fields, not fields extracted from rules
    const allFields = acquisitionData.fields || [];

    // Build unique series field definitions from all series
    const seriesFieldMap = new Map();
    if (acquisitionData.series) {
      acquisitionData.series.forEach((series: any) => {
        if (series.fields && Array.isArray(series.fields)) {
          series.fields.forEach((field: any) => {
            if (!seriesFieldMap.has(field.tag)) {
              const processedField = processSchemaFieldForUI(field);
              seriesFieldMap.set(field.tag, {
                ...processedField,
                level: 'series'
              });
            }
          });
        }
      });
    }

    // Build the acquisition object
    const acquisition: Acquisition = {
      id: `schema-${schema.id}-${acquisitionId}`,
      protocolName: acquisitionName,
      seriesDescription: acquisitionData.description || '',
      totalFiles: 0, // Schema templates don't have files
      acquisitionFields: convertFields(allFields.filter((f: any) => !f.level || f.level === 'acquisition'), 'acquisition'),
      // seriesFields removed - now embedded in series[].fields[]
      series: acquisitionData.series?.map((series: any, index: number) => ({
        name: series.name || `Series ${index + 1}`,
        fields: (series.fields || []).map((field: any) => {
          const processedField = processSchemaFieldForUI(field);
          return {
            name: processedField.name,
            tag: processedField.tag,
            value: processedField.value ?? field.defaultValue ?? '',
            validationRule: processedField.validationRule || { type: 'exact' as const }
          };
        })
      })) || [],
      validationFunctions: acquisitionData.rules || acquisitionData.validationFunctions || [],
      metadata: {
        manufacturer: schema.authors?.join(', ') || 'Schema Template',
        notes: `Template from schema: ${schema.name} v${schema.version || '1.0.0'}`,
        ...acquisitionData.metadata
      }
    };

    return acquisition;
  } catch (error) {
    console.error('Failed to convert schema to acquisition:', error);
    return null;
  }
};

/**
 * Converts all acquisitions in a schema to Acquisition objects
 */
export const convertSchemaToAcquisitions = async (
  schema: UnifiedSchema,
  getSchemaContent: (schemaId: string) => Promise<string | null>
): Promise<Acquisition[]> => {
  const acquisitions: Acquisition[] = [];

  for (const schemaAcq of schema.acquisitions) {
    const acquisition = await convertSchemaToAcquisition(schema, schemaAcq.id, getSchemaContent);
    if (acquisition) {
      acquisitions.push(acquisition);
    }
  }

  return acquisitions;
};
