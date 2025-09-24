import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Plus, Loader2, Copy } from 'lucide-react';
import { dicompareAPI } from '../../services/DicompareAPI';
import { useAcquisitions } from '../../contexts/AcquisitionContext';
import { useSchemaService } from '../../hooks/useSchemaService';
import { useSchemaContext } from '../../contexts/SchemaContext';
import AcquisitionTable from './AcquisitionTable';
import UnifiedSchemaSelector from './UnifiedSchemaSelector';
import { processFieldForUI, processSeriesFieldValue } from '../../utils/fieldProcessing';
import { processUploadedFiles } from '../../utils/fileUploadUtils';
import { convertSchemaToAcquisitions } from '../../utils/schemaToAcquisition';


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

          // Convert to acquisition context format
          const contextAcquisitions = schemaAcquisitions.map(acq => ({
            ...acq,
            acquisitionFields: acq.acquisitionFields.map(field => processFieldForUI(field)),
            seriesFields: acq.seriesFields.map(field => processFieldForUI({
              ...field,
              value: field.values?.[0] || field.value
            })),
            series: acq.series.map(series => ({
              name: series.name,
              fields: Object.fromEntries(
                Object.entries(series.fields).map(([tag, value]) => {
                  const matchingField = acq.seriesFields.find(sf => sf.tag === tag);
                  const fieldName = matchingField?.name || tag;

                  return [
                    tag,
                    processSeriesFieldValue(
                      (typeof value === 'object' && value !== null && 'value' in value) ? {
                        ...value,
                        field: fieldName
                      } : {
                        value,
                        field: fieldName,
                        dataType: typeof value === 'number' ? 'number' :
                                 Array.isArray(value) ? 'list_string' : 'string'
                      },
                      fieldName,
                      tag
                    )
                  ];
                })
              )
            }))
          }));

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

  const getIncompleteFields = () => {
    const incompleteFields = new Set<string>();
    
    acquisitions.forEach(acquisition => {
      // Check acquisition-level fields
      acquisition.acquisitionFields.forEach(field => {
        if (!isFieldValueValid(field)) {
          incompleteFields.add(`${acquisition.id}-${field.tag}`);
        }
      });
      
      // Check series field values only if there are series-level fields
      if (acquisition.seriesFields.length > 0) {
        // Ensure we check at least 2 series (matching SeriesTable display logic)
        const minSeriesCount = Math.max(2, acquisition.series?.length || 0);
        
        for (let seriesIndex = 0; seriesIndex < minSeriesCount; seriesIndex++) {
          const series = acquisition.series?.[seriesIndex];
          
          acquisition.seriesFields.forEach(field => {
            const fieldValue = series?.fields?.[field.tag];
            // If the field doesn't exist in this series, it's incomplete
            if (fieldValue === undefined || !isFieldValueValid(fieldValue)) {
              incompleteFields.add(`${acquisition.id}-series-${seriesIndex}-${field.tag}`);
            }
          });
        }
      }
    });
    
    return incompleteFields;
  };

  const incompleteFields = getIncompleteFields();
  const hasIncompleteFields = incompleteFields.size > 0;

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadStatus('Preparing files...');

    // Initialize Pyodide if needed
    const initSuccess = await initializePyodideIfNeeded();
    if (!initSuccess) {
      setIsUploading(false);
      return;
    }

    try {
      // Process uploaded files with proper filtering using shared utility
      setUploadStatus('Reading file data...');
      
      const fileObjects = await processUploadedFiles(files, (fileProgress) => {
        setUploadStatus(`Reading file ${fileProgress.current} of ${fileProgress.total}: ${fileProgress.fileName}`);
        setUploadProgress((fileProgress.current / fileProgress.total) * 30); // 0-30% for file reading
      });
      
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
        seriesFields: acq.seriesFields.map(field => processFieldForUI({
          ...field,
          value: field.values?.[0] || field.value
        })),
        series: acq.series.map(series => ({
          name: series.name,
          fields: Object.fromEntries(
            Object.entries(series.fields).map(([tag, value]) => {
              // Find the matching seriesField to get the field name
              const matchingField = acq.seriesFields.find(sf => sf.tag === tag);
              const fieldName = matchingField?.name || tag;
              
              return [
                tag,
                // Process the series field value with rounding and appropriate validation rules
                processSeriesFieldValue(
                  (typeof value === 'object' && value !== null && 'value' in value) ? {
                    ...value,
                    field: fieldName  // Add field name
                  } : {
                    value,
                    field: fieldName,  // Add field name
                    dataType: typeof value === 'number' ? 'number' : 
                             Array.isArray(value) ? 'list_string' : 'string'
                  },
                  fieldName,
                  tag
                )
              ];
            })
          )
        }))
      }));
      
      setAcquisitions(prev => [...prev, ...contextAcquisitions]);
      setUploadProgress(100);
      
      console.log('✅ Analysis complete');
      
    } catch (error) {
      console.error('❌ Upload failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setUploadStatus(`Upload failed: ${errorMessage}`);
      
      // Keep error message visible longer for user to read
      setTimeout(() => {
        setUploadStatus('');
      }, 5000);
    } finally {
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        // Only clear status if it's not an error message
        if (!uploadStatus.includes('failed:')) {
          setUploadStatus('');
        }
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

    // Initialize Pyodide if needed
    const initSuccess = await initializePyodideIfNeeded();
    if (!initSuccess) {
      setIsUploading(false);
      return;
    }

    try {
      setUploadProgress(30);
      
      // Read file content
      const fileContent = await file.arrayBuffer();
      setUploadProgress(60);
      
      // Process via API
      const acquisition = await dicompareAPI.loadProFile(new Uint8Array(fileContent), file.name);
      
      // Add validation rules and round values for fields
      const processedAcquisition = {
        ...acquisition,
        acquisitionFields: acquisition.acquisitionFields.map(field => processFieldForUI(field, 'pro'))
      };
      
      setAcquisitions(prev => [...prev, processedAcquisition]);
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
        seriesFields: [],
        series: [],
        validationFunctions: []
      };

      // Process acquisition-level fields
      if (targetAcquisition.fields && Array.isArray(targetAcquisition.fields)) {
        newAcquisition.acquisitionFields = targetAcquisition.fields.map(field => processFieldForUI({
          tag: field.tag,
          name: field.field || field.name,
          value: field.value || '',
          vr: field.vr || 'UN',
          level: 'acquisition',
          dataType: field.dataType || 'string',
          validationRule: field.validationRule || { type: 'exact' }
        }));
      }

      // Process series-level fields and instances
      if (targetAcquisition.series && Array.isArray(targetAcquisition.series)) {
        const fieldMap = new Map();
        const seriesInstances = [];

        targetAcquisition.series.forEach(series => {
          const seriesData = { name: series.name, fields: {} };

          if (series.fields && Array.isArray(series.fields)) {
            series.fields.forEach(f => {
              // Add to unique field definitions
              if (!fieldMap.has(f.tag)) {
                fieldMap.set(f.tag, {
                  tag: f.tag,
                  name: f.field || f.name,
                  value: '',
                  vr: f.vr || 'UN',
                  level: 'series',
                  dataType: f.dataType || 'string',
                  validationRule: f.validationRule || { type: 'exact' }
                });
              }

              // Add value to this series instance
              seriesData.fields[f.tag] = processSeriesFieldValue({
                value: f.value,
                field: f.field || f.name,
                dataType: f.dataType || 'string',
                validationRule: f.validationRule
              }, f.field || f.name, f.tag);
            });
          }

          seriesInstances.push(seriesData);
        });

        newAcquisition.seriesFields = Array.from(fieldMap.values()).map(field => processFieldForUI(field));
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

  // Component to render unified upload card
  const renderUnifiedUploadCard = (isAdditional: boolean = false) => (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm p-6 h-fit col-span-3">
      <div
        className={`border-2 border-dashed rounded-lg p-6 transition-colors ${
          isDragOver
            ? 'border-medical-500 bg-medical-50'
            : 'border-medical-300 hover:border-medical-400'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isUploading ? (
          <>
            <Loader2 className="h-12 w-12 text-medical-600 mx-auto mb-4 animate-spin" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2 text-center">Processing Files</h3>
            <p className="text-gray-600 mb-4 text-center">{uploadStatus}</p>

            <div className="max-w-md mx-auto space-y-3 mb-4">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-medical-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-sm text-gray-600 text-center">
                {Math.round(uploadProgress)}% complete
              </p>
            </div>
          </>
        ) : (
          <>
            <Upload className="h-10 w-10 text-medical-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2 text-center">
              {isAdditional ? 'Add More Content' : 'Create Acquisitions'}
            </h3>
            <p className="text-sm text-gray-600 mb-6 text-center">
              {isAdditional ? 'Upload more files or add manual acquisitions' : 'Upload files, drag and drop, or create acquisitions manually'}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* DICOM Upload Section */}
          <div className="border border-blue-200 rounded-lg p-4 bg-blue-50/50 hover:bg-blue-50 transition-colors">
            <div className="text-center">
              <Upload className="h-6 w-6 text-blue-500 mx-auto mb-2" />
              <h4 className="text-sm font-medium text-gray-900 mb-1">DICOM Files</h4>
              <p className="text-xs text-gray-600 mb-3">Upload DICOM files or folders</p>
              <input
                type="file"
                multiple
                webkitdirectory=""
                className="hidden"
                id={isAdditional ? "dicom-upload-extra" : "dicom-upload"}
                onChange={(e) => handleFileUpload(e.target.files)}
              />
              <label
                htmlFor={!isUploading ? (isAdditional ? "dicom-upload-extra" : "dicom-upload") : ""}
                className={`inline-flex items-center justify-center w-full px-3 py-2 border border-transparent text-xs font-medium rounded-md ${
                  !isUploading 
                    ? 'text-white bg-blue-600 hover:bg-blue-700 cursor-pointer' 
                    : 'text-gray-400 bg-gray-300 cursor-not-allowed'
                }`}
              >
                <Upload className="h-3 w-3 mr-1" />
                Browse DICOMs
              </label>
            </div>
          </div>

          {/* Protocol Upload Section */}
          <div className="border border-purple-200 rounded-lg p-4 bg-purple-50/50 hover:bg-purple-50 transition-colors">
            <div className="text-center">
              <Upload className="h-6 w-6 text-purple-500 mx-auto mb-2" />
              <h4 className="text-sm font-medium text-gray-900 mb-1">Siemens Protocol</h4>
              <p className="text-xs text-gray-600 mb-3">Upload .pro protocol files</p>
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
                    : 'text-gray-400 bg-gray-300 cursor-not-allowed'
                }`}
              >
                <Upload className="h-3 w-3 mr-1" />
                Browse Protocols
              </label>
            </div>
          </div>

          {/* Manual Entry Section */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/50 hover:bg-gray-50 transition-colors">
            <div className="text-center">
              <Plus className="h-6 w-6 text-gray-500 mx-auto mb-2" />
              <h4 className="text-sm font-medium text-gray-900 mb-1">Manual Entry</h4>
              <p className="text-xs text-gray-600 mb-3">Create acquisition manually</p>
              <button
                onClick={addNewAcquisition}
                className="inline-flex items-center justify-center w-full px-3 py-2 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Acquisition
              </button>
            </div>
          </div>

          {/* Copy from Schema Section */}
          <div className="border border-orange-200 rounded-lg p-4 bg-orange-50/50 hover:bg-orange-50 transition-colors">
            <div className="text-center">
              <Copy className="h-6 w-6 text-orange-500 mx-auto mb-2" />
              <h4 className="text-sm font-medium text-gray-900 mb-1">Copy from Schema</h4>
              <p className="text-xs text-gray-600 mb-3">Import from existing schemas</p>
              <button
                onClick={() => setShowSchemaModal(true)}
                disabled={isLoadingSchema}
                className={`inline-flex items-center justify-center w-full px-3 py-2 border border-transparent text-xs font-medium rounded-md ${
                  !isLoadingSchema
                    ? 'text-white bg-orange-600 hover:bg-orange-700 cursor-pointer'
                    : 'text-gray-400 bg-gray-300 cursor-not-allowed'
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
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Build Schema - Step 2
              {editingSchema && (
                <span className="text-lg font-normal text-blue-600 ml-2">
                  (Editing: {editingSchema.metadata?.name || 'Schema'})
                </span>
              )}
            </h2>
            <p className="text-gray-600">
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
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Clear Data
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Upload Card when no acquisitions exist */}
      {acquisitions.length === 0 && (
        <div className="mb-8">
          {renderUnifiedUploadCard(false)}
        </div>
      )}

      {/* Acquisitions Grid */}
      {acquisitions.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Show existing acquisitions */}
          {acquisitions.map((acquisition) => (
            <AcquisitionTable
              key={acquisition.id}
              acquisition={acquisition}
              isEditMode={true}
              incompleteFields={incompleteFields}
              onUpdate={(field, value) => updateAcquisition(acquisition.id, { [field]: value })}
              onDelete={() => deleteAcquisition(acquisition.id)}
              onFieldUpdate={(fieldTag, updates) => updateField(acquisition.id, fieldTag, updates)}
              onFieldConvert={(fieldTag, toLevel, mode) => convertFieldLevel(acquisition.id, fieldTag, toLevel, mode)}
              onFieldDelete={(fieldTag) => deleteField(acquisition.id, fieldTag)}
              onFieldAdd={(fields) => addFields(acquisition.id, fields)}
              onSeriesUpdate={(seriesIndex, fieldTag, value) => updateSeries(acquisition.id, seriesIndex, fieldTag, value)}
              onSeriesAdd={() => addSeries(acquisition.id)}
              onSeriesDelete={(seriesIndex) => deleteSeries(acquisition.id, seriesIndex)}
              onSeriesNameUpdate={(seriesIndex, name) => updateSeriesName(acquisition.id, seriesIndex, name)}
              onValidationFunctionAdd={(func) => addValidationFunction(acquisition.id, func)}
              onValidationFunctionUpdate={(index, func) => updateValidationFunction(acquisition.id, index, func)}
              onValidationFunctionDelete={(index) => deleteValidationFunction(acquisition.id, index)}
            />
          ))}

          {/* Always show unified upload card for additional uploads */}
          <div className="col-span-1">
            {renderUnifiedUploadCard(true)}
          </div>
        </div>
      )}

      {/* Continue Button */}
      <div className="mt-8 flex flex-col items-end">
        {hasIncompleteFields && (
          <div className="mb-2 text-sm text-red-600 flex items-center">
            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Please complete all field values before continuing ({incompleteFields.size} incomplete)
          </div>
        )}
        <button
          onClick={handleContinue}
          disabled={acquisitions.length === 0 || hasIncompleteFields}
          className="px-6 py-3 bg-medical-600 text-white rounded-lg hover:bg-medical-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          Continue to Metadata
        </button>
      </div>

      {/* Schema Selection Modal */}
      {showSchemaModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">Select Schema and Acquisition</h3>
                <button
                  onClick={() => setShowSchemaModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-gray-600 mt-4">
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
    </div>
  );
};

export default BuildSchema;