import React, { useState, useEffect } from 'react';
import { Upload, Library, FolderOpen, Trash2, Download, FileText, List, ChevronDown, ChevronUp, X } from 'lucide-react';
import { UnifiedSchema } from '../../hooks/useSchemaService';
import { useSchemaContext } from '../../contexts/SchemaContext';
import { convertSchemaToAcquisitions } from '../../utils/schemaToAcquisition';
import { Acquisition } from '../../types';

interface UnifiedSchemaSelectorProps {
  // Data
  librarySchemas: UnifiedSchema[];
  uploadedSchemas: UnifiedSchema[];

  // Selection behavior
  selectionMode: 'schema' | 'acquisition';

  // Callbacks
  onSchemaSelect?: (schemaId: string) => void;
  onAcquisitionSelect?: (schemaId: string, acquisitionIndex: number) => void;
  onSchemaUpload?: (file: File) => void;
  onSchemaDownload?: (schemaId: string) => void;

  // UI Options
  expandable?: boolean;
  selectedSchemaId?: string;

  // Utility
  getSchemaContent: (schemaId: string) => Promise<string | null>;
}

interface DeleteConfirmModalProps {
  isOpen: boolean;
  schemaName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  schemaName,
  onConfirm,
  onCancel
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-surface-primary rounded-lg max-w-md w-full p-6">
        <div className="flex items-start mb-4">
          <div className="flex-shrink-0">
            <div className="h-12 w-12 rounded-full bg-status-error-bg flex items-center justify-center">
              <Trash2 className="h-6 w-6 text-status-error" />
            </div>
          </div>
          <div className="ml-4 flex-1">
            <h3 className="text-lg font-medium text-content-primary">Delete Schema</h3>
            <p className="mt-2 text-sm text-content-secondary">
              Are you sure you want to delete <strong>{schemaName}</strong>? This action cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-content-secondary bg-surface-primary border border-border-secondary rounded-md hover:bg-surface-secondary"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-content-inverted bg-status-error border border-transparent rounded-md hover:opacity-90"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

const UnifiedSchemaSelector: React.FC<UnifiedSchemaSelectorProps> = ({
  librarySchemas,
  uploadedSchemas,
  selectionMode,
  onSchemaSelect,
  onAcquisitionSelect,
  onSchemaUpload,
  onSchemaDownload,
  expandable = true,
  selectedSchemaId,
  getSchemaContent
}) => {
  const { deleteSchema } = useSchemaContext();
  const [activeTab, setActiveTab] = useState<'library' | 'uploaded'>('library');
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set());
  const [dragActive, setDragActive] = useState(false);
  const [schemaAcquisitions, setSchemaAcquisitions] = useState<Record<string, Acquisition[]>>({});
  const [loadingSchemas, setLoadingSchemas] = useState<Set<string>>(new Set());
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; schemaId: string; schemaName: string }>({
    isOpen: false,
    schemaId: '',
    schemaName: ''
  });

  const displayedSchemas = activeTab === 'library' ? librarySchemas : uploadedSchemas;

  const toggleSchemaExpansion = async (schemaId: string) => {
    if (!expandable) return;

    setExpandedSchemas(prev => {
      const newSet = new Set(prev);
      if (newSet.has(schemaId)) {
        newSet.delete(schemaId);
      } else {
        newSet.add(schemaId);
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

  const handleSchemaClick = (schemaId: string) => {
    if (selectionMode === 'schema' && onSchemaSelect) {
      onSchemaSelect(schemaId);
    } else if (selectionMode === 'acquisition' && expandable) {
      toggleSchemaExpansion(schemaId);
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
        setActiveTab('uploaded');
      }
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onSchemaUpload?.(e.target.files[0]);
      setActiveTab('uploaded');
    }
  };

  const handleDelete = (schemaId: string, schemaName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteModal({
      isOpen: true,
      schemaId,
      schemaName
    });
  };

  const confirmDelete = async () => {
    if (deleteModal.schemaId) {
      try {
        await deleteSchema(deleteModal.schemaId);
        console.log('✅ Schema deleted successfully:', deleteModal.schemaId);
      } catch (error) {
        console.error('❌ Failed to delete schema:', error);
        // You could show a toast notification here if needed
      }
    }
    setDeleteModal({ isOpen: false, schemaId: '', schemaName: '' });
  };

  const handleDownload = async (schemaId: string, schemaName: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (onSchemaDownload) {
      onSchemaDownload(schemaId);
    } else {
      // Default download implementation
      try {
        const content = await getSchemaContent(schemaId);
        if (content) {
          const blob = new Blob([content], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${schemaName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_schema.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      } catch (error) {
        console.error('Failed to download schema:', error);
      }
    }
  };

  return (
    <>
      <div className="bg-surface-primary rounded-lg shadow-md p-6 border border-border h-fit">
        {/* Tabs */}
        <div className="border-b border-border mb-4">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('library')}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'library'
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-content-tertiary hover:text-content-secondary hover:border-border-secondary'
              }`}
            >
              <div className="flex items-center">
                <Library className="h-4 w-4 mr-2" />
                Library
                {librarySchemas.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 text-xs bg-surface-secondary text-content-secondary rounded-full">
                    {librarySchemas.length}
                  </span>
                )}
              </div>
            </button>
            <button
              onClick={() => setActiveTab('uploaded')}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'uploaded'
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-content-tertiary hover:text-content-secondary hover:border-border-secondary'
              }`}
            >
              <div className="flex items-center">
                <FolderOpen className="h-4 w-4 mr-2" />
                Custom
                {uploadedSchemas.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 text-xs bg-surface-secondary text-content-secondary rounded-full">
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
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-border-secondary hover:border-content-muted'
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
              <Upload className="h-6 w-6 text-content-muted mx-auto mb-2" />
              <p className="text-sm text-content-secondary mb-1">
                Drop schema file here or click to browse
              </p>
              <p className="text-xs text-content-tertiary">
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
            const isSelected = selectedSchemaId === schema.id;

            return (
              <div
                key={schema.id}
                className={`border rounded-lg bg-surface-primary shadow-sm transition-all ${
                  isSelected ? 'border-brand-500 ring-2 ring-brand-100' : 'border-border'
                }`}
              >
                {/* Schema Header */}
                <div
                  className={`px-4 py-3 rounded-t-lg cursor-pointer transition-colors ${
                    selectionMode === 'schema'
                      ? 'hover:bg-surface-secondary'
                      : expandable
                        ? 'hover:bg-surface-secondary'
                        : ''
                  }`}
                  onClick={() => handleSchemaClick(schema.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-content-primary truncate">
                        {schema.name}
                      </h3>
                      <p className="text-xs text-content-secondary truncate mt-1">
                        {schema.description || 'No description available'}
                      </p>
                      <div className="mt-2 flex items-center space-x-3 text-xs text-content-tertiary">
                        <span>v{schema.version || '1.0.0'}</span>
                        {schema.authors?.length > 0 && (
                          <>
                            <span>•</span>
                            <span>{schema.authors.join(', ')}</span>
                          </>
                        )}
                        {schema.isMultiAcquisition && (
                          <>
                            <span>•</span>
                            <span className="px-2 py-0.5 bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 rounded-full">
                              {schema.acquisitions.length} acquisitions
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 ml-4">
                      {/* Download button - always visible */}
                      <button
                        onClick={(e) => handleDownload(schema.id, schema.name, e)}
                        className="p-1 text-content-tertiary hover:text-brand-600 transition-colors"
                        title="Save schema"
                      >
                        <Download className="h-4 w-4" />
                      </button>

                      {/* Delete button - only for custom schemas */}
                      {activeTab === 'uploaded' && (
                        <button
                          onClick={(e) => handleDelete(schema.id, schema.name, e)}
                          className="p-1 text-content-tertiary hover:text-status-error transition-colors"
                          title="Delete schema"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}

                      {/* Expand chevron */}
                      {expandable && selectionMode === 'acquisition' && (
                        <div className="p-1 text-content-secondary">
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Acquisitions */}
                {expandable && isExpanded && selectionMode === 'acquisition' && (
                  <div className="p-4 border-t border-border bg-surface-secondary">
                    {isLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600"></div>
                        <span className="ml-2 text-sm text-content-secondary">Loading acquisitions...</span>
                      </div>
                    ) : acquisitions.length > 0 ? (
                      <div className="space-y-2">
                        {acquisitions.map((acquisition, index) => (
                          <button
                            key={acquisition.id}
                            onClick={() => onAcquisitionSelect?.(schema.id, index)}
                            className="w-full text-left border border-border-secondary rounded-lg p-3 bg-surface-primary hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:border-brand-300 dark:hover:border-brand-700 transition-all"
                          >
                            <div className="flex items-start space-x-3">
                              <FileText className="h-5 w-5 text-content-tertiary mt-0.5 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm text-content-primary">
                                  {acquisition.protocolName}
                                </div>
                                {acquisition.seriesDescription && (
                                  <div className="text-xs text-content-secondary mt-1">
                                    {acquisition.seriesDescription}
                                  </div>
                                )}
                                <div className="flex items-center space-x-4 mt-2 text-xs text-content-tertiary">
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
                                    <span className="text-brand-600 dark:text-brand-400">
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
                      <div className="text-center py-4 text-sm text-content-tertiary">
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
          <p className="text-sm text-content-tertiary text-center py-8">
            {activeTab === 'library'
              ? 'No library schemas available.'
              : 'No custom schemas. Load a schema to get started.'}
          </p>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={deleteModal.isOpen}
        schemaName={deleteModal.schemaName}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteModal({ isOpen: false, schemaId: '', schemaName: '' })}
      />
    </>
  );
};

export default UnifiedSchemaSelector;