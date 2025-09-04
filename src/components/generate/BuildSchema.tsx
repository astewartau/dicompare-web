import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Plus, Loader2, Database } from 'lucide-react';
import { dicompareAPI } from '../../services/DicompareAPI';
import { useAcquisitions } from '../../contexts/AcquisitionContext';
import AcquisitionTable from './AcquisitionTable';
import { processFieldForUI, processSeriesFieldValue } from '../../utils/fieldProcessing';
import { processUploadedFiles } from '../../utils/fileUploadUtils';

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
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [isPyodideReady, setIsPyodideReady] = useState(() => dicompareAPI.isInitialized());
  const [isDragOver, setIsDragOver] = useState(false);

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


  const loadExampleData = async () => {
    try {
      setIsUploading(true);
      setUploadStatus('Loading example data...');
      setUploadProgress(25);
      
      // Initialize Pyodide if needed
      const initSuccess = await initializePyodideIfNeeded();
      if (!initSuccess) {
        setIsUploading(false);
        return;
      }
      
      setUploadProgress(50);
      
      // Get example DICOM data from API in UI format
      const acquisitions = await dicompareAPI.getExampleDicomDataForUI();
      
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
      
      setAcquisitions(contextAcquisitions);
      setUploadProgress(100);
      
      console.log('✅ Example data loaded');
      
    } catch (error) {
      console.error('❌ Failed to load example data:', error);
      setUploadStatus('Failed to load example data. Please try again.');
    } finally {
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        setUploadStatus('');
      }, 500);
    }
  };

  const clearData = () => {
    setAcquisitions([]);
  };

  const handleContinue = () => {
    navigate('/generate-template/enter-metadata');
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
        <Upload className="h-10 w-10 text-medical-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2 text-center">
          {isAdditional ? 'Add More Content' : 'Create Acquisitions'}
        </h3>
        <p className="text-sm text-gray-600 mb-6 text-center">
          {isAdditional ? 'Upload more files or add manual acquisitions' : 'Upload files, drag and drop, or create acquisitions manually'}
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        </div>
      </div>
    </div>
  );



  // Status display component
  const renderStatusDisplay = () => (
    <>
      {uploadStatus && uploadStatus.includes('Starting Python environment') && (
        <div className="col-span-full mb-4 text-xs text-amber-600 flex items-center justify-center">
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
          Starting Python environment...
        </div>
      )}
      
      {isUploading && (
        <div className="col-span-full mt-4">
          <div className="flex items-center justify-center mb-2">
            <Loader2 className="h-4 w-4 animate-spin text-medical-600 mr-2" />
            <span className="text-sm font-medium text-gray-700">{uploadStatus}</span>
          </div>
          <div className="bg-gray-200 rounded-full h-2">
            <div 
              className="bg-medical-600 h-2 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {Math.round(uploadProgress)}% complete
          </p>
        </div>
      )}
    </>
  );

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Build Schema - Step 1</h2>
            <p className="text-gray-600">
              {acquisitions.length > 0 ? (
                'Review detected acquisitions and configure which DICOM fields to include in your validation template.'
              ) : (
                'Upload DICOM files to automatically extract metadata and create acquisition templates, or manually add acquisitions.'
              )}
            </p>
          </div>
          
          <div className="flex space-x-3">
            {acquisitions.length === 0 ? (
              <button
                onClick={loadExampleData}
                disabled={isUploading}
                className="inline-flex items-center px-4 py-2 border border-medical-600 text-medical-600 rounded-lg hover:bg-medical-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Database className="h-4 w-4 mr-2" />
                Load Example Data
              </button>
            ) : (
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

      {/* Status Display */}
      {renderStatusDisplay()}

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
    </div>
  );
};

export default BuildSchema;