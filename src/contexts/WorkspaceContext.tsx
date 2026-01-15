import React, { createContext, useContext, useState, useCallback, ReactNode, useRef } from 'react';
import { Acquisition, DicomField, Series, SeriesField, SelectedValidationFunction, AcquisitionSelection } from '../types';
import { SchemaBinding, UnifiedSchema } from '../hooks/useSchemaService';
import { useFileProcessing } from '../hooks/useFileProcessing';
import { useWorkspaceEditing } from '../hooks/useWorkspaceEditing';
import { dicompareWorkerAPI as dicompareAPI } from '../services/DicompareWorkerAPI';
import { generateDicomsFromAcquisition } from '../utils/testDataGeneration';
import { convertSchemaToAcquisition } from '../utils/schemaToAcquisition';

// Core workspace item model
export interface WorkspaceItem {
  id: string;
  acquisition: Acquisition;
  source: 'schema' | 'data' | 'empty';  // 'empty' = created without initial content
  isEditing: boolean;

  // For data-sourced items: how should the data be used?
  // - 'schema-template': Use extracted parameters to build a schema (can edit)
  // - 'validation-subject': Validate this data against a schema (attach schema)
  dataUsageMode?: 'schema-template' | 'validation-subject';

  // For compliance - one of these may be set
  attachedData?: Acquisition;         // Real DICOM data (when item has schema)
  attachedSchema?: SchemaBinding;     // Schema to validate against (when item has data)

  // Does this item have a user-created schema? (for empty items that got a schema created)
  hasCreatedSchema?: boolean;

  // Track origin for schema-sourced items
  schemaOrigin?: {
    schemaId: string;
    acquisitionIndex: number;
    schemaName: string;
    acquisitionName: string;
  };
}

// Schema metadata for export
export interface SchemaMetadata {
  name: string;
  description: string;
  authors: string[];
  version: string;
  tags?: string[];
}

// Processing progress
export interface ProcessingProgress {
  currentFile: number;
  totalFiles: number;
  currentOperation: string;
  percentage: number;
}

// Pending attachment selection (when multiple acquisitions found)
export interface PendingAttachmentSelection {
  targetItemId: string;
  acquisitions: Acquisition[];
}

interface WorkspaceContextType {
  // State
  items: WorkspaceItem[];
  selectedId: string | null;
  schemaMetadata: SchemaMetadata;
  isProcessing: boolean;
  processingTarget: 'schema' | 'data' | 'addNew' | null;  // Which zone is processing
  processingProgress: ProcessingProgress | null;
  processingError: string | null;
  pendingAttachmentSelection: PendingAttachmentSelection | null;

  // Add items
  addFromSchema: (selections: AcquisitionSelection[], getSchemaContent: (id: string) => Promise<string | null>, getUnifiedSchema: (id: string) => UnifiedSchema | null) => Promise<void>;
  addFromData: (files: FileList, mode?: 'schema-template' | 'validation-subject') => Promise<void>;
  addFromScratch: () => string;
  addEmpty: () => string;  // Create truly empty item (no schema, no data)

  // Schema management for empty items
  createSchemaForItem: (id: string) => void;  // Create empty schema for an item
  detachCreatedSchema: (id: string) => void;  // Remove created schema from item

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
  uploadSchemaForItem: (id: string, files: FileList) => Promise<void>;  // Upload DICOMs to build schema for existing item
  detachData: (id: string) => void;
  detachSchema: (id: string) => void;
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

  // Schema metadata
  setSchemaMetadata: (metadata: SchemaMetadata) => void;

  // Export
  getSchemaExport: () => { acquisitions: Acquisition[]; metadata: SchemaMetadata };

  // Helpers
  getSchemaAcquisition: (binding: SchemaBinding, getSchemaContent: (id: string) => Promise<string | null>) => Promise<Acquisition | null>;

  // Load entire schema for editing
  loadSchema: (schemaId: string, getSchemaContent: (id: string) => Promise<string | null>, getUnifiedSchema: (id: string) => UnifiedSchema | null) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

interface WorkspaceProviderProps {
  children: ReactNode;
}

// Default schema metadata
const DEFAULT_SCHEMA_METADATA: SchemaMetadata = {
  name: '',
  description: '',
  authors: [],
  version: '1.0',
};

export const WorkspaceProvider: React.FC<WorkspaceProviderProps> = ({ children }) => {
  const [items, setItems] = useState<WorkspaceItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [schemaMetadata, setSchemaMetadata] = useState<SchemaMetadata>(DEFAULT_SCHEMA_METADATA);
  const [pendingAttachmentSelection, setPendingAttachmentSelection] = useState<PendingAttachmentSelection | null>(null);

  // Use file processing hook for all file operations
  const {
    isProcessing,
    processingTarget,
    processingProgress,
    processingError,
    processFiles,
  } = useFileProcessing();

  // Cache for schema acquisitions
  const schemaAcquisitionsRef = useRef<Map<string, Acquisition>>(new Map());

  // Use editing hook for field/series/validation mutations
  const editing = useWorkspaceEditing(setItems);

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

      // Convert schema to acquisition
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
    // Do NOT auto-select - let user stay on "From schema" tab to continue adding
  }, []);

  // Add items from DICOM files or protocol files
  const addFromData = useCallback(async (files: FileList, mode: 'schema-template' | 'validation-subject' = 'schema-template') => {
    const newAcquisitions = await processFiles(files, 'addNew');

    const newItems: WorkspaceItem[] = newAcquisitions.map((acq, idx) => ({
      id: `ws_${Date.now()}_${acq.id || idx}`,
      acquisition: acq,
      source: 'data' as const,
      isEditing: false,
      dataUsageMode: mode
    }));

    setItems(prev => [...prev, ...newItems]);

    // Auto-select the first new item
    if (newItems.length > 0) {
      setSelectedId(newItems[0].id);
    }
  }, [processFiles]);

  // Add a new empty acquisition from scratch (treated as a schema entry)
  const addFromScratch = useCallback((): string => {
    const newId = `ws_${Date.now()}_scratch`;
    const newAcquisition: Acquisition = {
      id: newId,
      protocolName: 'New Acquisition',
      seriesDescription: '',
      totalFiles: 0,
      acquisitionFields: [],
      series: [],
      metadata: {}
    };

    const newItem: WorkspaceItem = {
      id: newId,
      acquisition: newAcquisition,
      source: 'schema',  // Treated as schema - can only attach data for validation
      isEditing: true
    };

    setItems(prev => [...prev, newItem]);
    setSelectedId(newId);
    return newId;
  }, []);

  // Add a truly empty item (no schema, no data)
  const addEmpty = useCallback((): string => {
    const newId = `ws_${Date.now()}_empty`;
    const emptyAcquisition: Acquisition = {
      id: newId,
      protocolName: '',
      seriesDescription: '',
      totalFiles: 0,
      acquisitionFields: [],
      series: [],
      metadata: {}
    };

    const newItem: WorkspaceItem = {
      id: newId,
      acquisition: emptyAcquisition,
      source: 'empty',
      isEditing: false
    };

    setItems(prev => [...prev, newItem]);
    setSelectedId(newId);
    return newId;
  }, []);

  // Create empty schema for an empty item (user clicked "Blank" on schema side)
  const createSchemaForItem = useCallback((id: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;

      return {
        ...item,
        hasCreatedSchema: true,
        attachedSchema: undefined,  // Clear any attached schema
        isEditing: false,  // Don't start in edit mode
        acquisition: {
          ...item.acquisition,
          protocolName: item.acquisition.protocolName || 'New Acquisition',
        }
      };
    }));
  }, []);

  // Remove created schema from an item (detach the schema side, preserves attachedData)
  const detachCreatedSchema = useCallback((id: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;

      return {
        ...item,
        hasCreatedSchema: false,
        isEditing: false,
        schemaOrigin: undefined,
        // Note: attachedData is preserved, attachedSchema should already be undefined
        // since hasCreatedSchema and attachedSchema are mutually exclusive
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
      };
    }));
  }, []);

  // Select an item
  const selectItem = useCallback((id: string | null) => {
    setSelectedId(id);
  }, []);

  // Remove an item
  const removeItem = useCallback((id: string) => {
    setItems(prev => {
      const index = prev.findIndex(item => item.id === id);
      const newItems = prev.filter(item => item.id !== id);

      // If the removed item was selected, select another item
      if (selectedId === id && newItems.length > 0) {
        // Select the item at the same index, or the last item if we removed the last one
        const newIndex = Math.min(index, newItems.length - 1);
        setSelectedId(newItems[newIndex].id);
      } else if (selectedId === id) {
        // No items left, keep selection as is (will show Add New)
        setSelectedId(null);
      }

      return newItems;
    });
  }, [selectedId]);

  // Reorder items
  const reorderItems = useCallback((fromIndex: number, toIndex: number) => {
    setItems(prev => {
      const newItems = [...prev];
      const [removed] = newItems.splice(fromIndex, 1);
      newItems.splice(toIndex, 0, removed);
      return newItems;
    });
  }, []);

  // Clear all items
  const clearAll = useCallback(async () => {
    setItems([]);
    setSelectedId(null);
    setSchemaMetadata(DEFAULT_SCHEMA_METADATA);
    schemaAcquisitionsRef.current = new Map();
    try {
      await dicompareAPI.clearSessionCache();
    } catch (error) {
      console.error('Failed to clear session cache:', error);
    }
  }, []);

  // Toggle editing mode for an item
  const toggleEditing = useCallback((id: string) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, isEditing: !item.isEditing } : item
    ));
  }, []);

  // Set editing mode explicitly
  const setItemEditing = useCallback((id: string, isEditing: boolean) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, isEditing } : item
    ));
  }, []);

  // Set data usage mode for data-sourced items
  const setDataUsageMode = useCallback((id: string, mode: 'schema-template' | 'validation-subject') => {
    setItems(prev => prev.map(item => {
      if (item.id !== id || item.source !== 'data') return item;

      // When switching to validation-subject mode, exit editing (can't edit in this mode)
      // When switching to schema-template mode, keep current edit state
      const newIsEditing = mode === 'validation-subject' ? false : item.isEditing;

      return { ...item, dataUsageMode: mode, isEditing: newIsEditing };
    }));
  }, []);

  // Attach data to a schema-sourced item
  const attachData = useCallback(async (id: string, files: FileList) => {
    // Process files using the shared hook
    const allAcquisitions = await processFiles(files, 'data');

    // Handle the results
    if (allAcquisitions.length === 1) {
      // Single acquisition - attach directly
      setItems(prev => prev.map(item =>
        item.id === id ? { ...item, attachedData: allAcquisitions[0] } : item
      ));
    } else if (allAcquisitions.length > 1) {
      // Multiple acquisitions - prompt user to select
      setPendingAttachmentSelection({
        targetItemId: id,
        acquisitions: allAcquisitions
      });
    }
  }, [processFiles]);

  // Attach schema to an item (clears hasCreatedSchema if set)
  const attachSchema = useCallback((id: string, binding: SchemaBinding) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;

      // When attaching a schema to an empty item, update the acquisition name and tags from the schema
      let updatedAcquisition = item.acquisition;
      if (item.source === 'empty') {
        // Find the acquisition in the schema to get tags
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
  }, []);

  // Upload files to build a schema for an existing item (preserves attachedData)
  const uploadSchemaForItem = useCallback(async (id: string, files: FileList) => {
    const newAcquisitions = await processFiles(files, 'schema');

    // Use the first acquisition to set up the schema on this item
    if (newAcquisitions.length > 0) {
      const schemaAcquisition = newAcquisitions[0];
      setItems(prev => prev.map(item => {
        if (item.id !== id) return item;
        return {
          ...item,
          source: 'data' as const,
          dataUsageMode: 'schema-template' as const,
          hasCreatedSchema: false,
          attachedSchema: undefined,
          isEditing: false,
          acquisition: schemaAcquisition,
          // Preserve attachedData!
          attachedData: item.attachedData
        };
      }));
    }
  }, [processFiles]);

  // Detach data
  const detachData = useCallback((id: string) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, attachedData: undefined } : item
    ));
  }, []);

  // Detach schema (handles all item types, preserves attachedData)
  const detachSchema = useCallback((id: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;

      // For schema-sourced items, convert to empty item (preserving any attached data)
      if (item.source === 'schema') {
        return {
          ...item,
          source: 'empty' as const,
          schemaOrigin: undefined,
          attachedSchema: undefined,
          hasCreatedSchema: false,
          isEditing: false,
          acquisition: {
            id: item.id,
            protocolName: '',
            seriesDescription: '',
            totalFiles: 0,
            acquisitionFields: [],
            series: [],
            metadata: {}
          },
          // Keep the attached data if present
          attachedData: item.attachedData
        };
      }

      // For data-sourced items used as schema template, convert to empty (with or without attached data)
      if (item.source === 'data' && item.dataUsageMode !== 'validation-subject') {
        return {
          ...item,
          source: 'empty' as const,
          dataUsageMode: undefined,
          attachedSchema: undefined,
          hasCreatedSchema: false,
          isEditing: false,
          acquisition: {
            id: item.id,
            protocolName: '',
            seriesDescription: '',
            totalFiles: 0,
            acquisitionFields: [],
            series: [],
            metadata: {}
          },
          // Keep any attached data if present
          attachedData: item.attachedData
        };
      }

      // For empty items with attached schema, reset acquisition properties
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

      // For other items, just clear attachedSchema and preserve attachedData
      return {
        ...item,
        attachedSchema: undefined,
        attachedData: item.attachedData
      };
    }));
  }, []);

  // Confirm attachment selection (when multiple acquisitions were found)
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
  }, [pendingAttachmentSelection]);

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

    setIsProcessing(true);
    setProcessingTarget('data');
    setProcessingError(null);
    setProcessingProgress({
      currentFile: 0,
      totalFiles: 1,
      currentOperation: 'Generating test data...',
      percentage: 0
    });

    try {
      const dicomFiles = await generateDicomsFromAcquisition(item.acquisition, (message, pct) => {
        setProcessingProgress(prev => ({
          ...prev!,
          currentOperation: message,
          percentage: pct
        }));
      });

      // Process generated DICOMs
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
      setProcessingError(error instanceof Error ? error.message : 'Unknown error occurred');
    }

    setIsProcessing(false);
    setProcessingTarget(null);
    setProcessingProgress(null);
  }, [items]);

  // Destructure editing functions from hook
  const {
    updateAcquisition,
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
    deleteValidationFunction,
  } = editing;

  // Get acquisitions for schema export
  const getSchemaExport = useCallback(() => {
    const acquisitions = items.map(item => item.acquisition);
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

    // Clear existing items first
    setItems([]);
    setSelectedId(null);
    schemaAcquisitionsRef.current = new Map();
    try {
      await dicompareAPI.clearSessionCache();
    } catch (error) {
      console.error('Failed to clear session cache:', error);
    }

    // Load schema metadata
    setSchemaMetadata({
      name: schema.name || '',
      description: schema.description || '',
      authors: schema.authors || [],
      version: schema.version || '1.0',
    });

    // Convert all acquisitions
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

    // Select first item if any
    if (newItems.length > 0) {
      setSelectedId(newItems[0].id);
    }
  }, []);

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
    confirmAttachmentSelection,
    cancelAttachmentSelection,
    generateTestData,
    updateAcquisition,
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
    deleteValidationFunction,
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
