import React, { useState, useEffect } from 'react';
import { Upload, Library, FolderOpen } from 'lucide-react';
import { UnifiedSchema } from '../../hooks/useSchemaService';
import SchemaCard from './SchemaCard';

interface SchemaSelectorProps {
  librarySchemas: UnifiedSchema[];
  uploadedSchemas: UnifiedSchema[];
  selectedSchemaId?: string | null;
  title?: string;
  onSchemaSelect: (schemaId: string, acquisitionId?: string) => void;
  onSchemaDelete?: (schemaId: string, event: React.MouseEvent) => void;
  onSchemaUpload?: (file: File) => void;
}

const SchemaSelector: React.FC<SchemaSelectorProps> = ({
  librarySchemas,
  uploadedSchemas,
  selectedSchemaId,
  title = "Select Validation Schema",
  onSchemaSelect,
  onSchemaDelete,
  onSchemaUpload
}) => {
  const [activeTab, setActiveTab] = useState<'library' | 'uploaded'>('library');
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set());
  const [dragActive, setDragActive] = useState(false);

  const displayedSchemas = activeTab === 'library' ? librarySchemas : uploadedSchemas;

  const toggleSchemaExpansion = (schemaId: string) => {
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
      <div className="mb-4">
        <h4 className="font-medium text-gray-900 text-base mb-2">{title}</h4>
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

      {/* Schema List */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {displayedSchemas.map((schema) => (
          <SchemaCard
            key={schema.id}
            schema={schema}
            isSelected={selectedSchemaId === schema.id}
            isCollapsed={!expandedSchemas.has(schema.id)}
            showDeleteButton={true}
            onSelect={onSchemaSelect}
            onToggleCollapse={() => toggleSchemaExpansion(schema.id)}
            onDelete={onSchemaDelete}
          />
        ))}
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

export default SchemaSelector;