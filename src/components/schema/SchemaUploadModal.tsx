import React, { useState, useCallback, useEffect } from 'react';
import { useSchemaContext } from '../../contexts/SchemaContext';

interface SchemaUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete?: (schemaId: string) => void;
  preloadedFile?: File | null;
}

export const SchemaUploadModal: React.FC<SchemaUploadModalProps> = ({ 
  isOpen, 
  onClose, 
  onUploadComplete,
  preloadedFile 
}) => {
  const { uploadSchema } = useSchemaContext();
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    authors: '',
  });

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
      handleFileUpload(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith('.json') && !file.name.endsWith('.py')) {
      setError('Only .json and .py files are supported');
      return;
    }

    // Pre-fill form from schema content if it's a JSON file
    if (file.name.endsWith('.json')) {
      await prefillFromSchema(file);
    }

    setUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 100);

      const additionalMetadata = {
        title: formData.title || undefined,
        description: formData.description || undefined,
        authors: formData.authors ? formData.authors.split(',').map(a => a.trim()) : undefined,
      };

      const schema = await uploadSchema(file, additionalMetadata);
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      setTimeout(() => {
        onUploadComplete?.(schema.id);
        onClose();
        resetForm();
      }, 500);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const resetForm = () => {
    setFormData({ title: '', description: '', authors: '' });
    setError(null);
    setUploadProgress(0);
  };

  // Pre-fill form when a file is provided (but don't auto-upload)
  useEffect(() => {
    if (preloadedFile && isOpen) {
      prefillFromSchema(preloadedFile);
    }
  }, [preloadedFile, isOpen]);

  // Pre-fill form data from schema content
  const prefillFromSchema = async (file: File) => {
    try {
      const content = await file.text();
      const schemaData = JSON.parse(content);
      
      // Extract metadata from schema if available
      const template = schemaData.template || schemaData;
      const metadata = {
        title: template.name || file.name.replace('.json', ''),
        description: template.description || '',
        authors: template.authors ? template.authors.join(', ') : ''
      };
      
      setFormData(metadata);
    } catch (error) {
      console.error('Failed to extract schema metadata:', error);
      // Fall back to filename
      setFormData(prev => ({
        ...prev,
        title: file.name.replace('.json', '')
      }));
    }
  };

  const handleClose = () => {
    if (!uploading) {
      resetForm();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Upload Schema</h2>
          <button
            onClick={handleClose}
            disabled={uploading}
            className="text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title (optional)
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Schema title"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={uploading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description (optional)
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Schema description"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={uploading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Authors (optional)
            </label>
            <input
              type="text"
              value={formData.authors}
              onChange={(e) => setFormData(prev => ({ ...prev, authors: e.target.value }))}
              placeholder="Comma-separated list of authors"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={uploading}
            />
          </div>

          <div
            className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              dragActive 
                ? 'border-blue-400 bg-blue-50' 
                : preloadedFile 
                  ? 'border-green-400 bg-green-50' 
                  : 'border-gray-300 hover:border-gray-400'
            } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept=".json,.py"
              onChange={handleFileInput}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={uploading}
            />
            
            {uploading ? (
              <div className="space-y-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-sm text-gray-600">Uploading...</p>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
              </div>
            ) : preloadedFile ? (
              <div className="space-y-2">
                <div className="text-4xl">✅</div>
                <p className="text-sm text-gray-900 font-medium">
                  {preloadedFile.name}
                </p>
                <p className="text-xs text-gray-600">
                  File ready for upload. Review the details above and click Upload to proceed.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-4xl">📄</div>
                <p className="text-sm text-gray-600">
                  Drop your schema file here or click to browse
                </p>
                <p className="text-xs text-gray-500">
                  Supports .json and .py files
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={handleClose}
            disabled={uploading}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          {(preloadedFile || formData.title) && (
            <button
              onClick={() => {
                if (preloadedFile) {
                  handleFileUpload(preloadedFile);
                }
              }}
              disabled={uploading || !preloadedFile}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? 'Uploading...' : 'Upload Schema'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};