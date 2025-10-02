import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Database, Loader, CheckCircle, Plus, X, Trash2 } from 'lucide-react';
import { Acquisition, ProcessingProgress } from '../../types';
import { dicompareAPI } from '../../services/DicompareAPI';
import { processUploadedFiles } from '../../utils/fileUploadUtils';
import { useSchemaService, SchemaBinding } from '../../hooks/useSchemaService';
import { SchemaUploadModal } from '../schema/SchemaUploadModal';
import AcquisitionTable from '../schema/AcquisitionTable';
import UnifiedSchemaSelector from '../schema/UnifiedSchemaSelector';
import ComplianceReportModal from './ComplianceReportModal';

// ✅ MOVE COMPONENT OUTSIDE TO PREVENT RECREATION!
const SchemaAcquisitionDisplay = React.memo<{
  binding: SchemaBinding;
  realAcquisition?: Acquisition;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onDeselect?: () => void;
  isDataProcessing?: boolean;
  getSchemaContent: (schemaId: string) => Promise<string | null>;
  getSchemaAcquisition: (binding: SchemaBinding) => Promise<Acquisition | null>;
}>(({ binding, realAcquisition, isCollapsed, onToggleCollapse, onDeselect, isDataProcessing, getSchemaContent, getSchemaAcquisition }) => {
  const [schemaAcquisition, setSchemaAcquisition] = useState<Acquisition | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Skip loading during data processing to prevent interference
    if (isDataProcessing) {
      return;
    }

    // Don't reload if we already have the right schema
    if (schemaAcquisition) {
      setIsLoading(false);
      return;
    }

    const loadSchema = async () => {
      setIsLoading(true);
      try {
        const acquisition = await getSchemaAcquisition(binding);
        setSchemaAcquisition(acquisition);
      } catch (error) {
        console.error('Failed to load schema:', error);
        setSchemaAcquisition(null);
      }
      setIsLoading(false);
    };

    loadSchema();
  }, [binding.schemaId, binding.acquisitionId]);

  // If we have a schema, ALWAYS show it regardless of any other state
  if (schemaAcquisition) {
    return (
      <AcquisitionTable
        acquisition={schemaAcquisition}
        isEditMode={false}
        mode="compliance"
        realAcquisition={realAcquisition}
        isDataProcessing={isDataProcessing}
        schemaId={binding.schemaId}
        schemaAcquisitionId={binding.acquisitionId}
        getSchemaContent={getSchemaContent}
        title={binding.schema.name}
        version={binding.schema.version}
        authors={binding.schema.authors}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
        onDeselect={onDeselect}
        // Disabled handlers for compliance mode
        onUpdate={() => {}}
        onDelete={() => {}}
        onFieldUpdate={() => {}}
        onFieldConvert={() => {}}
        onFieldDelete={() => {}}
        onFieldAdd={() => {}}
        onSeriesUpdate={() => {}}
        onSeriesAdd={() => {}}
        onSeriesDelete={() => {}}
        onSeriesNameUpdate={() => {}}
      />
    );
  }

  // Only show loading when we don't have schema and we're not processing
  if (isLoading && !isDataProcessing) {
    return (
      <div className="border border-gray-300 rounded-lg bg-white shadow-sm h-fit p-4 text-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-medical-600 mx-auto mb-2"></div>
        <span className="text-sm text-gray-600">Loading schema...</span>
      </div>
    );
  }

  // Error state when not processing
  if (!isDataProcessing) {
    return (
      <div className="border border-gray-300 rounded-lg bg-white shadow-sm h-fit p-4 text-center">
        <span className="text-sm text-red-600">Failed to load schema</span>
      </div>
    );
  }

  // During processing without schema - minimal loading
  return (
    <div className="border border-gray-300 rounded-lg bg-white shadow-sm h-fit p-4 text-center">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-medical-600 mx-auto mb-2"></div>
      <span className="text-sm text-gray-600">Loading schema...</span>
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if meaningful props have changed
  // Completely ignore isDataProcessing, callback functions to prevent re-renders
  const bindingChanged = (
    prevProps.binding.schemaId !== nextProps.binding.schemaId ||
    prevProps.binding.acquisitionId !== nextProps.binding.acquisitionId
  );
  const realAcquisitionChanged = prevProps.realAcquisition?.id !== nextProps.realAcquisition?.id;
  const collapsedChanged = prevProps.isCollapsed !== nextProps.isCollapsed;

  // Only re-render if binding, realAcquisition, or collapsed state actually changed
  return !bindingChanged && !realAcquisitionChanged && !collapsedChanged;
});

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
  const [showExampleData, setShowExampleData] = useState(false);
  const [schemaPairings, setSchemaPairings] = useState<Map<string, SchemaBinding>>(new Map());
  const [preSelectedSchemaId, setPreSelectedSchemaId] = useState<string | null>(null);
  const [preSelectedAcquisitionId, setPreSelectedAcquisitionId] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [collapsedSchemas, setCollapsedSchemas] = useState<Set<string>>(new Set());
  const [isDragOver, setIsDragOver] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [schemaAcquisitions, setSchemaAcquisitions] = useState<Map<string, Acquisition>>(new Map());
  const [showComplianceReport, setShowComplianceReport] = useState(false);
  const [allComplianceResults, setAllComplianceResults] = useState<Map<string, any[]>>(new Map());

  // Clear cache for debugging - remove this later
  useEffect(() => {
    setSchemaAcquisitions(new Map());
  }, []);

  // Helper function to convert schema to acquisition format for display
  const convertSchemaToAcquisition = async (binding: SchemaBinding): Promise<Acquisition> => {
    const { schema, acquisitionId } = binding;

    try {
      // Get schema content to extract fields
      const schemaContent = await getSchemaContent(schema.id);
      let schemaFields: any[] = [];
      let seriesInstances: any[] = [];

      if (schemaContent) {
        const parsedSchema = JSON.parse(schemaContent);
        // Extract fields from schema structure - this depends on your schema format
        if (parsedSchema.acquisitions && typeof parsedSchema.acquisitions === 'object') {

          // Handle acquisitions as an object with named keys (e.g., "QSM", "0")
          let targetAcquisition = null;

          if (acquisitionId === undefined || acquisitionId === null) {
            throw new Error(`No acquisitionId provided. Available acquisitions: ${Object.keys(parsedSchema.acquisitions).join(', ')}`);
          }

          const acquisitionKeys = Object.keys(parsedSchema.acquisitions);
          const index = parseInt(acquisitionId, 10);

          if (isNaN(index) || index < 0 || index >= acquisitionKeys.length) {
            throw new Error(`Invalid acquisition index "${acquisitionId}". Must be 0-${acquisitionKeys.length - 1}. Available: ${acquisitionKeys.map((key, i) => `${i}: ${key}`).join(', ')}`);
          }

          const acquisitionName = acquisitionKeys[index];
          targetAcquisition = parsedSchema.acquisitions[acquisitionName];

          if (targetAcquisition) {
            // Extract acquisition-level fields
            if (targetAcquisition.fields && Array.isArray(targetAcquisition.fields)) {
              // Convert schema format fields to DicomField format
              schemaFields = targetAcquisition.fields.map(f => ({
                name: f.field || f.name,
                tag: f.tag,
                value: f.value,
                level: 'acquisition',
                dataType: f.dataType,
                validationRule: f.validationRule
              }));
            } else {
              schemaFields = [
                ...(targetAcquisition.acquisitionFields || targetAcquisition.acquisition_fields || [])
              ];
            }

            // Extract series-level fields and series instances separately
            if (targetAcquisition.series && Array.isArray(targetAcquisition.series)) {
              // Collect unique field definitions for seriesFields
              const fieldMap = new Map();

              targetAcquisition.series.forEach(series => {
                const seriesData = { name: series.name, fields: [] };

                if (series.fields && Array.isArray(series.fields)) {
                  series.fields.forEach(f => {
                    // Add to unique field definitions
                    if (!fieldMap.has(f.tag)) {
                      fieldMap.set(f.tag, {
                        name: f.field || f.name,
                        tag: f.tag,
                        value: '', // No default value for series fields
                        level: 'series',
                        dataType: f.dataType,
                        validationRule: f.validationRule
                      });
                    }

                    // Add field to this series instance as an array element
                    seriesData.fields.push({
                      tag: f.tag,
                      name: f.field || f.name,
                      value: f.value,
                      validationRule: f.validationRule || { type: 'exact' }
                    });
                  });
                }

                seriesInstances.push(seriesData);
              });

              const uniqueSeriesFields = Array.from(fieldMap.values());
              schemaFields = [...schemaFields, ...uniqueSeriesFields];
            }
          }
        } else if (parsedSchema.fields) {
          schemaFields = parsedSchema.fields;
        } else {
          // Maybe it's at the top level?
          if (parsedSchema.acquisition_fields || parsedSchema.acquisitionFields) {
            schemaFields = [
              ...(parsedSchema.acquisition_fields || parsedSchema.acquisitionFields || []),
              ...(parsedSchema.series_fields || parsedSchema.seriesFields || [])
            ];
          }
        }
      }

      // Extract validation rules
      let validationRules = [];
      if (schemaContent) {
        const parsedSchema = JSON.parse(schemaContent);
        if (parsedSchema.acquisitions && typeof parsedSchema.acquisitions === 'object') {
          let targetAcquisition = null;

          if (acquisitionId === undefined || acquisitionId === null) {
            throw new Error(`No acquisitionId provided. Available acquisitions: ${Object.keys(parsedSchema.acquisitions).join(', ')}`);
          }

          const acquisitionKeys = Object.keys(parsedSchema.acquisitions);
          const index = parseInt(acquisitionId, 10);

          if (isNaN(index) || index < 0 || index >= acquisitionKeys.length) {
            throw new Error(`Invalid acquisition index "${acquisitionId}". Must be 0-${acquisitionKeys.length - 1}. Available: ${acquisitionKeys.map((key, i) => `${i}: ${key}`).join(', ')}`);
          }

          const acquisitionName = acquisitionKeys[index];
          targetAcquisition = parsedSchema.acquisitions[acquisitionName];
          console.log('✅ Found acquisition by index:', index, '→', acquisitionName);

          if (targetAcquisition && targetAcquisition.rules && Array.isArray(targetAcquisition.rules)) {
            validationRules = targetAcquisition.rules.map(rule => ({
              id: rule.id,
              name: rule.name,
              description: rule.description,
              implementation: rule.implementation,
              fields: rule.fields || [],
              category: 'Custom',
              testCases: rule.testCases || []
            }));
          }
        }
      }

      // Convert to acquisition format
      return {
        id: `schema-${schema.id}-${acquisitionId || 'default'}`,
        protocolName: schema.name,
        seriesDescription: schema.description || 'Schema requirements',
        acquisitionFields: schemaFields.filter(f => !f.level || f.level === 'acquisition') || [],
        seriesFields: schemaFields.filter(f => f.level === 'series') || [],
        series: seriesInstances,
        totalFiles: 0,
        validationFunctions: (() => {
          const functions = validationRules.map(rule => ({
            ...rule,
            customName: rule.name,
            customDescription: rule.description,
            customFields: rule.fields || [],
            customImplementation: rule.implementation,
            customTestCases: [],
            enabledSystemFields: []
          }));
          return functions;
        })()
      };
    } catch (error) {
      console.error('Failed to convert schema to acquisition:', error);
      // Return minimal acquisition if conversion fails
      return {
        id: `schema-${schema.id}-${acquisitionId || 'default'}`,
        protocolName: schema.name,
        seriesDescription: schema.description || 'Schema requirements',
        acquisitionFields: [],
        seriesFields: [],
        series: [],
        totalFiles: 0,
        validationFunctions: []
      };
    }
  };


  // Helper to get or load schema acquisition
  const getSchemaAcquisition = async (binding: SchemaBinding): Promise<Acquisition | null> => {
    const key = `${binding.schemaId}-${binding.acquisitionId || 'default'}`;

    if (schemaAcquisitions.has(key)) {
      return schemaAcquisitions.get(key)!;
    }

    try {
      const acquisition = await convertSchemaToAcquisition(binding);
      setSchemaAcquisitions(prev => new Map(prev.set(key, acquisition)));
      return acquisition;
    } catch (error) {
      console.error('Failed to get schema acquisition:', error);
      return null;
    }
  };

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

  // File upload logic (unchanged)
  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files) return;

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

      const fileObjects = await processUploadedFiles(files, (fileProgress) => {
        setProgress(prev => ({
          ...prev!,
          currentOperation: `Reading file ${fileProgress.current} of ${fileProgress.total}: ${fileProgress.fileName}`,
          percentage: (fileProgress.current / fileProgress.total) * 25
        }));
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
      setApiError(null);
    } catch (error) {
      console.error('Failed to load DICOM data:', error);
      setApiError(`Failed to process DICOM data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    setIsProcessing(false);
    setProgress(null);
  }, [preSelectedSchemaId, preSelectedAcquisitionId, loadedData]);

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

          readEntries();
        });
      };

      readEntries();
    });
  };

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

  // Other handlers
  const loadExampleData = async () => {
    try {
      setApiError(null);
      const acquisitions = await dicompareAPI.getExampleDicomDataForUI();
      setLoadedData(acquisitions);

      setShowExampleData(true);
    } catch (error) {
      console.error('Failed to load example data:', error);
      setApiError('Failed to load example DICOM data');
    }
  };

  const clearData = () => {
    setLoadedData([]);
    setShowExampleData(false);
    setSchemaPairings(new Map());
    setPreSelectedSchemaId(null);
    setPreSelectedAcquisitionId(null);
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
    try {
      const content = await file.text();
      let cleanContent = content.trim();

      if (cleanContent.charCodeAt(0) === 0xFEFF) {
        cleanContent = cleanContent.slice(1);
      }

      if (!cleanContent.startsWith('{') && !cleanContent.startsWith('[')) {
        throw new Error('File does not appear to be valid JSON');
      }

      JSON.parse(cleanContent); // Validate JSON

      setUploadedFile(file);
      setShowUploadModal(true);
      setApiError(null);
    } catch (error) {
      console.error('Failed to parse schema file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setApiError(`Failed to parse schema file: ${errorMessage}`);

      setUploadedFile(file);
      setShowUploadModal(true);
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

  const handleSchemaSelect = (schemaId: string, acquisitionId?: number) => {
    setPreSelectedSchemaId(schemaId);
    setPreSelectedAcquisitionId(acquisitionId?.toString() || null);
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

  // Memoize the preselected schema binding to prevent unnecessary re-renders
  const preSelectedBinding = useMemo(() => {
    if (!preSelectedSchemaId) return null;
    const schema = getUnifiedSchema(preSelectedSchemaId);
    if (!schema) return null;
    return {
      schemaId: preSelectedSchemaId,
      acquisitionId: preSelectedAcquisitionId,
      schema: schema
    };
  }, [preSelectedSchemaId, preSelectedAcquisitionId]);

  // Memoize callback functions to prevent React.memo from failing
  const handlePreselectedToggleCollapse = useCallback(() => toggleSchemaCollapse('preselected'), []);
  const handlePreselectedDeselect = useCallback(() => {
    setPreSelectedSchemaId(null);
    setPreSelectedAcquisitionId(null);
  }, []);

  // Upload area component
  const renderUploadArea = (isExtra: boolean = false) => (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm p-6">
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragOver
            ? 'border-medical-500 bg-medical-50'
            : 'border-gray-300 hover:border-medical-400'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isProcessing ? (
          <>
            <Loader className="h-12 w-12 text-medical-600 mx-auto mb-4 animate-spin" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Processing DICOM Files</h3>
            <p className="text-gray-600 mb-4">{progress?.currentOperation}</p>

            {progress && (
              <div className="space-y-3 mb-4">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-medical-600 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${progress.percentage}%` }}
                  />
                </div>
                <p className="text-sm text-gray-600">
                  {Math.round(progress.percentage)}% complete
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {isExtra ? 'Upload More DICOM Files' : 'Upload DICOM Files'}
            </h3>
            <p className="text-gray-600 mb-4">
              Drag and drop DICOM files, zip archives, or folders here, or click to browse
            </p>

            <input
              type="file"
              multiple
              webkitdirectory=""
              accept=".dcm,.dicom,.zip"
              className="hidden"
              id={isExtra ? "file-upload-extra" : "file-upload"}
              onChange={(e) => handleFileUpload(e.target.files)}
            />
            <label
              htmlFor={isExtra ? "file-upload-extra" : "file-upload"}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-medical-600 hover:bg-medical-700 cursor-pointer"
            >
              <Upload className="h-4 w-4 mr-2" />
              Browse Files
            </label>
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
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Load & Match DICOM Data</h2>
            <p className="text-gray-600">
              {loadedData.length > 0 ? (
                <>
                  Match each acquisition with a validation template. {getPairedCount()} of {loadedData.length} acquisitions paired.
                  {showExampleData && (
                    <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                      Example Data
                    </span>
                  )}
                </>
              ) : (
                'Upload DICOM files for compliance validation and match them with validation templates.'
              )}
            </p>
            {(apiError || schemaError) && (
              <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {apiError || schemaError}
              </div>
            )}
          </div>

          <div className="flex space-x-3">
            <button
              onClick={loadExampleData}
              className="inline-flex items-center px-4 py-2 border border-medical-600 text-medical-600 rounded-lg hover:bg-medical-50"
            >
              <Database className="h-4 w-4 mr-2" />
              Load Example Data
            </button>
            {loadedData.length > 0 && (
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

      {/* Headers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4">
        <h3 className="text-lg font-semibold text-gray-900">DICOM Acquisitions</h3>
        <h3 className="text-lg font-semibold text-gray-900">Schema Selection</h3>
      </div>

      {/* Content */}
      <div className="space-y-6">
        {/* Initial upload area when no data */}
        {loadedData.length === 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {renderUploadArea()}
            {preSelectedBinding ? (
              <SchemaAcquisitionDisplay
                key={`preselected-${preSelectedBinding.schemaId}-${preSelectedBinding.acquisitionId}`}
                binding={preSelectedBinding}
                isDataProcessing={isProcessing}
                isCollapsed={collapsedSchemas.has('preselected')}
                onToggleCollapse={handlePreselectedToggleCollapse}
                onDeselect={handlePreselectedDeselect}
                getSchemaContent={getSchemaContent}
                getSchemaAcquisition={getSchemaAcquisition}
              />
            ) : (
              <UnifiedSchemaSelector
                librarySchemas={librarySchemas}
                uploadedSchemas={uploadedSchemas}
                selectionMode="acquisition"
                selectedSchemaId={preSelectedSchemaId}
                onAcquisitionSelect={handleSchemaSelect}
                                onSchemaUpload={handleSchemaUpload}
                expandable={true}
                getSchemaContent={getSchemaContent}
              />
            )}
          </div>
        )}

        {/* Loaded acquisitions */}
        {loadedData.map((acquisition) => {
          const pairing = getAcquisitionPairing(acquisition.id);

          return (
            <div key={acquisition.id} className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Left - Acquisition */}
              <div className="relative">
                <AcquisitionTable
                  acquisition={acquisition}
                  isEditMode={true}
                  onUpdate={() => {}}
                  onDelete={() => handleDeleteAcquisition(acquisition.id)}
                  onFieldUpdate={() => {}}
                  onFieldConvert={() => {}}
                  onFieldDelete={() => {}}
                  onFieldAdd={() => {}}
                  onSeriesUpdate={() => {}}
                  onSeriesAdd={() => {}}
                  onSeriesDelete={() => {}}
                  onSeriesNameUpdate={() => {}}
                />

              </div>

              {/* Right - Schema */}
              {pairing ? (
                <SchemaAcquisitionDisplay
                  key={`${pairing.schemaId}-${pairing.acquisitionId}-${acquisition.id}`}
                  binding={pairing}
                  realAcquisition={acquisition}
                  isCollapsed={collapsedSchemas.has(acquisition.id)}
                  onToggleCollapse={() => toggleSchemaCollapse(acquisition.id)}
                  onDeselect={() => unpairAcquisition(acquisition.id)}
                  isDataProcessing={isProcessing}
                  getSchemaContent={getSchemaContent}
                  getSchemaAcquisition={getSchemaAcquisition}
                />
              ) : (
                <UnifiedSchemaSelector
                  librarySchemas={librarySchemas}
                  uploadedSchemas={uploadedSchemas}
                  selectionMode="acquisition"
                  onAcquisitionSelect={(schemaId, acquisitionId) =>
                    pairSchemaWithAcquisition(acquisition.id, schemaId, acquisitionId)
                  }
                                    onSchemaUpload={handleSchemaUpload}
                  expandable={true}
                  getSchemaContent={getSchemaContent}
                />
              )}
            </div>
          );
        })}

        {/* Extra upload area at bottom */}
        {loadedData.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {renderUploadArea(true)}
            {preSelectedBinding ? (
              <SchemaAcquisitionDisplay
                key={`${preSelectedBinding.schemaId}-${preSelectedBinding.acquisitionId}`}
                binding={preSelectedBinding}
                isDataProcessing={isProcessing}
                isCollapsed={collapsedSchemas.has('preselected_bottom')}
                onToggleCollapse={() => toggleSchemaCollapse('preselected_bottom')}
                onDeselect={() => {
                  setPreSelectedSchemaId(null);
                  setPreSelectedAcquisitionId(null);
                }}
                getSchemaContent={getSchemaContent}
                getSchemaAcquisition={getSchemaAcquisition}
              />
            ) : (
              <UnifiedSchemaSelector
                librarySchemas={librarySchemas}
                uploadedSchemas={uploadedSchemas}
                selectionMode="acquisition"
                selectedSchemaId={preSelectedSchemaId}
                onAcquisitionSelect={handleSchemaSelect}
                                onSchemaUpload={handleSchemaUpload}
                expandable={true}
                getSchemaContent={getSchemaContent}
              />
            )}
          </div>
        )}
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

      {/* Compliance Report Modal */}
      <ComplianceReportModal
        isOpen={showComplianceReport}
        onClose={() => setShowComplianceReport(false)}
        acquisitions={loadedData.filter(acq => schemaPairings.has(acq.id))}
        schemaPairings={schemaPairings}
        complianceResults={allComplianceResults}
      />

      {/* Continue Button */}
      <div className="mt-8 flex justify-end">
        <button
          onClick={handleContinue}
          disabled={getPairedCount() === 0}
          className="px-6 py-3 bg-medical-600 text-white rounded-lg hover:bg-medical-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          Export Compliance Report
          {getPairedCount() > 0 && (
            <span className="ml-2 bg-white bg-opacity-20 px-2 py-1 rounded-full text-xs">
              {getPairedCount()} analyzed
            </span>
          )}
        </button>
      </div>
    </div>
  );
};

export default DataLoadingAndMatching;