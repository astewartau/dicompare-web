import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, ChevronRight } from 'lucide-react';
import { useSchemaService } from '../../hooks/useSchemaService';
import { useSchemaContext } from '../../contexts/SchemaContext';
import UnifiedSchemaSelector from './UnifiedSchemaSelector';
import { SchemaUploadModal } from './SchemaUploadModal';

const SchemaStartPage: React.FC = () => {
  const navigate = useNavigate();
  const { librarySchemas, uploadedSchemas, getSchemaContent } = useSchemaService();
  const { setEditingSchema, setOriginSchema } = useSchemaContext();
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

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
    try {
      const content = await file.text();
      let cleanContent = content.trim();

      if (cleanContent.charCodeAt(0) === 0xFEFF) {
        cleanContent = cleanContent.slice(1);
      }

      if (!cleanContent.startsWith('{') && !cleanContent.startsWith('[')) {
        throw new Error('File does not appear to be valid JSON');
      }

      JSON.parse(cleanContent); // Validate JSON

      setUploadedFile(file);
      setShowUploadModal(true);
    } catch (error) {
      console.error('Failed to parse schema file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`Failed to parse schema file: ${errorMessage}`);

      setUploadedFile(file);
      setShowUploadModal(true);
    }
  };


  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Schema Builder - Choose Your Starting Point</h2>
        <p className="text-gray-600">
          Start by selecting an existing schema to edit, or create a new schema from scratch.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Create New Schema Card */}
        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 h-fit">
          <div className="text-center">
            <div className="w-16 h-16 bg-medical-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plus className="h-8 w-8 text-medical-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Create New Schema</h3>
            <p className="text-gray-600 mb-6">
              Start building a new validation schema from scratch. Upload DICOM files, create acquisitions manually, or import from existing schemas.
            </p>
            <button
              onClick={handleCreateNew}
              className="inline-flex items-center px-6 py-3 bg-medical-600 text-white rounded-lg hover:bg-medical-700 transition-colors"
            >
              <Plus className="h-5 w-5 mr-2" />
              Create New Schema
              <ChevronRight className="h-5 w-5 ml-2" />
            </button>
          </div>
        </div>

        {/* Start from Existing Schema Card */}
        <div>
          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 mb-4">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Edit className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Start from Existing</h3>
              <p className="text-gray-600">
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
    </div>
  );
};

export default SchemaStartPage;