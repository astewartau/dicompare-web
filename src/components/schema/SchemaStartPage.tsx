import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, ChevronRight, Loader2, X } from 'lucide-react';
import { useSchemaService } from '../../hooks/useSchemaService';
import { useSchemaContext } from '../../contexts/SchemaContext';
import { useAcquisitions } from '../../contexts/AcquisitionContext';
import UnifiedSchemaSelector from './UnifiedSchemaSelector';
import { SchemaUploadModal } from './SchemaUploadModal';
import { schemaCacheManager } from '../../services/SchemaCacheManager';
import { AcquisitionSelection } from '../../types';
import { convertRawAcquisitionToContext } from '../../utils/schemaToAcquisition';

const SchemaStartPage: React.FC = () => {
  const navigate = useNavigate();
  const { librarySchemas, uploadedSchemas, getSchemaContent } = useSchemaService();
  const { setEditingSchema, setOriginSchema } = useSchemaContext();
  const { setAcquisitions } = useAcquisitions();
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Multi-select state
  const [selectedAcquisitions, setSelectedAcquisitions] = useState<AcquisitionSelection[]>([]);
  const [isCreatingSchema, setIsCreatingSchema] = useState(false);
  const [showExistingModal, setShowExistingModal] = useState(false);

  const handleCreateNew = () => {
    setEditingSchema(null);
    setOriginSchema(null);
    navigate('/schema-builder/build-schema');
  };

  const handleEditSchema = async (schemaId: string) => {
    try {
      const schemaContent = await getSchemaContent(schemaId);
      if (schemaContent) {
        const parsedSchema = JSON.parse(schemaContent);
        const schemaInfo = [...librarySchemas, ...uploadedSchemas].find(s => s.id === schemaId);

        if (schemaInfo) {
          // Set the editing schema
          setEditingSchema({
            id: schemaId,
            content: parsedSchema,
            metadata: schemaInfo
          });

          // Set the origin schema for tracking where we started from
          setOriginSchema({
            id: schemaId,
            name: schemaInfo.name,
            type: librarySchemas.find(s => s.id === schemaId) ? 'library' : 'uploaded',
            metadata: schemaInfo
          });

          navigate('/schema-builder/build-schema');
        }
      }
    } catch (error) {
      console.error('Failed to load schema for editing:', error);
      alert('Failed to load schema for editing. Please try again.');
    }
  };

  const handleSchemaUpload = async (file: File) => {
    // Clear any previous error
    setValidationError(null);

    try {
      // Validate the schema file (JSON syntax + metaschema validation)
      const validation = await schemaCacheManager.validateSchemaFile(file);

      if (!validation.isValid) {
        // Show error modal, don't open upload modal
        setValidationError(validation.error || 'Invalid schema file');
        return;
      }

      // Schema is valid, proceed to upload modal
      setUploadedFile(file);
      setShowUploadModal(true);
    } catch (error) {
      console.error('Failed to validate schema file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setValidationError(errorMessage);
    }
  };

  // Toggle acquisition selection
  const handleAcquisitionToggle = (selection: AcquisitionSelection) => {
    setSelectedAcquisitions(prev => {
      const exists = prev.some(
        s => s.schemaId === selection.schemaId && s.acquisitionIndex === selection.acquisitionIndex
      );
      return exists
        ? prev.filter(s => !(s.schemaId === selection.schemaId && s.acquisitionIndex === selection.acquisitionIndex))
        : [...prev, selection];
    });
  };

  // Create schema from selected acquisitions
  const handleCreateFromSelected = async () => {
    if (selectedAcquisitions.length === 0) return;

    setIsCreatingSchema(true);
    try {
      const acquisitions: any[] = [];

      // Group selections by schemaId for efficient loading
      const selectionsBySchema = new Map<string, AcquisitionSelection[]>();
      for (const sel of selectedAcquisitions) {
        if (!selectionsBySchema.has(sel.schemaId)) {
          selectionsBySchema.set(sel.schemaId, []);
        }
        selectionsBySchema.get(sel.schemaId)!.push(sel);
      }

      // Extract each acquisition
      for (const [schemaId, selections] of selectionsBySchema) {
        const schemaContent = await getSchemaContent(schemaId);
        if (!schemaContent) {
          console.warn(`Failed to load schema content for ${schemaId}`);
          continue;
        }

        const parsedSchema = JSON.parse(schemaContent);
        const acquisitionKeys = Object.keys(parsedSchema.acquisitions || {});

        for (const sel of selections) {
          if (sel.acquisitionIndex < acquisitionKeys.length) {
            const acquisitionName = acquisitionKeys[sel.acquisitionIndex];
            const targetAcquisition = parsedSchema.acquisitions[acquisitionName];

            if (targetAcquisition) {
              const newAcquisition = convertRawAcquisitionToContext(
                acquisitionName,
                targetAcquisition,
                schemaId,
                targetAcquisition.tags
              );
              acquisitions.push(newAcquisition);
            }
          }
        }
      }

      if (acquisitions.length === 0) {
        throw new Error('No valid acquisitions could be extracted');
      }

      // Set acquisitions in context
      setAcquisitions(acquisitions);

      // Clear origin/editing schema since we're creating fresh from multiple sources
      setEditingSchema(null);
      setOriginSchema(null);

      // Navigate to build step
      navigate('/schema-builder/build-schema');

    } catch (error) {
      console.error('Failed to create from selected:', error);
      alert(`Failed to create schema from selections: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsCreatingSchema(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-content-primary mb-4">Schema Builder - Choose Your Starting Point</h2>
        <p className="text-content-secondary">
          Start by selecting an existing schema to edit, or create a new schema from scratch.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Create New Schema Card */}
        <div className="bg-surface-primary rounded-lg shadow-md p-6 border border-border h-fit">
          <div className="text-center">
            <div className="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plus className="h-8 w-8 text-brand-600" />
            </div>
            <h3 className="text-xl font-semibold text-content-primary mb-3">Create New Schema</h3>
            <p className="text-content-secondary mb-6">
              Start building a new schema from scratch or from existing DICOM files or protocols.
            </p>
            <button
              onClick={handleCreateNew}
              className="inline-flex items-center px-6 py-3 bg-brand-600 text-content-inverted rounded-lg hover:bg-brand-700 transition-colors"
            >
              <Plus className="h-5 w-5 mr-2" />
              Create New Schema
              <ChevronRight className="h-5 w-5 ml-2" />
            </button>
          </div>
        </div>

        {/* Start from Existing Schema Card */}
        <div className="bg-surface-primary rounded-lg shadow-md p-6 border border-border h-fit">
          <div className="text-center">
            <div className="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Edit className="h-8 w-8 text-brand-600" />
            </div>
            <h3 className="text-xl font-semibold text-content-primary mb-3">Start from Existing</h3>
            <p className="text-content-secondary mb-6">
              Select individual acquisitions from existing schemas. Mix and match from multiple schemas to build your new schema.
            </p>
            <button
              onClick={() => setShowExistingModal(true)}
              className="inline-flex items-center px-6 py-3 bg-brand-600 text-content-inverted rounded-lg hover:bg-brand-700 transition-colors"
            >
              <Edit className="h-5 w-5 mr-2" />
              Browse Existing Schemas
              <ChevronRight className="h-5 w-5 ml-2" />
            </button>
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      <SchemaUploadModal
        isOpen={showUploadModal}
        onClose={() => {
          setShowUploadModal(false);
          setUploadedFile(null);
        }}
        onUploadComplete={() => {
          setShowUploadModal(false);
          setUploadedFile(null);
        }}
        preloadedFile={uploadedFile}
      />

      {/* Validation Error Modal */}
      {validationError && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-surface-primary rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-status-error-bg rounded-full flex items-center justify-center">
                <span className="text-status-error text-xl">!</span>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-content-primary">Invalid Schema File</h3>
                <p className="mt-2 text-sm text-content-secondary">{validationError}</p>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setValidationError(null)}
                className="px-4 py-2 bg-surface-secondary text-content-primary rounded-md hover:bg-border-secondary"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Start from Existing Modal */}
      {showExistingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-surface-primary rounded-lg w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div>
                <h3 className="text-xl font-semibold text-content-primary">Select Acquisitions</h3>
                <p className="text-sm text-content-secondary mt-1">
                  Expand schemas to select individual acquisitions. Mix and match from multiple schemas.
                </p>
              </div>
              <button
                onClick={() => setShowExistingModal(false)}
                className="text-content-tertiary hover:text-content-primary p-2"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body - Scrollable */}
            <div className="flex-1 overflow-y-auto p-6">
              <UnifiedSchemaSelector
                librarySchemas={librarySchemas}
                uploadedSchemas={uploadedSchemas}
                selectionMode="acquisition"
                multiSelectMode={true}
                selectedAcquisitions={selectedAcquisitions}
                onAcquisitionToggle={handleAcquisitionToggle}
                onSchemaUpload={handleSchemaUpload}
                expandable={true}
                getSchemaContent={getSchemaContent}
              />
            </div>

            {/* Modal Footer - Selection Summary */}
            <div className="border-t border-border p-6">
              {selectedAcquisitions.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 bg-brand-600 text-white rounded-full text-sm font-medium">
                        {selectedAcquisitions.length}
                      </span>
                      <span className="text-content-secondary text-sm">
                        acquisition{selectedAcquisitions.length !== 1 ? 's' : ''} selected
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedAcquisitions([])}
                        className="px-3 py-1.5 text-sm text-content-secondary hover:text-content-primary flex items-center gap-1"
                      >
                        <X className="h-4 w-4" />
                        Clear
                      </button>
                      <button
                        onClick={handleCreateFromSelected}
                        disabled={isCreatingSchema}
                        className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium"
                      >
                        {isCreatingSchema ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4" />
                            Create from Selected
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  {/* Show selected acquisitions summary */}
                  <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                    {selectedAcquisitions.map((sel) => (
                      <span
                        key={`${sel.schemaId}-${sel.acquisitionIndex}`}
                        className="inline-flex items-center px-2 py-1 bg-surface-secondary rounded text-xs text-content-secondary border border-border"
                      >
                        <span className="font-medium text-content-primary">{sel.acquisitionName}</span>
                        <span className="mx-1 text-content-tertiary">from</span>
                        <span>{sel.schemaName}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAcquisitionToggle(sel);
                          }}
                          className="ml-1.5 text-content-tertiary hover:text-content-primary"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-content-tertiary text-sm">
                    Expand schemas and select acquisitions to include in your new schema.
                  </p>
                  <button
                    onClick={() => setShowExistingModal(false)}
                    className="px-4 py-2 bg-surface-secondary text-content-primary rounded-lg hover:bg-border-secondary"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchemaStartPage;