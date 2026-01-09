import { useState, useEffect } from 'react';
import { useSchemaContext } from '../contexts/SchemaContext';
import { SchemaTemplate } from '../types/schema';
import { dicompareAPI } from '../services/DicompareAPI';

export interface SchemaAcquisition {
  id: string;
  protocolName: string;
  seriesDescription: string;
  tags?: string[];
}

export interface UnifiedSchema extends SchemaTemplate {
  acquisitions: SchemaAcquisition[];
  isMultiAcquisition: boolean;
}

export interface SchemaBinding {
  schemaId: string;
  acquisitionId?: string;
  schema: UnifiedSchema;
}

export const useSchemaService = () => {
  const { schemas: uploadedSchemas, getSchemaContent: getUploadedContent } = useSchemaContext();
  const [librarySchemas, setLibrarySchemas] = useState<SchemaTemplate[]>([]);
  const [schemaAcquisitions, setSchemaAcquisitions] = useState<Record<string, SchemaAcquisition[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Universal schema content loader
  const getSchemaContent = async (schemaId: string): Promise<string | null> => {
    // Try uploaded schemas first
    const uploadedContent = await getUploadedContent(schemaId);
    if (uploadedContent) {
      return uploadedContent;
    }

    // Try library schemas
    try {
      const response = await fetch(`/schemas/${schemaId}.json`);
      if (response.ok) {
        return await response.text();
      }
    } catch (error) {
      console.error(`Failed to load library schema ${schemaId}:`, error);
    }

    return null;
  };

  // Parse acquisitions from schema content
  const parseSchemaAcquisitions = async (schemaId: string): Promise<SchemaAcquisition[]> => {
    if (schemaAcquisitions[schemaId]) {
      return schemaAcquisitions[schemaId];
    }

    try {
      const content = await getSchemaContent(schemaId);
      if (!content) {
        return [{ id: '0', protocolName: 'Unknown', seriesDescription: 'Could not load schema' }];
      }

      const schemaData = JSON.parse(content);
      const acquisitionsData = Object.entries(schemaData.acquisitions || {}).map(([name, data]: [string, any]) => ({
        protocolName: name,
        seriesDescription: `${(data.fields || []).length} fields, ${(data.series || []).length} series`,
        ...data
      }));

      const parsed = acquisitionsData.map((acq: any, index: number) => ({
        id: index.toString(),
        protocolName: acq.protocolName,
        seriesDescription: acq.seriesDescription,
        tags: acq.tags
      }));

      // Cache the result
      setSchemaAcquisitions(prev => ({ ...prev, [schemaId]: parsed }));
      return parsed;
    } catch (error) {
      console.error(`Failed to parse acquisitions for schema ${schemaId}:`, error);
      return [{ id: '0', protocolName: 'Parse Error', seriesDescription: 'Could not parse schema' }];
    }
  };

  // Get all schemas (uploaded + library) with acquisition data
  // Note: Schema-level tags don't exist per metaschema - tags are only at acquisition level
  const getAllUnifiedSchemas = (): UnifiedSchema[] => {
    const uploadedUnified: UnifiedSchema[] = uploadedSchemas.map(schema => ({
      id: schema.id,
      name: schema.title,
      description: schema.description || '',
      category: 'Uploaded Schema',
      content: '',
      format: schema.format,
      version: schema.version,
      authors: schema.authors,
      acquisitions: schemaAcquisitions[schema.id] || [],
      isMultiAcquisition: (schemaAcquisitions[schema.id] || []).length > 1
    }));

    const libraryUnified: UnifiedSchema[] = librarySchemas.map(schema => ({
      ...schema,
      acquisitions: schemaAcquisitions[schema.id] || [],
      isMultiAcquisition: (schemaAcquisitions[schema.id] || []).length > 1
    }));

    return [...uploadedUnified, ...libraryUnified];
  };

  // Get specific schema by ID
  const getUnifiedSchema = (schemaId: string): UnifiedSchema | null => {
    return getAllUnifiedSchemas().find(s => s.id === schemaId) || null;
  };

  // Load library schemas
  const loadLibrarySchemas = async () => {
    try {
      setError(null);
      const schemas = await dicompareAPI.getExampleSchemas();
      setLibrarySchemas(schemas);
    } catch (error) {
      console.error('Failed to load library schemas:', error);
      setError('Failed to load validation schemas');
    }
  };

  // Pre-load acquisitions for all schemas
  const preloadAcquisitions = async () => {
    const allSchemas = [...uploadedSchemas, ...librarySchemas];

    for (const schema of allSchemas) {
      if (!schemaAcquisitions[schema.id]) {
        await parseSchemaAcquisitions(schema.id);
      }
    }
  };

  // Initialize on mount
  useEffect(() => {
    const initialize = async () => {
      setIsLoading(true);
      await loadLibrarySchemas();
      setIsLoading(false);
    };
    initialize();
  }, []);

  // Pre-load acquisitions when schemas change
  useEffect(() => {
    if (!isLoading && (uploadedSchemas.length > 0 || librarySchemas.length > 0)) {
      preloadAcquisitions();
    }
  }, [uploadedSchemas, librarySchemas, isLoading]);

  return {
    // Schema data
    getAllUnifiedSchemas,
    getUnifiedSchema,
    getSchemaContent,
    parseSchemaAcquisitions,

    // Schema categories
    uploadedSchemas: getAllUnifiedSchemas().filter(s => s.category === 'Uploaded Schema'),
    librarySchemas: getAllUnifiedSchemas().filter(s => s.category === 'Library'),

    // State
    isLoading,
    error,

    // Actions
    refreshLibrarySchemas: loadLibrarySchemas
  };
};