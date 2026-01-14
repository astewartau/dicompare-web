import React, { useState, useEffect } from 'react';
import { X, Download, Save, Loader2, CheckCircle, User, Plus, Tag } from 'lucide-react';
import { useWorkspace, SchemaMetadata } from '../../contexts/WorkspaceContext';
import { useSchemaContext } from '../../contexts/SchemaContext';
import { dicompareAPI } from '../../services/DicompareAPI';

interface SaveSchemaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SaveSchemaModal: React.FC<SaveSchemaModalProps> = ({ isOpen, onClose }) => {
  const { items, schemaMetadata, setSchemaMetadata, getSchemaExport } = useWorkspace();
  const { uploadSchema } = useSchemaContext();

  const [metadata, setMetadata] = useState<SchemaMetadata>({
    name: '',
    description: '',
    authors: [],
    version: '1.0'
  });
  const [newAuthor, setNewAuthor] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [generatedSchema, setGeneratedSchema] = useState<any>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Load existing metadata on open
  useEffect(() => {
    if (isOpen) {
      setMetadata(schemaMetadata);
    }
  }, [isOpen, schemaMetadata]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSaveSuccess(false);
      setGeneratedSchema(null);
      setGenerateError(null);
    }
  }, [isOpen]);

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

  const generateSchema = async () => {
    if (!validateForm()) return;

    setIsGenerating(true);
    setGenerateError(null);

    try {
      const { acquisitions } = getSchemaExport();

      const schema = await dicompareAPI.generateSchemaJS(acquisitions, {
        name: metadata.name,
        description: metadata.description || '',
        version: metadata.version || '1.0',
        authors: metadata.authors || []
      });

      setGeneratedSchema(schema);
      setSchemaMetadata(metadata);
    } catch (err) {
      console.error('Failed to generate schema:', err);
      setGenerateError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadJSON = () => {
    if (!generatedSchema) return;

    const { statistics, ...schemaContent } = generatedSchema;
    const jsonContent = JSON.stringify(schemaContent, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metadata.name.replace(/\s+/g, '_')}_v${metadata.version}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSaveToLibrary = async () => {
    if (!generatedSchema) return;

    setIsSaving(true);

    try {
      const { statistics, ...schemaContent } = generatedSchema;
      const jsonContent = JSON.stringify(schemaContent, null, 2);

      const blob = new Blob([jsonContent], { type: 'application/json' });
      const fileName = `${metadata.name.replace(/\s+/g, '_')}_v${metadata.version}.json`;
      const file = new File([blob], fileName, { type: 'application/json' });

      await uploadSchema(file, {
        title: metadata.name,
        description: metadata.description,
        authors: metadata.authors,
        version: metadata.version,
      });

      setSaveSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Failed to save schema:', err);
      setGenerateError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-primary rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-content-primary">Save Schema</h2>
            <p className="text-sm text-content-secondary mt-1">
              {generatedSchema ? 'Download or save to your library' : 'Enter metadata and generate your schema'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-content-muted hover:text-content-secondary"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {saveSuccess ? (
            <div className="text-center py-12">
              <CheckCircle className="h-16 w-16 text-status-success mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-content-primary mb-2">Schema Saved!</h3>
              <p className="text-content-secondary">Your schema has been saved to your library.</p>
            </div>
          ) : generatedSchema ? (
            <div className="space-y-6">
              {/* Schema Summary */}
              <div className="bg-surface-secondary rounded-lg p-4">
                <h3 className="font-medium text-content-primary mb-3">Schema Summary</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-content-tertiary">Name:</span>
                    <span className="ml-2 text-content-primary">{metadata.name}</span>
                  </div>
                  <div>
                    <span className="text-content-tertiary">Version:</span>
                    <span className="ml-2 text-content-primary">{metadata.version}</span>
                  </div>
                  <div>
                    <span className="text-content-tertiary">Acquisitions:</span>
                    <span className="ml-2 text-content-primary">{items.length}</span>
                  </div>
                  <div>
                    <span className="text-content-tertiary">Authors:</span>
                    <span className="ml-2 text-content-primary">{metadata.authors.join(', ')}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={handleSaveToLibrary}
                  disabled={isSaving}
                  className="flex items-center justify-center px-6 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-5 w-5 mr-2" />
                      Save to Library
                    </>
                  )}
                </button>

                <button
                  onClick={handleDownloadJSON}
                  className="flex items-center justify-center px-6 py-4 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium"
                >
                  <Download className="h-5 w-5 mr-2" />
                  Download JSON
                </button>
              </div>

              {/* Back to Edit */}
              <button
                onClick={() => setGeneratedSchema(null)}
                className="w-full text-sm text-content-secondary hover:text-content-primary"
              >
                Back to edit metadata
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {generateError && (
                <div className="p-3 bg-status-error-bg border border-status-error/30 text-status-error rounded-lg">
                  {generateError}
                </div>
              )}

              {/* Hint about Schema Info panel */}
              <div className="p-3 bg-surface-secondary border border-border rounded-lg text-sm text-content-secondary">
                <span className="font-medium text-content-primary">Tip:</span> You can also edit these details anytime by clicking the header in the sidebar.
              </div>

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
                  placeholder="e.g., Brain MRI Protocol"
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.name}</p>
                )}
              </div>

              {/* Description */}
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-content-secondary mb-2">
                  Description
                </label>
                <textarea
                  id="description"
                  rows={3}
                  value={metadata.description}
                  onChange={(e) => setMetadata(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-3 border border-border-secondary rounded-lg bg-surface-primary text-content-primary focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  placeholder="Describe the purpose and scope of this schema..."
                />
              </div>

              {/* Authors */}
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-2">
                  Authors *
                </label>

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
                    className="px-4 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>

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
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!saveSuccess && !generatedSchema && (
          <div className="px-6 py-4 border-t border-border flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-border-secondary text-content-secondary rounded-lg hover:bg-surface-secondary"
            >
              Cancel
            </button>
            <button
              onClick={generateSchema}
              disabled={isGenerating || items.length === 0}
              className="px-4 py-2 bg-brand-600 text-content-inverted rounded-lg hover:bg-brand-700 disabled:bg-surface-tertiary disabled:text-content-muted disabled:cursor-not-allowed flex items-center"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate Schema'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SaveSchemaModal;
