import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, FileText, Code, Eye, ArrowLeft, Loader2, Save, CheckCircle } from 'lucide-react';
import { useAcquisitions } from '../../contexts/AcquisitionContext';
import { useSchemaContext } from '../../contexts/SchemaContext';
import { dicompareAPI } from '../../services/DicompareAPI';

const DownloadSchema: React.FC = () => {
  const navigate = useNavigate();
  const { acquisitions, schemaMetadata } = useAcquisitions();
  const { uploadSchema } = useSchemaContext();
  const [schema, setSchema] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Generate schema when component mounts
  useEffect(() => {
    const generateSchema = async () => {
      if (!schemaMetadata || acquisitions.length === 0) {
        setError('Missing schema metadata or acquisitions. Please go back and complete the previous steps.');
        return;
      }

      setIsGenerating(true);
      try {
        console.log('Generating template with acquisitions:', acquisitions);
        console.log('Schema metadata:', schemaMetadata);
        
        const generatedSchema = await dicompareAPI.generateSchemaJS(acquisitions, schemaMetadata);
        setSchema(generatedSchema);
        setError(null);
      } catch (err) {
        console.error('Failed to generate schema:', err);
        setError(`Failed to generate schema: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setIsGenerating(false);
      }
    };

    generateSchema();
  }, [acquisitions, schemaMetadata]);

  const handleDownloadJSON = () => {
    // Separate the schema from statistics for download
    const { statistics, ...schemaContent } = schema;
    const jsonContent = JSON.stringify(schemaContent, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Use schemaMetadata for filename, with fallback
    const schemaName = schemaMetadata?.name || 'validation_schema';
    const version = schemaMetadata?.version || '1.0';
    a.download = `${schemaName.replace(/\s+/g, '_')}_v${version}.json`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSaveToLibrary = async () => {
    if (!schema || !schemaMetadata) return;

    setIsSaving(true);
    setError(null);

    try {
      // Separate the schema from statistics for saving
      const { statistics, ...schemaContent } = schema;
      const jsonContent = JSON.stringify(schemaContent, null, 2);

      // Create a File object from the schema content
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const schemaName = schemaMetadata?.name || 'validation_schema';
      const version = schemaMetadata?.version || '1.0';
      const fileName = `${schemaName.replace(/\s+/g, '_')}_v${version}.json`;
      const file = new File([blob], fileName, { type: 'application/json' });

      // Use the existing uploadSchema function from SchemaContext
      await uploadSchema(file, {
        title: schemaMetadata.name,
        description: schemaMetadata.description,
        authors: schemaMetadata.authors,
        version: schemaMetadata.version,
      });

      setSaveSuccess(true);

      // Auto-hide success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);

    } catch (err) {
      console.error('Failed to save schema to library:', err);
      setError(`Failed to save schema: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    navigate('/schema-builder/enter-metadata');
  };

  const handleStartOver = () => {
    navigate('/schema-builder/build-schema');
  };

  // Show loading state
  if (isGenerating) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Download Schema - Step 3</h2>
          <p className="text-gray-600">Generating your validation schema...</p>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-medical-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Generating Schema</h3>
          <p className="text-gray-600">Using dicompare to create your validation schema...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Download Schema - Step 3</h2>
          <p className="text-gray-600">There was an issue generating your schema.</p>
        </div>
        
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-red-800 mb-2">Schema Generation Failed</h3>
          <p className="text-red-700 mb-4">{error}</p>
          <div className="space-x-4">
            <button
              onClick={() => navigate('/schema-builder/enter-metadata')}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Back to Metadata
            </button>
            <button
              onClick={() => navigate('/schema-builder/build-schema')}
              className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50"
            >
              Start Over
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show success state with schema
  if (!schema) {
    return null; // Still loading or no schema
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Download Schema - Step 3</h2>
        <p className="text-gray-600">
          Your schema has been generated successfully! Download it in your preferred format or preview the content.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Schema Summary */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <Eye className="h-6 w-6 mr-2 text-medical-600" />
            Schema Summary
          </h3>
          
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-gray-700">Schema Name</h4>
              <p className="text-gray-900">{schemaMetadata?.name || 'Generated Schema'}</p>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-700">Version</h4>
              <p className="text-gray-900">{schemaMetadata?.version || '1.0'}</p>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-700">Authors</h4>
              <p className="text-gray-900">{schemaMetadata?.authors?.join(', ') || 'Unknown'}</p>
            </div>
            
            {schemaMetadata?.description && (
              <div>
                <h4 className="font-medium text-gray-700">Description</h4>
                <p className="text-gray-900">{schemaMetadata.description}</p>
              </div>
            )}
            
            <div>
              <h4 className="font-medium text-gray-700">Acquisitions</h4>
              <div className="mt-2 space-y-2">
                {acquisitions.map((acquisition) => (
                  <div key={acquisition.id} className="p-3 bg-gray-50 rounded-lg">
                    <p className="font-medium text-gray-900">{acquisition.protocolName}</p>
                    <p className="text-sm text-gray-600">
                      {acquisition.acquisitionFields.length + acquisition.seriesFields.length} validation fields
                      {acquisition.validationFunctions && acquisition.validationFunctions.length > 0 && (
                        <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs">
                          {acquisition.validationFunctions.length} validator {acquisition.validationFunctions.length === 1 ? 'rule' : 'rules'}
                        </span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            
            {schema.statistics && (
              <div>
                <h4 className="font-medium text-gray-700">Statistics</h4>
                <div className="mt-2 space-y-1 text-sm text-gray-600">
                  <p>Total acquisitions: {schema.statistics.total_acquisitions}</p>
                  <p>Total validation fields: {schema.statistics.total_validation_fields}</p>
                  <p>Estimated validation time: {schema.statistics.estimated_validation_time}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Download Options */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center mb-4">
            <FileText className="h-6 w-6 mr-2 text-medical-600" />
            <h3 className="text-xl font-semibold text-gray-900">Save or Download Schema</h3>
          </div>
          
          <p className="text-gray-600 mb-6">
            Save your schema to your library for immediate use, or download it as a JSON file.
          </p>

          {/* Success Message */}
          {saveSuccess && (
            <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded-lg flex items-center">
              <CheckCircle className="h-4 w-4 mr-2" />
              Schema saved to library successfully! It's now available in Check Compliance.
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              className="flex items-center justify-center px-6 py-4 bg-medical-600 text-white rounded-lg hover:bg-medical-700 font-medium"
            >
              <Download className="h-5 w-5 mr-2" />
              Download JSON
            </button>
          </div>
        </div>
      </div>

      {/* Schema Preview */}
      <div className="mt-8 bg-white rounded-lg shadow-md p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
          <FileText className="h-6 w-6 mr-2 text-medical-600" />
          Schema Content Preview
        </h3>
        
        <div className="bg-gray-50 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-gray-700 whitespace-pre-wrap">
            {schema ? JSON.stringify((() => {
              const { statistics, ...schemaContent } = schema;
              return schemaContent;
            })(), null, 2) : 'Loading...'}
          </pre>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="mt-8 flex justify-between">
        <button
          onClick={handleBack}
          className="flex items-center px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Back to Metadata
        </button>
        
        <div className="space-x-4">
          <button
            onClick={handleStartOver}
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Create Another Schema
          </button>
          
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Return to Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default DownloadSchema;