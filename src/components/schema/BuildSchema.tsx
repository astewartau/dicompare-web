import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Plus, Loader2, AlertTriangle, FileText, ArrowLeft, Copy, X, GripVertical } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { dicompareAPI } from '../../services/DicompareAPI';
import { useAcquisitions } from '../../contexts/AcquisitionContext';
import { useSchemaService } from '../../hooks/useSchemaService';
import { useSchemaContext } from '../../contexts/SchemaContext';
import AcquisitionTable from './AcquisitionTable';
import UnifiedSchemaSelector from './UnifiedSchemaSelector';
import { SchemaUploadModal } from './SchemaUploadModal';
import SchemaReadmeModal, { ReadmeItem } from './SchemaReadmeModal';
import { schemaCacheManager } from '../../services/SchemaCacheManager';
import { processFieldForUI } from '../../utils/fieldProcessing';
import { roundDicomValue } from '../../utils/valueRounding';
import { processUploadedFiles, checkFileSizeLimit, FileSizeInfo, getAllFilesFromDirectory } from '../../utils/fileUploadUtils';
import { convertSchemaToAcquisitions, convertRawAcquisitionToContext } from '../../utils/schemaToAcquisition';
import { processSchemaFieldForUI } from '../../utils/datatypeInference';
import { AcquisitionSelection } from '../../types';

// Droppable zone for acquisitions panel using dnd-kit
interface AcquisitionsDropZoneProps {
  isOverDropZone: boolean;
  children: React.ReactNode;
}

const AcquisitionsDropZone: React.FC<AcquisitionsDropZoneProps> = ({ isOverDropZone, children }) => {
  const { setNodeRef } = useDroppable({
    id: 'acquisitions-drop-zone',
  });

  return (
    <div ref={setNodeRef} className="col-span-12 md:col-span-4 lg:col-span-3">
      {children}
    </div>
  );
};

// Sortable wrapper for acquisition items in the list
interface SortableAcquisitionItemProps {
  id: string;
  children: (dragHandleProps: { attributes: any; listeners: any }) => React.ReactNode;
}

const SortableAcquisitionItem: React.FC<SortableAcquisitionItemProps> = ({ id, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({ attributes, listeners })}
    </div>
  );
};


const BuildSchema: React.FC = () => {
  const navigate = useNavigate();
  const {
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
    updateSeriesName,
    addValidationFunction,
    updateValidationFunction,
    deleteValidationFunction
  } = useAcquisitions();
  const {
    getAllUnifiedSchemas,
    getSchemaContent,
    librarySchemas,
    uploadedSchemas
  } = useSchemaService();
  const { editingSchema, setEditingSchema } = useSchemaContext();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [isPyodideReady, setIsPyodideReady] = useState(() => dicompareAPI.isInitialized());
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedAcquisitionId, setSelectedAcquisitionId] = useState<string | null>(null);
  const [showBackConfirmModal, setShowBackConfirmModal] = useState(false);
  const [dicomAnalysisError, setDicomAnalysisError] = useState<string | null>(null);
  const [sizeWarning, setSizeWarning] = useState<{ show: boolean; info: FileSizeInfo | null; files: FileList | null }>({
    show: false,
    info: null,
    files: null
  });

  // Tabbed layout state
  const [activeTab, setActiveTab] = useState<'schema' | 'data' | 'scratch'>('data');

  // Schema selection state (for Tab 1)
  const [selectedSchemaAcquisitions, setSelectedSchemaAcquisitions] = useState<AcquisitionSelection[]>([]);
  const [isAddingFromSchema, setIsAddingFromSchema] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [schemaValidationError, setSchemaValidationError] = useState<string | null>(null);

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

  // DnD Kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const ADD_NEW_ID = '__add_new__';

  // Auto-select logic for new workflow
  useEffect(() => {
    if (acquisitions.length === 0) {
      // Start with "Add New" selected when no acquisitions
      setSelectedAcquisitionId(ADD_NEW_ID);
    } else if (selectedAcquisitionId === ADD_NEW_ID) {
      // Keep "Add New" selected if it was previously selected, even when acquisitions exist
      // This allows user to create multiple acquisitions
    } else if (!selectedAcquisitionId || !acquisitions.find(a => a.id === selectedAcquisitionId)) {
      // Select first acquisition if none selected or selected one was deleted
      setSelectedAcquisitionId(acquisitions[0].id);
    }
  }, [acquisitions, selectedAcquisitionId]);

  // Load editing schema when available
  useEffect(() => {
    const loadEditingSchema = async () => {
      if (editingSchema && editingSchema.content) {
        try {
          // Convert schema to acquisitions format
          const schemaAcquisitions = await convertSchemaToAcquisitions(
            {
              id: editingSchema.id,
              name: editingSchema.metadata?.name || 'Editing Schema',
              ...editingSchema.metadata
            },
            async (schemaId: string) => JSON.stringify(editingSchema.content)
          );

          // Schema acquisitions are already properly formatted by convertSchemaToAcquisitions
          const contextAcquisitions = schemaAcquisitions;

          setAcquisitions(contextAcquisitions);
          console.log('✅ Schema loaded for editing');

          // Clear editing schema since we've loaded it
          setEditingSchema(null);
        } catch (error) {
          console.error('❌ Failed to load editing schema:', error);
        }
      }
    };

    loadEditingSchema();
  }, [editingSchema, setAcquisitions, setEditingSchema]);

  // Initialize Pyodide only when needed
  const initializePyodideIfNeeded = useCallback(async () => {
    if (dicompareAPI.isInitialized() || isPyodideReady) {
      return true;
    }

    try {
      setUploadStatus('Starting Python environment...');
      // Trigger initialization by calling a simple API method
      await dicompareAPI.getFieldInfo('0008,0060');
      setIsPyodideReady(true);
      setUploadStatus('Python environment ready!');
      setTimeout(() => setUploadStatus(''), 1000);
      console.log('✅ Pyodide initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Pyodide:', error);
      setUploadStatus('Failed to start Python environment');
      setIsPyodideReady(false);
      return false;
    }
  }, [isPyodideReady]);

  // Validation logic for field completeness
  const isFieldValueValid = (field: any) => {
    // Handle series field values that might be SeriesFieldValue objects
    if (typeof field === 'object' && field !== null && 'validationRule' in field) {
      const rule = field.validationRule;
      // For non-exact validation rules, check if the rule has the required value
      if (rule && rule.type !== 'exact') {
        if (rule.type === 'contains' && rule.contains) return true;
        if (rule.type === 'range' && rule.min !== undefined && rule.max !== undefined) return true;
        if (rule.type === 'tolerance' && rule.value !== undefined && rule.tolerance !== undefined) return true;
        if (rule.type === 'contains_any' && rule.contains_any && rule.contains_any.length > 0) return true;
        if (rule.type === 'contains_all' && rule.contains_all && rule.contains_all.length > 0) return true;
        return false;
      }
      // For exact validation, accept any value including empty string, empty array, 0, null
      // The user explicitly set this value, so it's valid
      return true;
    }

    // Handle direct values (arrays, strings, numbers)
    // Accept any value including empty string, empty array, 0, null
    // Only reject undefined (field not set at all)
    if (field === undefined) return false;
    return true;
  };

  // Helper to get series field definitions from series data
  const getSeriesFieldDefinitions = (acquisition: Acquisition) => {
    const fieldMap = new Map<string, { tag: string | null; name: string }>();

    // Extract field definitions from all series
    // Use tag or name as key (for derived fields that have null tags)
    acquisition.series?.forEach(series => {
      // Handle both array format (from loaded schemas) and object format (from processed data)
      if (Array.isArray(series.fields)) {
        series.fields.forEach(field => {
          const fieldKey = field.tag || field.name;
          if (!fieldMap.has(fieldKey)) {
            fieldMap.set(fieldKey, {
              tag: field.tag,
              name: field.field || field.name || field.tag || 'unknown'
            });
          }
        });
      } else if (series.fields && typeof series.fields === 'object') {
        // Handle object format where fields is an object keyed by tag
        Object.entries(series.fields).forEach(([tag, fieldData]: [string, any]) => {
          if (!fieldMap.has(tag)) {
            fieldMap.set(tag, {
              tag: tag,
              name: fieldData.name || fieldData.field || tag
            });
          }
        });
      }
    });

    return Array.from(fieldMap.values());
  };

  // Helper to check if a specific acquisition has incomplete fields
  const getAcquisitionIncompleteFields = (acquisitionId: string) => {
    const acquisitionIncomplete = new Set<string>();

    const acquisition = acquisitions.find(a => a.id === acquisitionId);
    if (!acquisition) return acquisitionIncomplete;

    // Check acquisition-level fields
    acquisition.acquisitionFields.forEach(field => {
      if (!isFieldValueValid(field)) {
        const fieldKey = field.tag || field.name;
        acquisitionIncomplete.add(`${acquisition.id}-${fieldKey}`);
      }
    });

    // Get series field definitions from the series data
    const seriesFieldDefs = getSeriesFieldDefinitions(acquisition);

    // Check series field values only if there are series-level fields
    if (seriesFieldDefs.length > 0) {
      const minSeriesCount = Math.max(1, acquisition.series?.length || 0);

      for (let seriesIndex = 0; seriesIndex < minSeriesCount; seriesIndex++) {
        const series = acquisition.series?.[seriesIndex];

        seriesFieldDefs.forEach(fieldDef => {
          let fieldValue = null;
          const fieldKey = fieldDef.tag || fieldDef.name;

          // Handle both array format (from loaded schemas) and object format (from processed data)
          // Use tag-or-name matching for derived fields with null tags
          if (Array.isArray(series?.fields)) {
            fieldValue = series.fields.find(f => f.tag === fieldDef.tag || f.name === fieldDef.name);
          } else if (series?.fields && typeof series.fields === 'object') {
            fieldValue = series.fields[fieldKey];
          }

          // Use == null to check for null/undefined without catching falsy values like 0
          if (fieldValue == null || !isFieldValueValid(fieldValue)) {
            acquisitionIncomplete.add(`${acquisition.id}-series-${seriesIndex}-${fieldKey}`);
          }
        });
      }
    }

    return acquisitionIncomplete;
  };

  const getIncompleteFields = () => {
    const incompleteFields = new Set<string>();
    acquisitions.forEach(acquisition => {
      const acquisitionIncomplete = getAcquisitionIncompleteFields(acquisition.id);
      acquisitionIncomplete.forEach(field => incompleteFields.add(field));
    });
    return incompleteFields;
  };

  const incompleteFields = getIncompleteFields();
  const hasIncompleteFields = incompleteFields.size > 0;

  const selectedAcquisition = selectedAcquisitionId && selectedAcquisitionId !== ADD_NEW_ID
    ? acquisitions.find(a => a.id === selectedAcquisitionId)
    : null;

  // Core file processing logic - called after size check passes or user chooses to proceed anyway
  const processFiles = useCallback(async (files: FileList, skipSizeCheck: boolean = false) => {
    setIsUploading(true);
    setUploadProgress(0);
    setUploadStatus('Preparing files...');

    try {
      // IMPORTANT: Read files into memory FIRST before initializing Pyodide
      // This prevents browser file access timeout issues on slower systems
      setUploadStatus('Reading file data...');

      const fileObjects = await processUploadedFiles(files, {
        onProgress: (fileProgress) => {
          setUploadStatus(`Reading file ${fileProgress.current} of ${fileProgress.total}: ${fileProgress.fileName}`);
          setUploadProgress((fileProgress.current / fileProgress.total) * 30); // 0-30% for file reading
        },
        skipSizeCheck
      });

      // Now initialize Pyodide if needed (after files are safely in memory)
      const initSuccess = await initializePyodideIfNeeded();
      if (!initSuccess) {
        setIsUploading(false);
        return;
      }
      
      setUploadStatus('Processing DICOM files...');
      
      // Analyze files using the API and get UI-formatted data with progress callback
      const acquisitions = await dicompareAPI.analyzeFilesForUI(fileObjects, (progress) => {
        console.log('🔄 Generate Template JavaScript received progress:', progress);
        
        // Convert Proxy object to plain object if needed
        const progressObj = progress.toJs ? progress.toJs() : progress;
        const percentage = progressObj.percentage || 0;
        const operation = progressObj.currentOperation || 'Processing...';
        
        setUploadProgress(30 + (percentage * 0.6)); // Scale to 30-90%
        setUploadStatus(operation);
        console.log('🔄 Generate Template set progress to:', 30 + (percentage * 0.6) + '%');
      });
      
      // Convert to acquisition context format with validation rules and value rounding
      const contextAcquisitions = acquisitions.map(acq => ({
        ...acq,
        acquisitionFields: acq.acquisitionFields.map(field => processFieldForUI(field)),
        series: acq.series.map(series => ({
          name: series.name,
          fields: Array.isArray(series.fields)
            ? series.fields.map(field => ({
                tag: field.tag,
                name: field.name,
                value: roundDicomValue(field.value),  // Direct value, same as acquisition fields
                validationRule: field.validationRule || { type: 'exact' },
                fieldType: field.fieldType  // Preserve field type (standard/derived)
              }))
            : [] // Handle old object format by converting to empty array
        }))
      }));
      
      setAcquisitions(prev => [...prev, ...contextAcquisitions]);

      // Auto-select the first newly created acquisition
      if (contextAcquisitions.length > 0) {
        setSelectedAcquisitionId(contextAcquisitions[0].id);
      }

      setUploadProgress(100);

      console.log('✅ Analysis complete');
      
    } catch (error) {
      console.error('❌ Load failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setDicomAnalysisError(errorMessage);
      setUploadStatus('');
    } finally {
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        setUploadStatus('');
      }, 500);
    }
  }, [setAcquisitions, initializePyodideIfNeeded]);

  // Main file upload handler - checks size first and shows warning if needed
  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files) return;

    // Check file size before processing
    setUploadStatus('Checking file sizes...');
    const sizeInfo = await checkFileSizeLimit(files);

    if (sizeInfo.exceedsLimit) {
      // Show warning modal and let user decide
      setSizeWarning({ show: true, info: sizeInfo, files });
      setUploadStatus('');
      return;
    }

    // Size is OK, proceed with processing
    await processFiles(files, false);
  }, [processFiles]);

  // Handle "try anyway" from size warning modal
  const handleProceedAnyway = useCallback(async () => {
    const files = sizeWarning.files;
    setSizeWarning({ show: false, info: null, files: null });

    if (files) {
      await processFiles(files, true);
    }
  }, [sizeWarning.files, processFiles]);

  const handleProFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    const fileName = file.name.toLowerCase();

    // Validate file extension
    // LxProtocol files have no extension - check if parent folder or filename suggests it
    const isLxProtocol = fileName === 'lxprotocol' || fileName.endsWith('/lxprotocol');
    if (!fileName.endsWith('.pro') && !fileName.endsWith('.exar1') && !fileName.endsWith('.examcard') && !isLxProtocol) {
      setUploadStatus('Please select a protocol file (.pro, .exar1, .ExamCard, or LxProtocol)');
      setTimeout(() => setUploadStatus(''), 3000);
      return;
    }

    const isExarFile = fileName.endsWith('.exar1');
    const isExamCard = fileName.endsWith('.examcard');
    setIsUploading(true);
    setUploadProgress(0);
    setUploadStatus(`Processing ${isLxProtocol ? 'GE LxProtocol' : isExamCard ? 'Philips ExamCard' : isExarFile ? 'Siemens exam archive' : 'Siemens protocol'} file...`);

    try {
      setUploadProgress(30);

      // IMPORTANT: Read file content FIRST before initializing Pyodide
      // This prevents browser file access timeout issues on slower systems
      const fileContent = await file.arrayBuffer();
      setUploadProgress(60);

      // Now initialize Pyodide if needed (after file is safely in memory)
      const initSuccess = await initializePyodideIfNeeded();
      if (!initSuccess) {
        setIsUploading(false);
        return;
      }

      // Process via API - .exar1, .ExamCard, and LxProtocol return multiple acquisitions, .pro returns one
      if (isLxProtocol) {
        const acquisitions = await dicompareAPI.loadLxProtocolFile(new Uint8Array(fileContent), file.name);

        // Add validation rules and round values for fields
        const processedAcquisitions = acquisitions.map(acquisition => ({
          ...acquisition,
          acquisitionFields: acquisition.acquisitionFields.map(field => processFieldForUI(field, 'lxprotocol'))
        }));

        setAcquisitions(prev => [...prev, ...processedAcquisitions]);

        // Auto-select the first newly created acquisition
        if (processedAcquisitions.length > 0) {
          setSelectedAcquisitionId(processedAcquisitions[0].id);
        }

        console.log(`✅ LxProtocol file loaded successfully: ${acquisitions.length} scan(s)`);
      } else if (isExamCard) {
        const acquisitions = await dicompareAPI.loadExamCardFile(new Uint8Array(fileContent), file.name);

        // Add validation rules and round values for fields
        const processedAcquisitions = acquisitions.map(acquisition => ({
          ...acquisition,
          acquisitionFields: acquisition.acquisitionFields.map(field => processFieldForUI(field, 'examcard'))
        }));

        setAcquisitions(prev => [...prev, ...processedAcquisitions]);

        // Auto-select the first newly created acquisition
        if (processedAcquisitions.length > 0) {
          setSelectedAcquisitionId(processedAcquisitions[0].id);
        }

        console.log(`✅ ExamCard file loaded successfully: ${acquisitions.length} scan(s)`);
      } else if (isExarFile) {
        const acquisitions = await dicompareAPI.loadExarFile(new Uint8Array(fileContent), file.name);

        // Add validation rules and round values for fields
        const processedAcquisitions = acquisitions.map(acquisition => ({
          ...acquisition,
          acquisitionFields: acquisition.acquisitionFields.map(field => processFieldForUI(field, 'pro'))
        }));

        setAcquisitions(prev => [...prev, ...processedAcquisitions]);

        // Auto-select the first newly created acquisition
        if (processedAcquisitions.length > 0) {
          setSelectedAcquisitionId(processedAcquisitions[0].id);
        }

        console.log(`✅ Exam archive file loaded successfully: ${acquisitions.length} protocol(s)`);
      } else {
        const acquisition = await dicompareAPI.loadProFile(new Uint8Array(fileContent), file.name);

        // Add validation rules and round values for fields
        const processedAcquisition = {
          ...acquisition,
          acquisitionFields: acquisition.acquisitionFields.map(field => processFieldForUI(field, 'pro'))
        };

        setAcquisitions(prev => [...prev, processedAcquisition]);

        // Auto-select the newly created acquisition
        setSelectedAcquisitionId(processedAcquisition.id);

        console.log('✅ Protocol file loaded successfully');
      }

      setUploadProgress(100);

    } catch (error) {
      console.error('❌ Protocol file load failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setUploadStatus(`Load failed: ${errorMessage}`);

      setTimeout(() => {
        setUploadStatus('');
      }, 5000);
    } finally {
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        if (!uploadStatus.includes('failed:')) {
          setUploadStatus('');
        }
      }, 500);
    }
  }, [setAcquisitions, initializePyodideIfNeeded]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Only set to false if we're leaving the drop zone entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    // Handle both files and directories from drag and drop
    const items = Array.from(e.dataTransfer.items);
    const files: File[] = [];
    
    // Process each dropped item
    for (const item of items) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          if (entry.isDirectory) {
            // Handle directory - recursively get all files
            const dirFiles = await getAllFilesFromDirectory(entry as FileSystemDirectoryEntry);
            files.push(...dirFiles);
          } else {
            // Handle single file
            const file = item.getAsFile();
            if (file) files.push(file);
          }
        } else {
          // Fallback for browsers that don't support webkitGetAsEntry
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
    }
    
    if (files.length > 0) {
      // Separate protocol files (.pro, .exar1, .ExamCard, LxProtocol) from DICOM files
      const proFiles = files.filter(file => {
        const name = file.name.toLowerCase();
        return name.endsWith('.pro') || name.endsWith('.exar1') || name.endsWith('.examcard') || name === 'lxprotocol';
      });
      const dicomFiles = files.filter(file => {
        const name = file.name.toLowerCase();
        return !name.endsWith('.pro') && !name.endsWith('.exar1') && !name.endsWith('.examcard') && name !== 'lxprotocol';
      });

      // Handle protocol files first
      for (const proFile of proFiles) {
        const proFileList = {
          length: 1,
          item: () => proFile,
          0: proFile,
          [Symbol.iterator]: function* () {
            yield proFile;
          }
        };
        await handleProFileUpload(proFileList as FileList);
      }
      
      // Handle DICOM files if any
      if (dicomFiles.length > 0) {
        const fileList = {
          length: dicomFiles.length,
          item: (index: number) => dicomFiles[index] || null,
          [Symbol.iterator]: function* () {
            for (let i = 0; i < dicomFiles.length; i++) {
              yield dicomFiles[i];
            }
          }
        };
        // Add array access
        dicomFiles.forEach((file, index) => {
          (fileList as any)[index] = file;
        });
        
        await handleFileUpload(fileList as FileList);
      }
    } else {
      // Fallback to original behavior
      const allFiles = Array.from(e.dataTransfer.files);
      const proFiles = allFiles.filter(file => {
        const name = file.name.toLowerCase();
        return name.endsWith('.pro') || name.endsWith('.exar1') || name.endsWith('.examcard');
      });
      const dicomFiles = allFiles.filter(file => {
        const name = file.name.toLowerCase();
        return !name.endsWith('.pro') && !name.endsWith('.exar1') && !name.endsWith('.examcard');
      });

      // Handle protocol files
      for (const proFile of proFiles) {
        const proFileList = {
          length: 1,
          item: () => proFile,
          0: proFile
        } as FileList;
        await handleProFileUpload(proFileList);
      }
      
      // Handle DICOM files
      if (dicomFiles.length > 0) {
        const dicomFileList = {
          length: dicomFiles.length,
          item: (index: number) => dicomFiles[index] || null
        } as FileList;
        dicomFiles.forEach((file, index) => {
          (dicomFileList as any)[index] = file;
        });
        await handleFileUpload(dicomFileList);
      }
    }
  }, [handleFileUpload, handleProFileUpload]);

  const clearData = () => {
    setAcquisitions([]);
  };

  const handleContinue = () => {
    navigate('/schema-builder/enter-metadata');
  };

  const handleBack = () => {
    // If there's any data, show confirmation modal
    if (acquisitions.length > 0) {
      setShowBackConfirmModal(true);
    } else {
      // No data to lose, go back directly
      navigate('/');
    }
  };

  const confirmBack = () => {
    setShowBackConfirmModal(false);
    setAcquisitions([]); // Clear data
    navigate('/');
  };

  // Schema selection handlers (Tab 1)
  const handleSchemaAcquisitionToggle = (selection: AcquisitionSelection) => {
    setSelectedSchemaAcquisitions(prev => {
      const exists = prev.some(
        s => s.schemaId === selection.schemaId && s.acquisitionIndex === selection.acquisitionIndex
      );
      return exists
        ? prev.filter(s => !(s.schemaId === selection.schemaId && s.acquisitionIndex === selection.acquisitionIndex))
        : [...prev, selection];
    });
  };

  const handleAddFromSelectedSchemas = async () => {
    if (selectedSchemaAcquisitions.length === 0) return;

    setIsAddingFromSchema(true);
    try {
      const newAcquisitions: any[] = [];

      // Group selections by schemaId for efficient loading
      const selectionsBySchema = new Map<string, AcquisitionSelection[]>();
      for (const sel of selectedSchemaAcquisitions) {
        if (!selectionsBySchema.has(sel.schemaId)) {
          selectionsBySchema.set(sel.schemaId, []);
        }
        selectionsBySchema.get(sel.schemaId)!.push(sel);
      }

      // Extract each acquisition
      for (const [schemaId, selections] of selectionsBySchema) {
        const schemaContent = await getSchemaContent(schemaId);
        if (!schemaContent) {
          console.warn(`Failed to load schema content for ${schemaId}`);
          continue;
        }

        const parsedSchema = JSON.parse(schemaContent);
        const acquisitionKeys = Object.keys(parsedSchema.acquisitions || {});

        for (const sel of selections) {
          if (sel.acquisitionIndex < acquisitionKeys.length) {
            const acquisitionName = acquisitionKeys[sel.acquisitionIndex];
            const targetAcquisition = parsedSchema.acquisitions[acquisitionName];

            if (targetAcquisition) {
              const newAcquisition = convertRawAcquisitionToContext(
                acquisitionName,
                targetAcquisition,
                schemaId,
                targetAcquisition.tags
              );
              newAcquisitions.push(newAcquisition);
            }
          }
        }
      }

      if (newAcquisitions.length > 0) {
        setAcquisitions(prev => [...prev, ...newAcquisitions]);
        // Select the first newly added acquisition
        setSelectedAcquisitionId(newAcquisitions[0].id);
        // Clear selections
        setSelectedSchemaAcquisitions([]);
      }
    } catch (error) {
      console.error('Failed to add from selected schemas:', error);
    } finally {
      setIsAddingFromSchema(false);
    }
  };

  const handleSchemaFileUpload = async (file: File) => {
    setSchemaValidationError(null);
    try {
      const validation = await schemaCacheManager.validateSchemaFile(file);
      if (!validation.isValid) {
        setSchemaValidationError(validation.error || 'Invalid schema file');
        return;
      }
      setUploadedFile(file);
      setShowUploadModal(true);
    } catch (error) {
      console.error('Failed to validate schema file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setSchemaValidationError(errorMessage);
    }
  };

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

    // Acquisition-level READMEs
    const acquisitions = schemaData.acquisitions || {};
    Object.entries(acquisitions).forEach(([name, data]: [string, any], index) => {
      items.push({
        id: `acquisition-${index}`,
        type: 'acquisition',
        name: name,
        description: data.detailed_description || data.description || '',
        acquisitionIndex: index
      });
    });

    return items;
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
  const handleAcquisitionReadmeClick = async (schemaId: string, schemaName: string, acquisitionIndex: number, _acquisitionName: string) => {
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

  // DnD Kit handlers for drag-and-drop from schema selector
  const handleDndDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDndDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    // Check if dragging from schema browser (not reordering)
    const activeId = active.id as string;
    const isFromSchemaBrowser = activeId.startsWith('schema-drag-') || activeId.startsWith('acq-drag-');

    if (!isFromSchemaBrowser || !over) {
      setIsOverDropZone(false);
      return;
    }

    // Only show drop zone if over specific valid targets:
    // - The acquisitions drop zone itself
    // - Any existing acquisition in the list
    const overId = over.id as string;
    const isOverDropZone = overId === 'acquisitions-drop-zone';
    const isOverAcquisition = acquisitions.some(a => a.id === overId);

    setIsOverDropZone(isOverDropZone || isOverAcquisition);
  };

  const handleDndDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);
    setIsOverDropZone(false);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Check if this is a drop from schema browser
    const isFromSchemaBrowser = activeId.startsWith('schema-drag-') || activeId.startsWith('acq-drag-');

    // Only accept drops on specific valid targets:
    // - The acquisitions drop zone itself
    // - Any existing acquisition in the list
    const isOverDropZone = overId === 'acquisitions-drop-zone';
    const isOverAcquisition = acquisitions.some(a => a.id === overId);
    const isValidDropTarget = isOverDropZone || isOverAcquisition;

    // Handle drop on acquisitions panel (from schema browser)
    if (isFromSchemaBrowser && isValidDropTarget) {
      const dragData = active.data.current;
      if (dragData?.type === 'acquisition') {
        // Single acquisition drop - add to acquisitions
        const selection: AcquisitionSelection = dragData.selection;
        try {
          const schemaContent = await getSchemaContent(selection.schemaId);
          if (!schemaContent) return;

          const parsedSchema = JSON.parse(schemaContent);
          const acquisitionKeys = Object.keys(parsedSchema.acquisitions || {});

          if (selection.acquisitionIndex < acquisitionKeys.length) {
            const acquisitionName = acquisitionKeys[selection.acquisitionIndex];
            const targetAcquisition = parsedSchema.acquisitions[acquisitionName];

            if (targetAcquisition) {
              const newAcquisition = convertRawAcquisitionToContext(
                acquisitionName,
                targetAcquisition,
                selection.schemaId,
                targetAcquisition.tags
              );
              setAcquisitions(prev => [...prev, newAcquisition]);
              setSelectedAcquisitionId(newAcquisition.id);
            }
          }
        } catch (error) {
          console.error('Failed to add acquisition from drag:', error);
        }
      } else if (dragData?.type === 'schema') {
        // Entire schema drop - add all acquisitions
        try {
          const schemaContent = await getSchemaContent(dragData.schemaId);
          if (!schemaContent) return;

          const parsedSchema = JSON.parse(schemaContent);
          const acquisitionEntries = Object.entries(parsedSchema.acquisitions || {});

          const newAcquisitions: any[] = [];
          acquisitionEntries.forEach(([name, acqData]: [string, any]) => {
            const newAcquisition = convertRawAcquisitionToContext(
              name,
              acqData,
              dragData.schemaId,
              acqData.tags
            );
            newAcquisitions.push(newAcquisition);
          });

          if (newAcquisitions.length > 0) {
            setAcquisitions(prev => [...prev, ...newAcquisitions]);
            setSelectedAcquisitionId(newAcquisitions[0].id);
          }
        } catch (error) {
          console.error('Failed to add schema acquisitions from drag:', error);
        }
      }
      return;
    }

    // Handle reordering within acquisitions list
    if (activeId !== overId) {
      // Check if both items are acquisitions (not schema browser items)
      const isActiveAcquisition = acquisitions.some(a => a.id === activeId);
      const isOverAcquisition = acquisitions.some(a => a.id === overId);

      if (isActiveAcquisition && isOverAcquisition) {
        setAcquisitions(prev => {
          const oldIndex = prev.findIndex(a => a.id === activeId);
          const newIndex = prev.findIndex(a => a.id === overId);
          if (oldIndex === -1 || newIndex === -1) return prev;
          return arrayMove(prev, oldIndex, newIndex);
        });
      }
    }
  };

  // Component to render compact acquisition preview card
  const renderAcquisitionPreview = (acquisition: any, dragHandleProps?: { attributes: any; listeners: any }) => {
    const incompleteFields = getAcquisitionIncompleteFields(acquisition.id);
    const hasIncomplete = incompleteFields.size > 0;
    const isSelected = selectedAcquisitionId === acquisition.id;

    return (
      <div
        onClick={() => setSelectedAcquisitionId(acquisition.id)}
        className={`border rounded-lg p-4 cursor-pointer transition-all ${
          isSelected
            ? 'border-brand-500 bg-brand-50 shadow-md'
            : 'border-border hover:border-border-secondary hover:bg-surface-secondary'
        }`}
      >
        <div className="flex items-start">
          {/* Drag handle - only this initiates drag */}
          <div
            {...(dragHandleProps?.attributes || {})}
            {...(dragHandleProps?.listeners || {})}
            className="cursor-grab active:cursor-grabbing touch-none"
          >
            <GripVertical className="h-4 w-4 text-content-muted mt-0.5 mr-2 flex-shrink-0" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <FileText className="h-4 w-4 text-content-tertiary flex-shrink-0" />
              <h3 className="text-sm font-medium text-content-primary truncate">
                {acquisition.protocolName || 'Untitled Acquisition'}
              </h3>
              {hasIncomplete && (
                <AlertTriangle className="h-4 w-4 text-status-error flex-shrink-0" title={`${incompleteFields.size} incomplete fields`} />
              )}
            </div>
            <p className="text-xs text-content-secondary mt-1 truncate">
              {acquisition.seriesDescription || 'No description'}
            </p>
            <div className="flex items-center space-x-4 mt-2 text-xs text-content-tertiary">
              <span>{acquisition.acquisitionFields.length} fields</span>
              {acquisition.series && acquisition.series.length > 0 && (
                <span>{acquisition.series.length} series</span>
              )}
              {acquisition.validationFunctions && acquisition.validationFunctions.length > 0 && (
                <span>{acquisition.validationFunctions.length} rules</span>
              )}
            </div>
          </div>
          {/* Delete button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteAcquisition(acquisition.id);
            }}
            className="p-1 text-content-tertiary hover:text-status-error rounded ml-2 flex-shrink-0"
            title="Remove"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  };

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
            Add acquisitions
          </h3>
        </div>
      </div>
    );
  };

  // Tabbed options - schema browser or data upload
  const renderTabbedOptions = () => (
    <div className="border border-border rounded-lg bg-surface-primary shadow-sm flex flex-col h-full">
      {/* Tab Headers */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab('schema')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'schema'
              ? 'text-brand-600 border-b-2 border-brand-600 bg-surface-primary'
              : 'text-content-secondary hover:text-content-primary bg-surface-secondary'
          }`}
        >
          <FileText className="h-4 w-4 inline mr-2" />
          From schema
        </button>
        <button
          onClick={() => setActiveTab('data')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'data'
              ? 'text-brand-600 border-b-2 border-brand-600 bg-surface-primary'
              : 'text-content-secondary hover:text-content-primary bg-surface-secondary'
          }`}
        >
          <Upload className="h-4 w-4 inline mr-2" />
          From data
        </button>
        <button
          onClick={() => {
            // Immediately create a new acquisition and navigate to it
            const newAcquisitionId = `acq_${Date.now()}`;
            const newAcquisition = {
              id: newAcquisitionId,
              protocolName: 'New Acquisition',
              seriesDescription: '',
              totalFiles: 0,
              acquisitionFields: [],
              series: [],
              metadata: {},
              validationFunctions: []
            };
            setAcquisitions(prev => [...prev, newAcquisition]);
            setSelectedAcquisitionId(newAcquisitionId);
          }}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'scratch'
              ? 'text-brand-600 border-b-2 border-brand-600 bg-surface-primary'
              : 'text-content-secondary hover:text-content-primary bg-surface-secondary'
          }`}
        >
          <Plus className="h-4 w-4 inline mr-2" />
          From scratch
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'schema' ? (
          <div className="h-full flex flex-col">
            {/* Inline Schema Browser */}
            <div className="flex-1 overflow-y-auto p-4">
              <UnifiedSchemaSelector
                librarySchemas={librarySchemas}
                uploadedSchemas={uploadedSchemas}
                selectionMode="acquisition"
                multiSelectMode={true}
                selectedAcquisitions={selectedSchemaAcquisitions}
                onAcquisitionToggle={handleSchemaAcquisitionToggle}
                onSchemaUpload={handleSchemaFileUpload}
                expandable={true}
                getSchemaContent={getSchemaContent}
                enableDragDrop={true}
                onSchemaReadmeClick={handleSchemaReadmeClick}
                onAcquisitionReadmeClick={handleAcquisitionReadmeClick}
              />
            </div>

            {/* Footer with Add Button */}
            <div className="px-4 py-3 border-t border-border flex items-center justify-between bg-surface-secondary">
              <p className="text-sm text-content-secondary">
                {selectedSchemaAcquisitions.length} selected
              </p>
              <button
                onClick={handleAddFromSelectedSchemas}
                disabled={selectedSchemaAcquisitions.length === 0 || isAddingFromSchema}
                className="px-4 py-2 bg-brand-600 text-content-inverted rounded-lg hover:bg-brand-700 disabled:bg-surface-tertiary disabled:text-content-muted disabled:cursor-not-allowed"
              >
                {isAddingFromSchema ? (
                  <>
                    <Loader2 className="h-4 w-4 inline mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>Add {selectedSchemaAcquisitions.length} Acquisition{selectedSchemaAcquisitions.length !== 1 ? 's' : ''}</>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 flex-1">
            {/* Upload area content */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 transition-colors h-full flex flex-col ${
                isDragOver
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-border-secondary hover:border-brand-500'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {isUploading ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <Loader2 className="h-12 w-12 text-brand-600 mx-auto mb-4 animate-spin" />
                  <h3 className="text-lg font-semibold text-content-primary mb-2">Processing Files</h3>
                  <p className="text-content-secondary mb-4">{uploadStatus}</p>

                  <div className="w-full max-w-xs space-y-3 mb-4">
                    <div className="w-full bg-surface-secondary rounded-full h-2">
                      <div
                        className="bg-brand-600 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-sm text-content-secondary text-center">
                      {Math.round(uploadProgress)}% complete
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <Upload className="h-10 w-10 text-brand-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-content-primary mb-2 text-center">
                    Load Data
                  </h3>
                  <p className="text-sm text-content-secondary mb-6 text-center">
                    Drag and drop files, or choose an option below
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-xl">
                    {/* DICOM Loading Section */}
                    <div className="border border-blue-500/20 rounded-lg p-4 bg-blue-500/5 hover:bg-blue-500/10 transition-colors">
                      <div className="text-center">
                        <Upload className="h-6 w-6 text-blue-500 mx-auto mb-2" />
                        <h4 className="text-sm font-medium text-content-primary mb-1">DICOM Files</h4>
                        <p className="text-xs text-content-secondary mb-3">Load DICOM files, zip archives, or folders</p>
                        <input
                          type="file"
                          multiple
                          webkitdirectory=""
                          accept=".dcm,.dicom,.zip"
                          className="hidden"
                          id="dicom-upload-tabbed"
                          onChange={(e) => handleFileUpload(e.target.files)}
                        />
                        <label
                          htmlFor={!isUploading ? "dicom-upload-tabbed" : ""}
                          className={`inline-flex items-center justify-center w-full px-3 py-2 border border-transparent text-xs font-medium rounded-md ${
                            !isUploading
                              ? 'text-white bg-blue-600 hover:bg-blue-700 cursor-pointer'
                              : 'text-content-muted bg-surface-secondary cursor-not-allowed'
                          }`}
                        >
                          <Upload className="h-3 w-3 mr-1" />
                          Browse DICOMs
                        </label>
                      </div>
                    </div>

                    {/* Protocol Upload Section */}
                    <div className="border border-purple-500/20 rounded-lg p-4 bg-purple-500/5 hover:bg-purple-500/10 transition-colors">
                      <div className="text-center">
                        <Upload className="h-6 w-6 text-purple-500 mx-auto mb-2" />
                        <h4 className="text-sm font-medium text-content-primary mb-1">Protocol Files</h4>
                        <p className="text-xs text-content-secondary mb-3">Siemens, Philips, or GE protocols</p>
                        <input
                          type="file"
                          accept=".pro,.exar1,.ExamCard,.examcard,LxProtocol"
                          className="hidden"
                          id="protocol-upload-tabbed"
                          onChange={(e) => handleProFileUpload(e.target.files)}
                        />
                        <label
                          htmlFor={!isUploading ? "protocol-upload-tabbed" : ""}
                          className={`inline-flex items-center justify-center w-full px-3 py-2 border border-transparent text-xs font-medium rounded-md ${
                            !isUploading
                              ? 'text-white bg-purple-600 hover:bg-purple-700 cursor-pointer'
                              : 'text-content-muted bg-surface-secondary cursor-not-allowed'
                          }`}
                        >
                          <Upload className="h-3 w-3 mr-1" />
                          Browse Protocols
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );




  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-content-primary mb-4">
              Schema Builder
              {editingSchema && (
                <span className="text-lg font-normal text-brand-600 ml-2">
                  (Editing: {editingSchema.metadata?.name || 'Schema'})
                </span>
              )}
            </h2>
            <p className="text-content-secondary">
              {acquisitions.length > 0 ? (
                editingSchema ?
                  'Review and modify the loaded schema acquisitions and configure which DICOM fields to include.' :
                  'Review detected acquisitions and configure which DICOM fields to include in your validation schema.'
              ) : (
                'Start from an existing schema or load reference data to create acquisition schemas.'
              )}
            </p>
          </div>

          <div className="flex space-x-3">
            {acquisitions.length > 0 && (
              <button
                onClick={clearData}
                className="px-4 py-2 border border-border-secondary text-content-secondary rounded-lg hover:bg-surface-secondary"
              >
                Clear Data
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Master-Detail Layout - Always Visible */}
      {/* DndContext wraps entire layout to enable drag from schema browser to acquisitions panel */}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDndDragStart}
        onDragOver={handleDndDragOver}
        onDragEnd={handleDndDragEnd}
      >
        <div className="grid grid-cols-12 gap-6 min-h-[600px]">
          {/* Left Panel - Acquisition Selector (Droppable Zone) */}
          <AcquisitionsDropZone isOverDropZone={isOverDropZone}>
            <div className={`bg-surface-primary rounded-lg border shadow-sm transition-colors ${
              isOverDropZone ? 'border-brand-500 bg-brand-50/50' : 'border-border'
            }`}>
              {/* Header */}
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-lg font-medium text-content-primary">Acquisitions</h3>
                <p className="text-sm text-content-secondary">Select to view or drag to reorder</p>
              </div>

              {/* Acquisition List */}
              <div className="p-2 space-y-2 max-h-[500px] overflow-y-auto">
                {/* Add New Acquisition - Always first (not sortable) */}
                {renderAddNewItem()}

                {/* Drop hint when dragging from schema browser */}
                {isOverDropZone && (
                  <div className="p-3 text-center text-brand-600 text-sm border-2 border-dashed border-brand-500 rounded-lg bg-brand-50 dark:bg-brand-900/30">
                    Drop to add
                  </div>
                )}

                {/* Existing Acquisitions - Sortable */}
                <SortableContext
                  items={acquisitions.map(a => a.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {acquisitions.map((acquisition) => (
                    <SortableAcquisitionItem key={acquisition.id} id={acquisition.id}>
                      {(dragHandleProps) => renderAcquisitionPreview(acquisition, dragHandleProps)}
                    </SortableAcquisitionItem>
                  ))}
                </SortableContext>
              </div>
            </div>
          </AcquisitionsDropZone>

        {/* Right Panel - Detail View */}
        <div className="col-span-12 md:col-span-8 lg:col-span-9">
          {selectedAcquisitionId === ADD_NEW_ID ? (
            /* Show tabbed options when "Add New" is selected */
            renderTabbedOptions()
          ) : selectedAcquisition ? (
            /* Show selected acquisition details - Clean editing mode */
            <AcquisitionTable
              acquisition={selectedAcquisition}
              isEditMode={true}
              incompleteFields={incompleteFields}
              onUpdate={(field, value) => updateAcquisition(selectedAcquisition.id, { [field]: value })}
              onDelete={() => {
                deleteAcquisition(selectedAcquisition.id);
                // Auto-selection will handle selecting next acquisition
              }}
              onFieldUpdate={(fieldTag, updates) => updateField(selectedAcquisition.id, fieldTag, updates)}
              onFieldConvert={(fieldTag, toLevel, mode) => convertFieldLevel(selectedAcquisition.id, fieldTag, toLevel, mode)}
              onFieldDelete={(fieldTag) => deleteField(selectedAcquisition.id, fieldTag)}
              onFieldAdd={(fields) => addFields(selectedAcquisition.id, fields)}
              onSeriesUpdate={(seriesIndex, fieldTag, value) => updateSeries(selectedAcquisition.id, seriesIndex, fieldTag, value)}
              onSeriesAdd={() => addSeries(selectedAcquisition.id)}
              onSeriesDelete={(seriesIndex) => deleteSeries(selectedAcquisition.id, seriesIndex)}
              onSeriesNameUpdate={(seriesIndex, name) => updateSeriesName(selectedAcquisition.id, seriesIndex, name)}
              onValidationFunctionAdd={(func) => addValidationFunction(selectedAcquisition.id, func)}
              onValidationFunctionUpdate={(index, func) => updateValidationFunction(selectedAcquisition.id, index, func)}
              onValidationFunctionDelete={(index) => deleteValidationFunction(selectedAcquisition.id, index)}
            />
          ) : (
            /* Fallback - should rarely happen */
            <div className="bg-surface-primary rounded-lg border border-border shadow-sm p-6 h-full flex items-center justify-center">
              <div className="text-center">
                <FileText className="h-12 w-12 text-content-muted mx-auto mb-4" />
                <h3 className="text-lg font-medium text-content-primary mb-2">Nothing Selected</h3>
                <p className="text-content-secondary">Select an option from the left panel</p>
              </div>
            </div>
          )}
        </div>
        </div>

        {/* Drag Overlay for smooth animation */}
        <DragOverlay>
          {activeDragId ? (
            (() => {
              // Check if it's a schema browser drag
              if (activeDragId.startsWith('schema-drag-')) {
                return (
                  <div className="border rounded-lg p-4 bg-surface-primary shadow-lg border-brand-500 opacity-90">
                    <div className="flex items-center space-x-2">
                      <GripVertical className="h-4 w-4 text-content-muted" />
                      <FileText className="h-4 w-4 text-content-tertiary" />
                      <span className="text-sm font-medium text-content-primary">
                        Schema (all acquisitions)
                      </span>
                    </div>
                  </div>
                );
              }
              if (activeDragId.startsWith('acq-drag-')) {
                return (
                  <div className="border rounded-lg p-4 bg-surface-primary shadow-lg border-brand-500 opacity-90">
                    <div className="flex items-center space-x-2">
                      <GripVertical className="h-4 w-4 text-content-muted" />
                      <FileText className="h-4 w-4 text-content-tertiary" />
                      <span className="text-sm font-medium text-content-primary">
                        Acquisition
                      </span>
                    </div>
                  </div>
                );
              }
              // It's a sidebar acquisition being reordered
              const acquisition = acquisitions.find(a => a.id === activeDragId);
              return (
                <div className="border rounded-lg p-4 bg-surface-primary shadow-lg border-brand-500 opacity-90">
                  <div className="flex items-center space-x-2">
                    <GripVertical className="h-4 w-4 text-content-muted" />
                    <FileText className="h-4 w-4 text-content-tertiary" />
                    <span className="text-sm font-medium text-content-primary">
                      {acquisition?.protocolName || 'Acquisition'}
                    </span>
                  </div>
                </div>
              );
            })()
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Navigation Buttons */}
      <div className="mt-8 flex justify-between items-end">
        <button
          onClick={handleBack}
          className="px-6 py-3 border border-border-secondary text-content-secondary rounded-lg hover:bg-surface-secondary flex items-center"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Start
        </button>

        <div className="flex flex-col items-end">
          {hasIncompleteFields && (
            <div className="mb-2 text-sm text-status-error flex items-center">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Please complete all field values before continuing ({incompleteFields.size} incomplete)
            </div>
          )}
          <button
            onClick={handleContinue}
            disabled={acquisitions.length === 0 || hasIncompleteFields}
            className="px-6 py-3 bg-brand-600 text-content-inverted rounded-lg hover:bg-brand-700 disabled:bg-surface-secondary disabled:text-content-muted disabled:cursor-not-allowed"
          >
            Continue to Metadata
          </button>
        </div>
      </div>

      {/* Back Confirmation Modal */}
      {showBackConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-surface-primary rounded-lg max-w-md w-full p-6">
            <div className="flex items-center mb-4">
              <AlertTriangle className="h-6 w-6 text-status-warning mr-3" />
              <h3 className="text-lg font-medium text-content-primary">Confirm Navigation</h3>
            </div>
            <p className="text-content-secondary mb-6">
              Going back to the starting point will clear all your current progress, including {acquisitions.length} acquisition{acquisitions.length !== 1 ? 's' : ''} and all configured fields.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowBackConfirmModal(false)}
                className="px-4 py-2 border border-border-secondary text-content-secondary rounded-lg hover:bg-surface-secondary"
              >
                Cancel
              </button>
              <button
                onClick={confirmBack}
                className="px-4 py-2 bg-status-error text-content-inverted rounded-lg hover:opacity-90"
              >
                Clear and Go Back
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

      {/* Schema Upload Modal */}
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

      {/* Schema Validation Error Modal */}
      {schemaValidationError && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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

export default BuildSchema;