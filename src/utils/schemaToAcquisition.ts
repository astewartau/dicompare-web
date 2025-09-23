import { UnifiedSchema } from '../hooks/useSchemaService';
import { Acquisition, DicomField } from '../types';

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

    // Convert schema fields to DicomField format
    const convertFields = (fields: any[] = [], level: 'acquisition' | 'series'): DicomField[] => {
      return fields.map(field => ({
        tag: field.tag || '',
        name: field.name || field.field || field.tag || '',
        keyword: field.keyword,
        value: field.value || field.defaultValue || '',
        vr: field.vr || 'CS',
        level,
        dataType: field.dataType || 'string',
        validationRule: field.validationRule || { type: 'exact' as const }
      }));
    };

    // Only use actual defined fields, not fields extracted from rules
    const allFields = acquisitionData.fields || [];

    // Build the acquisition object
    const acquisition: Acquisition = {
      id: `schema-${schema.id}-${acquisitionId}`,
      protocolName: acquisitionName,
      seriesDescription: acquisitionData.description || '',
      totalFiles: 0, // Schema templates don't have files
      acquisitionFields: convertFields(allFields.filter((f: any) => !f.level || f.level === 'acquisition'), 'acquisition'),
      seriesFields: convertFields(allFields.filter((f: any) => f.level === 'series'), 'series'),
      series: acquisitionData.series?.map((series: any, index: number) => ({
        name: series.name || `Series ${index + 1}`,
        fields: Object.fromEntries(
          (allFields.filter((f: any) => f.level === 'series') || []).map((field: any) => [
            field.tag,
            {
              value: field.value || field.defaultValue || '',
              dataType: field.dataType || 'string',
              validationRule: field.validationRule || { type: 'exact' as const }
            }
          ])
        )
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