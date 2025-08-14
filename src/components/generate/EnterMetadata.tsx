import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Tag, X, Plus } from 'lucide-react';
import { useAcquisitions } from '../../contexts/AcquisitionContext';

interface TemplateMetadata {
  name: string;
  description: string;
  authors: string[];
  version: string;
}

const EnterMetadata: React.FC = () => {
  const navigate = useNavigate();
  const { templateMetadata, setTemplateMetadata } = useAcquisitions();
  
  const [metadata, setMetadata] = useState<TemplateMetadata>({
    name: '',
    description: '',
    authors: [],
    version: '1.0'
  });
  const [newAuthor, setNewAuthor] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load metadata from context on mount
  useEffect(() => {
    if (templateMetadata) {
      setMetadata(templateMetadata);
    }
  }, [templateMetadata]);

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
      newErrors.name = 'Template name is required';
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
      setTemplateMetadata(metadata);
      navigate('/generate-template/download-schema');
    }
  };

  const handleBack = () => {
    navigate('/generate-template/build-schema');
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Enter Metadata - Step 2</h2>
        <p className="text-gray-600">
          Provide essential information about your template including name, description, and authors.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-md p-8">
        <div className="space-y-6">
          {/* Template Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Template Name *
            </label>
            <input
              type="text"
              id="name"
              value={metadata.name}
              onChange={(e) => setMetadata(prev => ({ ...prev, name: e.target.value }))}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-medical-500 focus:border-medical-500 ${
                errors.name ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="e.g., Brain MRI Basic Protocol"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600">{errors.name}</p>
            )}
          </div>

          {/* Template Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              id="description"
              rows={4}
              value={metadata.description}
              onChange={(e) => setMetadata(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-medical-500 focus:border-medical-500"
              placeholder="Describe the purpose and scope of this template..."
            />
            <p className="mt-1 text-sm text-gray-500">
              Optional: Provide additional context about when and how to use this template
            </p>
          </div>

          {/* Authors */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Authors *
            </label>
            
            {/* Author Input */}
            <div className="flex space-x-2 mb-3">
              <div className="flex-1 relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  value={newAuthor}
                  onChange={(e) => setNewAuthor(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-medical-500 focus:border-medical-500"
                  placeholder="Enter author name"
                />
              </div>
              <button
                onClick={addAuthor}
                disabled={!newAuthor.trim()}
                className="px-4 py-3 bg-medical-600 text-white rounded-lg hover:bg-medical-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
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
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-medical-100 text-medical-800"
                  >
                    <Tag className="h-3 w-3 mr-1" />
                    {author}
                    <button
                      onClick={() => removeAuthor(author)}
                      className="ml-2 text-medical-600 hover:text-medical-800"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {errors.authors && (
              <p className="mt-1 text-sm text-red-600">{errors.authors}</p>
            )}
            
            <p className="text-sm text-gray-500">
              Add the names of researchers or institutions who created this template
            </p>
          </div>

          {/* Version */}
          <div>
            <label htmlFor="version" className="block text-sm font-medium text-gray-700 mb-2">
              Version *
            </label>
            <input
              type="text"
              id="version"
              value={metadata.version}
              onChange={(e) => setMetadata(prev => ({ ...prev, version: e.target.value }))}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-medical-500 focus:border-medical-500 ${
                errors.version ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="1.0"
            />
            {errors.version && (
              <p className="mt-1 text-sm text-red-600">{errors.version}</p>
            )}
            <p className="mt-1 text-sm text-gray-500">
              Use semantic versioning (e.g., 1.0, 1.1, 2.0)
            </p>
          </div>
        </div>

        {/* Template Preview */}
        <div className="mt-8 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Template Preview</h3>
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium text-gray-700">Name:</span> 
              <span className="ml-2 text-gray-900">{metadata.name || 'Untitled Template'}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Version:</span> 
              <span className="ml-2 text-gray-900">{metadata.version}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Authors:</span> 
              <span className="ml-2 text-gray-900">
                {metadata.authors.length > 0 ? metadata.authors.join(', ') : 'No authors specified'}
              </span>
            </div>
            {metadata.description && (
              <div>
                <span className="font-medium text-gray-700">Description:</span> 
                <div className="ml-2 text-gray-900 mt-1">{metadata.description}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="mt-8 flex justify-between">
        <button
          onClick={handleBack}
          className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
        >
          Back to Schema
        </button>
        <button
          onClick={handleContinue}
          className="px-6 py-3 bg-medical-600 text-white rounded-lg hover:bg-medical-700"
        >
          Continue to Download
        </button>
      </div>
    </div>
  );
};

export default EnterMetadata;