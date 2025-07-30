import React, { useState, useEffect } from 'react';
import { useSchemaContext } from '../../contexts/SchemaContext';
import { SchemaUploadModal } from './SchemaUploadModal';
import { SchemaMetadata } from '../../types/schema';

export const SchemaManager: React.FC = () => {
  const { 
    schemas, 
    selectedSchema, 
    isLoading, 
    error, 
    selectSchema, 
    deleteSchema, 
    refreshSchemas,
    clearCache,
    getCacheSize 
  } = useSchemaContext();
  
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [cacheSize, setCacheSize] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const updateCacheSize = async () => {
      const size = await getCacheSize();
      setCacheSize(size);
    };
    updateCacheSize();
  }, [schemas, getCacheSize]);

  const filteredSchemas = schemas.filter(schema =>
    schema.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    schema.filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
    schema.authors.some(author => author.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleDelete = async (id: string) => {
    await deleteSchema(id);
    setShowDeleteConfirm(null);
  };

  const handleExportSchema = async (schema: SchemaMetadata) => {
    try {
      const { getSchemaContent } = useSchemaContext();
      const content = await getSchemaContent(schema.id);
      if (!content) return;

      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = schema.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export schema:', err);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading schemas...</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Schema Manager</h2>
            <p className="text-gray-600 mt-1">
              Manage your uploaded validation schemas ({schemas.length} total, {formatFileSize(cacheSize)})
            </p>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowUploadModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Upload Schema
            </button>
            <button
              onClick={refreshSchemas}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="flex space-x-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search schemas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {schemas.length > 0 && (
            <button
              onClick={() => clearCache()}
              className="px-4 py-2 border border-red-300 text-red-700 rounded-md hover:bg-red-50 transition-colors"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      <div className="divide-y divide-gray-200">
        {filteredSchemas.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {searchTerm ? 'No schemas match your search.' : 'No schemas uploaded yet.'}
            {!searchTerm && (
              <button
                onClick={() => setShowUploadModal(true)}
                className="block mx-auto mt-2 text-blue-600 hover:text-blue-800"
              >
                Upload your first schema
              </button>
            )}
          </div>
        ) : (
          filteredSchemas.map((schema) => (
            <div key={schema.id} className="p-4 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <input
                      type="radio"
                      name="selectedSchema"
                      checked={selectedSchema?.id === schema.id}
                      onChange={() => selectSchema(schema)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">{schema.title}</h3>
                      <p className="text-sm text-gray-600">{schema.filename}</p>
                    </div>
                    <div className="flex space-x-2">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        schema.isValid 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {schema.isValid ? 'Valid' : 'Invalid'}
                      </span>
                      <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded-full">
                        {schema.format.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  
                  <div className="mt-2 text-sm text-gray-600">
                    {schema.description && (
                      <p className="mb-1">{schema.description}</p>
                    )}
                    <div className="flex items-center space-x-4">
                      <span>Version: {schema.version}</span>
                      <span>Size: {formatFileSize(schema.fileSize)}</span>
                      <span>Uploaded: {formatDate(schema.uploadDate)}</span>
                      {schema.acquisitionCount && (
                        <span>Acquisitions: {schema.acquisitionCount}</span>
                      )}
                    </div>
                    {schema.authors.length > 0 && (
                      <p className="mt-1">Authors: {schema.authors.join(', ')}</p>
                    )}
                  </div>
                </div>

                <div className="flex space-x-2 ml-4">
                  <button
                    onClick={() => handleExportSchema(schema)}
                    className="px-3 py-1 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                  >
                    Export
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(schema.id)}
                    className="px-3 py-1 text-sm border border-red-300 text-red-700 rounded hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <SchemaUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploadComplete={(schemaId) => {
          const uploadedSchema = schemas.find(s => s.id === schemaId);
          if (uploadedSchema) {
            selectSchema(uploadedSchema);
          }
        }}
      />

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <h3 className="text-lg font-medium mb-4">Confirm Delete</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this schema? This action cannot be undone.
            </p>
            <div className="flex space-x-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};