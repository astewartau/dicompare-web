import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Plus, Loader2, Copy, AlertTriangle, FileText, ArrowLeft } from 'lucide-react';
import { dicompareAPI } from '../../services/DicompareAPI';
import { useAcquisitions } from '../../contexts/AcquisitionContext';
import { useSchemaService } from '../../hooks/useSchemaService';
import { useSchemaContext } from '../../contexts/SchemaContext';
import AcquisitionTable from './AcquisitionTable';
import UnifiedSchemaSelector from './UnifiedSchemaSelector';
import { processFieldForUI } from '../../utils/fieldProcessing';
import { roundDicomValue } from '../../utils/valueRounding';
import { processUploadedFiles } from '../../utils/fileUploadUtils';
import { convertSchemaToAcquisitions } from '../../utils/schemaToAcquisition';
import { processSchemaFieldForUI } from '../../utils/datatypeInference';
import { buildValidationRuleFromField } from '../../utils/fieldFormatters';


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
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);
  const [selectedAcquisitionId, setSelectedAcquisitionId] = useState<string | null>(null);
  const [showBackConfirmModal, setShowBackConfirmModal] = useState(false);
  const [dicomAnalysisError, setDicomAnalysisError] = useState<string | null>(null);
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
      // For exact validation, check the value
      if (!field.value && field.value !== 0) return false;
      if (typeof field.value === 'string' && field.value.trim() === '') return false;
      if (Array.isArray(field.value) && field.value.length === 0) return false;
      return true;
    }
    
    // Handle direct values (arrays, strings, numbers) - these are valid if they exist
    if (field === null || field === undefined) return false;
    if (typeof field === 'string' && field.trim() === '') return false;
    if (Array.isArray(field) && field.length === 0) return false;
    return true;
  };

  // Helper to get series field definitions from series data
  const getSeriesFieldDefinitions = (acquisition: Acquisition) => {
    const fieldMap = new Map<string, { tag: string; name: string }>();

    // Extract field definitions from all series
    acquisition.series?.forEach(series => {
      // Handle both array format (from loaded schemas) and object format (from processed data)
      if (Array.isArray(series.fields)) {
        series.fields.forEach(field => {
          if (!fieldMap.has(field.tag)) {
            fieldMap.set(field.tag, {
              tag: field.tag,
              name: field.field || field.name || field.tag
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
        acquisitionIncomplete.add(`${acquisition.id}-${field.tag}`);
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

          // Handle both array format (from loaded schemas) and object format (from processed data)
          if (Array.isArray(series?.fields)) {
            fieldValue = series.fields.find(f => f.tag === fieldDef.tag);
          } else if (series?.fields && typeof series.fields === 'object') {
            fieldValue = series.fields[fieldDef.tag];
          }

          // Use == null to check for null/undefined without catching falsy values like 0
          if (fieldValue == null || !isFieldValueValid(fieldValue)) {
            acquisitionIncomplete.add(`${acquisition.id}-series-${seriesIndex}-${fieldDef.tag}`);
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

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadStatus('Preparing files...');

    try {
      // IMPORTANT: Read files into memory FIRST before initializing Pyodide
      // This prevents browser file access timeout issues on slower systems
      setUploadStatus('Reading file data...');

      const fileObjects = await processUploadedFiles(files, (fileProgress) => {
        setUploadStatus(`Reading file ${fileProgress.current} of ${fileProgress.total}: ${fileProgress.fileName}`);
        setUploadProgress((fileProgress.current / fileProgress.total) * 30); // 0-30% for file reading
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
                validationRule: field.validationRule || { type: 'exact' }
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
      console.error('❌ Upload failed:', error);
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

  const handleProFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];

    // Validate file extension
    if (!file.name.toLowerCase().endsWith('.pro')) {
      setUploadStatus('Please select a Siemens protocol file (.pro)');
      setTimeout(() => setUploadStatus(''), 3000);
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadStatus('Processing Siemens protocol file...');

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
      
      // Process via API
      const acquisition = await dicompareAPI.loadProFile(new Uint8Array(fileContent), file.name);
      
      // Add validation rules and round values for fields
      const processedAcquisition = {
        ...acquisition,
        acquisitionFields: acquisition.acquisitionFields.map(field => processFieldForUI(field, 'pro'))
      };
      
      setAcquisitions(prev => [...prev, processedAcquisition]);

      // Auto-select the newly created acquisition
      setSelectedAcquisitionId(processedAcquisition.id);

      setUploadProgress(100);

      console.log('✅ Protocol file uploaded successfully');
      
    } catch (error) {
      console.error('❌ Protocol file upload failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setUploadStatus(`Upload failed: ${errorMessage}`);
      
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
      // Separate .pro files from DICOM files
      const proFiles = files.filter(file => file.name.toLowerCase().endsWith('.pro'));
      const dicomFiles = files.filter(file => !file.name.toLowerCase().endsWith('.pro'));
      
      // Handle .pro files first
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
      const proFiles = allFiles.filter(file => file.name.toLowerCase().endsWith('.pro'));
      const dicomFiles = allFiles.filter(file => !file.name.toLowerCase().endsWith('.pro'));
      
      // Handle .pro files
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

  // Helper function to recursively get all files from a directory
  const getAllFilesFromDirectory = async (dirEntry: FileSystemDirectoryEntry): Promise<File[]> => {
    const files: File[] = [];
    
    return new Promise((resolve) => {
      const reader = dirEntry.createReader();
      
      const readEntries = () => {
        reader.readEntries(async (entries) => {
          if (entries.length === 0) {
            resolve(files);
            return;
          }
          
          for (const entry of entries) {
            if (entry.isFile) {
              const file = await new Promise<File>((fileResolve) => {
                (entry as FileSystemFileEntry).file(fileResolve);
              });
              files.push(file);
            } else if (entry.isDirectory) {
              const subFiles = await getAllFilesFromDirectory(entry as FileSystemDirectoryEntry);
              files.push(...subFiles);
            }
          }
          
          // Continue reading entries (directories might have more entries than fit in one read)
          readEntries();
        });
      };
      
      readEntries();
    });
  };



  const clearData = () => {
    setAcquisitions([]);
  };

  const handleCopyFromSchema = async (schemaId: string, acquisitionIndex: number) => {
    setIsLoadingSchema(true);
    try {
      // Get schema content
      const schemaContent = await getSchemaContent(schemaId);
      if (!schemaContent) {
        throw new Error('Failed to load schema content');
      }

      const parsedSchema = JSON.parse(schemaContent);

      // Find the specific acquisition by index
      let targetAcquisition = null;
      let acquisitionName = '';
      if (parsedSchema.acquisitions && typeof parsedSchema.acquisitions === 'object') {
        const acquisitionKeys = Object.keys(parsedSchema.acquisitions);
        if (acquisitionIndex >= 0 && acquisitionIndex < acquisitionKeys.length) {
          acquisitionName = acquisitionKeys[acquisitionIndex];
          targetAcquisition = parsedSchema.acquisitions[acquisitionName];
        }
      }

      if (!targetAcquisition) {
        throw new Error(`Acquisition at index ${acquisitionIndex} not found in schema`);
      }

      // Convert schema acquisition to builder format
      const newAcquisition = {
        id: `imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        protocolName: acquisitionName,
        seriesDescription: targetAcquisition.description || `Imported from ${schemaId}`,
        totalFiles: 0,
        acquisitionFields: [],
        series: [],
        validationFunctions: []
      };

      // Process acquisition-level fields
      if (targetAcquisition.fields && Array.isArray(targetAcquisition.fields)) {
        newAcquisition.acquisitionFields = targetAcquisition.fields.map(field => {
          const processedField = processSchemaFieldForUI(field);
          return {
            ...processedField,
            level: 'acquisition'
          };
        });
      }

      // Process series-level fields and instances
      if (targetAcquisition.series && Array.isArray(targetAcquisition.series)) {
        const seriesInstances = [];

        targetAcquisition.series.forEach(series => {
          const seriesFields = [];

          if (series.fields && Array.isArray(series.fields)) {
            series.fields.forEach(f => {
              // Create SeriesField objects for the fields array - use direct value format
              // Build validation rule from schema properties using shared utility
              const validationRule = buildValidationRuleFromField(f) || { type: 'exact' };

              seriesFields.push({
                tag: f.tag,
                name: f.field || f.name,
                value: f.value,  // Direct value, same as acquisition fields
                validationRule
              });
            });
          }

          seriesInstances.push({
            name: series.name,
            fields: seriesFields
          });
        });

        newAcquisition.series = seriesInstances;
      }

      // Process validation rules
      if (targetAcquisition.rules && Array.isArray(targetAcquisition.rules)) {
        newAcquisition.validationFunctions = targetAcquisition.rules.map(rule => ({
          id: rule.id,
          name: rule.name,
          description: rule.description,
          implementation: rule.implementation,
          fields: rule.fields || [],
          category: 'Custom',
          testCases: rule.testCases || [],
          customName: rule.name,
          customDescription: rule.description,
          customFields: rule.fields || [],
          customImplementation: rule.implementation,
          customTestCases: [],
          enabledSystemFields: []
        }));
      }

      // Add to acquisitions
      setAcquisitions(prev => [...prev, newAcquisition]);

      // Auto-select the newly created acquisition
      setSelectedAcquisitionId(newAcquisition.id);

      setShowSchemaModal(false);

      console.log('✅ Successfully imported acquisition from schema');

    } catch (error) {
      console.error('❌ Failed to copy from schema:', error);
      alert(`Failed to copy from schema: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoadingSchema(false);
    }
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
      navigate('/schema-builder/start');
    }
  };

  const confirmBack = () => {
    setShowBackConfirmModal(false);
    setAcquisitions([]); // Clear data
    navigate('/schema-builder/start');
  };

  // Component to render compact acquisition preview card
  const renderAcquisitionPreview = (acquisition: any) => {
    const incompleteFields = getAcquisitionIncompleteFields(acquisition.id);
    const hasIncomplete = incompleteFields.size > 0;
    const isSelected = selectedAcquisitionId === acquisition.id;

    return (
      <div
        key={acquisition.id}
        onClick={() => setSelectedAcquisitionId(acquisition.id)}
        className={`border rounded-lg p-4 cursor-pointer transition-all ${
          isSelected
            ? 'border-brand-500 bg-brand-50 shadow-md'
            : 'border-border hover:border-border-secondary hover:bg-surface-secondary'
        }`}
      >
        <div className="flex items-start justify-between">
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
            Add New Acquisition
          </h3>
        </div>
        <p className="text-xs text-content-secondary mt-1">
          Upload files or create acquisition manually
        </p>
      </div>
    );
  };

  // Component to render unified upload card
  const renderUnifiedUploadCard = (isAdditional: boolean = false) => (
    <div className="border border-border rounded-lg bg-surface-primary shadow-sm p-6 h-fit">
      <div
        className={`border-2 border-dashed rounded-lg p-6 transition-colors ${
          isDragOver
            ? 'border-brand-500 bg-brand-50'
            : 'border-brand-500/30 hover:border-brand-500'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isUploading ? (
          <>
            <Loader2 className="h-12 w-12 text-brand-600 mx-auto mb-4 animate-spin" />
            <h3 className="text-lg font-semibold text-content-primary mb-2 text-center">Processing Files</h3>
            <p className="text-content-secondary mb-4 text-center">{uploadStatus}</p>

            <div className="max-w-md mx-auto space-y-3 mb-4">
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
          </>
        ) : (
          <>
            <Upload className="h-10 w-10 text-brand-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-content-primary mb-2 text-center">
              {isAdditional ? 'Add More Content' : 'Create Acquisitions'}
            </h3>
            <p className="text-sm text-content-secondary mb-6 text-center">
              {isAdditional ? 'Upload more files, zip archives, or add manual acquisitions' : 'Upload files, zip archives, drag and drop, or create acquisitions manually'}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* DICOM Upload Section */}
          <div className="border border-blue-500/20 rounded-lg p-4 bg-blue-500/5 hover:bg-blue-500/10 transition-colors">
            <div className="text-center">
              <Upload className="h-6 w-6 text-blue-500 mx-auto mb-2" />
              <h4 className="text-sm font-medium text-content-primary mb-1">DICOM Files</h4>
              <p className="text-xs text-content-secondary mb-3">Upload DICOM files, zip archives, or folders</p>
              <input
                type="file"
                multiple
                webkitdirectory=""
                accept=".dcm,.dicom,.zip"
                className="hidden"
                id={isAdditional ? "dicom-upload-extra" : "dicom-upload"}
                onChange={(e) => handleFileUpload(e.target.files)}
              />
              <label
                htmlFor={!isUploading ? (isAdditional ? "dicom-upload-extra" : "dicom-upload") : ""}
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
              <h4 className="text-sm font-medium text-content-primary mb-1">Siemens Protocol</h4>
              <p className="text-xs text-content-secondary mb-3">Upload .pro protocol files</p>
              <input
                type="file"
                accept=".pro"
                className="hidden"
                id={isAdditional ? "protocol-upload-extra" : "protocol-upload"}
                onChange={(e) => handleProFileUpload(e.target.files)}
              />
              <label
                htmlFor={!isUploading ? (isAdditional ? "protocol-upload-extra" : "protocol-upload") : ""}
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

          {/* Manual Entry Section */}
          <div className="border border-border rounded-lg p-4 bg-surface-secondary/50 hover:bg-surface-secondary transition-colors">
            <div className="text-center">
              <Plus className="h-6 w-6 text-content-tertiary mx-auto mb-2" />
              <h4 className="text-sm font-medium text-content-primary mb-1">Manual Entry</h4>
              <p className="text-xs text-content-secondary mb-3">Create acquisition manually</p>
              <button
                onClick={() => {
                  // Create a new acquisition manually here so we can get its ID
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

                  // Add to acquisitions
                  setAcquisitions(prev => [...prev, newAcquisition]);

                  // Auto-select the newly created acquisition
                  setSelectedAcquisitionId(newAcquisitionId);
                }}
                className="inline-flex items-center justify-center w-full px-3 py-2 border border-border-secondary rounded-md text-xs font-medium text-content-secondary bg-surface-primary hover:bg-surface-secondary"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Acquisition
              </button>
            </div>
          </div>

          {/* Copy from Schema Section */}
          <div className="border border-orange-500/20 rounded-lg p-4 bg-orange-500/5 hover:bg-orange-500/10 transition-colors">
            <div className="text-center">
              <Copy className="h-6 w-6 text-orange-500 mx-auto mb-2" />
              <h4 className="text-sm font-medium text-content-primary mb-1">Copy from Schema</h4>
              <p className="text-xs text-content-secondary mb-3">Import from existing schemas</p>
              <button
                onClick={() => setShowSchemaModal(true)}
                disabled={isLoadingSchema}
                className={`inline-flex items-center justify-center w-full px-3 py-2 border border-transparent text-xs font-medium rounded-md ${
                  !isLoadingSchema
                    ? 'text-white bg-orange-600 hover:bg-orange-700 cursor-pointer'
                    : 'text-content-muted bg-surface-secondary cursor-not-allowed'
                }`}
              >
                {isLoadingSchema ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3 mr-1" />
                    Browse Schemas
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
          </>
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
              Build Schema - Step 2
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
                'Upload DICOM files to automatically extract metadata and create acquisition schemas, or manually add acquisitions.'
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
      <div className="grid grid-cols-12 gap-6 min-h-[600px]">
        {/* Left Panel - Acquisition Selector */}
        <div className="col-span-12 md:col-span-4 lg:col-span-3">
          <div className="bg-surface-primary rounded-lg border border-border shadow-sm">
            {/* Header */}
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-lg font-medium text-content-primary">Acquisitions</h3>
              <p className="text-sm text-content-secondary">Select an acquisition to edit or create new</p>
            </div>

            {/* Acquisition List */}
            <div className="p-2 space-y-2 max-h-[500px] overflow-y-auto">
              {/* Add New Acquisition - Always first */}
              {renderAddNewItem()}

              {/* Existing Acquisitions */}
              {acquisitions.map((acquisition) => renderAcquisitionPreview(acquisition))}
            </div>
          </div>
        </div>

        {/* Right Panel - Detail View */}
        <div className="col-span-12 md:col-span-8 lg:col-span-9">
          {selectedAcquisitionId === ADD_NEW_ID ? (
            /* Show upload options when "Add New" is selected */
            renderUnifiedUploadCard(false)
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

      {/* Schema Selection Modal */}
      {showSchemaModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-surface-primary rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-content-primary">Select Schema and Acquisition</h3>
                <button
                  onClick={() => setShowSchemaModal(false)}
                  className="text-content-muted hover:text-content-secondary"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-content-secondary mt-4">
                Select a schema from your library, then choose a specific acquisition to import into your current schema.
              </p>
            </div>

            <div className="p-6">
              <UnifiedSchemaSelector
                librarySchemas={librarySchemas}
                uploadedSchemas={uploadedSchemas}
                selectionMode="acquisition"
                onAcquisitionSelect={(schemaId, acquisitionIndex) => {
                  handleCopyFromSchema(schemaId, acquisitionIndex);
                  setShowSchemaModal(false);
                }}
                expandable={true}
                getSchemaContent={getSchemaContent}
              />
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
};

export default BuildSchema;