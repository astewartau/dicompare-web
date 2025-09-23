import React, { useState, useEffect } from 'react';
import { Upload, Library, FolderOpen, Trash2, FileText, List, ChevronDown, ChevronUp } from 'lucide-react';
import { UnifiedSchema } from '../../hooks/useSchemaService';
import AcquisitionTable from './AcquisitionTable';
import { convertSchemaToAcquisitions } from '../../utils/schemaToAcquisition';
import { Acquisition } from '../../types';

interface SchemaSelectorProps {
  librarySchemas: UnifiedSchema[];
  uploadedSchemas: UnifiedSchema[];
  selectedSchemaId?: string | null;
  title?: string;
  onSchemaSelect: (schemaId: string, acquisitionId?: number) => void;
  onSchemaDelete?: (schemaId: string, event: React.MouseEvent) => void;
  onSchemaUpload?: (file: File) => void;
  getSchemaContent: (schemaId: string) => Promise<string | null>;
}

const SchemaSelector: React.FC<SchemaSelectorProps> = ({
  librarySchemas,
  uploadedSchemas,
  selectedSchemaId,
  title = "Select Validation Schema",
  onSchemaSelect,
  onSchemaDelete,
  onSchemaUpload,
  getSchemaContent
}) => {
  const [activeTab, setActiveTab] = useState<'library' | 'uploaded'>('library');
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set());
  const [dragActive, setDragActive] = useState(false);
  const [schemaAcquisitions, setSchemaAcquisitions] = useState<Record<string, Acquisition[]>>({});
  const [loadingSchemas, setLoadingSchemas] = useState<Set<string>>(new Set());

  const displayedSchemas = activeTab === 'library' ? librarySchemas : uploadedSchemas;

  const toggleSchemaExpansion = async (schemaId: string) => {
    setExpandedSchemas(prev => {
      const newSet = new Set(prev);
      if (newSet.has(schemaId)) {
        newSet.delete(schemaId);
      } else {
        newSet.add(schemaId);
        // Load acquisitions when expanding
        loadSchemaAcquisitions(schemaId);
      }
      return newSet;
    });
  };

  const loadSchemaAcquisitions = async (schemaId: string) => {
    if (schemaAcquisitions[schemaId] || loadingSchemas.has(schemaId)) return;

    setLoadingSchemas(prev => new Set(prev).add(schemaId));

    try {
      const schema = [...librarySchemas, ...uploadedSchemas].find(s => s.id === schemaId);
      if (schema) {
        const acquisitions = await convertSchemaToAcquisitions(schema, getSchemaContent);
        setSchemaAcquisitions(prev => ({ ...prev, [schemaId]: acquisitions }));
      }
    } catch (error) {
      console.error(`Failed to load acquisitions for schema ${schemaId}:`, error);
    } finally {
      setLoadingSchemas(prev => {
        const newSet = new Set(prev);
        newSet.delete(schemaId);
        return newSet;
      });
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.json')) {
        onSchemaUpload?.(file);
      }
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onSchemaUpload?.(e.target.files[0]);
      setActiveTab('uploaded');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 h-fit">
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
              Custom
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

      {/* Schema List */}
      <div className="space-y-4 max-h-96 overflow-y-auto">
        {displayedSchemas.map((schema) => {
          const isExpanded = expandedSchemas.has(schema.id);
          const acquisitions = schemaAcquisitions[schema.id] || [];
          const isLoading = loadingSchemas.has(schema.id);

          return (
            <div key={schema.id} className="border border-gray-200 rounded-lg bg-white shadow-sm">
              {/* Schema Header */}
              <div
                className="px-3 py-2 bg-gray-50 border-b border-gray-200 rounded-t-lg cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => toggleSchemaExpansion(schema.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">
                      {schema.name}
                    </h3>
                    <p className="text-xs text-gray-600 truncate">
                      {schema.description || 'No description available'}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {onSchemaDelete && activeTab === 'uploaded' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSchemaDelete(schema.id, e);
                        }}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete schema"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                    <div className="p-1 text-gray-600">
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </div>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  v{schema.version || '1.0.0'} • {schema.authors?.join(', ') || 'Schema'}
                  {schema.isMultiAcquisition && (
                    <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                      {schema.acquisitions.length} acquisitions
                    </span>
                  )}
                </div>
              </div>

              {/* Expanded Acquisitions */}
              {isExpanded && (
                <div className="p-3">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-medical-600"></div>
                      <span className="ml-2 text-sm text-gray-600">Loading acquisitions...</span>
                    </div>
                  ) : acquisitions.length > 0 ? (
                    <div className="space-y-2">
                      {acquisitions.map((acquisition, index) => (
                        <button
                          key={acquisition.id}
                          onClick={() => onSchemaSelect(schema.id, index)}
                          className="w-full text-left border border-gray-200 rounded-lg p-3 hover:bg-medical-50 hover:border-medical-300 transition-all"
                        >
                          <div className="flex items-start space-x-3">
                            <FileText className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm text-gray-900">
                                {acquisition.protocolName}
                              </div>
                              {acquisition.seriesDescription && (
                                <div className="text-xs text-gray-600 mt-1">
                                  {acquisition.seriesDescription}
                                </div>
                              )}
                              <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                                {(acquisition.acquisitionFields.length + (acquisition.seriesFields?.length || 0)) > 0 && (
                                  <span className="flex items-center">
                                    <List className="h-3 w-3 mr-1" />
                                    {acquisition.acquisitionFields.length + (acquisition.seriesFields?.length || 0)} fields
                                  </span>
                                )}
                                {acquisition.series && acquisition.series.length > 0 && (
                                  <span>
                                    {acquisition.series.length} series
                                  </span>
                                )}
                                {acquisition.validationFunctions && acquisition.validationFunctions.length > 0 && (
                                  <span className="text-purple-600">
                                    {acquisition.validationFunctions.length} validation {acquisition.validationFunctions.length === 1 ? 'rule' : 'rules'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-sm text-gray-500">
                      No acquisitions found in this schema
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {displayedSchemas.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-4">
          {activeTab === 'library'
            ? 'No library schemas available.'
            : 'No custom schemas. Upload a schema to get started.'}
        </p>
      )}
    </div>
  );
};

export default SchemaSelector;