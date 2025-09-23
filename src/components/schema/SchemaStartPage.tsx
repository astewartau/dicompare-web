import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Library, FolderOpen, FileText, ChevronRight } from 'lucide-react';
import { useSchemaService } from '../../hooks/useSchemaService';
import { useSchemaContext } from '../../contexts/SchemaContext';

const SchemaStartPage: React.FC = () => {
  const navigate = useNavigate();
  const { librarySchemas, uploadedSchemas, getSchemaContent } = useSchemaService();
  const { setEditingSchema, setOriginSchema } = useSchemaContext();
  const [activeTab, setActiveTab] = useState<'library' | 'uploaded'>('library');
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set());

  const displayedSchemas = activeTab === 'library' ? librarySchemas : uploadedSchemas;

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
        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
          <div className="mb-6 text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Edit className="h-8 w-8 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Start from Existing</h3>
            <p className="text-gray-600">
              Use an existing schema as your starting template. You can save as a new schema or update the original.
            </p>
          </div>

          {/* Schema Library Tabs */}
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
                  Custom
                  {uploadedSchemas.length > 0 && (
                    <span className="ml-2 px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                      {uploadedSchemas.length}
                    </span>
                  )}
                </div>
              </button>
            </nav>
          </div>

          {/* Schema List */}
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {displayedSchemas.map((schema) => (
              <div key={schema.id} className="border border-gray-200 rounded-lg bg-white shadow-sm">
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => handleEditSchema(schema.id)}
                >
                  <div className="flex items-start space-x-3">
                    <FileText className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-gray-900 truncate">
                        {schema.name}
                      </h4>
                      <p className="text-xs text-gray-600 mt-1 truncate">
                        {schema.description || 'No description available'}
                      </p>
                      <div className="flex items-center space-x-2 mt-2 text-xs text-gray-500">
                        <span>v{schema.version || '1.0.0'}</span>
                        {schema.authors?.length > 0 && (
                          <>
                            <span>•</span>
                            <span>by {schema.authors.join(', ')}</span>
                          </>
                        )}
                        {schema.isMultiAcquisition && (
                          <>
                            <span>•</span>
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                              {schema.acquisitions.length} acquisitions
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {displayedSchemas.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">
                {activeTab === 'library'
                  ? 'No library schemas available.'
                  : 'No custom schemas available.'}
              </p>
              <p className="text-xs mt-1">
                {activeTab === 'library'
                  ? 'Check back later as more schemas are added to the library.'
                  : 'Upload schemas in the Check Compliance page or create new ones here.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SchemaStartPage;