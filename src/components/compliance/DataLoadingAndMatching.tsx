import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Database, Loader, CheckCircle, Plus, X, Trash2, FileText, AlertTriangle, GripVertical } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Acquisition, ProcessingProgress, AcquisitionSelection } from '../../types';
import { dicompareAPI } from '../../services/DicompareAPI';
import { processUploadedFiles, checkFileSizeLimit, FileSizeInfo, getAllFilesFromDirectory } from '../../utils/fileUploadUtils';
import { useSchemaService, SchemaBinding } from '../../hooks/useSchemaService';
import { SchemaUploadModal } from '../schema/SchemaUploadModal';
import { schemaCacheManager } from '../../services/SchemaCacheManager';
import UnifiedSchemaSelector from '../schema/UnifiedSchemaSelector';
import ComplianceReportModal from './ComplianceReportModal';
import SchemaReadmeModal, { ReadmeItem } from '../schema/SchemaReadmeModal';
import CombinedComplianceView from './CombinedComplianceView';
import { generateDicomsFromAcquisition } from '../../utils/testDataGeneration';
import { convertSchemaToAcquisition } from '../../utils/schemaToAcquisition';
import { SchemaAcquisitionDisplay, SortableAcquisitionItem, SidebarItem } from './ComplianceSidebarComponents';
import SchemaSelectionModal from './SchemaSelectionModal';

const DataLoadingAndMatching: React.FC = () => {
  const navigate = useNavigate();
  const {
    getAllUnifiedSchemas,
    getUnifiedSchema,
    getSchemaContent,
    librarySchemas,
    uploadedSchemas,
    isLoading: schemasLoading,
    error: schemaError
  } = useSchemaService();

  // Simplified state management
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const [loadedData, setLoadedData] = useState<Acquisition[]>([]);
  const [schemaPairings, setSchemaPairings] = useState<Map<string, SchemaBinding>>(new Map());
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [collapsedSchemas, setCollapsedSchemas] = useState<Set<string>>(new Set());
  const [isDragOver, setIsDragOver] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [schemaValidationError, setSchemaValidationError] = useState<string | null>(null);
  const schemaAcquisitionsRef = useRef<Map<string, Acquisition>>(new Map());
  const [showComplianceReport, setShowComplianceReport] = useState(false);
  const [allComplianceResults, setAllComplianceResults] = useState<Map<string, any[]>>(new Map());
  const [selectedAcquisitionId, setSelectedAcquisitionId] = useState<string | null>(null);
  const [showSchemaSelectionModal, setShowSchemaSelectionModal] = useState(false);
  const [showSchemaAsDataModal, setShowSchemaAsDataModal] = useState(false);
  const [sizeWarning, setSizeWarning] = useState<{ show: boolean; info: FileSizeInfo | null; files: FileList | null }>({
    show: false,
    info: null,
    files: null
  });
  const [dicomAnalysisError, setDicomAnalysisError] = useState<string | null>(null);

  // Schema-first workflow state
  const [showSchemaFirstModal, setShowSchemaFirstModal] = useState(false);
  const [schemaFirstSelections, setSchemaFirstSelections] = useState<AcquisitionSelection[]>([]);
  const [pendingSchemaSelections, setPendingSchemaSelections] = useState<AcquisitionSelection[]>([]); // Temp state for modal
  const [schemaFirstData, setSchemaFirstData] = useState<Map<string, Acquisition>>(new Map());
  const [uploadingForSchema, setUploadingForSchema] = useState<string | null>(null);

  // Tabbed options state
  const [activeOptionsTab, setActiveOptionsTab] = useState<'schema' | 'data'>('schema');

  // DnD Kit state
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [isOverDropZone, setIsOverDropZone] = useState(false);

  // README modal state
  const [showReadmeModal, setShowReadmeModal] = useState(false);
  const [readmeModalData, setReadmeModalData] = useState<{
    schemaName: string;
    readmeItems: ReadmeItem[];
    initialSelection: string;
  } | null>(null);

  // Build README items from schema data for the sidebar
  const buildReadmeItems = (schemaData: any, schemaName: string): ReadmeItem[] => {
    const items: ReadmeItem[] = [];

    // Schema-level README
    items.push({
      id: 'schema',
      type: 'schema',
      name: schemaName,
      description: schemaData.description || ''
    });

    // Acquisition READMEs
    Object.entries(schemaData.acquisitions || {}).forEach(([name, acqData]: [string, any], index) => {
      items.push({
        id: `acquisition-${index}`,
        type: 'acquisition',
        name: name,
        description: acqData?.detailed_description || acqData?.description || '',
        acquisitionIndex: index
      });
    });

    return items;
  };

  // Open README for a schema acquisition (from compliance table)
  const openReadmeForSelection = async (selection: AcquisitionSelection) => {
    try {
      const content = await getSchemaContent(selection.schemaId);
      if (content) {
        const schemaData = JSON.parse(content);
        const schemaName = schemaData.name || 'Schema';
        setReadmeModalData({
          schemaName,
          readmeItems: buildReadmeItems(schemaData, schemaName),
          initialSelection: `acquisition-${selection.acquisitionIndex}`
        });
        setShowReadmeModal(true);
      }
    } catch (error) {
      console.error('Failed to load README:', error);
    }
  };

  // Open README for a schema (schema-level description)
  const handleSchemaReadmeClick = async (schemaId: string, schemaName: string) => {
    try {
      const content = await getSchemaContent(schemaId);
      if (content) {
        const schemaData = JSON.parse(content);
        setReadmeModalData({
          schemaName,
          readmeItems: buildReadmeItems(schemaData, schemaName),
          initialSelection: 'schema'
        });
        setShowReadmeModal(true);
      }
    } catch (error) {
      console.error('Failed to load schema README:', error);
    }
  };

  // Open README for an acquisition in the schema browser
  const handleAcquisitionReadmeClick = async (schemaId: string, schemaName: string, acquisitionIndex: number, acquisitionName: string) => {
    try {
      const content = await getSchemaContent(schemaId);
      if (content) {
        const schemaData = JSON.parse(content);
        setReadmeModalData({
          schemaName,
          readmeItems: buildReadmeItems(schemaData, schemaName),
          initialSelection: `acquisition-${acquisitionIndex}`
        });
        setShowReadmeModal(true);
      }
    } catch (error) {
      console.error('Failed to load acquisition README:', error);
    }
  };

  // DnD Kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before starting drag
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const ADD_NEW_ID = '__add_new__';

  // Auto-select logic
  useEffect(() => {
    if (loadedData.length === 0 && !selectedAcquisitionId?.startsWith('schema-first:')) {
      // Start with "Add New" selected when no acquisitions (but preserve schema-first selections)
      setSelectedAcquisitionId(ADD_NEW_ID);
    } else if (selectedAcquisitionId === ADD_NEW_ID) {
      // Keep "Add New" selected if it was previously selected
    } else if (selectedAcquisitionId?.startsWith('schema-first:')) {
      // Keep schema-first selection as-is
    } else if (!selectedAcquisitionId || !loadedData.find(a => a.id === selectedAcquisitionId)) {
      // Select first acquisition if none selected or selected one was deleted
      setSelectedAcquisitionId(loadedData[0]?.id || ADD_NEW_ID);
    }
  }, [loadedData, selectedAcquisitionId]);


  // Helper to get or load schema acquisition - uses ref for stable callback
  const getSchemaAcquisition = useCallback(async (binding: SchemaBinding): Promise<Acquisition | null> => {
    const key = `${binding.schemaId}-${binding.acquisitionId || 'default'}`;

    if (schemaAcquisitionsRef.current.has(key)) {
      return schemaAcquisitionsRef.current.get(key)!;
    }

    try {
      // Use shared utility for schema conversion
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
  }, [getSchemaContent]);

  // Schema pairing helpers
  const pairSchemaWithAcquisition = (acquisitionId: string, schemaId: string, schemaAcquisitionId?: number) => {
    const schema = getUnifiedSchema(schemaId);
    if (!schema) return;

    const binding: SchemaBinding = {
      schemaId,
      acquisitionId: schemaAcquisitionId?.toString(),
      schema
    };

    setSchemaPairings(prev => new Map(prev.set(acquisitionId, binding)));
  };

  const unpairAcquisition = (acquisitionId: string) => {
    setSchemaPairings(prev => {
      const newMap = new Map(prev);
      newMap.delete(acquisitionId);
      return newMap;
    });
  };

  const getAcquisitionPairing = (acquisitionId: string): SchemaBinding | null => {
    return schemaPairings.get(acquisitionId) || null;
  };

  const getPairedCount = () => schemaPairings.size;

  // Core file processing logic - called after size check passes or user chooses to proceed anyway
  const processFiles = useCallback(async (files: FileList, skipSizeCheck: boolean = false) => {
    setIsProcessing(true);
    setProgress({
      currentFile: 0,
      totalFiles: files.length,
      currentOperation: 'Initializing...',
      percentage: 0
    });

    try {
      setProgress(prev => ({
        ...prev!,
        currentOperation: 'Reading file data...',
        percentage: prev?.percentage || 0
      }));

      const fileObjects = await processUploadedFiles(files, {
        onProgress: (fileProgress) => {
          setProgress(prev => ({
            ...prev!,
            currentOperation: `Reading file ${fileProgress.current} of ${fileProgress.total}: ${fileProgress.fileName}`,
            percentage: (fileProgress.current / fileProgress.total) * 25
          }));
        },
        skipSizeCheck
      });

      const result = await dicompareAPI.analyzeFilesForUI(fileObjects, (progress) => {
        try {
          const progressObj = progress.toJs ? progress.toJs() : progress;
          const percentage = progressObj.percentage || 0;
          const operation = progressObj.currentOperation || 'Processing...';
          const totalProcessed = progressObj.totalProcessed || 0;
          const totalFiles = progressObj.totalFiles || files.length;

          const scaledPercentage = 25 + (percentage * 0.65);

          setProgress({
            currentFile: Math.floor((totalProcessed / totalFiles) * files.length),
            totalFiles: files.length,
            currentOperation: operation,
            percentage: scaledPercentage
          });
        } catch (error) {
          console.error('Progress callback failed:', error);
          throw new Error(`Progress callback failed: ${error.message}`);
        }
      });

      const newAcquisitions = result || [];
      const existingIds = new Set(loadedData.map(acq => acq.id));
      const resolvedAcquisitions = newAcquisitions.map(acq => {
        if (!existingIds.has(acq.id)) {
          return acq;
        }

        let counter = 2;
        let newId = `${acq.id}_${counter}`;
        while (existingIds.has(newId)) {
          counter++;
          newId = `${acq.id}_${counter}`;
        }

        return { ...acq, id: newId };
      });

      setLoadedData(prev => [...prev, ...resolvedAcquisitions]);

      // Auto-select the first newly created acquisition
      if (resolvedAcquisitions.length > 0) {
        setSelectedAcquisitionId(resolvedAcquisitions[0].id);
      }

      setApiError(null);
      setDicomAnalysisError(null);
    } catch (error) {
      console.error('Failed to load DICOM data:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setDicomAnalysisError(errorMessage);
    }

    setIsProcessing(false);
    setProgress(null);
  }, [loadedData]);

  // Main file upload handler - checks size first and shows warning if needed
  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files) return;

    // Check if this is a protocol file (.pro, .exar1, .ExamCard, or LxProtocol) - route to special handler
    const fileName = files[0].name.toLowerCase();
    if (files.length === 1 && (fileName.endsWith('.pro') || fileName.endsWith('.exar1') || fileName.endsWith('.examcard') || fileName === 'lxprotocol')) {
      await handleProFile(files[0]);
      return;
    }

    // Check file size before processing
    setProgress({
      currentFile: 0,
      totalFiles: files.length,
      currentOperation: 'Checking file sizes...',
      percentage: 0
    });
    const sizeInfo = await checkFileSizeLimit(files);
    setProgress(null);

    if (sizeInfo.exceedsLimit) {
      // Show warning modal and let user decide
      setSizeWarning({ show: true, info: sizeInfo, files });
      return;
    }

    // Size is OK, proceed with processing
    await processFiles(files, false);
  }, [processFiles]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle "try anyway" from size warning modal
  const handleProceedAnyway = useCallback(async () => {
    const files = sizeWarning.files;
    setSizeWarning({ show: false, info: null, files: null });

    if (files) {
      await processFiles(files, true);
    }
  }, [sizeWarning.files, processFiles]);

  // Handle protocol file upload (.pro, .exar1, .ExamCard, or LxProtocol) - generates DICOMs and then processes them
  const handleProFile = useCallback(async (proFile: File) => {
    const fileName = proFile.name.toLowerCase();
    const isExarFile = fileName.endsWith('.exar1');
    const isExamCard = fileName.endsWith('.examcard');
    const isLxProtocol = fileName === 'lxprotocol';
    const fileType = isLxProtocol ? 'GE LxProtocol' : isExamCard ? 'Philips ExamCard' : isExarFile ? 'Siemens exam archive' : 'Siemens protocol';

    setIsProcessing(true);
    setProgress({
      currentFile: 0,
      totalFiles: 1,
      currentOperation: `Parsing ${fileType} file...`,
      percentage: 0
    });

    try {
      // Step 1: Read file content as Uint8Array
      setProgress(prev => ({ ...prev!, currentOperation: 'Reading file...', percentage: 5 }));
      const arrayBuffer = await proFile.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Step 2: Parse protocol file to acquisition(s)
      setProgress(prev => ({ ...prev!, currentOperation: 'Reading protocol fields...', percentage: 10 }));

      // .exar1, .ExamCard, and LxProtocol return multiple acquisitions, .pro returns one
      let acquisitions: Acquisition[];
      if (isLxProtocol) {
        acquisitions = await dicompareAPI.loadLxProtocolFile(uint8Array, proFile.name);
      } else if (isExamCard) {
        acquisitions = await dicompareAPI.loadExamCardFile(uint8Array, proFile.name);
      } else if (isExarFile) {
        acquisitions = await dicompareAPI.loadExarFile(uint8Array, proFile.name);
      } else {
        const acquisition = await dicompareAPI.loadProFile(uint8Array, proFile.name);
        acquisitions = [acquisition];
      }

      // Generate DICOMs for each acquisition using shared utility
      const allDicomFiles: File[] = [];
      const totalAcquisitions = acquisitions.length;

      for (let acqIndex = 0; acqIndex < acquisitions.length; acqIndex++) {
        const acquisition = acquisitions[acqIndex];
        const baseProgress = 10 + (acqIndex / totalAcquisitions) * 60;

        const dicomFiles = await generateDicomsFromAcquisition(acquisition, (message, pct) => {
          setProgress(prev => ({
            ...prev!,
            currentOperation: `${acquisition.protocolName}: ${message}`,
            percentage: baseProgress + (pct * 0.6 * (1 / totalAcquisitions))
          }));
        });

        allDicomFiles.push(...dicomFiles);
      }

      // Process all generated DICOMs through existing pipeline
      setProgress(prev => ({ ...prev!, currentOperation: 'Processing generated DICOMs...', percentage: 80 }));

      const fileList = new DataTransfer();
      allDicomFiles.forEach(file => fileList.items.add(file));

      await handleFileUpload(fileList.files);

    } catch (error) {
      console.error(`Failed to process ${fileType} file:`, error);
      setDicomAnalysisError(`Failed to process ${fileType} file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsProcessing(false);
      setProgress(null);
    }
  }, [handleFileUpload]);

  // Handle schema as data source - generates DICOMs from schema and loads them
  const handleSchemaAsData = useCallback(async (binding: SchemaBinding) => {
    setIsProcessing(true);
    setProgress({
      currentFile: 0,
      totalFiles: 1,
      currentOperation: 'Loading schema...',
      percentage: 0
    });

    try {
      // Step 1: Load the schema acquisition using shared utility
      setProgress(prev => ({ ...prev!, currentOperation: 'Loading schema acquisition...', percentage: 10 }));
      const acquisition = await convertSchemaToAcquisition(
        binding.schema,
        binding.acquisitionId || '0',
        getSchemaContent
      );

      if (!acquisition) {
        throw new Error('Failed to load schema acquisition');
      }

      // Step 2: Generate DICOMs using shared utility
      const dicomFiles = await generateDicomsFromAcquisition(acquisition, (message, pct) => {
        setProgress(prev => ({
          ...prev!,
          currentOperation: message,
          percentage: 10 + (pct * 0.7)
        }));
      });

      // Step 3: Process generated DICOMs through existing pipeline
      setProgress(prev => ({ ...prev!, currentOperation: 'Processing generated DICOMs...', percentage: 80 }));

      const fileList = new DataTransfer();
      dicomFiles.forEach(file => fileList.items.add(file));

      await handleFileUpload(fileList.files);

    } catch (error) {
      console.error('Failed to process schema as data:', error);
      setDicomAnalysisError(`Failed to generate DICOMs from schema: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsProcessing(false);
      setProgress(null);
    }
  }, [handleFileUpload, getSchemaContent]);

  // Drag and drop handlers (unchanged)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const items = Array.from(e.dataTransfer.items);
    const files: File[] = [];

    for (const item of items) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          if (entry.isDirectory) {
            const dirFiles = await getAllFilesFromDirectory(entry as FileSystemDirectoryEntry);
            files.push(...dirFiles);
          } else {
            const file = item.getAsFile();
            if (file) files.push(file);
          }
        } else {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
    }

    if (files.length > 0) {
      const fileList = {
        length: files.length,
        item: (index: number) => files[index] || null,
        [Symbol.iterator]: function* () {
          for (let i = 0; i < files.length; i++) {
            yield files[i];
          }
        }
      };
      files.forEach((file, index) => {
        (fileList as any)[index] = file;
      });

      await handleFileUpload(fileList as FileList);
    } else {
      await handleFileUpload(e.dataTransfer.files);
    }
  }, [handleFileUpload]);

  const clearData = async () => {
    setLoadedData([]);
    setSchemaPairings(new Map());
    setSelectedAcquisitionId(ADD_NEW_ID);
    // Clear the schema acquisition cache
    schemaAcquisitionsRef.current = new Map();
    // Clear the Pyodide session cache so validation works correctly
    try {
      await dicompareAPI.clearSessionCache();
    } catch (error) {
      console.error('Failed to clear session cache:', error);
    }
  };

  const handleDeleteAcquisition = (acquisitionId: string) => {
    setLoadedData(prev => prev.filter(acq => acq.id !== acquisitionId));
    unpairAcquisition(acquisitionId);
    setCollapsedSchemas(prev => {
      const newSet = new Set(prev);
      newSet.delete(acquisitionId);
      return newSet;
    });
  };

  const handleSchemaUpload = async (file: File) => {
    // Clear any previous error
    setSchemaValidationError(null);

    try {
      // Validate the schema file (JSON syntax + metaschema validation)
      const validation = await schemaCacheManager.validateSchemaFile(file);

      if (!validation.isValid) {
        // Show error modal, don't open upload modal
        setSchemaValidationError(validation.error || 'Invalid schema file');
        return;
      }

      // Schema is valid, proceed to upload modal
      setUploadedFile(file);
      setShowUploadModal(true);
    } catch (error) {
      console.error('Failed to validate schema file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setSchemaValidationError(errorMessage);
    }
  };

  const handleSchemaDelete = async (schemaId: string, event: React.MouseEvent) => {
    event.stopPropagation();

    // Remove pairings with this schema
    setSchemaPairings(prev => {
      const newMap = new Map(prev);
      for (const [acquisitionId, binding] of newMap) {
        if (binding.schemaId === schemaId) {
          newMap.delete(acquisitionId);
        }
      }
      return newMap;
    });

    if (preSelectedSchemaId === schemaId) {
      setPreSelectedSchemaId(null);
      setPreSelectedAcquisitionId(null);
    }

    // Note: Actual deletion handled by context for uploaded schemas
    // Library schemas can't be deleted
  };

  const toggleSchemaCollapse = (key: string) => {
    setCollapsedSchemas(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  // Schema-first workflow helpers
  const getSchemaFirstSelectionId = (selection: AcquisitionSelection) =>
    `schema-first:${selection.schemaId}:${selection.acquisitionIndex}`;

  const handleSchemaFirstToggle = (selection: AcquisitionSelection) => {
    // Update pending selections (not the actual state yet)
    setPendingSchemaSelections(prev => {
      const exists = prev.some(
        s => s.schemaId === selection.schemaId && s.acquisitionIndex === selection.acquisitionIndex
      );
      if (exists) {
        return prev.filter(
          s => !(s.schemaId === selection.schemaId && s.acquisitionIndex === selection.acquisitionIndex)
        );
      } else {
        return [...prev, selection];
      }
    });
  };

  const openSchemaFirstModal = () => {
    // Initialize pending with current selections
    setPendingSchemaSelections([...schemaFirstSelections]);
    setShowSchemaFirstModal(true);
  };

  const confirmSchemaFirstSelections = () => {
    // Commit pending selections to actual state
    setSchemaFirstSelections(pendingSchemaSelections);
    setShowSchemaFirstModal(false);

    // Auto-select the first new schema-first item if nothing else is selected
    if (pendingSchemaSelections.length > 0 && selectedAcquisitionId === ADD_NEW_ID) {
      const firstSelection = pendingSchemaSelections[0];
      setSelectedAcquisitionId(getSchemaFirstSelectionId(firstSelection));
    }
  };

  const cancelSchemaFirstModal = () => {
    // Discard pending selections
    setPendingSchemaSelections([]);
    setShowSchemaFirstModal(false);
  };

  const removeSchemaFirstSelection = (selectionId: string) => {
    // Parse the selection ID
    const parts = selectionId.split(':');
    if (parts.length !== 3) return;

    const schemaId = parts[1];
    const acquisitionIndex = parseInt(parts[2], 10);

    // Remove from selections
    setSchemaFirstSelections(prev =>
      prev.filter(s => !(s.schemaId === schemaId && s.acquisitionIndex === acquisitionIndex))
    );

    // Remove any linked data
    setSchemaFirstData(prev => {
      const newMap = new Map(prev);
      newMap.delete(selectionId);
      return newMap;
    });

    // If this was selected, switch to ADD_NEW_ID
    if (selectedAcquisitionId === selectionId) {
      setSelectedAcquisitionId(ADD_NEW_ID);
    }
  };

  // Computed sidebar items for dnd-kit
  const sidebarItems: SidebarItem[] = useMemo(() => {
    const schemaItems: SidebarItem[] = schemaFirstSelections.map(selection => ({
      id: getSchemaFirstSelectionId(selection),
      type: 'schema-first' as const,
      data: selection,
    }));

    const dataItems: SidebarItem[] = loadedData.map(acquisition => ({
      id: acquisition.id,
      type: 'data' as const,
      data: acquisition,
    }));

    return [...schemaItems, ...dataItems];
  }, [schemaFirstSelections, loadedData]);

  // DnD Kit handlers
  const handleDndDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDndDragOver = (event: DragOverEvent) => {
    const { over } = event;
    setIsOverDropZone(over?.id === 'sidebar-drop-zone');
  };

  const handleDndDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);
    setIsOverDropZone(false);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // If dropped on the drop zone (from schema browser), it's already handled by native drag
    if (overId === 'sidebar-drop-zone') return;

    // Reordering within the list
    if (activeId !== overId) {
      const activeItem = sidebarItems.find(item => item.id === activeId);
      const overItem = sidebarItems.find(item => item.id === overId);

      if (!activeItem || !overItem) return;

      // Handle reordering within same type
      if (activeItem.type === 'schema-first' && overItem.type === 'schema-first') {
        setSchemaFirstSelections(prev => {
          const oldIndex = prev.findIndex(s => getSchemaFirstSelectionId(s) === activeId);
          const newIndex = prev.findIndex(s => getSchemaFirstSelectionId(s) === overId);
          if (oldIndex === -1 || newIndex === -1) return prev;
          return arrayMove(prev, oldIndex, newIndex);
        });
      } else if (activeItem.type === 'data' && overItem.type === 'data') {
        setLoadedData(prev => {
          const oldIndex = prev.findIndex(a => a.id === activeId);
          const newIndex = prev.findIndex(a => a.id === overId);
          if (oldIndex === -1 || newIndex === -1) return prev;
          return arrayMove(prev, oldIndex, newIndex);
        });
      }
      // Cross-type reordering could be added here if needed
    }
  };

  // Native drag handler for schema browser items (still needed for cross-context drag)
  const handleAcquisitionDragStart = (selection: AcquisitionSelection, event: React.DragEvent) => {
    event.dataTransfer.setData('application/json', JSON.stringify({ type: 'acquisition', selection }));
    event.dataTransfer.effectAllowed = 'copy';
  };

  // Native drag handler for entire schema (adds all acquisitions)
  const handleSchemaDragStart = (schemaId: string, schemaName: string, acquisitionCount: number, event: React.DragEvent) => {
    event.dataTransfer.setData('application/json', JSON.stringify({ type: 'schema', schemaId, schemaName, acquisitionCount }));
    event.dataTransfer.effectAllowed = 'copy';
  };

  const handleSidebarDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    setIsOverDropZone(false);

    try {
      const rawData = event.dataTransfer.getData('application/json');
      const data = JSON.parse(rawData);

      if (data.type === 'acquisition') {
        // Single acquisition drop
        const selection: AcquisitionSelection = data.selection;

        // Check if already added
        const exists = schemaFirstSelections.some(
          s => s.schemaId === selection.schemaId && s.acquisitionIndex === selection.acquisitionIndex
        );

        if (!exists) {
          setSchemaFirstSelections(prev => [...prev, selection]);
        }
      } else if (data.type === 'schema') {
        // Entire schema drop - add all acquisitions
        const { schemaId, schemaName } = data;

        // Get the schema to find all acquisitions
        const schema = getUnifiedSchema(schemaId);
        if (schema) {
          // Parse the schema content to get all acquisitions
          const content = await getSchemaContent(schemaId);
          if (content) {
            const schemaData = JSON.parse(content);
            const acquisitionEntries = Object.entries(schemaData.acquisitions || {});

            const newSelections: AcquisitionSelection[] = [];
            acquisitionEntries.forEach(([name, _], index) => {
              // Check if already added
              const exists = schemaFirstSelections.some(
                s => s.schemaId === schemaId && s.acquisitionIndex === index
              );

              if (!exists) {
                newSelections.push({
                  schemaId,
                  acquisitionIndex: index,
                  schemaName,
                  acquisitionName: name
                });
              }
            });

            if (newSelections.length > 0) {
              setSchemaFirstSelections(prev => [...prev, ...newSelections]);
            }
          }
        }
      } else {
        // Legacy format (just a selection object without type wrapper)
        const selection: AcquisitionSelection = data;
        const exists = schemaFirstSelections.some(
          s => s.schemaId === selection.schemaId && s.acquisitionIndex === selection.acquisitionIndex
        );

        if (!exists) {
          setSchemaFirstSelections(prev => [...prev, selection]);
        }
      }
    } catch (e) {
      console.error('Failed to parse dropped data:', e);
    }
  };

  const handleSidebarDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsOverDropZone(true);
  };

  const handleSidebarDragLeave = (event: React.DragEvent) => {
    const relatedTarget = event.relatedTarget as Node | null;
    const currentTarget = event.currentTarget as Node;
    if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
      setIsOverDropZone(false);
    }
  };

  // Schema-first file upload handler
  const handleSchemaFirstFileUpload = useCallback(async (selectionId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Parse selection to get schema info for pairing
    const parts = selectionId.split(':');
    if (parts.length !== 3) return;
    const schemaId = parts[1];
    const acquisitionIndex = parseInt(parts[2], 10);

    setUploadingForSchema(selectionId);
    setIsProcessing(true);
    setProgress({
      currentFile: 0,
      totalFiles: files.length,
      currentOperation: 'Initializing...',
      percentage: 0
    });

    try {
      // Process files (reuse existing logic)
      const fileObjects = await processUploadedFiles(files, {
        onProgress: (fileProgress) => {
          setProgress(prev => ({
            ...prev!,
            currentOperation: `Reading file ${fileProgress.current} of ${fileProgress.total}: ${fileProgress.fileName}`,
            percentage: (fileProgress.current / fileProgress.total) * 25
          }));
        }
      });

      const result = await dicompareAPI.analyzeFilesForUI(fileObjects, (progress) => {
        try {
          const progressObj = progress.toJs ? progress.toJs() : progress;
          const percentage = progressObj.percentage || 0;
          const operation = progressObj.currentOperation || 'Processing...';
          setProgress(prev => ({
            ...prev!,
            currentOperation: operation,
            percentage: 25 + (percentage * 0.65)
          }));
        } catch (error) {
          console.error('Progress callback failed:', error);
        }
      });

      const acquisitions = result || [];

      if (acquisitions.length > 0) {
        // Use the first acquisition for this schema
        const acquisition = acquisitions[0];

        // Store the linked data
        setSchemaFirstData(prev => new Map(prev).set(selectionId, acquisition));

        // Auto-pair with the schema
        pairSchemaWithAcquisition(acquisition.id, schemaId, acquisitionIndex);
      }

      setDicomAnalysisError(null);
    } catch (error) {
      console.error('Failed to process DICOM files:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setDicomAnalysisError(errorMessage);
    }

    setIsProcessing(false);
    setProgress(null);
    setUploadingForSchema(null);
  }, [pairSchemaWithAcquisition]);

  // Schema-first drag and drop handler
  const handleSchemaFirstDrop = useCallback(async (e: React.DragEvent, selectionId: string) => {
    e.preventDefault();
    setIsDragOver(false);

    const items = Array.from(e.dataTransfer.items);
    const files: File[] = [];

    for (const item of items) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          if (entry.isDirectory) {
            const dirFiles = await getAllFilesFromDirectory(entry as FileSystemDirectoryEntry);
            files.push(...dirFiles);
          } else {
            const file = item.getAsFile();
            if (file) files.push(file);
          }
        } else {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
    }

    if (files.length > 0) {
      const fileList = {
        length: files.length,
        item: (index: number) => files[index] || null,
        [Symbol.iterator]: function* () {
          for (let i = 0; i < files.length; i++) {
            yield files[i];
          }
        }
      };
      files.forEach((file, index) => {
        (fileList as any)[index] = file;
      });

      await handleSchemaFirstFileUpload(selectionId, fileList as FileList);
    } else {
      await handleSchemaFirstFileUpload(selectionId, e.dataTransfer.files);
    }
  }, [handleSchemaFirstFileUpload]);

  // Generate test data for schema-first selection
  const handleGenerateTestDataForSchema = useCallback(async (selectionId: string) => {
    // Parse selection to get schema info
    const parts = selectionId.split(':');
    if (parts.length !== 3) return;
    const schemaId = parts[1];
    const acquisitionIndex = parts[2];

    // Get the schema
    const schema = getUnifiedSchema(schemaId);
    if (!schema) return;

    setUploadingForSchema(selectionId);

    try {
      setIsProcessing(true);
      setProgress({
        currentFile: 0,
        totalFiles: 1,
        currentOperation: 'Loading schema...',
        percentage: 0
      });

      // Convert schema to acquisition using shared utility
      setProgress(prev => ({ ...prev!, currentOperation: 'Loading schema acquisition...', percentage: 10 }));
      const acquisition = await convertSchemaToAcquisition(schema, acquisitionIndex, getSchemaContent);

      if (!acquisition) {
        throw new Error('Failed to load schema acquisition');
      }

      // Generate DICOMs using shared utility
      const dicomFiles = await generateDicomsFromAcquisition(acquisition, (message, pct) => {
        setProgress(prev => ({
          ...prev!,
          currentOperation: message,
          percentage: 10 + (pct * 0.6)
        }));
      });

      // Process through existing pipeline
      setProgress(prev => ({ ...prev!, currentOperation: 'Processing generated DICOMs...', percentage: 70 }));
      const fileList = new DataTransfer();
      dicomFiles.forEach(file => fileList.items.add(file));

      // Process files and link to schema-first selection
      const fileObjects = await processUploadedFiles(fileList.files, {});
      const result = await dicompareAPI.analyzeFilesForUI(fileObjects, () => {});

      if (result && result.length > 0) {
        const loadedAcquisition = result[0];
        setSchemaFirstData(prev => new Map(prev).set(selectionId, loadedAcquisition));
        pairSchemaWithAcquisition(loadedAcquisition.id, schemaId, parseInt(acquisitionIndex, 10));
      }

    } catch (error) {
      console.error('Failed to generate test data:', error);
      setDicomAnalysisError(`Failed to generate test data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    setIsProcessing(false);
    setProgress(null);
    setUploadingForSchema(null);
  }, [getUnifiedSchema, getSchemaContent, pairSchemaWithAcquisition]);

  const handleContinue = async () => {
    // Collect all compliance results for the report
    const reportResults = new Map<string, any[]>();

    for (const acquisition of loadedData) {
      const pairing = getAcquisitionPairing(acquisition.id);
      if (pairing) {
        try {
          // Get compliance results for this acquisition
          const validationResults = await dicompareAPI.validateAcquisitionAgainstSchema(
            acquisition,
            pairing.schemaId,
            getSchemaContent,
            pairing.acquisitionId
          );
          reportResults.set(acquisition.id, validationResults);
        } catch (error) {
          console.error(`Failed to get compliance results for ${acquisition.id}:`, error);
          reportResults.set(acquisition.id, []);
        }
      }
    }

    setAllComplianceResults(reportResults);
    setShowComplianceReport(true);
  };

  const selectedAcquisition = selectedAcquisitionId && selectedAcquisitionId !== ADD_NEW_ID
    ? loadedData.find(a => a.id === selectedAcquisitionId)
    : null;

  // Component to render "Add New Acquisition" selectable item
  const renderAddNewItem = () => {
    const isSelected = selectedAcquisitionId === ADD_NEW_ID;

    return (
      <div
        onClick={() => setSelectedAcquisitionId(ADD_NEW_ID)}
        className={`border rounded-lg p-4 cursor-pointer transition-all ${
          isSelected
            ? 'border-brand-500 bg-brand-50 shadow-md'
            : 'border-dashed border-border-secondary hover:border-content-muted hover:bg-surface-secondary'
        }`}
      >
        <div className="flex items-center space-x-2">
          <Plus className="h-4 w-4 text-brand-500 flex-shrink-0" />
          <h3 className="text-sm font-medium text-content-primary">
            Load DICOMs/Schemas
          </h3>
        </div>
      </div>
    );
  };

  // Combined view renderer
  const renderCombinedView = (acquisition: Acquisition) => {
    const pairing = getAcquisitionPairing(acquisition.id);

    return (
      <div className="bg-surface-primary rounded-lg border border-border shadow-sm">
        {/* Header with Attach Schema button */}
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold text-content-primary">{acquisition.protocolName}</h3>
              <p className="text-sm text-content-secondary mt-1">{acquisition.seriesDescription || 'No description'}</p>
              {pairing && (
                <p className="text-xs text-content-tertiary mt-1">
                  Schema: {pairing.schema.name} v{pairing.schema.version}
                </p>
              )}
            </div>
            <div className="flex items-center space-x-3">
              {pairing ? (
                <button
                  onClick={() => unpairAcquisition(acquisition.id)}
                  className="inline-flex items-center px-3 py-2 border border-status-error/30 text-status-error text-sm rounded-lg hover:bg-status-error-bg"
                >
                  <X className="h-4 w-4 mr-2" />
                  Detach Schema
                </button>
              ) : (
                <button
                  onClick={() => setShowSchemaSelectionModal(true)}
                  className="inline-flex items-center px-3 py-2 border border-brand-600 text-brand-600 text-sm rounded-lg hover:bg-brand-50"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Attach Schema
                </button>
              )}
              <button
                onClick={() => handleDeleteAcquisition(acquisition.id)}
                className="inline-flex items-center px-3 py-2 border border-border-secondary text-content-secondary text-sm rounded-lg hover:bg-surface-secondary"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          <CombinedComplianceView
            key={`${acquisition.id}-${pairing?.schemaId || 'no-schema'}-${pairing?.acquisitionId || 'default'}`}
            acquisition={acquisition}
            pairing={pairing}
            getSchemaContent={getSchemaContent}
            getSchemaAcquisition={getSchemaAcquisition}
          />
        </div>
      </div>
    );
  };

  // Schema-first view - show schema requirements + upload area
  const renderSchemaFirstView = (selectionId: string) => {
    const selection = schemaFirstSelections.find(
      s => getSchemaFirstSelectionId(s) === selectionId
    );

    if (!selection) {
      return (
        <div className="bg-surface-primary rounded-lg border border-border shadow-sm p-6 text-center">
          <p className="text-content-secondary">Schema selection not found</p>
        </div>
      );
    }

    const linkedData = schemaFirstData.get(selectionId);

    // If data is uploaded, show the combined compliance view
    if (linkedData) {
      const pairing = getAcquisitionPairing(linkedData.id);

      return (
        <div className="bg-surface-primary rounded-lg border border-border shadow-sm">
          {/* Header */}
          <div className="px-6 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold text-content-primary">{selection.acquisitionName}</h3>
                <p className="text-sm text-content-secondary mt-1">{selection.schemaName}</p>
                <p className="text-xs text-status-success mt-1 flex items-center">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {linkedData.totalFiles} files loaded
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => openReadmeForSelection(selection)}
                  className="inline-flex items-center px-3 py-2 border border-border-secondary text-content-secondary text-sm rounded-lg hover:bg-surface-secondary"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  README
                </button>
                <button
                  onClick={() => {
                    // Clear linked data to allow re-upload
                    setSchemaFirstData(prev => {
                      const newMap = new Map(prev);
                      newMap.delete(selectionId);
                      return newMap;
                    });
                  }}
                  className="inline-flex items-center px-3 py-2 border border-border-secondary text-content-secondary text-sm rounded-lg hover:bg-surface-secondary"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Replace Data
                </button>
                <button
                  onClick={() => removeSchemaFirstSelection(selectionId)}
                  className="inline-flex items-center px-3 py-2 border border-status-error/30 text-status-error text-sm rounded-lg hover:bg-status-error-bg"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove
                </button>
              </div>
            </div>
          </div>

          {/* Content - Compliance View */}
          <div className="px-6 py-4">
            <CombinedComplianceView
              key={`schema-first-${selectionId}-${linkedData.id}`}
              acquisition={linkedData}
              pairing={pairing}
              getSchemaContent={getSchemaContent}
              getSchemaAcquisition={getSchemaAcquisition}
            />
          </div>
        </div>
      );
    }

    // No data yet - show schema requirements + upload area
    return (
      <div className="bg-surface-primary rounded-lg border border-border shadow-sm">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold text-content-primary">{selection.acquisitionName}</h3>
              <p className="text-sm text-content-secondary mt-1">{selection.schemaName}</p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => openReadmeForSelection(selection)}
                className="inline-flex items-center px-3 py-2 border border-border-secondary text-content-secondary text-sm rounded-lg hover:bg-surface-secondary"
              >
                <FileText className="h-4 w-4 mr-2" />
                README
              </button>
              <button
                onClick={() => removeSchemaFirstSelection(selectionId)}
                className="inline-flex items-center px-3 py-2 border border-border-secondary text-content-secondary text-sm rounded-lg hover:bg-surface-secondary"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remove
              </button>
            </div>
          </div>
        </div>

        {/* Upload Area */}
        <div className="px-6 py-4 border-b border-border">
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              isDragOver
                ? 'border-brand-500 bg-brand-50'
                : 'border-border-secondary hover:border-brand-500'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleSchemaFirstDrop(e, selectionId)}
          >
            {uploadingForSchema === selectionId ? (
              <>
                <Loader className="h-8 w-8 text-brand-600 mx-auto mb-2 animate-spin" />
                <p className="text-sm text-content-secondary">{progress?.currentOperation || 'Processing...'}</p>
                {progress && (
                  <div className="mt-3 w-full max-w-xs mx-auto">
                    <div className="w-full bg-surface-secondary rounded-full h-1.5">
                      <div
                        className="bg-brand-600 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${progress.percentage}%` }}
                      />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-content-muted mx-auto mb-2" />
                <p className="text-sm text-content-secondary mb-3">
                  Upload DICOMs that should match: <strong>{selection.acquisitionName}</strong>
                </p>
                <input
                  type="file"
                  multiple
                  webkitdirectory=""
                  accept=".dcm,.dicom,.zip,.pro,.exar1,.ExamCard,.examcard,LxProtocol"
                  className="hidden"
                  id={`file-upload-${selectionId}`}
                  onChange={(e) => handleSchemaFirstFileUpload(selectionId, e.target.files)}
                />
                <div className="flex justify-center gap-3">
                  <label
                    htmlFor={`file-upload-${selectionId}`}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-content-inverted bg-brand-600 hover:bg-brand-700 cursor-pointer"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Browse Files
                  </label>
                  <button
                    onClick={() => handleGenerateTestDataForSchema(selectionId)}
                    className="inline-flex items-center px-4 py-2 border border-brand-600 text-brand-600 text-sm font-medium rounded-md hover:bg-brand-50"
                  >
                    <Database className="h-4 w-4 mr-2" />
                    Generate Test Data
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Schema Requirements - Display using SchemaAcquisitionDisplay */}
        <div className="px-6 py-4">
          <SchemaAcquisitionDisplay
            binding={{
              schemaId: selection.schemaId,
              acquisitionId: selection.acquisitionIndex.toString(),
              schema: getUnifiedSchema(selection.schemaId)!
            }}
            isCollapsed={false}
            isDataProcessing={false}
            hideHeader={true}
            getSchemaContent={getSchemaContent}
            getSchemaAcquisition={getSchemaAcquisition}
          />
        </div>
      </div>
    );
  };

  // Tabbed options - inline schema browser or data upload
  const renderTabbedOptions = () => (
    <div className="border border-border rounded-lg bg-surface-primary shadow-sm flex flex-col h-full">
      {/* Tab Headers */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveOptionsTab('schema')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeOptionsTab === 'schema'
              ? 'text-brand-600 border-b-2 border-brand-600 bg-surface-primary'
              : 'text-content-secondary hover:text-content-primary bg-surface-secondary'
          }`}
        >
          <FileText className="h-4 w-4 inline mr-2" />
          Schema selection
        </button>
        <button
          onClick={() => setActiveOptionsTab('data')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeOptionsTab === 'data'
              ? 'text-brand-600 border-b-2 border-brand-600 bg-surface-primary'
              : 'text-content-secondary hover:text-content-primary bg-surface-secondary'
          }`}
        >
          <Upload className="h-4 w-4 inline mr-2" />
          Load data
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeOptionsTab === 'schema' ? (
          <div className="h-full flex flex-col">
            {/* Inline Schema Browser */}
            <div className="flex-1 overflow-y-auto p-4">
              <UnifiedSchemaSelector
                librarySchemas={librarySchemas}
                uploadedSchemas={uploadedSchemas}
                selectionMode="acquisition"
                multiSelectMode={true}
                selectedAcquisitions={pendingSchemaSelections}
                onAcquisitionToggle={handleSchemaFirstToggle}
                onSchemaUpload={handleSchemaUpload}
                expandable={true}
                getSchemaContent={getSchemaContent}
                enableDragDrop={true}
                onAcquisitionDragStart={handleAcquisitionDragStart}
                onSchemaDragStart={handleSchemaDragStart}
                onSchemaReadmeClick={handleSchemaReadmeClick}
                onAcquisitionReadmeClick={handleAcquisitionReadmeClick}
              />
            </div>

            {/* Footer with Add Button */}
            <div className="px-4 py-3 border-t border-border flex items-center justify-between bg-surface-secondary">
              <p className="text-sm text-content-secondary">
                {pendingSchemaSelections.length} selected
              </p>
              <button
                onClick={confirmSchemaFirstSelections}
                disabled={pendingSchemaSelections.length === 0}
                className="px-4 py-2 bg-brand-600 text-content-inverted rounded-lg hover:bg-brand-700 disabled:bg-surface-tertiary disabled:text-content-muted disabled:cursor-not-allowed"
              >
                Add {pendingSchemaSelections.length} Acquisition{pendingSchemaSelections.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 flex-1">
            {/* Upload area content */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors h-full flex flex-col items-center justify-center ${
                isDragOver
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-border-secondary hover:border-brand-500'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {isProcessing ? (
                <>
                  <Loader className="h-12 w-12 text-brand-600 mx-auto mb-4 animate-spin" />
                  <h3 className="text-lg font-semibold text-content-primary mb-2">Processing DICOM Files</h3>
                  <p className="text-content-secondary mb-4">{progress?.currentOperation}</p>

                  {progress && (
                    <div className="space-y-3 mb-4 w-full max-w-xs">
                      <div className="w-full bg-surface-secondary rounded-full h-2">
                        <div
                          className="bg-brand-600 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${progress.percentage}%` }}
                        />
                      </div>
                      <p className="text-sm text-content-secondary">
                        {Math.round(progress.percentage)}% complete
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <Upload className="h-12 w-12 text-content-muted mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-content-primary mb-2">
                    Load Data for Compliance Testing
                  </h3>
                  <p className="text-content-secondary mb-4 text-sm">
                    Drag and drop DICOMs (folders or .zip), protocols (.pro, .exar1, .ExamCard, LxProtocol), or click to browse
                  </p>

                  <input
                    type="file"
                    multiple
                    webkitdirectory=""
                    accept=".dcm,.dicom,.zip,.pro,.exar1,.ExamCard,.examcard,LxProtocol"
                    className="hidden"
                    id="file-upload-tabbed"
                    onChange={(e) => handleFileUpload(e.target.files)}
                  />
                  <div className="flex items-center justify-center gap-3">
                    <label
                      htmlFor="file-upload-tabbed"
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-content-inverted bg-brand-600 hover:bg-brand-700 cursor-pointer"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Browse Files
                    </label>

                    <span className="text-content-tertiary text-sm">or</span>

                    <button
                      onClick={() => setShowSchemaAsDataModal(true)}
                      className="inline-flex items-center px-4 py-2 border border-brand-600 text-brand-600 text-sm font-medium rounded-md hover:bg-brand-50"
                    >
                      <Database className="h-4 w-4 mr-2" />
                      Generate Example Data
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Upload area component
  const renderUploadArea = (isExtra: boolean = false) => (
    <div className="border border-border rounded-lg bg-surface-primary shadow-sm p-6">
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragOver
            ? 'border-brand-500 bg-brand-50'
            : 'border-border-secondary hover:border-brand-500'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isProcessing ? (
          <>
            <Loader className="h-12 w-12 text-brand-600 mx-auto mb-4 animate-spin" />
            <h3 className="text-lg font-semibold text-content-primary mb-2">Processing DICOM Files</h3>
            <p className="text-content-secondary mb-4">{progress?.currentOperation}</p>

            {progress && (
              <div className="space-y-3 mb-4">
                <div className="w-full bg-surface-secondary rounded-full h-2">
                  <div
                    className="bg-brand-600 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${progress.percentage}%` }}
                  />
                </div>
                <p className="text-sm text-content-secondary">
                  {Math.round(progress.percentage)}% complete
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <Upload className="h-12 w-12 text-content-muted mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-content-primary mb-2">
              {isExtra ? 'Load More DICOM Files' : 'Load Data for Compliance Testing'}
            </h3>
            <p className="text-content-secondary mb-4">
              Evaluating compliance requires input data.<br/>Drag and drop DICOMs (folders or .zip), protocols (.pro, .exar1, .ExamCard, LxProtocol), or generate example data to begin.
            </p>

            <input
              type="file"
              multiple
              webkitdirectory=""
              accept=".dcm,.dicom,.zip,.pro,.exar1,.ExamCard,.examcard,LxProtocol"
              className="hidden"
              id={isExtra ? "file-upload-extra" : "file-upload"}
              onChange={(e) => handleFileUpload(e.target.files)}
            />
            <div className="flex items-center justify-center gap-3">
              <label
                htmlFor={isExtra ? "file-upload-extra" : "file-upload"}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-content-inverted bg-brand-600 hover:bg-brand-700 cursor-pointer"
              >
                <Upload className="h-4 w-4 mr-2" />
                Browse Files
              </label>

              <span className="text-content-tertiary text-sm">or</span>

              <button
                onClick={() => setShowSchemaAsDataModal(true)}
                className="inline-flex items-center px-4 py-2 border border-brand-600 text-brand-600 text-sm font-medium rounded-md hover:bg-brand-50"
              >
                <Database className="h-4 w-4 mr-2" />
                Generate Example Data
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-content-primary mb-2">Load and Validate DICOM Data</h2>
            <p className="text-content-secondary">

            </p>
            {(apiError || schemaError) && (
              <div className="mt-4 p-3 bg-status-error-bg border border-status-error/30 text-status-error rounded">
                {apiError || schemaError}
              </div>
            )}
          </div>

          {loadedData.length > 0 && (
            <button
              onClick={clearData}
              className="px-4 py-2 border border-border-secondary text-content-secondary rounded-lg hover:bg-surface-secondary"
            >
              Clear Data
            </button>
          )}
        </div>
      </div>

      {/* Master-Detail Layout */}
      <div className="grid grid-cols-12 gap-6 min-h-[800px]">
        {/* Left Panel - Acquisition Selector with DnD Kit */}
        <div
          className="col-span-12 md:col-span-3"
          onDragOver={handleSidebarDragOver}
          onDragLeave={handleSidebarDragLeave}
          onDrop={handleSidebarDrop}
        >
          <div className={`bg-surface-primary rounded-lg border shadow-sm transition-colors ${
            isOverDropZone ? 'border-brand-500 bg-brand-50/50' : 'border-border'
          }`}>
            {/* Header */}
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-lg font-medium text-content-primary">Acquisitions</h3>
              <p className="text-sm text-content-secondary">Select to view or drag to reorder</p>
            </div>

            {/* Acquisition List with DnD */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDndDragStart}
              onDragOver={handleDndDragOver}
              onDragEnd={handleDndDragEnd}
            >
              <div className="p-2 space-y-2 max-h-[800px] overflow-y-auto">
                {/* Upload New - Always first (not sortable) */}
                {renderAddNewItem()}

                {/* Drop hint when dragging from schema browser */}
                {isOverDropZone && (
                  <div className="p-3 text-center text-brand-600 text-sm border-2 border-dashed border-brand-500 rounded-lg bg-brand-50 dark:bg-brand-900/30">
                    Drop to add
                  </div>
                )}

                {/* Sortable items */}
                <SortableContext
                  items={sidebarItems.map(item => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {sidebarItems.map((item) => (
                    <SortableAcquisitionItem
                      key={item.id}
                      item={item}
                      isSelected={selectedAcquisitionId === item.id}
                      linkedData={item.type === 'schema-first' ? schemaFirstData.get(item.id) : undefined}
                      pairing={item.type === 'data' ? getAcquisitionPairing((item.data as Acquisition).id) : null}
                      onSelect={() => setSelectedAcquisitionId(item.id)}
                      onRemove={item.type === 'schema-first' ? () => removeSchemaFirstSelection(item.id) : undefined}
                    />
                  ))}
                </SortableContext>
              </div>

              {/* Drag Overlay for smooth animation */}
              <DragOverlay>
                {activeDragId ? (
                  <div className="border rounded-lg p-4 bg-surface-primary shadow-lg border-brand-500 opacity-90">
                    <div className="flex items-center space-x-2">
                      <GripVertical className="h-4 w-4 text-content-muted" />
                      <FileText className="h-4 w-4 text-content-tertiary" />
                      <span className="text-sm font-medium text-content-primary">
                        {sidebarItems.find(item => item.id === activeDragId)?.type === 'schema-first'
                          ? (sidebarItems.find(item => item.id === activeDragId)?.data as AcquisitionSelection)?.acquisitionName
                          : (sidebarItems.find(item => item.id === activeDragId)?.data as Acquisition)?.protocolName
                        }
                      </span>
                    </div>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>

        {/* Right Panel - Combined View */}
        <div className="col-span-12 md:col-span-9">
          {selectedAcquisitionId === ADD_NEW_ID ? (
            /* Show tabbed options for schema selection or data loading */
            renderTabbedOptions()
          ) : selectedAcquisitionId?.startsWith('schema-first:') ? (
            /* Show schema-first view */
            renderSchemaFirstView(selectedAcquisitionId)
          ) : selectedAcquisition ? (
            /* Show combined acquisition + schema view */
            renderCombinedView(selectedAcquisition)
          ) : (
            /* Fallback */
            <div className="bg-surface-primary rounded-lg border border-border shadow-sm p-6 h-full flex items-center justify-center">
              <div className="text-center">
                <FileText className="h-12 w-12 text-content-muted mx-auto mb-4" />
                <h3 className="text-lg font-medium text-content-primary mb-2">No Acquisition Selected</h3>
                <p className="text-content-secondary">Select an acquisition from the left panel</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      <SchemaUploadModal
        isOpen={showUploadModal}
        onClose={() => {
          setShowUploadModal(false);
          setUploadedFile(null);
        }}
        onUploadComplete={() => {
          setShowUploadModal(false);
          setUploadedFile(null);
        }}
        preloadedFile={uploadedFile}
      />

      {/* Schema Selection Modal */}
      {selectedAcquisition && (
        <SchemaSelectionModal
          isOpen={showSchemaSelectionModal}
          onClose={() => setShowSchemaSelectionModal(false)}
          title="Select Schema"
          description="Select a schema and acquisition to validate against"
          librarySchemas={librarySchemas}
          uploadedSchemas={uploadedSchemas}
          getSchemaContent={getSchemaContent}
          onSchemaUpload={handleSchemaUpload}
          onSchemaReadmeClick={handleSchemaReadmeClick}
          onAcquisitionReadmeClick={handleAcquisitionReadmeClick}
          onAcquisitionSelect={(schemaId, acquisitionId) => {
            pairSchemaWithAcquisition(selectedAcquisition.id, schemaId, acquisitionId);
            setShowSchemaSelectionModal(false);
          }}
        />
      )}

      {/* Schema-First Selection Modal */}
      <SchemaSelectionModal
        isOpen={showSchemaFirstModal}
        onClose={cancelSchemaFirstModal}
        title="Select Schema Acquisitions"
        description="Choose one or more schema acquisitions to validate against"
        librarySchemas={librarySchemas}
        uploadedSchemas={uploadedSchemas}
        getSchemaContent={getSchemaContent}
        onSchemaUpload={handleSchemaUpload}
        onSchemaReadmeClick={handleSchemaReadmeClick}
        onAcquisitionReadmeClick={handleAcquisitionReadmeClick}
        multiSelectMode={true}
        selectedAcquisitions={pendingSchemaSelections}
        onAcquisitionToggle={handleSchemaFirstToggle}
        footer={
          <div className="flex items-center justify-between">
            <p className="text-sm text-content-secondary">
              {pendingSchemaSelections.length} acquisition{pendingSchemaSelections.length !== 1 ? 's' : ''} selected
            </p>
            <div className="flex gap-3">
              <button
                onClick={cancelSchemaFirstModal}
                className="px-4 py-2 border border-border-secondary text-content-secondary rounded-lg hover:bg-surface-secondary"
              >
                Cancel
              </button>
              <button
                onClick={confirmSchemaFirstSelections}
                disabled={pendingSchemaSelections.length === 0}
                className="px-4 py-2 bg-brand-600 text-content-inverted rounded-lg hover:bg-brand-700 disabled:bg-surface-secondary disabled:text-content-muted disabled:cursor-not-allowed"
              >
                Add {pendingSchemaSelections.length} Acquisition{pendingSchemaSelections.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        }
      />

      {/* Schema as Data Source Modal */}
      <SchemaSelectionModal
        isOpen={showSchemaAsDataModal}
        onClose={() => setShowSchemaAsDataModal(false)}
        title="Select Schema to Generate Test Data"
        description="Choose a schema to generate DICOM files for testing"
        librarySchemas={librarySchemas}
        uploadedSchemas={uploadedSchemas}
        getSchemaContent={getSchemaContent}
        onSchemaUpload={handleSchemaUpload}
        onSchemaReadmeClick={handleSchemaReadmeClick}
        onAcquisitionReadmeClick={handleAcquisitionReadmeClick}
        onAcquisitionSelect={async (schemaId, acquisitionId) => {
          setShowSchemaAsDataModal(false);
          const schema = await getUnifiedSchema(schemaId);
          if (schema) {
            const binding: SchemaBinding = {
              schemaId,
              acquisitionId,
              schema
            };
            await handleSchemaAsData(binding);
          }
        }}
      />

      {/* Compliance Report Modal */}
      <ComplianceReportModal
        isOpen={showComplianceReport}
        onClose={() => setShowComplianceReport(false)}
        acquisitions={loadedData.filter(acq => schemaPairings.has(acq.id))}
        schemaPairings={schemaPairings}
        complianceResults={allComplianceResults}
        getSchemaContent={getSchemaContent}
        getSchemaAcquisition={getSchemaAcquisition}
      />

      {/* Continue Button */}
      <div className="mt-8 flex justify-end">
        <button
          onClick={handleContinue}
          disabled={getPairedCount() === 0}
          className="px-6 py-3 bg-brand-600 text-content-inverted rounded-lg hover:bg-brand-700 disabled:bg-surface-secondary disabled:text-content-muted disabled:cursor-not-allowed"
        >
          Export Compliance Report
          {getPairedCount() > 0 && (
            <span className="ml-2 bg-white bg-opacity-20 px-2 py-1 rounded-full text-xs">
              {getPairedCount()} analyzed
            </span>
          )}
        </button>
      </div>

      {/* Schema Validation Error Modal */}
      {schemaValidationError && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-surface-primary rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-status-error-bg rounded-full flex items-center justify-center">
                <span className="text-status-error text-xl">!</span>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-content-primary">Invalid Schema File</h3>
                <p className="mt-2 text-sm text-content-secondary">{schemaValidationError}</p>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setSchemaValidationError(null)}
                className="px-4 py-2 bg-surface-secondary text-content-primary rounded-md hover:bg-border-secondary"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DICOM Analysis Error Modal */}
      {dicomAnalysisError && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-primary rounded-lg p-6 w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-status-error-bg rounded-full flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-status-error" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-content-primary">DICOM Analysis Failed</h3>
                <p className="mt-1 text-sm text-content-tertiary">An error occurred while processing the DICOM files.</p>
              </div>
            </div>
            <div className="flex-1 min-h-0 mb-4 relative">
              <button
                onClick={() => navigator.clipboard.writeText(dicomAnalysisError)}
                className="absolute top-2 right-2 p-1.5 bg-surface-primary rounded border border-border-secondary hover:bg-surface-secondary text-content-tertiary hover:text-content-secondary"
                title="Copy error to clipboard"
              >
                <Copy className="h-4 w-4" />
              </button>
              <pre className="bg-surface-secondary rounded p-3 pr-10 text-xs text-content-secondary font-mono whitespace-pre-wrap break-words overflow-y-auto max-h-[40vh]">
                {dicomAnalysisError}
              </pre>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setDicomAnalysisError(null)}
                className="px-4 py-2 bg-surface-secondary text-content-primary rounded-md hover:bg-border-secondary"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Size Warning Modal */}
      {sizeWarning.show && sizeWarning.info && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-surface-primary rounded-lg max-w-md w-full p-6">
            <div className="flex items-center mb-4">
              <AlertTriangle className="h-6 w-6 text-status-warning mr-3" />
              <h3 className="text-lg font-medium text-content-primary">Large Dataset Warning</h3>
            </div>
            <p className="text-content-secondary mb-4">
              This dataset is <span className="font-semibold">{sizeWarning.info.totalGB.toFixed(1)} GB</span> ({sizeWarning.info.fileCount.toLocaleString()} files),
              which exceeds the recommended ~2 GB limit for browser processing.
            </p>
            <p className="text-content-tertiary text-sm mb-6">
              Processing may fail due to browser memory limits. For large datasets, consider using the desktop Python package instead.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setSizeWarning({ show: false, info: null, files: null })}
                className="px-4 py-2 border border-border-secondary text-content-secondary rounded-lg hover:bg-surface-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleProceedAnyway}
                className="px-4 py-2 bg-status-warning text-content-inverted rounded-lg hover:opacity-90"
              >
                Try Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* README Modal with sidebar navigation */}
      <SchemaReadmeModal
        isOpen={showReadmeModal}
        onClose={() => {
          setShowReadmeModal(false);
          setReadmeModalData(null);
        }}
        schemaName={readmeModalData?.schemaName || ''}
        readmeItems={readmeModalData?.readmeItems || []}
        initialSelection={readmeModalData?.initialSelection || 'schema'}
      />
    </div>
  );
};

export default DataLoadingAndMatching;