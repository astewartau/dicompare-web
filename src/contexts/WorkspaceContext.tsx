import React, { createContext, useContext, useState, useCallback, ReactNode, useRef } from 'react';
import { Acquisition, DicomField, Series, SeriesField, SelectedValidationFunction, AcquisitionSelection } from '../types';
import { SchemaBinding, UnifiedSchema } from '../hooks/useSchemaService';
import { searchDicomFields, suggestDataType, suggestValidationConstraint, isValidDicomTag } from '../services/dicomFieldService';
import { convertValueToDataType, inferDataTypeFromValue } from '../utils/datatypeInference';
import { getSuggestedToleranceValue } from '../utils/vrMapping';
import { dicompareWorkerAPI as dicompareAPI } from '../services/DicompareWorkerAPI';
import { processUploadedFiles, getAllFilesFromDirectory } from '../utils/fileUploadUtils';
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingTarget, setProcessingTarget] = useState<'schema' | 'data' | 'addNew' | null>(null);
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
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

  // Helper to detect protocol file type
  const getProtocolFileType = (fileName: string): 'pro' | 'exar1' | 'examcard' | 'lxprotocol' | null => {
    const lowerName = fileName.toLowerCase();
    if (lowerName.endsWith('.pro')) return 'pro';
    if (lowerName.endsWith('.exar1')) return 'exar1';
    if (lowerName.endsWith('.examcard')) return 'examcard';
    if (lowerName === 'lxprotocol') return 'lxprotocol';
    return null;
  };

  // Add items from DICOM files or protocol files
  const addFromData = useCallback(async (files: FileList, mode: 'schema-template' | 'validation-subject' = 'schema-template') => {
    setIsProcessing(true);
    setProcessingTarget('addNew');
    setProcessingError(null);
    setProcessingProgress({
      currentFile: 0,
      totalFiles: files.length,
      currentOperation: 'Initializing...',
      percentage: 0
    });

    try {
      // Check if files are protocol files
      const fileArray = Array.from(files);
      const protocolFiles = fileArray.filter(f => getProtocolFileType(f.name) !== null);
      const dicomFiles = fileArray.filter(f => getProtocolFileType(f.name) === null);

      let newAcquisitions: Acquisition[] = [];

      // Process protocol files
      if (protocolFiles.length > 0) {
        setProcessingProgress(prev => ({
          ...prev!,
          currentOperation: 'Processing protocol files...',
          percentage: 10
        }));

        for (const file of protocolFiles) {
          const fileType = getProtocolFileType(file.name)!;
          const fileContent = await file.arrayBuffer();
          const uint8Content = new Uint8Array(fileContent);

          let acquisitions: Acquisition[] = [];
          if (fileType === 'pro') {
            const result = await dicompareAPI.loadProFile(uint8Content, file.name);
            acquisitions = [result];
          } else if (fileType === 'exar1') {
            acquisitions = await dicompareAPI.loadExarFile(uint8Content, file.name);
          } else if (fileType === 'examcard') {
            acquisitions = await dicompareAPI.loadExamCardFile(uint8Content, file.name);
          } else if (fileType === 'lxprotocol') {
            acquisitions = await dicompareAPI.loadLxProtocolFile(uint8Content, file.name);
          }

          newAcquisitions.push(...acquisitions);
        }
      }

      // Process DICOM files
      if (dicomFiles.length > 0) {
        const fileObjects = await processUploadedFiles(
          // Convert back to FileList-like object
          (() => {
            const dt = new DataTransfer();
            dicomFiles.forEach(f => dt.items.add(f));
            return dt.files;
          })(),
          {
            onProgress: (fileProgress) => {
              setProcessingProgress(prev => ({
                ...prev!,
                currentOperation: `Reading file ${fileProgress.current} of ${fileProgress.total}`,
                percentage: (fileProgress.current / fileProgress.total) * 5
              }));
            }
          }
        );

        const result = await dicompareAPI.analyzeFilesForUI(fileObjects, (progress) => {
          setProcessingProgress({
            currentFile: progress.currentFile,
            totalFiles: progress.totalFiles,
            currentOperation: progress.currentOperation,
            percentage: progress.percentage
          });
        });

        newAcquisitions.push(...(result || []));
      }

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
    } catch (error) {
      console.error('Failed to load data:', error);
      setProcessingError(error instanceof Error ? error.message : 'Unknown error occurred');
    }

    setIsProcessing(false);
    setProcessingTarget(null);
    setProcessingProgress(null);
  }, []);

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
    setIsProcessing(true);
    setProcessingTarget('data');
    setProcessingError(null);
    setProcessingProgress({
      currentFile: 0,
      totalFiles: files.length,
      currentOperation: 'Initializing...',
      percentage: 0
    });

    try {
      // Check if files are protocol files
      const fileArray = Array.from(files);
      const protocolFiles = fileArray.filter(f => getProtocolFileType(f.name) !== null);
      const dicomFiles = fileArray.filter(f => getProtocolFileType(f.name) === null);

      let allAcquisitions: Acquisition[] = [];

      // If protocol files, load them and generate test DICOMs
      if (protocolFiles.length > 0) {
        setProcessingProgress(prev => ({
          ...prev!,
          currentOperation: 'Loading protocol file...',
          percentage: 10
        }));

        // Load the first protocol file
        const file = protocolFiles[0];
        const fileType = getProtocolFileType(file.name)!;
        const fileContent = await file.arrayBuffer();
        const uint8Content = new Uint8Array(fileContent);

        let protocolAcquisitions: Acquisition[] = [];
        if (fileType === 'pro') {
          const result = await dicompareAPI.loadProFile(uint8Content, file.name);
          protocolAcquisitions = [result];
        } else if (fileType === 'exar1') {
          protocolAcquisitions = await dicompareAPI.loadExarFile(uint8Content, file.name);
        } else if (fileType === 'examcard') {
          protocolAcquisitions = await dicompareAPI.loadExamCardFile(uint8Content, file.name);
        } else if (fileType === 'lxprotocol') {
          protocolAcquisitions = await dicompareAPI.loadLxProtocolFile(uint8Content, file.name);
        }

        if (protocolAcquisitions.length > 0) {
          setProcessingProgress(prev => ({
            ...prev!,
            currentOperation: 'Generating test DICOMs from protocol...',
            percentage: 30
          }));

          // Generate test DICOMs from each protocol acquisition
          for (let i = 0; i < protocolAcquisitions.length; i++) {
            const dicomFilesGenerated = await generateDicomsFromAcquisition(
              protocolAcquisitions[i],
              (message, pct) => {
                const baseProgress = 30 + (i / protocolAcquisitions.length) * 50;
                const itemProgress = (pct / 100) * (50 / protocolAcquisitions.length);
                setProcessingProgress(prev => ({
                  ...prev!,
                  currentOperation: `${message} (${i + 1}/${protocolAcquisitions.length})`,
                  percentage: baseProgress + itemProgress
                }));
              }
            );

            // Process generated DICOMs
            const fileList = new DataTransfer();
            dicomFilesGenerated.forEach(f => fileList.items.add(f));

            const fileObjects = await processUploadedFiles(fileList.files, {});
            const result = await dicompareAPI.analyzeFilesForUI(fileObjects, () => {});

            if (result && result.length > 0) {
              allAcquisitions.push(...result);
            }
          }
        }
      }

      // If DICOM files (or no protocol files processed successfully), process as DICOMs
      if (allAcquisitions.length === 0 && dicomFiles.length > 0) {
        const fileObjects = await processUploadedFiles(
          (() => {
            const dt = new DataTransfer();
            dicomFiles.forEach(f => dt.items.add(f));
            return dt.files;
          })(),
          {
            onProgress: (fileProgress) => {
              setProcessingProgress(prev => ({
                ...prev!,
                currentOperation: `Reading file ${fileProgress.current} of ${fileProgress.total}`,
                percentage: (fileProgress.current / fileProgress.total) * 5
              }));
            }
          }
        );

        const result = await dicompareAPI.analyzeFilesForUI(fileObjects, (progress) => {
          setProcessingProgress(prev => ({
            ...prev!,
            currentOperation: progress.currentOperation,
            percentage: progress.percentage
          }));
        });

        if (result && result.length > 0) {
          allAcquisitions.push(...result);
        }
      }

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
    } catch (error) {
      console.error('Failed to attach data:', error);
      setProcessingError(error instanceof Error ? error.message : 'Unknown error occurred');
    }

    setIsProcessing(false);
    setProcessingTarget(null);
    setProcessingProgress(null);
  }, []);

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
    setIsProcessing(true);
    setProcessingTarget('schema');
    setProcessingError(null);
    setProcessingProgress({
      currentFile: 0,
      totalFiles: files.length,
      currentOperation: 'Initializing...',
      percentage: 0
    });

    try {
      // Check if files are protocol files
      const fileArray = Array.from(files);
      const protocolFiles = fileArray.filter(f => getProtocolFileType(f.name) !== null);
      const dicomFiles = fileArray.filter(f => getProtocolFileType(f.name) === null);

      let newAcquisitions: Acquisition[] = [];

      // Process protocol files
      if (protocolFiles.length > 0) {
        setProcessingProgress(prev => ({
          ...prev!,
          currentOperation: 'Processing protocol files...',
          percentage: 10
        }));

        for (const file of protocolFiles) {
          const fileType = getProtocolFileType(file.name)!;
          const fileContent = await file.arrayBuffer();
          const uint8Content = new Uint8Array(fileContent);

          let acquisitions: Acquisition[] = [];
          if (fileType === 'pro') {
            const result = await dicompareAPI.loadProFile(uint8Content, file.name);
            acquisitions = [result];
          } else if (fileType === 'exar1') {
            acquisitions = await dicompareAPI.loadExarFile(uint8Content, file.name);
          } else if (fileType === 'examcard') {
            acquisitions = await dicompareAPI.loadExamCardFile(uint8Content, file.name);
          } else if (fileType === 'lxprotocol') {
            acquisitions = await dicompareAPI.loadLxProtocolFile(uint8Content, file.name);
          }

          newAcquisitions.push(...acquisitions);
        }
      }

      // Process DICOM files
      if (dicomFiles.length > 0) {
        const fileObjects = await processUploadedFiles(
          (() => {
            const dt = new DataTransfer();
            dicomFiles.forEach(f => dt.items.add(f));
            return dt.files;
          })(),
          {
            onProgress: (fileProgress) => {
              setProcessingProgress(prev => ({
                ...prev!,
                currentOperation: `Reading file ${fileProgress.current} of ${fileProgress.total}`,
                percentage: (fileProgress.current / fileProgress.total) * 5
              }));
            }
          }
        );

        const result = await dicompareAPI.analyzeFilesForUI(fileObjects, (progress) => {
          setProcessingProgress({
            currentFile: progress.currentFile,
            totalFiles: progress.totalFiles,
            currentOperation: progress.currentOperation,
            percentage: progress.percentage
          });
        });

        newAcquisitions.push(...(result || []));
      }

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
    } catch (error) {
      console.error('Failed to upload schema for item:', error);
      setProcessingError(error instanceof Error ? error.message : 'Unknown error occurred');
    }

    setIsProcessing(false);
    setProcessingTarget(null);
    setProcessingProgress(null);
  }, []);

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

  // Update acquisition properties
  const updateAcquisition = useCallback((id: string, updates: Partial<Acquisition>) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, acquisition: { ...item.acquisition, ...updates } } : item
    ));
  }, []);

  // Update a field in an acquisition
  const updateField = useCallback((id: string, fieldTagOrName: string, updates: Partial<DicomField>) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;

      const acq = item.acquisition;
      return {
        ...item,
        acquisition: {
          ...acq,
          acquisitionFields: acq.acquisitionFields.map(f =>
            (f.tag === fieldTagOrName || f.name === fieldTagOrName) ? { ...f, ...updates } : f
          ),
          series: acq.series?.map(s => ({
            ...s,
            fields: Array.isArray(s.fields) ? s.fields.map(f =>
              (f.tag === fieldTagOrName || f.name === fieldTagOrName) ? { ...f, ...updates } : f
            ) : []
          }))
        }
      };
    }));
  }, []);

  // Delete a field
  const deleteField = useCallback((id: string, fieldTagOrName: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;

      const acq = item.acquisition;
      return {
        ...item,
        acquisition: {
          ...acq,
          acquisitionFields: acq.acquisitionFields.filter(f => f.tag !== fieldTagOrName && f.name !== fieldTagOrName),
          series: acq.series?.map(s => ({
            ...s,
            fields: Array.isArray(s.fields) ? s.fields.filter(f => f.tag !== fieldTagOrName && f.name !== fieldTagOrName) : []
          }))
        }
      };
    }));
  }, []);

  // Convert field between acquisition and series level
  const convertFieldLevel = useCallback((id: string, fieldTagOrName: string, toLevel: 'acquisition' | 'series', mode: 'separate-series' | 'single-series' = 'single-series') => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;

      const acq = item.acquisition;

      // Find field in acquisition level
      const acquisitionField = acq.acquisitionFields.find(f => f.tag === fieldTagOrName || f.name === fieldTagOrName);

      // Find field in any series
      let seriesField: SeriesField | undefined;
      for (const series of acq.series || []) {
        if (Array.isArray(series.fields)) {
          seriesField = series.fields.find(f => f.tag === fieldTagOrName || f.name === fieldTagOrName);
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
        fieldType: seriesField.fieldType
      } : null);

      if (!field) return item;

      if (toLevel === 'acquisition') {
        const updatedSeries = (acq.series || []).map(series => ({
          ...series,
          fields: Array.isArray(series.fields)
            ? series.fields.filter(f => f.tag !== fieldTagOrName && f.name !== fieldTagOrName)
            : []
        }));

        return {
          ...item,
          acquisition: {
            ...acq,
            acquisitionFields: [...acq.acquisitionFields.filter(f => f.tag !== fieldTagOrName && f.name !== fieldTagOrName), { ...field, level: 'acquisition' }],
            series: updatedSeries
          }
        };
      } else {
        const currentSeries = acq.series || [];
        let updatedSeries: Series[] = [];

        if (Array.isArray(field.value) && mode === 'separate-series') {
          if (currentSeries.length > 0) {
            let seriesCounter = 1;
            for (const existingSeries of currentSeries) {
              for (let i = 0; i < field.value.length; i++) {
                updatedSeries.push({
                  name: `Series ${String(seriesCounter).padStart(2, '0')}`,
                  fields: [
                    ...(Array.isArray(existingSeries.fields)
                        ? existingSeries.fields.filter(f => f.tag !== fieldTagOrName && f.name !== fieldTagOrName)
                        : []),
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
          const seriesCount = Math.max(1, currentSeries.length);
          for (let i = 0; i < seriesCount; i++) {
            const existingSeries = currentSeries[i];
            updatedSeries.push({
              name: existingSeries?.name || `Series ${String(i + 1).padStart(2, '0')}`,
              fields: [
                ...(existingSeries && Array.isArray(existingSeries.fields)
                    ? existingSeries.fields.filter(f => f.tag !== fieldTagOrName && f.name !== fieldTagOrName)
                    : []),
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
          ...item,
          acquisition: {
            ...acq,
            acquisitionFields: acq.acquisitionFields.filter(f => f.tag !== fieldTagOrName && f.name !== fieldTagOrName),
            series: updatedSeries
          }
        };
      }
    }));
  }, []);

  // Add fields to an acquisition
  const addFields = useCallback(async (id: string, fieldTags: string[]) => {
    if (fieldTags.length === 0) return;

    const newFieldsPromises = fieldTags.map(async (tagOrName) => {
      try {
        const isDicomFormat = isValidDicomTag(tagOrName);
        const results = await searchDicomFields(tagOrName, 1);
        const fieldDef = isDicomFormat
          ? results.find(f => f.tag.replace(/[()]/g, '') === tagOrName)
          : results.find(f => f.keyword?.toLowerCase() === tagOrName.toLowerCase() || f.name?.toLowerCase() === tagOrName.toLowerCase());

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
        const defaultValue = convertValueToDataType('', suggestedDataType);

        let validationRule: any = { type: constraintType };
        if (constraintType === 'tolerance') {
          const toleranceValue = getSuggestedToleranceValue(name, tag || '');
          if (toleranceValue !== undefined) {
            validationRule.tolerance = toleranceValue;
            validationRule.value = defaultValue;
          }
        }

        return {
          tag,
          name,
          keyword,
          value: defaultValue,
          vr,
          dataType: suggestedDataType,
          level: 'acquisition' as const,
          validationRule,
          fieldType
        };
      } catch (error) {
        const isDicomFormat = isValidDicomTag(tagOrName);
        return {
          tag: isDicomFormat ? tagOrName : null,
          name: tagOrName,
          keyword: tagOrName,
          value: '',
          vr: 'UN',
          dataType: 'string',
          level: 'acquisition' as const,
          validationRule: { type: 'exact' as const },
          fieldType: isDicomFormat ? 'private' as const : 'custom' as const
        };
      }
    });

    const newFields = await Promise.all(newFieldsPromises);

    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;

      const acq = item.acquisition;
      const existingTags = new Set(acq.acquisitionFields.map(f => f.tag).filter(Boolean));
      const existingNames = new Set(acq.acquisitionFields.map(f => f.name.toLowerCase()));

      const uniqueNewFields = newFields.filter(newField => {
        if (newField.tag && existingTags.has(newField.tag)) return false;
        if (existingNames.has(newField.name.toLowerCase())) return false;
        return true;
      });

      return {
        ...item,
        acquisition: {
          ...acq,
          acquisitionFields: [...acq.acquisitionFields, ...uniqueNewFields]
        }
      };
    }));
  }, []);

  // Update a series field
  const updateSeries = useCallback((id: string, seriesIndex: number, fieldTag: string, updates: Partial<SeriesField>) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;

      const acq = item.acquisition;
      const updatedSeries = [...(acq.series || [])];

      if (!updatedSeries[seriesIndex]) {
        updatedSeries[seriesIndex] = { name: `Series ${String(seriesIndex + 1).padStart(2, '0')}`, fields: [] };
      }

      const existingFieldIndex = updatedSeries[seriesIndex].fields.findIndex(f => f.tag === fieldTag);

      if (existingFieldIndex >= 0) {
        updatedSeries[seriesIndex].fields[existingFieldIndex] = {
          ...updatedSeries[seriesIndex].fields[existingFieldIndex],
          ...updates
        };
      } else {
        const newField: SeriesField = {
          tag: fieldTag,
          name: updates.name || fieldTag,
          value: updates.value || '',
          validationRule: updates.validationRule
        };
        updatedSeries[seriesIndex].fields.push(newField);
      }

      return { ...item, acquisition: { ...acq, series: updatedSeries } };
    }));
  }, []);

  // Add a new series
  const addSeries = useCallback((id: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;

      const acq = item.acquisition;
      const currentSeries = acq.series || [];
      let newFields: SeriesField[] = [];

      if (currentSeries.length > 0) {
        for (let i = currentSeries.length - 1; i >= 0; i--) {
          if (currentSeries[i].fields.length > 0) {
            newFields = currentSeries[i].fields.map(field => ({
              ...field,
              value: field.value
            }));
            break;
          }
        }
      }

      if (newFields.length === 0 && currentSeries.length > 0) {
        const fieldMap = new Map<string, SeriesField>();
        currentSeries.forEach(s => {
          s.fields.forEach(f => {
            const fieldKey = f.tag || f.name;
            if (!fieldMap.has(fieldKey)) {
              fieldMap.set(fieldKey, f);
            }
          });
        });

        fieldMap.forEach((field) => {
          const defaultValue = inferDataTypeFromValue(field.value) === 'number' ? 0 :
                              inferDataTypeFromValue(field.value) === 'list_number' ? [] :
                              inferDataTypeFromValue(field.value) === 'list_string' ? [] :
                              '';
          newFields.push({ ...field, value: defaultValue });
        });
      }

      const newSeries: Series = {
        name: `Series ${String(currentSeries.length + 1).padStart(2, '0')}`,
        fields: newFields
      };

      return { ...item, acquisition: { ...acq, series: [...currentSeries, newSeries] } };
    }));
  }, []);

  // Delete a series
  const deleteSeries = useCallback((id: string, seriesIndex: number) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;

      const acq = item.acquisition;
      const updatedSeries = [...(acq.series || [])];
      updatedSeries.splice(seriesIndex, 1);

      return { ...item, acquisition: { ...acq, series: updatedSeries } };
    }));
  }, []);

  // Update series name
  const updateSeriesName = useCallback((id: string, seriesIndex: number, name: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;

      const acq = item.acquisition;
      const updatedSeries = [...(acq.series || [])];
      if (updatedSeries[seriesIndex]) {
        updatedSeries[seriesIndex] = { ...updatedSeries[seriesIndex], name };
      }

      return { ...item, acquisition: { ...acq, series: updatedSeries } };
    }));
  }, []);

  // Add validation function
  const addValidationFunction = useCallback((id: string, func: SelectedValidationFunction) => {
    setItems(prev => prev.map(item =>
      item.id === id ? {
        ...item,
        acquisition: {
          ...item.acquisition,
          validationFunctions: [...(item.acquisition.validationFunctions || []), func]
        }
      } : item
    ));
  }, []);

  // Update validation function
  const updateValidationFunction = useCallback((id: string, index: number, func: SelectedValidationFunction) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;

      const updatedFunctions = [...(item.acquisition.validationFunctions || [])];
      if (updatedFunctions[index]) {
        updatedFunctions[index] = func;
      }

      return { ...item, acquisition: { ...item.acquisition, validationFunctions: updatedFunctions } };
    }));
  }, []);

  // Delete validation function
  const deleteValidationFunction = useCallback((id: string, index: number) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;

      const updatedFunctions = [...(item.acquisition.validationFunctions || [])];
      updatedFunctions.splice(index, 1);

      return { ...item, acquisition: { ...item.acquisition, validationFunctions: updatedFunctions } };
    }));
  }, []);

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
