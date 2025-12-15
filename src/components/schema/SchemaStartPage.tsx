import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, ChevronRight } from 'lucide-react';
import { useSchemaService } from '../../hooks/useSchemaService';
import { useSchemaContext } from '../../contexts/SchemaContext';
import UnifiedSchemaSelector from './UnifiedSchemaSelector';
import { SchemaUploadModal } from './SchemaUploadModal';
import { schemaCacheManager } from '../../services/SchemaCacheManager';

const SchemaStartPage: React.FC = () => {
  const navigate = useNavigate();
  const { librarySchemas, uploadedSchemas, getSchemaContent } = useSchemaService();
  const { setEditingSchema, setOriginSchema } = useSchemaContext();
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

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
              Start building a new validation schema from scratch. Upload DICOM files, create acquisitions manually, or import from existing schemas.
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
        <div>
          <div className="bg-surface-primary rounded-lg shadow-md p-6 border border-border mb-4">
            <div className="text-center">
              <div className="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Edit className="h-8 w-8 text-brand-600" />
              </div>
              <h3 className="text-xl font-semibold text-content-primary mb-3">Start from Existing</h3>
              <p className="text-content-secondary">
                Use an existing schema as your starting template. You can save as a new schema or update the original.
              </p>
            </div>
          </div>

          <UnifiedSchemaSelector
            librarySchemas={librarySchemas}
            uploadedSchemas={uploadedSchemas}
            selectionMode="schema"
            onSchemaSelect={handleEditSchema}
            onSchemaUpload={handleSchemaUpload}
            expandable={false}
            getSchemaContent={getSchemaContent}
          />
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
    </div>
  );
};

export default SchemaStartPage;