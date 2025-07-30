import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { SchemaMetadata } from '../types/schema';
import { schemaCacheManager } from '../services/SchemaCacheManager';

interface SchemaContextValue {
  schemas: SchemaMetadata[];
  selectedSchema: SchemaMetadata | null;
  isLoading: boolean;
  error: string | null;
  
  selectSchema: (schema: SchemaMetadata | null) => void;
  uploadSchema: (file: File, metadata?: Partial<SchemaMetadata>) => Promise<SchemaMetadata>;
  deleteSchema: (id: string) => Promise<void>;
  refreshSchemas: () => Promise<void>;
  getSchemaContent: (id: string) => Promise<string | null>;
  updateSchemaMetadata: (id: string, updates: Partial<SchemaMetadata>) => Promise<void>;
  clearCache: () => Promise<void>;
  getCacheSize: () => Promise<number>;
}

const SchemaContext = createContext<SchemaContextValue | null>(null);

export const useSchemaContext = () => {
  const context = useContext(SchemaContext);
  if (!context) {
    throw new Error('useSchemaContext must be used within a SchemaProvider');
  }
  return context;
};

interface SchemaProviderProps {
  children: ReactNode;
}

export const SchemaProvider: React.FC<SchemaProviderProps> = ({ children }) => {
  const [schemas, setSchemas] = useState<SchemaMetadata[]>([]);
  const [selectedSchema, setSelectedSchema] = useState<SchemaMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectSchema = (schema: SchemaMetadata | null) => {
    setSelectedSchema(schema);
  };

  const refreshSchemas = async () => {
    try {
      setError(null);
      const schemaList = await schemaCacheManager.getAllSchemaMetadata();
      setSchemas(schemaList.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schemas');
    }
  };

  const uploadSchema = async (file: File, additionalMetadata?: Partial<SchemaMetadata>): Promise<SchemaMetadata> => {
    try {
      setError(null);
      
      const validation = await schemaCacheManager.validateSchemaFile(file);
      if (!validation.isValid) {
        throw new Error(validation.error || 'Invalid schema file');
      }

      const extractedMetadata = await schemaCacheManager.extractMetadataFromFile(file);
      const id = `schema_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const metadata: SchemaMetadata = {
        id,
        filename: extractedMetadata.filename || file.name,
        title: extractedMetadata.title || file.name.replace(/\.[^/.]+$/, ''),
        version: extractedMetadata.version || '1.0.0',
        authors: extractedMetadata.authors || [],
        uploadDate: extractedMetadata.uploadDate || new Date().toISOString(),
        fileSize: extractedMetadata.fileSize || file.size,
        format: extractedMetadata.format || 'json',
        isValid: validation.isValid,
        description: extractedMetadata.description,
        acquisitionCount: extractedMetadata.acquisitionCount,
        ...additionalMetadata,
      };

      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      });

      await schemaCacheManager.storeSchema(metadata, content);
      await refreshSchemas();
      
      return metadata;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload schema';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const deleteSchema = async (id: string) => {
    try {
      setError(null);
      await schemaCacheManager.deleteSchema(id);
      
      if (selectedSchema?.id === id) {
        setSelectedSchema(null);
      }
      
      await refreshSchemas();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete schema');
    }
  };

  const getSchemaContent = async (id: string): Promise<string | null> => {
    try {
      const schema = await schemaCacheManager.getSchema(id);
      return schema?.content || null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schema content');
      return null;
    }
  };

  const updateSchemaMetadata = async (id: string, updates: Partial<SchemaMetadata>) => {
    try {
      setError(null);
      await schemaCacheManager.updateSchemaMetadata(id, updates);
      await refreshSchemas();
      
      if (selectedSchema?.id === id) {
        setSelectedSchema(prev => prev ? { ...prev, ...updates } : null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update schema');
    }
  };

  const clearCache = async () => {
    try {
      setError(null);
      await schemaCacheManager.clearCache();
      setSchemas([]);
      setSelectedSchema(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear cache');
    }
  };

  const getCacheSize = async (): Promise<number> => {
    try {
      return await schemaCacheManager.getCacheSize();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get cache size');
      return 0;
    }
  };

  useEffect(() => {
    const initializeContext = async () => {
      setIsLoading(true);
      try {
        await schemaCacheManager.initialize();
        await refreshSchemas();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize schema cache');
      } finally {
        setIsLoading(false);
      }
    };

    initializeContext();
  }, []);

  const value: SchemaContextValue = {
    schemas,
    selectedSchema,
    isLoading,
    error,
    selectSchema,
    uploadSchema,
    deleteSchema,
    refreshSchemas,
    getSchemaContent,
    updateSchemaMetadata,
    clearCache,
    getCacheSize,
  };

  return (
    <SchemaContext.Provider value={value}>
      {children}
    </SchemaContext.Provider>
  );
};