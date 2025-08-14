import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Database, Loader, CheckCircle, FileText, Code, Link2, Plus, X, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Acquisition, ProcessingProgress, Template, DicomField, Series } from '../../types';
import { dicompareAPI, AnalysisResult } from '../../services/DicompareAPI';
import { useSchemaContext } from '../../contexts/SchemaContext';
import { SchemaUploadModal } from '../schema/SchemaUploadModal';
import { SchemaTemplate } from '../../types/schema';
import AcquisitionTable from '../generate/AcquisitionTable';
import FieldTable from '../generate/FieldTable';
import SeriesTable from '../generate/SeriesTable';
import ComplianceFieldTable from './ComplianceFieldTable';
import SchemaSelectionCard from '../common/SchemaSelectionCard';

const DataLoadingAndMatching: React.FC = () => {
  const navigate = useNavigate();
  const { 
    schemas, 
    selectedSchema, 
    selectSchema, 
    getSchemaContent,
    deleteSchema
  } = useSchemaContext();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const [loadedData, setLoadedData] = useState<Acquisition[]>([]);
  const [showExampleData, setShowExampleData] = useState(false);
  const [availableSchemas, setAvailableSchemas] = useState<SchemaTemplate[]>([]);
  const [pairings, setPairings] = useState<Record<string, string>>({});
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [preSelectedSchemaId, setPreSelectedSchemaId] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [collapsedSchemas, setCollapsedSchemas] = useState<Set<string>>(new Set());

  // Load example schemas automatically on component mount
  const loadExampleSchemas = async () => {
    try {
      setApiError(null);
      const exampleSchemas = await dicompareAPI.getExampleSchemas();
      setAvailableSchemas(exampleSchemas);
    } catch (error) {
      console.error('Failed to load example schemas:', error);
      setApiError('Failed to load validation schemas');
    }
  };

  // Helper to format validation rule as a display value
  const formatValidationRule = (rule: {
    exact?: any;
    range?: { min: number; max: number };
    tolerance?: { value: number; unit?: string };
    contains?: string;
  }): string => {
    if (rule.exact !== undefined) return String(rule.exact);
    if (rule.range) return `${rule.range.min} - ${rule.range.max}`;
    if (rule.tolerance) return `±${rule.tolerance.value}${rule.tolerance.unit || ''}`;
    if (rule.contains) return `Contains: "${rule.contains}"`;
    return 'Any value';
  };

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
      setProgress({
        currentFile: 0,
        totalFiles: files.length,
        currentOperation: 'Processing DICOM files...',
        percentage: 25
      });

      // Process real DICOM files using dicompare
      const result = await dicompareAPI.analyzeFilesForUI(Array.from(files), (progress) => {
        setProgress({
          currentFile: Math.floor((progress.totalProcessed / progress.totalFiles) * files.length),
          totalFiles: files.length,
          currentOperation: progress.currentOperation,
          percentage: 25 + (progress.percentage * 0.75) // Scale to 25-100%
        });
      });

      // Append new acquisitions to existing ones instead of replacing
      const newAcquisitions = result || [];
      
      // Check for ID conflicts with existing acquisitions and resolve them
      const existingIds = new Set((loadedData || []).map(acq => acq.id));
      const resolvedAcquisitions = newAcquisitions.map(acq => {
        if (!existingIds.has(acq.id)) {
          return acq; // No conflict
        }
        
        // Find next available ID with suffix
        let counter = 2;
        let newId = `${acq.id}_${counter}`;
        while (existingIds.has(newId)) {
          counter++;
          newId = `${acq.id}_${counter}`;
        }
        
        console.log(`Resolved ID conflict: ${acq.id} → ${newId}`);
        return { ...acq, id: newId };
      });
      
      setLoadedData(prev => [...(prev || []), ...resolvedAcquisitions]);
      setApiError(null);
      
      // Auto-pair preselected schema with newly uploaded acquisitions
      if (preSelectedSchemaId && resolvedAcquisitions && resolvedAcquisitions.length > 0) {
        console.log(`Auto-pairing preselected schema ${preSelectedSchemaId} with ${resolvedAcquisitions.length} new acquisitions`);
        const newPairings: Record<string, string> = {};
        resolvedAcquisitions.forEach(acquisition => {
          newPairings[acquisition.id] = preSelectedSchemaId;
        });
        setPairings(prev => ({ ...prev, ...newPairings }));
        // Clear preselection since it's now been used
        setPreSelectedSchemaId(null);
      }
    } catch (error) {
      console.error('Failed to load DICOM data:', error);
      setApiError(`Failed to process DICOM data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Don't clear existing data on error - keep what was already loaded
    }
    
    setIsProcessing(false);
    setProgress(null);
  }, [preSelectedSchemaId]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFileUpload(e.dataTransfer.files);
  }, [handleFileUpload]);


  const loadExampleData = async () => {
    try {
      setApiError(null);
      // Load only DICOM data when user clicks "Load Example Data"
      const acquisitions = await dicompareAPI.getExampleDicomDataForUI();
      setLoadedData(acquisitions);
      
      // Auto-pair preselected schema with example data acquisitions
      if (preSelectedSchemaId && acquisitions && acquisitions.length > 0) {
        console.log(`Auto-pairing preselected schema ${preSelectedSchemaId} with ${acquisitions.length} example acquisitions`);
        const newPairings: Record<string, string> = {};
        acquisitions.forEach(acquisition => {
          newPairings[acquisition.id] = preSelectedSchemaId;
        });
        setPairings(prev => ({ ...prev, ...newPairings }));
        // Clear preselection since it's now been used
        setPreSelectedSchemaId(null);
      }
      
      setShowExampleData(true);
    } catch (error) {
      console.error('Failed to load example data:', error);
      setApiError('Failed to load example DICOM data');
    }
  };

  const clearData = () => {
    setLoadedData([]);
    setShowExampleData(false);
    setPairings({});
    setPreSelectedSchemaId(null);
  };

  const handleTemplatePairing = (acquisitionId: string, templateId: string, acquisitionIndex?: string) => {
    // Simple: just store "schemaId:acquisitionIndex" if acquisition selected, otherwise just schemaId
    const pairingKey = acquisitionIndex ? `${templateId}:${acquisitionIndex}` : templateId;
    setPairings(prev => ({
      ...prev,
      [acquisitionId]: pairingKey
    }));
    console.log(`Paired acquisition ${acquisitionId} with template ${templateId} acquisition ${acquisitionIndex || 'all'}`);
  };

  const unpairAcquisition = (acquisitionId: string) => {
    setPairings(prev => {
      const newPairings = { ...prev };
      delete newPairings[acquisitionId];
      return newPairings;
    });
  };

  const handleDeleteSchema = async (schemaId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent the schema selection from firing
    
    try {
      // Remove any pairings with this schema
      setPairings(prev => {
        const newPairings = { ...prev };
        Object.keys(newPairings).forEach(acquisitionId => {
          if (newPairings[acquisitionId] === schemaId) {
            delete newPairings[acquisitionId];
          }
        });
        return newPairings;
      });

      // Clear pre-selection if this schema was selected
      if (preSelectedSchemaId === schemaId) {
        setPreSelectedSchemaId(null);
      }

      // Delete from context (handles uploaded schemas)
      await deleteSchema(schemaId);
      
      // For example schemas, remove from availableSchemas state
      setAvailableSchemas(prev => prev.filter(schema => schema.id !== schemaId));
    } catch (error) {
      console.error('Failed to delete schema:', error);
    }
  };

  const handleSchemaUpload = async (file: File) => {
    try {
      // Read file content to pre-fill modal
      const content = await file.text();
      
      // Log the content for debugging
      console.log('File content length:', content.length);
      console.log('First 200 characters:', content.substring(0, 200));
      console.log('Content around line 85:', content.split('\n').slice(80, 90).join('\n'));
      
      // Try to clean up the JSON content
      let cleanContent = content.trim();
      
      // Remove any BOM (Byte Order Mark)
      if (cleanContent.charCodeAt(0) === 0xFEFF) {
        cleanContent = cleanContent.slice(1);
      }
      
      // Check for common JSON issues
      if (!cleanContent.startsWith('{') && !cleanContent.startsWith('[')) {
        throw new Error('File does not appear to be valid JSON (does not start with { or [)');
      }
      
      let schemaData;
      try {
        schemaData = JSON.parse(cleanContent);
      } catch (parseError) {
        // Try to provide more specific error information
        const match = parseError.message.match(/at line (\d+) column (\d+)/);
        if (match) {
          const line = parseInt(match[1]);
          const column = parseInt(match[2]);
          const lines = cleanContent.split('\n');
          const problematicLine = lines[line - 1];
          console.error(`Parse error at line ${line}, column ${column}:`);
          console.error(`Line content: "${problematicLine}"`);
          console.error(`Character at error position: "${problematicLine ? problematicLine[column - 1] : 'N/A'}"`);
          
          throw new Error(`JSON parse error at line ${line}, column ${column}. Problematic line: "${problematicLine}"`);
        }
        throw parseError;
      }
      
      // Validate basic structure
      if (!schemaData || typeof schemaData !== 'object') {
        throw new Error('Schema file must contain a valid JSON object');
      }
      
      // Extract metadata from schema if available
      const template = schemaData.template || schemaData;
      const metadata = {
        title: template.name || file.name.replace('.json', ''),
        description: template.description || '',
        authors: template.authors ? template.authors.join(', ') : ''
      };
      
      setUploadedFile(file);
      setShowUploadModal(true);
      setApiError(null); // Clear any previous errors
      
      console.log('Successfully parsed schema:', metadata);
      
    } catch (error) {
      console.error('Failed to parse schema file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setApiError(`Failed to parse schema file: ${errorMessage}`);
      
      // Still allow upload but without pre-filling
      setUploadedFile(file);
      setShowUploadModal(true);
    }
  };

  const handleContinue = () => {
    // Could navigate to a report export page or stay on current page
    console.log('Analysis complete - could export report or navigate to detailed analysis');
  };

  const getPairedTemplate = (acquisitionId: string): (SchemaTemplate & { acquisitionIndex?: string }) | null => {
    const pairingKey = pairings[acquisitionId];
    console.log(`getPairedTemplate for acquisition ${acquisitionId}, pairingKey: ${pairingKey}`);
    if (!pairingKey) return null;
    
    // Simple parsing: "schemaId:acquisitionIndex" or just "schemaId"
    const [templateId, acquisitionIndex] = pairingKey.includes(':') ? 
      pairingKey.split(':') : [pairingKey, undefined];
    
    console.log(`Parsed templateId: ${templateId}, acquisitionIndex: ${acquisitionIndex}`);
    
    // Find the schema
    const uploadedSchema = schemas.find(s => s.id === templateId);
    if (uploadedSchema) {
      const result = {
        id: uploadedSchema.id,
        name: uploadedSchema.title,
        description: uploadedSchema.description || '',
        category: 'Uploaded Schema',
        content: '',
        format: uploadedSchema.format,
        version: uploadedSchema.version,
        authors: uploadedSchema.authors,
        acquisitionIndex
      };
      console.log(`Returning paired template:`, result);
      return result;
    }
    
    const exampleSchema = availableSchemas.find(t => t.id === templateId);
    if (exampleSchema) {
      const result = {
        ...exampleSchema,
        acquisitionIndex
      };
      console.log(`Returning paired template:`, result);
      return result;
    }
    
    return null;
  };

  // Get all available schemas (uploaded + examples)
  const getAllAvailableSchemas = (): SchemaTemplate[] => {
    const uploadedSchemas: SchemaTemplate[] = schemas.map(schema => ({
      id: schema.id,
      name: schema.title,
      description: schema.description || '',
      category: 'Uploaded Schema',
      content: '', // Will be loaded when needed
      format: schema.format,
      version: schema.version,
      authors: schema.authors
    }));
    
    return [...uploadedSchemas, ...availableSchemas];
  };

  // Load example schemas automatically when component mounts
  useEffect(() => {
    loadExampleSchemas();
  }, []); // Only run once on mount

  const getPairedCount = () => {
    return Object.keys(pairings).length;
  };

  const toggleSchemaCollapse = (acquisitionId: string) => {
    setCollapsedSchemas(prev => {
      const newSet = new Set(prev);
      if (newSet.has(acquisitionId)) {
        newSet.delete(acquisitionId);
      } else {
        newSet.add(acquisitionId);
      }
      return newSet;
    });
  };

  const handleDeleteAcquisition = (acquisitionId: string) => {
    // Remove the acquisition from loadedData
    setLoadedData(prev => prev?.filter(acq => acq.id !== acquisitionId) || []);
    
    // Remove any pairing for this acquisition
    setPairings(prev => {
      const newPairings = { ...prev };
      delete newPairings[acquisitionId];
      return newPairings;
    });
    
    // Remove from collapsed state if it was collapsed
    setCollapsedSchemas(prev => {
      const newSet = new Set(prev);
      newSet.delete(acquisitionId);
      return newSet;
    });
    
    console.log(`Deleted acquisition ${acquisitionId}`);
  };

  // Remove the full-screen loading overlay - handle loading state in upload areas instead

  // Component to render upload area that looks like an acquisition card
  const renderUploadArea = (isExtra: boolean = false) => (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm p-6">
      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-medical-400 transition-colors"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isProcessing ? (
          // Show loading state
          <>
            <Loader className="h-12 w-12 text-medical-600 mx-auto mb-4 animate-spin" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Processing DICOM Files</h3>
            <p className="text-gray-600 mb-4">
              {progress?.currentOperation || 'Processing your files...'}
            </p>
            
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
          // Show normal upload interface
          <>
            <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {isExtra ? 'Upload More DICOM Files' : 'Upload DICOM Files'}
            </h3>
            <p className="text-gray-600 mb-4">
              Drag and drop DICOM files or folders here, or click to browse
            </p>
            
            <input
              type="file"
              multiple
              webkitdirectory=""
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
              {loadedData && loadedData.length > 0 ? (
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
            {apiError && (
              <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {apiError}
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
            {loadedData && loadedData.length > 0 && (
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

      {/* Acquisition and Schema Cards Side by Side */}
      <div className="space-y-6">
        {/* Show upload area first if no data loaded */}
        {(!loadedData || loadedData.length === 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {renderUploadArea()}
            {preSelectedSchemaId ? (
              // Show schema details when one is selected for upload area - using same structure as paired schema
              <div className="border border-gray-300 rounded-lg bg-white shadow-sm h-fit">
                {/* Template Header */}
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 rounded-t-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">
                        {getAllAvailableSchemas().find(s => s.id === preSelectedSchemaId)?.name}
                      </h3>
                      <p className="text-xs text-gray-600 truncate">Schema Requirements</p>
                    </div>
                    <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
                      <button
                        onClick={() => setPreSelectedSchemaId(null)}
                        className="p-1 text-gray-600 hover:text-red-600 transition-colors"
                        title="Deselect schema"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => toggleSchemaCollapse('preselected')}
                        className="p-1 text-gray-600 hover:text-gray-800 transition-colors"
                        title={collapsedSchemas.has('preselected') ? 'Expand' : 'Collapse'}
                      >
                        {collapsedSchemas.has('preselected') ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    v{getAllAvailableSchemas().find(s => s.id === preSelectedSchemaId)?.version || '1.0.0'} • {getAllAvailableSchemas().find(s => s.id === preSelectedSchemaId)?.authors?.join(', ') || 'Example Schema'}
                  </div>
                </div>

                {/* Schema Preview - Collapsible */}
                {!collapsedSchemas.has('preselected') && (
                  <div className="p-3 space-y-3">
                    <div>
                      <ComplianceFieldTable
                        fields={[]} // Empty fields for schema-only display
                        acquisition={{} as Acquisition} // Empty acquisition object
                        schemaFields={[]} // Not used anymore, Python API handles schema internally
                        schemaId={preSelectedSchemaId?.includes(':') ? preSelectedSchemaId.split(':')[0] : preSelectedSchemaId}
                        acquisitionId={preSelectedSchemaId?.includes(':') ? preSelectedSchemaId.split(':')[1] : undefined}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <SchemaSelectionCard
                schemas={getAllAvailableSchemas()}
                selectedSchemaId={preSelectedSchemaId}
                onSchemaSelect={(schemaId, acquisitionIndex) => {
                  console.log(`Pre-selecting schema ${schemaId} with acquisition ${acquisitionIndex || 'all'}`);
                  setPreSelectedSchemaId(acquisitionIndex ? `${schemaId}:${acquisitionIndex}` : schemaId);
                }}
                onSchemaDelete={handleDeleteSchema}
                onSchemaUpload={handleSchemaUpload}
                getSchemaContent={getSchemaContent}
                title="Select Validation Schema"
              />
            )}
          </div>
        )}

        {/* Show loaded acquisitions */}
        {loadedData && loadedData.map((acquisition) => {
          const pairedTemplate = getPairedTemplate(acquisition.id);
          
          return (
            <div key={acquisition.id} className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Left - Acquisition Card */}
              <div className="relative">
                <AcquisitionTable
                  acquisition={acquisition}
                  isEditMode={true} // Enable edit mode to show delete button
                  onUpdate={() => {}} // Not needed for compliance mode
                  onDelete={() => handleDeleteAcquisition(acquisition.id)}
                  onFieldUpdate={() => {}} // Not needed for compliance mode
                  onFieldConvert={() => {}} // Not needed for compliance mode
                  onFieldDelete={() => {}} // Not needed for compliance mode
                  onFieldAdd={() => {}} // Not needed for compliance mode
                  onSeriesUpdate={() => {}} // Not needed for compliance mode
                  onSeriesAdd={() => {}} // Not needed for compliance mode
                  onSeriesDelete={() => {}} // Not needed for compliance mode
                  onSeriesNameUpdate={() => {}} // Not needed for compliance mode
                />
                
                {/* Pairing Status Badge */}
                {pairedTemplate && (
                  <div className="absolute top-2 right-10 bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium flex items-center">
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Paired
                  </div>
                )}
              </div>

              {/* Right - Schema Selection or Details Card */}
              {pairedTemplate ? (
                // Show template details when paired
                <div className="border border-gray-300 rounded-lg bg-white shadow-sm h-fit">
                  {/* Template Header */}
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 rounded-t-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">{pairedTemplate.name}</h3>
                        <p className="text-xs text-gray-600 truncate">Schema Requirements</p>
                      </div>
                      <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
                        <button
                          onClick={() => unpairAcquisition(acquisition.id)}
                          className="p-1 text-gray-600 hover:text-red-600 transition-colors"
                          title="Unpair template"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => toggleSchemaCollapse(acquisition.id)}
                          className="p-1 text-gray-600 hover:text-gray-800 transition-colors"
                          title={collapsedSchemas.has(acquisition.id) ? 'Expand' : 'Collapse'}
                        >
                          {collapsedSchemas.has(acquisition.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                        </button>
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      v{pairedTemplate.version || '1.0.0'} • {pairedTemplate.authors?.join(', ') || 'Example Schema'}
                    </div>
                  </div>

                  {/* Schema Pairing - Collapsible */}
                  {!collapsedSchemas.has(acquisition.id) && (
                    <div className="p-3 space-y-3">
                      <div>
                        <ComplianceFieldTable
                          fields={acquisition.acquisitionFields}
                          acquisition={acquisition}
                          schemaFields={[]}
                          schemaId={pairedTemplate.id}
                          acquisitionId={pairedTemplate.acquisitionIndex}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // Show template selection when not paired
                <SchemaSelectionCard
                  schemas={getAllAvailableSchemas()}
                  onSchemaSelect={(schemaId, acquisitionId) => handleTemplatePairing(acquisition.id, schemaId, acquisitionId)}
                  onSchemaDelete={handleDeleteSchema}
                  onSchemaUpload={handleSchemaUpload}
                  getSchemaContent={getSchemaContent}
                  title={`Select template for: ${acquisition.protocolName}`}
                />
              )}
            </div>
          );
        })}

        {/* Always show extra upload row at the bottom when there's data */}
        {loadedData && loadedData.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {renderUploadArea(true)}
            {preSelectedSchemaId ? (
              // Show schema details when one is selected for upload area - using same structure as paired schema
              <div className="border border-gray-300 rounded-lg bg-white shadow-sm h-fit">
                {/* Template Header */}
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 rounded-t-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">
                        {getAllAvailableSchemas().find(s => s.id === preSelectedSchemaId)?.name}
                      </h3>
                      <p className="text-xs text-gray-600 truncate">Schema Requirements</p>
                    </div>
                    <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
                      <button
                        onClick={() => setPreSelectedSchemaId(null)}
                        className="p-1 text-gray-600 hover:text-red-600 transition-colors"
                        title="Deselect schema"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => toggleSchemaCollapse('preselected_bottom')}
                        className="p-1 text-gray-600 hover:text-gray-800 transition-colors"
                        title={collapsedSchemas.has('preselected_bottom') ? 'Expand' : 'Collapse'}
                      >
                        {collapsedSchemas.has('preselected_bottom') ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    v{getAllAvailableSchemas().find(s => s.id === preSelectedSchemaId)?.version || '1.0.0'} • {getAllAvailableSchemas().find(s => s.id === preSelectedSchemaId)?.authors?.join(', ') || 'Example Schema'}
                  </div>
                </div>

                {/* Schema Preview - Collapsible */}
                {!collapsedSchemas.has('preselected_bottom') && (
                  <div className="p-3 space-y-3">
                    <div>
                      <ComplianceFieldTable
                        fields={[]} // Empty fields for schema-only display
                        acquisition={{} as Acquisition} // Empty acquisition object
                        schemaFields={[]} // Not used anymore, Python API handles schema internally
                        schemaId={preSelectedSchemaId?.includes(':') ? preSelectedSchemaId.split(':')[0] : preSelectedSchemaId}
                        acquisitionId={preSelectedSchemaId?.includes(':') ? preSelectedSchemaId.split(':')[1] : undefined}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <SchemaSelectionCard
                schemas={getAllAvailableSchemas()}
                selectedSchemaId={preSelectedSchemaId}
                onSchemaSelect={setPreSelectedSchemaId}
                onSchemaDelete={handleDeleteSchema}
                onSchemaUpload={handleSchemaUpload}
                getSchemaContent={getSchemaContent}
                title="Select Validation Schema"
              />
            )}
          </div>
        )}
      </div>

      <SchemaUploadModal
        isOpen={showUploadModal}
        onClose={() => {
          setShowUploadModal(false);
          setUploadedFile(null);
        }}
        onUploadComplete={(schemaId) => {
          setShowUploadModal(false);
          setUploadedFile(null);
        }}
        preloadedFile={uploadedFile}
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