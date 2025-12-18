import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Database, Loader, CheckCircle, Plus, X, Trash2, FileText, AlertTriangle } from 'lucide-react';
import { Acquisition, ProcessingProgress } from '../../types';
import { dicompareAPI } from '../../services/DicompareAPI';
import { processUploadedFiles } from '../../utils/fileUploadUtils';
import { useSchemaService, SchemaBinding } from '../../hooks/useSchemaService';
import { SchemaUploadModal } from '../schema/SchemaUploadModal';
import { schemaCacheManager } from '../../services/SchemaCacheManager';
import AcquisitionTable from '../schema/AcquisitionTable';
import UnifiedSchemaSelector from '../schema/UnifiedSchemaSelector';
import ComplianceReportModal from './ComplianceReportModal';
import CombinedComplianceView from './CombinedComplianceView';
import { processSchemaFieldForUI, inferDataTypeFromValue } from '../../utils/datatypeInference';
import { getFieldByKeyword } from '../../services/dicomFieldService';
import { extractValidationFieldValues, generateTestDataFromSchema } from '../../utils/testDataGeneration';
import JSZip from 'jszip';

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
      <div className="border border-border-secondary rounded-lg bg-surface-primary shadow-sm h-fit p-4 text-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600 mx-auto mb-2"></div>
        <span className="text-sm text-content-secondary">Loading schema...</span>
      </div>
    );
  }

  // Error state when not processing
  if (!isDataProcessing) {
    return (
      <div className="border border-border-secondary rounded-lg bg-surface-primary shadow-sm h-fit p-4 text-center">
        <span className="text-sm text-status-error">Failed to load schema</span>
      </div>
    );
  }

  // During processing without schema - minimal loading
  return (
    <div className="border border-border-secondary rounded-lg bg-surface-primary shadow-sm h-fit p-4 text-center">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600 mx-auto mb-2"></div>
      <span className="text-sm text-content-secondary">Loading schema...</span>
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
  const ADD_NEW_ID = '__add_new__';

  // Auto-select logic
  useEffect(() => {
    if (loadedData.length === 0) {
      // Start with "Add New" selected when no acquisitions
      setSelectedAcquisitionId(ADD_NEW_ID);
    } else if (selectedAcquisitionId === ADD_NEW_ID) {
      // Keep "Add New" selected if it was previously selected
    } else if (!selectedAcquisitionId || !loadedData.find(a => a.id === selectedAcquisitionId)) {
      // Select first acquisition if none selected or selected one was deleted
      setSelectedAcquisitionId(loadedData[0].id);
    }
  }, [loadedData, selectedAcquisitionId]);


  // Helper function to convert schema to acquisition format for display
  const convertSchemaToAcquisition = async (binding: SchemaBinding): Promise<Acquisition> => {
    const { schema, acquisitionId } = binding;
    console.log('🔧 convertSchemaToAcquisition called with:', { schemaId: schema.id, acquisitionId });

    let acquisitionDescription = schema.description || 'Schema requirements';

    try {
      // Get schema content to extract fields
      const schemaContent = await getSchemaContent(schema.id);
      console.log('🔧 Got schema content, length:', schemaContent?.length);
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
            // Use acquisition-specific description if available
            if (targetAcquisition.description) {
              acquisitionDescription = targetAcquisition.description;
            }

            // Extract acquisition-level fields
            if (targetAcquisition.fields && Array.isArray(targetAcquisition.fields)) {
              // Convert schema format fields to DicomField format using processSchemaFieldForUI
              schemaFields = targetAcquisition.fields.map(f => {
                const processed = processSchemaFieldForUI(f);
                return {
                  ...processed,
                  level: 'acquisition'
                };
              });
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
                    // Process the schema field to get proper validation rule
                    const processed = processSchemaFieldForUI(f);

                    // Add to unique field definitions
                    if (!fieldMap.has(f.tag)) {
                      fieldMap.set(f.tag, {
                        name: f.field || f.name,
                        tag: f.tag,
                        value: '', // No default value for series fields
                        level: 'series',
                        dataType: processed.dataType,
                        validationRule: processed.validationRule
                      });
                    }

                    // Add field to this series instance as an array element
                    seriesData.fields.push({
                      tag: f.tag,
                      name: f.field || f.name,
                      value: processed.value,
                      dataType: processed.dataType,
                      validationRule: processed.validationRule
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
        seriesDescription: acquisitionDescription,
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
            customTestCases: rule.testCases || [],  // Preserve test cases from schema
            enabledSystemFields: []
          }));
          return functions;
        })()
      };
    } catch (error) {
      console.error('❌ Failed to convert schema to acquisition:', error);
      console.error('❌ Error details:', error.message);
      console.error('❌ Schema ID:', schema.id);
      console.error('❌ Acquisition ID:', acquisitionId);
      // Return minimal acquisition if conversion fails
      return {
        id: `schema-${schema.id}-${acquisitionId || 'default'}`,
        protocolName: schema.name,
        seriesDescription: acquisitionDescription,
        acquisitionFields: [],
        seriesFields: [],
        series: [],
        totalFiles: 0,
        validationFunctions: []
      };
    }
  };


  // Helper to get or load schema acquisition - uses ref for stable callback
  const getSchemaAcquisition = useCallback(async (binding: SchemaBinding): Promise<Acquisition | null> => {
    const key = `${binding.schemaId}-${binding.acquisitionId || 'default'}`;

    if (schemaAcquisitionsRef.current.has(key)) {
      return schemaAcquisitionsRef.current.get(key)!;
    }

    try {
      const acquisition = await convertSchemaToAcquisition(binding);
      schemaAcquisitionsRef.current.set(key, acquisition);
      return acquisition;
    } catch (error) {
      console.error('Failed to get schema acquisition:', error);
      return null;
    }
  }, []);

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

    // Check if this is a protocol file (.pro or .exar1) - route to special handler
    const fileName = files[0].name.toLowerCase();
    if (files.length === 1 && (fileName.endsWith('.pro') || fileName.endsWith('.exar1'))) {
      await handleProFile(files[0]);
      return;
    }

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

      // Auto-select the first newly created acquisition
      if (resolvedAcquisitions.length > 0) {
        setSelectedAcquisitionId(resolvedAcquisitions[0].id);
      }

      setApiError(null);
    } catch (error) {
      console.error('Failed to load DICOM data:', error);
      setApiError(`Failed to process DICOM data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    setIsProcessing(false);
    setProgress(null);
  }, [loadedData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle protocol file upload (.pro or .exar1) - generates DICOMs and then processes them
  const handleProFile = useCallback(async (proFile: File) => {
    const isExarFile = proFile.name.toLowerCase().endsWith('.exar1');
    const fileType = isExarFile ? 'exam archive' : 'protocol';

    setIsProcessing(true);
    setProgress({
      currentFile: 0,
      totalFiles: 1,
      currentOperation: `Parsing Siemens ${fileType} file...`,
      percentage: 0
    });

    try {
      // Step 1: Read file content as Uint8Array
      setProgress(prev => ({ ...prev!, currentOperation: 'Reading file...', percentage: 5 }));
      const arrayBuffer = await proFile.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Step 2: Parse protocol file to acquisition(s)
      setProgress(prev => ({ ...prev!, currentOperation: 'Reading protocol fields...', percentage: 10 }));

      // .exar1 returns multiple acquisitions, .pro returns one
      let acquisitions: Acquisition[];
      if (isExarFile) {
        acquisitions = await dicompareAPI.loadExarFile(uint8Array, proFile.name);
        console.log(`📦 Loaded ${acquisitions.length} protocol(s) from .exar1 file`);
      } else {
        const acquisition = await dicompareAPI.loadProFile(uint8Array, proFile.name);
        acquisitions = [acquisition];
      }

      // Process each acquisition
      const allDicomFiles: File[] = [];
      const totalAcquisitions = acquisitions.length;

      for (let acqIndex = 0; acqIndex < acquisitions.length; acqIndex++) {
        const acquisition = acquisitions[acqIndex];
        const baseProgress = 10 + (acqIndex / totalAcquisitions) * 60;

        setProgress(prev => ({
          ...prev!,
          currentOperation: `Processing ${acquisition.protocolName} (${acqIndex + 1}/${totalAcquisitions})...`,
          percentage: baseProgress
        }));

        // Build all fields list (acquisition + series)
        const allFields = [...(acquisition.acquisitionFields || [])];

        // Add series fields (handle object format from protocol files)
        const seriesFieldMap = new Map<string, any>();
        (acquisition.series || []).forEach(series => {
          if (typeof series.fields === 'object' && !Array.isArray(series.fields)) {
            Object.entries(series.fields).forEach(([tag, fieldData]: [string, any]) => {
              if (!seriesFieldMap.has(tag)) {
                seriesFieldMap.set(tag, {
                  tag: tag,
                  name: fieldData.name || fieldData.field || tag,
                  value: fieldData.value,
                  level: 'series',
                  ...fieldData
                });
              }
            });
          }
        });
        allFields.push(...Array.from(seriesFieldMap.values()));

        // Extract validation field values from validation functions
        const { validationFieldValues, maxValidationRows } = extractValidationFieldValues(
          acquisition.validationFunctions || [],
          allFields,
          acquisition.series || []
        );

        // Ensure ProtocolName field exists if not in schema
        const hasProtocolName = allFields.some(f => f.name === 'ProtocolName');
        if (!hasProtocolName && acquisition.protocolName) {
          const protocolNameFieldDef = await getFieldByKeyword('ProtocolName');
          if (protocolNameFieldDef) {
            const cleanedName = acquisition.protocolName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '_')
              .replace(/^_+|_+$/g, '');

            allFields.push({
              name: protocolNameFieldDef.keyword,
              tag: protocolNameFieldDef.tag,
              vr: protocolNameFieldDef.vr,
              level: 'acquisition',
              value: cleanedName,
              dataType: 'String'
            });
          }
        }

        // Generate test data using shared utility
        const testData = generateTestDataFromSchema(
          allFields,
          acquisition.series || [],
          validationFieldValues,
          maxValidationRows
        );

        // Add fields from testData that aren't in allFields (from validation tests)
        const existingFieldNames = new Set(allFields.map(f => f.name));
        const testDataFieldNames = [...new Set(testData.flatMap(row => Object.keys(row)))];

        for (const fieldName of testDataFieldNames) {
          if (!existingFieldNames.has(fieldName)) {
            const fieldDef = await getFieldByKeyword(fieldName);
            if (fieldDef) {
              allFields.push({
                name: fieldName,
                tag: fieldDef.tag.replace(/[()]/g, ''),
                vr: fieldDef.vr || '',
                level: 'acquisition',
                dataType: inferDataTypeFromValue(testData[0][fieldName]),
                value: testData[0][fieldName]
              } as any);
            }
          }
        }

        // Generate DICOMs from the test data
        setProgress(prev => ({
          ...prev!,
          currentOperation: `Generating DICOMs for ${acquisition.protocolName}...`,
          percentage: baseProgress + 20
        }));
        const zipBlob = await dicompareAPI.generateTestDicomsFromSchema(
          acquisition,
          testData,
          allFields
        );

        // Unzip in-memory and collect DICOM files
        const zip = await JSZip.loadAsync(zipBlob);

        for (const [filename, zipEntry] of Object.entries(zip.files)) {
          if (!zipEntry.dir && filename.endsWith('.dcm')) {
            const blob = await zipEntry.async('blob');
            allDicomFiles.push(new File([blob], filename, { type: 'application/dicom' }));
          }
        }

        console.log(`✅ Generated DICOMs for ${acquisition.protocolName}`);
      }

      console.log(`✅ Generated ${allDicomFiles.length} total DICOM files from ${fileType} file`);

      // Process all generated DICOMs through existing pipeline
      setProgress(prev => ({ ...prev!, currentOperation: 'Processing generated DICOMs...', percentage: 80 }));

      const fileList = new DataTransfer();
      allDicomFiles.forEach(file => fileList.items.add(file));

      await handleFileUpload(fileList.files);

    } catch (error) {
      console.error(`Failed to process ${fileType} file:`, error);
      setApiError(`Failed to process ${fileType} file: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      // Step 1: Load the schema acquisition
      setProgress(prev => ({ ...prev!, currentOperation: 'Loading schema acquisition...', percentage: 10 }));
      const acquisition = await convertSchemaToAcquisition(binding);

      if (!acquisition) {
        throw new Error('Failed to load schema acquisition');
      }

      // Step 2: Generate test data from the acquisition using shared utility
      setProgress(prev => ({ ...prev!, currentOperation: 'Generating test data...', percentage: 30 }));

      // Build all fields list (acquisition + series)
      const allFields = [...(acquisition.acquisitionFields || [])];

      // Add series fields
      const seriesFieldMap = new Map<string, any>();
      (acquisition.series || []).forEach(series => {
        if (Array.isArray(series.fields)) {
          series.fields.forEach(field => {
            if (!seriesFieldMap.has(field.tag)) {
              seriesFieldMap.set(field.tag, {
                ...field,
                level: 'series'
              });
            }
          });
        }
      });
      allFields.push(...Array.from(seriesFieldMap.values()));

      // Extract validation field values from validation functions
      const { validationFieldValues, maxValidationRows } = extractValidationFieldValues(
        acquisition.validationFunctions || [],
        allFields,
        acquisition.series || []
      );

      // Ensure ProtocolName field exists if not in schema
      // Use acquisition name as fallback for ProtocolName DICOM field
      const hasProtocolName = allFields.some(f => f.name === 'ProtocolName');
      if (!hasProtocolName && acquisition.protocolName) {
        const protocolNameFieldDef = await getFieldByKeyword('ProtocolName');
        if (protocolNameFieldDef) {
          // Clean acquisition name for use as ProtocolName (lowercase, underscores, no special chars)
          const cleanedName = acquisition.protocolName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');

          allFields.push({
            name: protocolNameFieldDef.keyword,
            tag: protocolNameFieldDef.tag,
            vr: protocolNameFieldDef.vr,
            level: 'acquisition',
            value: cleanedName,
            dataType: 'String'
          });
        }
      }

      // Generate test data using shared utility
      const testData = generateTestDataFromSchema(
        allFields,
        acquisition.series || [],
        validationFieldValues,
        maxValidationRows
      );

      // Add fields from testData that aren't in allFields (from validation tests)
      const existingFieldNames = new Set(allFields.map(f => f.name));
      const testDataFieldNames = [...new Set(testData.flatMap(row => Object.keys(row)))];

      for (const fieldName of testDataFieldNames) {
        if (!existingFieldNames.has(fieldName)) {
          // This field came from validation tests - look up its DICOM tag
          const fieldDef = await getFieldByKeyword(fieldName);
          if (fieldDef) {
            allFields.push({
              name: fieldName,
              tag: fieldDef.tag.replace(/[()]/g, ''),
              vr: fieldDef.vr || '',
              level: 'acquisition',
              dataType: inferDataTypeFromValue(testData[0][fieldName]),
              value: testData[0][fieldName]
            } as any);
          }
        }
      }

      // Step 3: Generate DICOMs from the test data
      setProgress(prev => ({ ...prev!, currentOperation: 'Generating DICOM files...', percentage: 50 }));
      const zipBlob = await dicompareAPI.generateTestDicomsFromSchema(
        acquisition,
        testData,
        allFields
      );

      // Step 4: Unzip in-memory
      setProgress(prev => ({ ...prev!, currentOperation: 'Extracting DICOM files...', percentage: 70 }));
      const zip = await JSZip.loadAsync(zipBlob);
      const dicomFiles: File[] = [];

      for (const [filename, zipEntry] of Object.entries(zip.files)) {
        if (!zipEntry.dir && filename.endsWith('.dcm')) {
          const blob = await zipEntry.async('blob');
          dicomFiles.push(new File([blob], filename, { type: 'application/dicom' }));
        }
      }

      console.log(`✅ Generated ${dicomFiles.length} DICOM files from schema`);

      // Step 5: Convert to FileList and process through existing DICOM pipeline
      setProgress(prev => ({ ...prev!, currentOperation: 'Processing generated DICOMs...', percentage: 80 }));

      const fileList = new DataTransfer();
      dicomFiles.forEach(file => fileList.items.add(file));

      // Process the generated DICOMs using existing pipeline
      await handleFileUpload(fileList.files);

    } catch (error) {
      console.error('Failed to process schema as data:', error);
      setApiError(`Failed to generate DICOMs from schema: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsProcessing(false);
      setProgress(null);
    }
  }, [handleFileUpload, convertSchemaToAcquisition]);

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

  // Component to render compact acquisition preview card
  const renderAcquisitionPreview = (acquisition: Acquisition) => {
    const pairing = getAcquisitionPairing(acquisition.id);
    const hasNoPairing = !pairing;
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
              {hasNoPairing && (
                <AlertTriangle className="h-4 w-4 text-status-warning flex-shrink-0" title="No schema assigned" />
              )}
            </div>
            <p className="text-xs text-content-secondary mt-1 truncate">
              {acquisition.seriesDescription || 'No description'}
            </p>
            <div className="flex items-center space-x-4 mt-2 text-xs text-content-tertiary">
              <span>{acquisition.totalFiles} files</span>
              {pairing && (
                <span className="text-status-success flex items-center">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Paired
                </span>
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
            Load DICOMs
          </h3>
        </div>
        <p className="text-xs text-content-secondary mt-1">

        </p>
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
              {isExtra ? 'Upload More DICOM Files' : 'Load Data for Compliance Testing'}
            </h3>
            <p className="text-content-secondary mb-4">
              Drag and drop DICOM files (or .zip), Siemens protocol files (.pro, .exar1), or select a schema to generate test data
            </p>

            <input
              type="file"
              multiple
              webkitdirectory=""
              accept=".dcm,.dicom,.zip,.pro,.exar1"
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
      <div className="grid grid-cols-12 gap-6 min-h-[600px]">
        {/* Left Panel - Acquisition Selector */}
        <div className="col-span-12 md:col-span-3">
          <div className="bg-surface-primary rounded-lg border border-border shadow-sm">
            {/* Header */}
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-lg font-medium text-content-primary">Acquisitions</h3>
              <p className="text-sm text-content-secondary">Select to view or load more data</p>
            </div>

            {/* Acquisition List */}
            <div className="p-2 space-y-2 max-h-[600px] overflow-y-auto">
              {/* Upload New - Always first */}
              {renderAddNewItem()}

              {/* Existing Acquisitions */}
              {loadedData.map((acquisition) => renderAcquisitionPreview(acquisition))}
            </div>
          </div>
        </div>

        {/* Right Panel - Combined View */}
        <div className="col-span-12 md:col-span-9">
          {selectedAcquisitionId === ADD_NEW_ID ? (
            /* Show upload options when "Upload New" is selected */
            renderUploadArea(false)
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
      {showSchemaSelectionModal && selectedAcquisition && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-surface-primary rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-content-primary">Select Schema</h3>
                <button
                  onClick={() => setShowSchemaSelectionModal(false)}
                  className="text-content-muted hover:text-content-secondary"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <p className="text-content-secondary mt-2">
                Select a schema and acquisition to validate against
              </p>
            </div>

            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <UnifiedSchemaSelector
                librarySchemas={librarySchemas}
                uploadedSchemas={uploadedSchemas}
                selectionMode="acquisition"
                onAcquisitionSelect={(schemaId, acquisitionId) => {
                  pairSchemaWithAcquisition(selectedAcquisition.id, schemaId, acquisitionId);
                  setShowSchemaSelectionModal(false);
                }}
                onSchemaUpload={handleSchemaUpload}
                expandable={true}
                getSchemaContent={getSchemaContent}
              />
            </div>
          </div>
        </div>
      )}

      {/* Schema as Data Source Modal */}
      {showSchemaAsDataModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-primary rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-content-primary">Select Schema to Generate Test Data</h2>
                <p className="text-sm text-content-secondary mt-1">
                  Choose a schema to generate compliant DICOM files for testing
                </p>
              </div>
              <button
                onClick={() => setShowSchemaAsDataModal(false)}
                className="text-content-muted hover:text-content-secondary"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <UnifiedSchemaSelector
                librarySchemas={librarySchemas}
                uploadedSchemas={uploadedSchemas}
                selectionMode="acquisition"
                onAcquisitionSelect={async (schemaId, acquisitionId) => {
                  setShowSchemaAsDataModal(false);

                  // Get the schema
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
                onSchemaUpload={handleSchemaUpload}
                expandable={true}
                getSchemaContent={getSchemaContent}
              />
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
};

export default DataLoadingAndMatching;