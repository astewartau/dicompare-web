import React, { useState, useCallback, useEffect } from 'react';
import { Trash2, Upload, ChevronDown, ChevronRight, FileText, Library, FolderOpen } from 'lucide-react';
import { SchemaTemplate } from '../../types/schema';

interface SchemaSelectionCardProps {
  schemas: SchemaTemplate[];
  selectedSchemaId?: string | null;
  onSchemaSelect: (schemaId: string, acquisitionId?: string) => void;
  onSchemaDelete: (schemaId: string, event: React.MouseEvent) => void;
  onSchemaUpload?: (file: File) => void;
  getSchemaContent?: (schemaId: string) => Promise<string | null>;
  title?: string;
  emptyMessage?: string;
}

const SchemaSelectionCard: React.FC<SchemaSelectionCardProps> = ({
  schemas,
  selectedSchemaId,
  onSchemaSelect,
  onSchemaDelete,
  onSchemaUpload,
  getSchemaContent,
  title = "Select Validation Schema",
  emptyMessage = "No templates available. Upload a template to get started."
}) => {
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set());
  const [dragActive, setDragActive] = useState(false);
  const [schemaAcquisitions, setSchemaAcquisitions] = useState<Record<string, any[]>>({});
  const [activeTab, setActiveTab] = useState<'library' | 'uploaded'>('library');
  
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.json')) {
        onSchemaUpload?.(file);
      }
    }
  }, [onSchemaUpload]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onSchemaUpload?.(e.target.files[0]);
      // Switch to uploaded tab after upload
      setActiveTab('uploaded');
    }
  };


  // Function to get acquisitions from a schema
  const getSchemaAcquisitions = async (schemaId: string) => {
    // Check if we already have the acquisitions cached
    if (schemaAcquisitions[schemaId]) {
      return schemaAcquisitions[schemaId];
    }

    if (!getSchemaContent) {
      // Fallback to single acquisition if no content getter provided
      return [
        { id: 'acq_001', protocolName: schemas.find(s => s.id === schemaId)?.name || 'Unknown', seriesDescription: 'Default series' }
      ];
    }

    try {
      const content = await getSchemaContent(schemaId);
      if (!content) {
        return [{ id: 'acq_001', protocolName: 'Unknown', seriesDescription: 'Default series' }];
      }

      const schemaData = JSON.parse(content);
      
      // Parse dicompare format: acquisitions as dictionary
      const acquisitionsData = Object.entries(schemaData.acquisitions).map(([name, data]: [string, any]) => ({
        protocolName: name,
        seriesDescription: `${(data.fields || []).length} fields, ${(data.series || []).length} series`,
        ...data
      }));

      console.log(`Schema ${schemaId} has ${acquisitionsData.length} acquisitions:`, acquisitionsData);

      const parsedAcquisitions = acquisitionsData.map((acq: any, index: number) => ({
        id: index.toString(),
        protocolName: acq.protocolName,
        seriesDescription: acq.seriesDescription
      }));

      console.log(`Parsed acquisitions for schema ${schemaId}:`, parsedAcquisitions);

      // Cache the result
      setSchemaAcquisitions(prev => ({
        ...prev,
        [schemaId]: parsedAcquisitions
      }));

      return parsedAcquisitions;
    } catch (error) {
      console.error('Failed to parse schema acquisitions:', error);
      return [{ id: '0', protocolName: 'Parse Error', seriesDescription: 'Could not parse schema' }];
    }
  };

  // Synchronous version for immediate use (uses cached data)
  const getSchemaAcquisitionsSync = (schemaId: string) => {
    return schemaAcquisitions[schemaId] || [
      { id: '0', protocolName: schemas.find(s => s.id === schemaId)?.name || 'Unknown', seriesDescription: 'Loading...' }
    ];
  };

  // Load acquisitions when schema is expanded
  const toggleSchemaExpansion = async (schemaId: string) => {
    const currentlyExpanded = expandedSchemas.has(schemaId);
    
    if (!currentlyExpanded) {
      // Load acquisitions before expanding
      console.log(`Loading acquisitions for schema ${schemaId}`);
      await getSchemaAcquisitions(schemaId);
    }
    
    setExpandedSchemas(prev => {
      const newSet = new Set(prev);
      if (newSet.has(schemaId)) {
        newSet.delete(schemaId);
      } else {
        newSet.add(schemaId);
      }
      return newSet;
    });
  };

  // Pre-load acquisitions for uploaded schemas when they become available
  useEffect(() => {
    schemas.forEach(async (schema) => {
      if (schema.category === 'Uploaded Schema' && !schemaAcquisitions[schema.id] && getSchemaContent) {
        console.log(`Pre-loading acquisitions for uploaded schema: ${schema.id}`);
        await getSchemaAcquisitions(schema.id);
      }
    });
  }, [schemas, getSchemaContent]);

  // Filter schemas by category
  const librarySchemas = schemas.filter(s => s.category === 'Library');
  const uploadedSchemas = schemas.filter(s => s.category === 'Uploaded Schema');
  const displayedSchemas = activeTab === 'library' ? librarySchemas : uploadedSchemas;

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 h-fit">
      <div className="mb-4">
        <h4 className="font-medium text-gray-900 text-base mb-2">
          {title}
        </h4>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-4">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('library')}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'library'
                ? 'border-medical-600 text-medical-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center">
              <Library className="h-4 w-4 mr-2" />
              Library
              {librarySchemas.length > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                  {librarySchemas.length}
                </span>
              )}
            </div>
          </button>
          <button
            onClick={() => setActiveTab('uploaded')}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'uploaded'
                ? 'border-medical-600 text-medical-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center">
              <FolderOpen className="h-4 w-4 mr-2" />
              Uploaded
              {uploadedSchemas.length > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                  {uploadedSchemas.length}
                </span>
              )}
            </div>
          </button>
        </nav>
      </div>

      {/* Upload Area - only show on uploaded tab */}
      {onSchemaUpload && activeTab === 'uploaded' && (
        <div className="mb-4">
          <div
            className={`relative border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
              dragActive
                ? 'border-medical-400 bg-medical-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept=".json"
              onChange={handleFileInput}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <Upload className="h-6 w-6 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600 mb-1">
              Drop schema file here or click to browse
            </p>
            <p className="text-xs text-gray-500">
              Supports .json files
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {displayedSchemas.map((template) => {
          const isExpanded = expandedSchemas.has(template.id);
          const acquisitions = getSchemaAcquisitionsSync(template.id);
          const hasMultipleAcquisitions = acquisitions.length > 1;
          
          console.log(`Schema ${template.id}:`, {
            acquisitions,
            hasMultipleAcquisitions,
            isExpanded
          });
          
          return (
            <div key={template.id} className="relative group">
              <div className={`border rounded-lg transition-all border-gray-200`}>
                <div className="flex items-center">
                  {/* Expand/Collapse button for schemas with multiple acquisitions */}
                  {hasMultipleAcquisitions && (
                    <button
                      onClick={() => toggleSchemaExpansion(template.id)}
                      className="p-2 text-gray-400 hover:text-gray-600"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  )}
                  
                  {/* Schema info */}
                  <button
                    onClick={() => {
                      if (hasMultipleAcquisitions) {
                        toggleSchemaExpansion(template.id);
                      } else {
                        onSchemaSelect(template.id, acquisitions[0]?.id);
                      }
                    }}
                    className={`flex-1 p-3 text-left transition-all hover:bg-gray-50 ${
                      !hasMultipleAcquisitions ? '' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center">
                          <FileText className="h-4 w-4 text-gray-500 mr-2" />
                          <h5 className="font-medium text-gray-900 text-sm">{template.name}</h5>
                          {hasMultipleAcquisitions && (
                            <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                              {acquisitions.length} acquisitions
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 mb-1 line-clamp-2 ml-6">
                          {template.description || 'No description available'}
                        </p>
                        <div className="flex items-center space-x-2 text-xs text-gray-500 ml-6">
                          <span className={`px-1.5 py-0.5 rounded-full ${
                            template.format === 'json'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {template.format.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                  
                  {/* Delete button */}
                  <button
                    onClick={(e) => onSchemaDelete(template.id, e)}
                    className="p-2 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete schema"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                
                {/* Expanded acquisitions list */}
                {isExpanded && hasMultipleAcquisitions && (
                  <div className="border-t border-gray-200 bg-gray-50">
                    {acquisitions.map((acquisition) => (
                      <button
                        key={acquisition.id}
                        onClick={() => {
                          console.log(`Clicked acquisition: templateId=${template.id}, acquisitionId=${acquisition.id}`);
                          onSchemaSelect(template.id, acquisition.id);
                        }}
                        className="w-full p-3 text-left hover:bg-gray-100 transition-colors border-b border-gray-200 last:border-b-0"
                      >
                        <div className="ml-6">
                          <h6 className="font-medium text-gray-800 text-sm">{acquisition.protocolName}</h6>
                          <p className="text-xs text-gray-600">{acquisition.seriesDescription}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {displayedSchemas.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-4">
          {activeTab === 'library'
            ? 'No library schemas available.'
            : 'No uploaded schemas. Upload a schema to get started.'}
        </p>
      )}
    </div>
  );
};

export default SchemaSelectionCard;