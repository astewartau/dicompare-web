import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Database, Loader, CheckCircle, FileText, Code, Link2, Plus, X, Trash2 } from 'lucide-react';
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

  // Load example schemas from Python API only when needed
  const loadExampleSchemasIfNeeded = async () => {
    if (availableSchemas.length > 0) return; // Already loaded
    
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
        percentage: 50
      });

      // Use Python API to get example DICOM data (UI format)
      const acquisitions = await dicompareAPI.getExampleDicomDataForUI();
      setLoadedData(acquisitions);
      
      // Auto-pair with pre-selected schema if one was chosen
      if (preSelectedSchemaId && acquisitions.length > 0) {
        const newPairings: Record<string, string> = {};
        acquisitions.forEach(acq => {
          newPairings[acq.id] = preSelectedSchemaId;
        });
        setPairings(prev => ({ ...prev, ...newPairings }));
        // Clear the pre-selection since it's now paired
        setPreSelectedSchemaId(null);
      }
      
      setApiError(null);
    } catch (error) {
      console.error('Failed to load DICOM data:', error);
      setApiError('Failed to process DICOM data');
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
      // Load example schemas and DICOM data when user clicks to load example data
      await loadExampleSchemasIfNeeded();
      const acquisitions = await dicompareAPI.getExampleDicomDataForUI();
      setLoadedData(acquisitions);
      
      // Auto-pair with pre-selected schema if one was chosen
      if (preSelectedSchemaId && acquisitions.length > 0) {
        const newPairings: Record<string, string> = {};
        acquisitions.forEach(acq => {
          newPairings[acq.id] = preSelectedSchemaId;
        });
        setPairings(prev => ({ ...prev, ...newPairings }));
        // Clear the pre-selection since it's now paired
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

  const handleTemplatePairing = (acquisitionId: string, templateId: string) => {
    setPairings(prev => ({
      ...prev,
      [acquisitionId]: templateId
    }));
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

  const handleContinue = () => {
    // Could navigate to a report export page or stay on current page
    console.log('Analysis complete - could export report or navigate to detailed analysis');
  };

  const getPairedTemplate = (acquisitionId: string): SchemaTemplate | null => {
    const templateId = pairings[acquisitionId];
    if (!templateId) return null;
    
    // First check uploaded schemas
    const uploadedSchema = schemas.find(s => s.id === templateId);
    if (uploadedSchema) {
      return {
        id: uploadedSchema.id,
        name: uploadedSchema.title,
        description: uploadedSchema.description || '',
        category: 'Uploaded Schema',
        content: '', // Will be loaded when needed
        format: uploadedSchema.format,
        version: uploadedSchema.version,
        authors: uploadedSchema.authors
      };
    }
    
    // Then check example schemas
    return availableSchemas.find(t => t.id === templateId) || null;
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

  // Load schemas when DICOM data is loaded and user might need to select templates
  useEffect(() => {
    if (loadedData.length > 0 && availableSchemas.length === 0) {
      loadExampleSchemasIfNeeded();
    }
  }, [loadedData.length]); // Only trigger when data is first loaded

  const getPairedCount = () => {
    return Object.keys(pairings).length;
  };

  if (isProcessing) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Loading DICOM Data</h2>
          <p className="text-gray-600">
            Processing your DICOM files and extracting metadata...
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="text-center">
            <Loader className="h-16 w-16 text-medical-600 mx-auto mb-6 animate-spin" />
            
            {progress && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">
                  {progress.currentOperation}
                </h3>
                
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className="bg-medical-600 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${progress.percentage}%` }}
                  />
                </div>
                
                <p className="text-sm text-gray-600">
                  {Math.round(progress.percentage)}% complete
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Component to render upload area that looks like an acquisition card
  const renderUploadArea = (isExtra: boolean = false) => (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm p-6">
      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-medical-400 transition-colors"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
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
            {loadedData.length > 0 && (
              <button
                onClick={clearData}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Clear Data
              </button>
            )}
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              <Plus className="h-4 w-4 mr-2" />
              Upload Template
            </button>
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
        {loadedData.length === 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {renderUploadArea()}
            {preSelectedSchemaId ? (
              // Show schema details when one is selected for upload area
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
                    <button
                      onClick={() => setPreSelectedSchemaId(null)}
                      className="p-1 text-gray-600 hover:text-red-600 transition-colors"
                      title="Deselect schema"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    v{getAllAvailableSchemas().find(s => s.id === preSelectedSchemaId)?.version || '1.0.0'} • {getAllAvailableSchemas().find(s => s.id === preSelectedSchemaId)?.authors?.join(', ') || 'Example Schema'}
                  </div>
                </div>

                {/* Schema Preview */}
                <div className="p-3 space-y-3">
                  <div>
                    <ComplianceFieldTable
                      fields={[]} // Empty fields for schema-only display
                      acquisition={{} as Acquisition} // Empty acquisition object
                      schemaFields={[]} // Not used anymore, Python API handles schema internally
                      schemaId={preSelectedSchemaId}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <SchemaSelectionCard
                schemas={getAllAvailableSchemas()}
                selectedSchemaId={preSelectedSchemaId}
                onSchemaSelect={setPreSelectedSchemaId}
                onSchemaDelete={handleDeleteSchema}
                title="Select Validation Schema"
              />
            )}
          </div>
        )}

        {/* Show loaded acquisitions */}
        {loadedData.map((acquisition) => {
          const pairedTemplate = getPairedTemplate(acquisition.id);
          
          return (
            <div key={acquisition.id} className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Left - Acquisition Card */}
              <div className="relative">
                <AcquisitionTable
                  acquisition={acquisition}
                  isEditMode={false}
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
                
                {/* Pairing Status Badge */}
                {pairedTemplate && (
                  <div className="absolute top-2 right-2 bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium flex items-center">
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
                      <button
                        onClick={() => unpairAcquisition(acquisition.id)}
                        className="p-1 text-gray-600 hover:text-red-600 transition-colors"
                        title="Unpair template"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      v{pairedTemplate.version || '1.0.0'} • {pairedTemplate.authors?.join(', ') || 'Example Schema'}
                    </div>
                  </div>

                  {/* Schema Pairing */}
                  <div className="p-3 space-y-3">
                    <div>
                      <ComplianceFieldTable
                        fields={acquisition.acquisitionFields} // Pass acquisition fields for compliance validation
                        acquisition={acquisition}
                        schemaFields={[]} // Not used anymore, Python API handles schema internally
                        schemaId={pairedTemplate.id}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                // Show template selection when not paired
                <SchemaSelectionCard
                  schemas={getAllAvailableSchemas()}
                  onSchemaSelect={(schemaId) => handleTemplatePairing(acquisition.id, schemaId)}
                  onSchemaDelete={handleDeleteSchema}
                  title={`Select template for: ${acquisition.protocolName}`}
                />
              )}
            </div>
          );
        })}

        {/* Always show extra upload row at the bottom when there's data */}
        {loadedData.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {renderUploadArea(true)}
            {preSelectedSchemaId ? (
              // Show schema details when one is selected for upload area
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
                    <button
                      onClick={() => setPreSelectedSchemaId(null)}
                      className="p-1 text-gray-600 hover:text-red-600 transition-colors"
                      title="Deselect schema"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    v{getAllAvailableSchemas().find(s => s.id === preSelectedSchemaId)?.version || '1.0.0'} • {getAllAvailableSchemas().find(s => s.id === preSelectedSchemaId)?.authors?.join(', ') || 'Example Schema'}
                  </div>
                </div>

                {/* Schema Preview */}
                <div className="p-3 space-y-3">
                  <div>
                    <ComplianceFieldTable
                      fields={[]} // Empty fields for schema-only display
                      acquisition={{} as Acquisition} // Empty acquisition object
                      schemaFields={[]} // Not used anymore, Python API handles schema internally
                      schemaId={preSelectedSchemaId}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <SchemaSelectionCard
                schemas={getAllAvailableSchemas()}
                selectedSchemaId={preSelectedSchemaId}
                onSchemaSelect={setPreSelectedSchemaId}
                onSchemaDelete={handleDeleteSchema}
                title="Select Validation Schema"
              />
            )}
          </div>
        )}
      </div>

      <SchemaUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploadComplete={(schemaId) => {
          setShowUploadModal(false);
        }}
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