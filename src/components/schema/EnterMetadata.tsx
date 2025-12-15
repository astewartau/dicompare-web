import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Tag, X, Plus, Edit } from 'lucide-react';
import { useAcquisitions } from '../../contexts/AcquisitionContext';
import { useSchemaContext } from '../../contexts/SchemaContext';

interface SchemaMetadata {
  name: string;
  description: string;
  authors: string[];
  version: string;
}

const EnterMetadata: React.FC = () => {
  const navigate = useNavigate();
  const { schemaMetadata, setSchemaMetadata } = useAcquisitions();
  const { originSchema } = useSchemaContext();
  
  const [metadata, setMetadata] = useState<SchemaMetadata>({
    name: '',
    description: '',
    authors: [],
    version: '1.0'
  });
  const [newAuthor, setNewAuthor] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load metadata from context on mount, prioritizing origin schema if available
  useEffect(() => {
    if (originSchema) {
      // Pre-fill from origin schema
      setMetadata({
        name: originSchema.metadata.title || originSchema.metadata.name || originSchema.name,
        description: originSchema.metadata.description || '',
        authors: originSchema.metadata.authors || [],
        version: originSchema.metadata.version || '1.0'
      });
    } else if (schemaMetadata) {
      // Fall back to existing schema metadata
      setMetadata(schemaMetadata);
    }
  }, [schemaMetadata, originSchema]);

  const addAuthor = () => {
    if (newAuthor.trim() && !metadata.authors.includes(newAuthor.trim())) {
      setMetadata(prev => ({
        ...prev,
        authors: [...prev.authors, newAuthor.trim()]
      }));
      setNewAuthor('');
      if (errors.authors) {
        setErrors(prev => ({ ...prev, authors: '' }));
      }
    }
  };

  const removeAuthor = (authorToRemove: string) => {
    setMetadata(prev => ({
      ...prev,
      authors: prev.authors.filter(author => author !== authorToRemove)
    }));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addAuthor();
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!metadata.name.trim()) {
      newErrors.name = 'Schema name is required';
    }

    if (metadata.authors.length === 0) {
      newErrors.authors = 'At least one author is required';
    }

    if (!metadata.version.trim()) {
      newErrors.version = 'Version is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = () => {
    if (validateForm()) {
      // Save metadata to context before navigating
      setSchemaMetadata(metadata);
      navigate('/schema-builder/save-schema');
    }
  };

  const handleBack = () => {
    navigate('/schema-builder/build-schema');
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-content-primary mb-4">
          Enter Metadata - Step 3
        </h2>
        <p className="text-content-secondary">
          {originSchema
            ? 'Review and modify the metadata from your template schema. You can save as a new schema or update the original.'
            : 'Provide essential information about your schema including name, description, and authors.'
          }
        </p>
        {originSchema && (
          <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <div className="flex items-center">
              <Edit className="h-4 w-4 text-blue-600 dark:text-blue-400 mr-2" />
              <span className="text-sm text-blue-700 dark:text-blue-300">
                <strong>Template source:</strong> {originSchema.type === 'library' ? 'Library' : 'Custom'} schema "{originSchema.name}"
              </span>
            </div>
            {originSchema.type === 'library' && (
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                Library schemas are read-only. Your changes will be saved as a new schema.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="bg-surface-primary rounded-lg shadow-md p-8">
        <div className="space-y-6">
          {/* Schema Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-content-secondary mb-2">
              Schema Name *
            </label>
            <input
              type="text"
              id="name"
              value={metadata.name}
              onChange={(e) => setMetadata(prev => ({ ...prev, name: e.target.value }))}
              className={`w-full px-4 py-3 border rounded-lg bg-surface-primary text-content-primary focus:ring-2 focus:ring-brand-500 focus:border-brand-500 ${
                errors.name ? 'border-red-500/50' : 'border-border-secondary'
              }`}
              placeholder="e.g., Brain MRI Basic Protocol"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.name}</p>
            )}
          </div>

          {/* Schema Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-content-secondary mb-2">
              Description
            </label>
            <textarea
              id="description"
              rows={4}
              value={metadata.description}
              onChange={(e) => setMetadata(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-4 py-3 border border-border-secondary rounded-lg bg-surface-primary text-content-primary focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              placeholder="Describe the purpose and scope of this schema..."
            />
            <p className="mt-1 text-sm text-content-tertiary">
              Optional: Provide additional context about when and how to use this schema
            </p>
          </div>

          {/* Authors */}
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-2">
              Authors *
            </label>

            {/* Author Input */}
            <div className="flex space-x-2 mb-3">
              <div className="flex-1 relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-content-tertiary" />
                <input
                  type="text"
                  value={newAuthor}
                  onChange={(e) => setNewAuthor(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="w-full pl-10 pr-4 py-3 border border-border-secondary rounded-lg bg-surface-primary text-content-primary focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  placeholder="Enter author name"
                />
              </div>
              <button
                onClick={addAuthor}
                disabled={!newAuthor.trim()}
                className="px-4 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>

            {/* Authors List */}
            {metadata.authors.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {metadata.authors.map((author, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-brand-500/10 text-brand-700 dark:text-brand-300"
                  >
                    <Tag className="h-3 w-3 mr-1" />
                    {author}
                    <button
                      onClick={() => removeAuthor(author)}
                      className="ml-2 text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {errors.authors && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.authors}</p>
            )}

            <p className="text-sm text-content-tertiary">
              Add the names of researchers or institutions who created this schema
            </p>
          </div>

          {/* Version */}
          <div>
            <label htmlFor="version" className="block text-sm font-medium text-content-secondary mb-2">
              Version *
            </label>
            <input
              type="text"
              id="version"
              value={metadata.version}
              onChange={(e) => setMetadata(prev => ({ ...prev, version: e.target.value }))}
              className={`w-full px-4 py-3 border rounded-lg bg-surface-primary text-content-primary focus:ring-2 focus:ring-brand-500 focus:border-brand-500 ${
                errors.version ? 'border-red-500/50' : 'border-border-secondary'
              }`}
              placeholder="1.0"
            />
            {errors.version && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.version}</p>
            )}
            <p className="mt-1 text-sm text-content-tertiary">
              Use semantic versioning (e.g., 1.0, 1.1, 2.0)
            </p>
          </div>
        </div>

        {/* Schema Preview */}
        <div className="mt-8 p-4 bg-surface-secondary rounded-lg">
          <h3 className="text-lg font-medium text-content-primary mb-4">Schema Preview</h3>
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium text-content-secondary">Name:</span>
              <span className="ml-2 text-content-primary">{metadata.name || 'Untitled Schema'}</span>
            </div>
            <div>
              <span className="font-medium text-content-secondary">Version:</span>
              <span className="ml-2 text-content-primary">{metadata.version}</span>
            </div>
            <div>
              <span className="font-medium text-content-secondary">Authors:</span>
              <span className="ml-2 text-content-primary">
                {metadata.authors.length > 0 ? metadata.authors.join(', ') : 'No authors specified'}
              </span>
            </div>
            {metadata.description && (
              <div>
                <span className="font-medium text-content-secondary">Description:</span>
                <div className="ml-2 text-content-primary mt-1">{metadata.description}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="mt-8 flex justify-between">
        <button
          onClick={handleBack}
          className="px-6 py-3 border border-border-secondary text-content-secondary rounded-lg hover:bg-surface-secondary"
        >
          Back to Schema
        </button>
        <button
          onClick={handleContinue}
          className="px-6 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700"
        >
          Continue to Download
        </button>
      </div>
    </div>
  );
};

export default EnterMetadata;