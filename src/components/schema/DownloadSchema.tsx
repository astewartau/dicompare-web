import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, FileText, Code, Eye, ArrowLeft, Loader2, Save, CheckCircle, Edit, AlertCircle } from 'lucide-react';
import { useAcquisitions } from '../../contexts/AcquisitionContext';
import { useSchemaContext } from '../../contexts/SchemaContext';
import { dicompareAPI } from '../../services/DicompareAPI';

const DownloadSchema: React.FC = () => {
  const navigate = useNavigate();
  const { acquisitions, schemaMetadata } = useAcquisitions();
  const { uploadSchema, updateExistingSchema, originSchema } = useSchemaContext();
  const [schema, setSchema] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveOption, setSaveOption] = useState<'new' | 'update' | null>(null);
  const [showConfirmUpdate, setShowConfirmUpdate] = useState(false);

  // Generate schema when component mounts
  useEffect(() => {
    const generateSchema = () => {
      if (!schemaMetadata || acquisitions.length === 0) {
        setError('Missing schema metadata or acquisitions. Please go back and complete the previous steps.');
        return;
      }

      setIsGenerating(true);
      try {
        console.log('Generating schema from acquisitions:', acquisitions);
        console.log('Schema metadata:', schemaMetadata);

        // Create schema directly from acquisitions data (no Python/pyodide needed)
        const schemaAcquisitions: Record<string, any> = {};

        acquisitions.forEach(acquisition => {
          const acquisitionName = acquisition.protocolName || acquisition.id || 'Unknown';

          // Transform acquisition fields
          const acquisitionFields = acquisition.acquisitionFields?.map((field: any) => {
            const fieldEntry: any = {
              field: field.keyword || field.name || '',
              tag: field.tag
            };

            // Handle field values (extract actual value from complex objects)
            if (typeof field.value === 'object' && field.value !== null && 'value' in field.value) {
              fieldEntry.value = field.value.value;
              if (field.value.validationRule) {
                fieldEntry.validationRule = field.value.validationRule;
              }
            } else {
              fieldEntry.value = field.value;
            }

            // Add other field properties
            if (field.vr) fieldEntry.vr = field.vr;
            if (field.dataType) fieldEntry.dataType = field.dataType;

            return fieldEntry;
          }) || [];

          // Transform series data
          const seriesData = acquisition.series?.map((series: any) => {
            const seriesEntry: any = {
              name: series.name || 'Unknown Series',
              fields: []
            };

            // Convert series fields
            acquisition.seriesFields?.forEach((seriesField: any) => {
              const fieldValue = series.fields?.[seriesField.tag];
              if (fieldValue !== undefined) {
                const fieldEntry: any = {
                  field: seriesField.keyword || seriesField.name || '',
                  tag: seriesField.tag
                };

                // Handle series field values
                if (typeof fieldValue === 'object' && fieldValue !== null && 'value' in fieldValue) {
                  fieldEntry.value = fieldValue.value;
                  if (fieldValue.validationRule) {
                    fieldEntry.validationRule = fieldValue.validationRule;
                  }
                } else {
                  fieldEntry.value = fieldValue;
                }

                if (seriesField.vr) fieldEntry.vr = seriesField.vr;
                if (seriesField.dataType) fieldEntry.dataType = seriesField.dataType;

                seriesEntry.fields.push(fieldEntry);
              }
            });

            return seriesEntry;
          }) || [];

          // Transform validation functions
          const validationRules = acquisition.validationFunctions?.map((rule: any) => ({
            id: rule.id,
            name: rule.name,
            description: rule.description,
            implementation: rule.implementation || rule.customImplementation,
            fields: rule.fields || rule.customFields || [],
            testCases: rule.testCases || rule.customTestCases || []
          })) || [];

          schemaAcquisitions[acquisitionName] = {
            description: acquisition.seriesDescription || '',
            fields: acquisitionFields,
            series: seriesData,
            rules: validationRules
          };
        });

        // Create the complete schema
        const generatedSchema = {
          name: schemaMetadata.name,
          description: schemaMetadata.description || '',
          version: schemaMetadata.version || '1.0',
          authors: schemaMetadata.authors || [],
          acquisitions: schemaAcquisitions,
          // Add statistics for UI display
          statistics: {
            totalAcquisitions: acquisitions.length,
            totalFields: acquisitions.reduce((sum, acq) =>
              sum + (acq.acquisitionFields?.length || 0) + (acq.seriesFields?.length || 0), 0),
            totalSeries: acquisitions.reduce((sum, acq) => sum + (acq.series?.length || 0), 0),
            totalValidationRules: acquisitions.reduce((sum, acq) =>
              sum + (acq.validationFunctions?.length || 0), 0)
          }
        };

        setSchema(generatedSchema);
        setError(null);
        console.log('✅ Schema generated successfully (pure JavaScript)');
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

  const handleSaveAsNew = async () => {
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
        name: schemaMetadata.name,
        description: schemaMetadata.description,
        authors: schemaMetadata.authors,
        version: schemaMetadata.version,
      });

      setSaveSuccess(true);
      setSaveOption('new');

      // Auto-hide success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);

    } catch (err) {
      console.error('Failed to save new schema:', err);
      setError(`Failed to save schema: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateOriginal = async () => {
    if (!schema || !schemaMetadata || !originSchema) return;

    setIsSaving(true);
    setError(null);

    try {
      // Separate the schema from statistics for saving
      const { statistics, ...schemaContent } = schema;

      // Update the existing schema
      await updateExistingSchema(originSchema.id, schemaContent, {
        name: schemaMetadata.name,
        description: schemaMetadata.description,
        authors: schemaMetadata.authors,
        version: schemaMetadata.version,
      });

      setSaveSuccess(true);
      setSaveOption('update');

      // Auto-hide success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);

    } catch (err) {
      console.error('Failed to update original schema:', err);
      setError(`Failed to update schema: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
      setShowConfirmUpdate(false);
    }
  };

  const handleConfirmUpdate = () => {
    setShowConfirmUpdate(true);
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
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Download Schema - Step 4</h2>
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
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Download Schema - Step 4</h2>
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
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          Download Schema - Step 4
          {originSchema && (
            <span className="text-lg font-normal text-blue-600 ml-2">
              (Based on: {originSchema.name})
            </span>
          )}
        </h2>
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
          {/* Origin Schema Info */}
          {originSchema && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center mb-2">
                <Edit className="h-4 w-4 text-blue-600 mr-2" />
                <span className="text-sm font-medium text-blue-800">
                  Started from: {originSchema.type === 'library' ? 'Library' : 'Custom'} schema "{originSchema.name}"
                </span>
              </div>
              {originSchema.type === 'library' ? (
                <p className="text-xs text-blue-600">
                  Library schemas are read-only. Your changes will be saved as a new schema.
                </p>
              ) : (
                <p className="text-xs text-blue-600">
                  You can save as a new schema or update the original.
                </p>
              )}
            </div>
          )}

          {/* Success Messages */}
          {saveSuccess && saveOption === 'new' && (
            <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded-lg flex items-center">
              <CheckCircle className="h-4 w-4 mr-2" />
              New schema saved to library successfully! It's now available in Check Compliance.
            </div>
          )}

          {saveSuccess && saveOption === 'update' && (
            <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded-lg flex items-center">
              <CheckCircle className="h-4 w-4 mr-2" />
              Original schema "{originSchema?.name}" updated successfully!
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-4">
            {/* Save Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Save as New - Always available */}
              <button
                onClick={handleSaveAsNew}
                disabled={isSaving}
                className="flex items-center justify-center px-6 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
              >
                {isSaving && saveOption === 'new' ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-5 w-5 mr-2" />
                    Save as New Schema
                  </>
                )}
              </button>

              {/* Update Original - Only for custom schemas */}
              {originSchema?.type === 'uploaded' && (
                <button
                  onClick={handleConfirmUpdate}
                  disabled={isSaving}
                  className="flex items-center justify-center px-6 py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                >
                  {isSaving && saveOption === 'update' ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Edit className="h-5 w-5 mr-2" />
                      Update Original
                    </>
                  )}
                </button>
              )}

              {/* Download - Always available */}
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

      {/* Update Confirmation Modal */}
      {showConfirmUpdate && originSchema && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center mb-4">
              <AlertCircle className="h-6 w-6 text-orange-600 mr-3" />
              <h3 className="text-lg font-medium text-gray-900">Update Original Schema</h3>
            </div>

            <p className="text-gray-600 mb-6">
              Are you sure you want to update the original schema "{originSchema.name}"?
              This action will permanently replace the existing schema with your changes.
            </p>

            <div className="flex space-x-3">
              <button
                onClick={() => setShowConfirmUpdate(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateOriginal}
                disabled={isSaving}
                className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin inline" />
                    Updating...
                  </>
                ) : (
                  'Update Original'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DownloadSchema;