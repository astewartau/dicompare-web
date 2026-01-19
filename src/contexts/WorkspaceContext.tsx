import React, { createContext, useContext, useCallback, ReactNode, useRef, useState } from 'react';
import { Acquisition, DicomField, Series, SeriesField, SelectedValidationFunction, AcquisitionSelection } from '../types';
import { SchemaBinding, UnifiedSchema } from '../hooks/useSchemaService';
import { dicompareWorkerAPI as dicompareAPI } from '../services/DicompareWorkerAPI';
import { generateDicomsFromAcquisition } from '../utils/testDataGeneration';
import { convertSchemaToAcquisition } from '../utils/schemaToAcquisition';
import { createEmptyAcquisition } from '../utils/workspaceHelpers';
import { processUploadedFiles } from '../utils/fileUploadUtils';

// Import from new contexts
import { useProcessing } from './ProcessingContext';
import { useSchemaMetadata } from './SchemaMetadataContext';
import { useItemManagement } from './ItemManagementContext';
import { useSchemaEditing } from './SchemaEditingContext';

// Re-export types from workspace/types.ts for backwards compatibility
export type {
  WorkspaceItem,
  SchemaMetadata,
  ProcessingProgress,
  PendingAttachmentSelection,
} from './workspace/types';

import {
  WorkspaceItem,
  SchemaMetadata,
  ProcessingProgress,
  PendingAttachmentSelection,
  DEFAULT_SCHEMA_METADATA,
} from './workspace/types';

interface WorkspaceContextType {
  // State
  items: WorkspaceItem[];
  selectedId: string | null;
  schemaMetadata: SchemaMetadata;
  isProcessing: boolean;
  processingTarget: 'schema' | 'data' | 'addNew' | null;
  processingProgress: ProcessingProgress | null;
  processingError: string | null;
  pendingAttachmentSelection: PendingAttachmentSelection | null;

  // Add items
  addFromSchema: (selections: AcquisitionSelection[], getSchemaContent: (id: string) => Promise<string | null>, getUnifiedSchema: (id: string) => UnifiedSchema | null) => Promise<void>;
  addFromData: (files: FileList, mode?: 'schema-template' | 'validation-subject') => Promise<void>;
  addFromScratch: () => string;
  addEmpty: () => string;

  // Schema management for empty items
  createSchemaForItem: (id: string) => void;
  detachCreatedSchema: (id: string) => void;

  // Item management
  selectItem: (id: string | null) => void;
  removeItem: (id: string) => void;
  reorderItems: (fromIndex: number, toIndex: number) => void;
  clearAll: () => Promise<void>;

  // Edit mode
  toggleEditing: (id: string) => void;
  setItemEditing: (id: string, isEditing: boolean) => void;

  // Data usage mode (for data-sourced items)
  setDataUsageMode: (id: string, mode: 'schema-template' | 'validation-subject') => void;

  // Attachments
  attachData: (id: string, files: FileList) => Promise<void>;
  attachSchema: (id: string, binding: SchemaBinding) => void;
  uploadSchemaForItem: (id: string, files: FileList) => Promise<void>;
  detachData: (id: string) => void;
  detachSchema: (id: string) => void;
  detachValidationData: (id: string) => void;
  generateTestData: (id: string, getSchemaContent: (id: string) => Promise<string | null>) => Promise<void>;

  // Attachment selection (when multiple acquisitions found)
  confirmAttachmentSelection: (acquisitionIndex: number) => void;
  cancelAttachmentSelection: () => void;

  // Acquisition editing (when isEditing=true)
  updateAcquisition: (id: string, updates: Partial<Acquisition>) => void;
  updateField: (id: string, fieldTag: string, updates: Partial<DicomField>) => void;
  deleteField: (id: string, fieldTag: string) => void;
  convertFieldLevel: (id: string, fieldTag: string, toLevel: 'acquisition' | 'series', mode?: 'separate-series' | 'single-series') => void;
  addFields: (id: string, fieldTags: string[]) => Promise<void>;
  updateSeries: (id: string, seriesIndex: number, fieldTag: string, updates: Partial<SeriesField>) => void;
  addSeries: (id: string) => void;
  deleteSeries: (id: string, seriesIndex: number) => void;
  updateSeriesName: (id: string, seriesIndex: number, name: string) => void;
  addValidationFunction: (id: string, func: SelectedValidationFunction) => void;
  updateValidationFunction: (id: string, index: number, func: SelectedValidationFunction) => void;
  deleteValidationFunction: (id: string, index: number) => void;

  // Test data notes (for print report only)
  updateTestDataNotes: (id: string, notes: string) => void;

  // Schema metadata
  setSchemaMetadata: (metadata: SchemaMetadata) => void;

  // Export
  getSchemaExport: (getSchemaContent: (id: string) => Promise<string | null>) => Promise<{ acquisitions: Acquisition[]; metadata: SchemaMetadata }>;

  // Helpers
  getSchemaAcquisition: (binding: SchemaBinding, getSchemaContent: (id: string) => Promise<string | null>) => Promise<Acquisition | null>;

  // Load entire schema for editing
  loadSchema: (schemaId: string, getSchemaContent: (id: string) => Promise<string | null>, getUnifiedSchema: (id: string) => UnifiedSchema | null) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

interface WorkspaceProviderProps {
  children: ReactNode;
}

export const WorkspaceProvider: React.FC<WorkspaceProviderProps> = ({ children }) => {
  // Consume the new contexts
  const { isProcessing, processingTarget, processingProgress, processingError, processFiles } = useProcessing();
  const { schemaMetadata, setSchemaMetadata, resetMetadata } = useSchemaMetadata();
  const { items, selectedId, setItems, selectItem, removeItem, reorderItems, clearItems } = useItemManagement();
  const editing = useSchemaEditing();

  // Local state for attachment selection modal
  const [pendingAttachmentSelection, setPendingAttachmentSelection] = useState<PendingAttachmentSelection | null>(null);

  // Cache for schema acquisitions
  const schemaAcquisitionsRef = useRef<Map<string, Acquisition>>(new Map());

  // Helper to get or load schema acquisition
  const getSchemaAcquisition = useCallback(async (
    binding: SchemaBinding,
    getSchemaContent: (id: string) => Promise<string | null>
  ): Promise<Acquisition | null> => {
    const key = `${binding.schemaId}-${binding.acquisitionId || 'default'}`;

    if (schemaAcquisitionsRef.current.has(key)) {
      return schemaAcquisitionsRef.current.get(key)!;
    }

    try {
      const acquisition = await convertSchemaToAcquisition(
        binding.schema,
        binding.acquisitionId || '0',
        getSchemaContent
      );
      if (acquisition) {
        schemaAcquisitionsRef.current.set(key, acquisition);
      }
      return acquisition;
    } catch (error) {
      console.error('Failed to get schema acquisition:', error);
      return null;
    }
  }, []);

  // Helper to check if an item is completely empty and should be auto-removed
  const isItemCompletelyEmpty = useCallback((item: WorkspaceItem): boolean => {
    return (
      item.source === 'empty' &&
      !item.hasCreatedSchema &&
      !item.attachedSchema &&
      !item.attachedData
    );
  }, []);

  // Helper to update an item and auto-remove if it becomes empty
  const updateItemWithCleanup = useCallback((
    id: string,
    updateFn: (item: WorkspaceItem) => WorkspaceItem
  ) => {
    setItems(prev => {
      const updated = prev.map(item => item.id === id ? updateFn(item) : item);
      const targetItem = updated.find(item => item.id === id);
      const shouldRemove = targetItem && isItemCompletelyEmpty(targetItem);

      if (shouldRemove) {
        if (selectedId === id) {
          selectItem('__add_from_data__');
        }
        return updated.filter(item => item.id !== id);
      }
      return updated;
    });
  }, [isItemCompletelyEmpty, selectedId, setItems, selectItem]);

  // Add items from schema selections
  const addFromSchema = useCallback(async (
    selections: AcquisitionSelection[],
    getSchemaContent: (id: string) => Promise<string | null>,
    getUnifiedSchema: (id: string) => UnifiedSchema | null
  ) => {
    const newItems: WorkspaceItem[] = [];

    for (const selection of selections) {
      const schema = getUnifiedSchema(selection.schemaId);
      if (!schema) continue;

      const acquisition = await convertSchemaToAcquisition(
        schema,
        selection.acquisitionIndex.toString(),
        getSchemaContent
      );

      if (acquisition) {
        newItems.push({
          id: `ws_${Date.now()}_${selection.acquisitionIndex}`,
          acquisition,
          source: 'schema',
          isEditing: false,
          schemaOrigin: {
            schemaId: selection.schemaId,
            acquisitionIndex: selection.acquisitionIndex,
            schemaName: selection.schemaName,
            acquisitionName: selection.acquisitionName
          }
        });
      }
    }

    setItems(prev => [...prev, ...newItems]);
  }, [setItems]);

  // Add items from DICOM files or protocol files
  const addFromData = useCallback(async (files: FileList, mode: 'schema-template' | 'validation-subject' = 'schema-template') => {
    const target = mode === 'validation-subject' ? 'data' : 'schema';
    const newAcquisitions = await processFiles(files, target);

    const newItems: WorkspaceItem[] = newAcquisitions.map((acq, idx) => ({
      id: `ws_${Date.now()}_${acq.id || idx}`,
      acquisition: acq,
      source: 'data' as const,
      isEditing: false,
      dataUsageMode: mode
    }));

    setItems(prev => [...prev, ...newItems]);

    if (newItems.length > 0) {
      selectItem(newItems[0].id);
    }
  }, [processFiles, setItems, selectItem]);

  // Add a new empty acquisition from scratch
  const addFromScratch = useCallback((): string => {
    const newId = `ws_${Date.now()}_scratch`;
    const newItem: WorkspaceItem = {
      id: newId,
      acquisition: createEmptyAcquisition(newId, 'New Acquisition'),
      source: 'schema',
      isEditing: true
    };

    setItems(prev => [...prev, newItem]);
    selectItem(newId);
    return newId;
  }, [setItems, selectItem]);

  // Add a truly empty item
  const addEmpty = useCallback((): string => {
    const newId = `ws_${Date.now()}_empty`;
    const newItem: WorkspaceItem = {
      id: newId,
      acquisition: createEmptyAcquisition(newId),
      source: 'empty',
      isEditing: false
    };

    setItems(prev => [...prev, newItem]);
    selectItem(newId);
    return newId;
  }, [setItems, selectItem]);

  // Create empty schema for an empty item
  const createSchemaForItem = useCallback((id: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;

      return {
        ...item,
        hasCreatedSchema: true,
        attachedSchema: undefined,
        isEditing: true,
        acquisition: {
          ...item.acquisition,
          protocolName: item.acquisition.protocolName || 'New Acquisition',
        }
      };
    }));
  }, [setItems]);

  // Remove created schema from an item
  const detachCreatedSchema = useCallback((id: string) => {
    updateItemWithCleanup(id, item => ({
      ...item,
      hasCreatedSchema: false,
      isEditing: false,
      schemaOrigin: undefined,
      acquisition: {
        ...item.acquisition,
        protocolName: '',
        seriesDescription: '',
        acquisitionFields: [],
        series: [],
        validationFunctions: [],
        detailedDescription: undefined,
        tags: undefined
      }
    }));
  }, [updateItemWithCleanup]);

  // Clear all items
  const clearAll = useCallback(async () => {
    clearItems();
    resetMetadata();
    schemaAcquisitionsRef.current = new Map();
    try {
      await dicompareAPI.clearSessionCache();
    } catch (error) {
      console.error('Failed to clear session cache:', error);
    }
  }, [clearItems, resetMetadata]);

  // Toggle editing mode for an item
  const toggleEditing = useCallback((id: string) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, isEditing: !item.isEditing } : item
    ));
  }, [setItems]);

  // Set editing mode explicitly
  const setItemEditing = useCallback((id: string, isEditing: boolean) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, isEditing } : item
    ));
  }, [setItems]);

  // Set data usage mode for data-sourced items
  const setDataUsageMode = useCallback((id: string, mode: 'schema-template' | 'validation-subject') => {
    setItems(prev => prev.map(item => {
      if (item.id !== id || item.source !== 'data') return item;

      const newIsEditing = mode === 'validation-subject' ? false : item.isEditing;
      return { ...item, dataUsageMode: mode, isEditing: newIsEditing };
    }));
  }, [setItems]);

  // Attach data to a schema-sourced item
  const attachData = useCallback(async (id: string, files: FileList) => {
    const allAcquisitions = await processFiles(files, 'data');

    if (allAcquisitions.length === 1) {
      setItems(prev => prev.map(item =>
        item.id === id ? { ...item, attachedData: allAcquisitions[0] } : item
      ));
    } else if (allAcquisitions.length > 1) {
      setPendingAttachmentSelection({
        targetItemId: id,
        acquisitions: allAcquisitions
      });
    }
  }, [processFiles, setItems]);

  // Attach schema to an item
  const attachSchema = useCallback((id: string, binding: SchemaBinding) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;

      let updatedAcquisition = item.acquisition;
      if (item.source === 'empty') {
        const acquisitionIndex = binding.acquisitionId ? parseInt(binding.acquisitionId) : 0;
        const schemaAcquisition = binding.schema.acquisitions?.[acquisitionIndex];

        updatedAcquisition = {
          ...item.acquisition,
          protocolName: binding.acquisitionName || item.acquisition.protocolName,
          seriesDescription: schemaAcquisition?.seriesDescription || item.acquisition.seriesDescription || '',
          tags: schemaAcquisition?.tags || item.acquisition.tags
        };
      }

      return {
        ...item,
        attachedSchema: binding,
        hasCreatedSchema: false,
        acquisition: updatedAcquisition
      };
    }));
  }, [setItems]);

  // Upload files to build a schema for an existing item
  const uploadSchemaForItem = useCallback(async (id: string, files: FileList) => {
    const newAcquisitions = await processFiles(files, 'schema');

    if (newAcquisitions.length > 0) {
      const schemaAcquisition = newAcquisitions[0];
      setItems(prev => prev.map(item => {
        if (item.id !== id) return item;

        const preservedData = item.dataUsageMode === 'validation-subject'
          ? item.acquisition
          : item.attachedData;

        return {
          ...item,
          source: 'data' as const,
          dataUsageMode: 'schema-template' as const,
          hasCreatedSchema: false,
          attachedSchema: undefined,
          isEditing: false,
          acquisition: schemaAcquisition,
          attachedData: preservedData
        };
      }));
    }
  }, [processFiles, setItems]);

  // Detach data
  const detachData = useCallback((id: string) => {
    updateItemWithCleanup(id, item => ({ ...item, attachedData: undefined }));
  }, [updateItemWithCleanup]);

  // Detach validation data
  const detachValidationData = useCallback((id: string) => {
    updateItemWithCleanup(id, item => {
      if (item.source !== 'data' || item.dataUsageMode !== 'validation-subject') return item;

      return {
        ...item,
        source: 'empty' as const,
        dataUsageMode: undefined,
        acquisition: createEmptyAcquisition(
          item.id,
          item.attachedSchema ? (item.acquisition.protocolName || '') : ''
        ),
        attachedSchema: item.attachedSchema
      } as WorkspaceItem;
    });
  }, [updateItemWithCleanup]);

  // Detach schema
  const detachSchema = useCallback((id: string) => {
    updateItemWithCleanup(id, item => {
      if (item.source === 'schema') {
        return {
          ...item,
          source: 'empty' as const,
          schemaOrigin: undefined,
          attachedSchema: undefined,
          hasCreatedSchema: false,
          isEditing: false,
          acquisition: createEmptyAcquisition(item.id),
          attachedData: item.attachedData
        };
      }
      if (item.source === 'data' && item.dataUsageMode !== 'validation-subject') {
        return {
          ...item,
          source: 'empty' as const,
          dataUsageMode: undefined,
          attachedSchema: undefined,
          hasCreatedSchema: false,
          isEditing: false,
          acquisition: createEmptyAcquisition(item.id),
          attachedData: item.attachedData
        };
      }
      if (item.source === 'empty' && item.attachedSchema) {
        return {
          ...item,
          attachedSchema: undefined,
          acquisition: {
            ...item.acquisition,
            protocolName: '',
            seriesDescription: '',
            tags: undefined
          },
          attachedData: item.attachedData
        };
      }
      return {
        ...item,
        attachedSchema: undefined,
        attachedData: item.attachedData
      };
    });
  }, [updateItemWithCleanup]);

  // Confirm attachment selection
  const confirmAttachmentSelection = useCallback((acquisitionIndex: number) => {
    if (!pendingAttachmentSelection) return;

    const { targetItemId, acquisitions } = pendingAttachmentSelection;
    const selectedAcquisition = acquisitions[acquisitionIndex];

    if (selectedAcquisition) {
      setItems(prev => prev.map(item =>
        item.id === targetItemId ? { ...item, attachedData: selectedAcquisition } : item
      ));
    }

    setPendingAttachmentSelection(null);
  }, [pendingAttachmentSelection, setItems]);

  // Cancel attachment selection
  const cancelAttachmentSelection = useCallback(() => {
    setPendingAttachmentSelection(null);
  }, []);

  // Generate test data for a schema-sourced item
  const generateTestData = useCallback(async (
    id: string,
    getSchemaContent: (id: string) => Promise<string | null>
  ) => {
    const item = items.find(i => i.id === id);
    if (!item || !item.schemaOrigin) return;

    try {
      const dicomFiles = await generateDicomsFromAcquisition(item.acquisition, () => {});

      const fileList = new DataTransfer();
      dicomFiles.forEach(file => fileList.items.add(file));

      const fileObjects = await processUploadedFiles(fileList.files, {});
      const result = await dicompareAPI.analyzeFilesForUI(fileObjects, () => {});

      if (result && result.length > 0) {
        setItems(prev => prev.map(item =>
          item.id === id ? { ...item, attachedData: result[0] } : item
        ));
      }
    } catch (error) {
      console.error('Failed to generate test data:', error);
    }
  }, [items, setItems]);

  // Get acquisitions for schema export
  const getSchemaExport = useCallback(async (getSchemaContent: (id: string) => Promise<string | null>) => {
    const acquisitions: Acquisition[] = [];

    for (const item of items) {
      const hasSchemaContent =
        item.attachedSchema ||
        item.hasCreatedSchema ||
        item.source === 'schema' ||
        (item.source === 'data' && item.dataUsageMode !== 'validation-subject');

      if (!hasSchemaContent) {
        continue;
      }

      if (item.attachedSchema) {
        const schemaAcq = await convertSchemaToAcquisition(
          item.attachedSchema.schema,
          item.attachedSchema.acquisitionId || '0',
          getSchemaContent
        );
        if (schemaAcq) {
          acquisitions.push({
            ...schemaAcq,
            protocolName: item.acquisition.protocolName || schemaAcq.protocolName,
            seriesDescription: item.acquisition.seriesDescription || schemaAcq.seriesDescription,
            tags: item.acquisition.tags || schemaAcq.tags,
          });
        }
      } else {
        acquisitions.push(item.acquisition);
      }
    }

    return { acquisitions, metadata: schemaMetadata };
  }, [items, schemaMetadata]);

  // Load entire schema for editing
  const loadSchema = useCallback(async (
    schemaId: string,
    getSchemaContent: (id: string) => Promise<string | null>,
    getUnifiedSchema: (id: string) => UnifiedSchema | null
  ) => {
    const schema = getUnifiedSchema(schemaId);
    if (!schema) {
      console.error('Schema not found:', schemaId);
      return;
    }

    clearItems();
    schemaAcquisitionsRef.current = new Map();
    try {
      await dicompareAPI.clearSessionCache();
    } catch (error) {
      console.error('Failed to clear session cache:', error);
    }

    setSchemaMetadata({
      name: schema.name || '',
      description: schema.description || '',
      authors: schema.authors || [],
      version: schema.version || '1.0',
    });

    const acquisitionCount = schema.acquisitions?.length || 1;
    const newItems: WorkspaceItem[] = [];

    for (let i = 0; i < acquisitionCount; i++) {
      const acquisition = await convertSchemaToAcquisition(schema, i.toString(), getSchemaContent);
      if (acquisition) {
        newItems.push({
          id: `ws_${Date.now()}_${i}`,
          acquisition,
          source: 'schema',
          isEditing: false,
          schemaOrigin: {
            schemaId: schema.id,
            acquisitionIndex: i,
            schemaName: schema.name,
            acquisitionName: acquisition.protocolName
          }
        });
      }
    }

    setItems(newItems);

    if (newItems.length > 0) {
      selectItem(newItems[0].id);
    }
  }, [clearItems, setItems, selectItem, setSchemaMetadata]);

  const value: WorkspaceContextType = {
    items,
    selectedId,
    schemaMetadata,
    isProcessing,
    processingTarget,
    processingProgress,
    processingError,
    pendingAttachmentSelection,
    addFromSchema,
    addFromData,
    addFromScratch,
    addEmpty,
    createSchemaForItem,
    detachCreatedSchema,
    selectItem,
    removeItem,
    reorderItems,
    clearAll,
    toggleEditing,
    setItemEditing,
    setDataUsageMode,
    attachData,
    attachSchema,
    uploadSchemaForItem,
    detachData,
    detachSchema,
    detachValidationData,
    confirmAttachmentSelection,
    cancelAttachmentSelection,
    generateTestData,
    // From SchemaEditingContext
    updateAcquisition: editing.updateAcquisition,
    updateField: editing.updateField,
    deleteField: editing.deleteField,
    convertFieldLevel: editing.convertFieldLevel,
    addFields: editing.addFields,
    updateSeries: editing.updateSeries,
    addSeries: editing.addSeries,
    deleteSeries: editing.deleteSeries,
    updateSeriesName: editing.updateSeriesName,
    addValidationFunction: editing.addValidationFunction,
    updateValidationFunction: editing.updateValidationFunction,
    deleteValidationFunction: editing.deleteValidationFunction,
    updateTestDataNotes: editing.updateTestDataNotes,
    setSchemaMetadata,
    getSchemaExport,
    getSchemaAcquisition,
    loadSchema
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = (): WorkspaceContextType => {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};
