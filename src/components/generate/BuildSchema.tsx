import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Plus, Loader2, Database } from 'lucide-react';
import { dicompareAPI } from '../../services/DicompareAPI';
import { useAcquisitions } from '../../contexts/AcquisitionContext';
import AcquisitionTable from './AcquisitionTable';

const BuildSchema: React.FC = () => {
  const navigate = useNavigate();
  const {
    acquisitions,
    setAcquisitions,
    updateAcquisition,
    deleteAcquisition,
    addNewAcquisition,
    updateField,
    deleteField,
    convertFieldLevel,
    addFields,
    updateSeries,
    addSeries,
    deleteSeries,
    updateSeriesName
  } = useAcquisitions();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string>('');

  // Validation logic for field completeness
  const isFieldValueValid = (field: any) => {
    // Handle series field values that might be SeriesFieldValue objects
    if (typeof field === 'object' && field !== null && 'validationRule' in field) {
      const rule = field.validationRule;
      // For non-exact validation rules, check if the rule has the required value
      if (rule && rule.type !== 'exact') {
        if (rule.type === 'contains' && rule.contains) return true;
        if (rule.type === 'range' && rule.min !== undefined && rule.max !== undefined) return true;
        if (rule.type === 'tolerance' && rule.value !== undefined && rule.tolerance !== undefined) return true;
        return false;
      }
      // For exact validation, check the value
      if (!field.value && field.value !== 0) return false;
      if (typeof field.value === 'string' && field.value.trim() === '') return false;
      if (Array.isArray(field.value) && field.value.length === 0) return false;
      return true;
    }
    
    // Handle direct values (arrays, strings, numbers) - these are valid if they exist
    if (field === null || field === undefined) return false;
    if (typeof field === 'string' && field.trim() === '') return false;
    if (Array.isArray(field) && field.length === 0) return false;
    return true;
  };

  const getIncompleteFields = () => {
    const incompleteFields = new Set<string>();
    
    acquisitions.forEach(acquisition => {
      // Check acquisition-level fields
      acquisition.acquisitionFields.forEach(field => {
        if (!isFieldValueValid(field)) {
          incompleteFields.add(`${acquisition.id}-${field.tag}`);
        }
      });
      
      // Check series field values only if there are series-level fields
      if (acquisition.seriesFields.length > 0) {
        // Ensure we check at least 2 series (matching SeriesTable display logic)
        const minSeriesCount = Math.max(2, acquisition.series?.length || 0);
        
        for (let seriesIndex = 0; seriesIndex < minSeriesCount; seriesIndex++) {
          const series = acquisition.series?.[seriesIndex];
          
          acquisition.seriesFields.forEach(field => {
            const fieldValue = series?.fields?.[field.tag];
            // If the field doesn't exist in this series, it's incomplete
            if (fieldValue === undefined || !isFieldValueValid(fieldValue)) {
              incompleteFields.add(`${acquisition.id}-series-${seriesIndex}-${field.tag}`);
            }
          });
        }
      }
    });
    
    return incompleteFields;
  };

  const incompleteFields = getIncompleteFields();
  const hasIncompleteFields = incompleteFields.size > 0;

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadStatus('Preparing files...');

    try {
      // Convert FileList to file paths (mock)
      const filePaths = Array.from(files).map(file => file.name);
      
      setUploadStatus('Processing DICOM files...');
      setUploadProgress(50);
      
      // Analyze files using the API and get UI-formatted data
      const acquisitions = await dicompareAPI.analyzeFilesForUI(filePaths);
      
      // Convert to acquisition context format with validation rules
      const contextAcquisitions = acquisitions.map(acq => ({
        ...acq,
        acquisitionFields: acq.acquisitionFields.map(field => ({
          ...field,
          validationRule: { type: 'exact' as const }
        })),
        seriesFields: acq.seriesFields.map(field => ({
          ...field,
          value: field.values?.[0] || field.value,
          validationRule: { type: 'exact' as const }
        })),
        series: acq.series.map(series => ({
          name: series.name,
          fields: Object.fromEntries(
            Object.entries(series.fields).map(([tag, value]) => [
              tag,
              // If it's already an object with a value property, keep it
              (typeof value === 'object' && value !== null && 'value' in value) ? value : {
                value,
                dataType: typeof value === 'number' ? 'number' : 
                         Array.isArray(value) ? 'list_string' : 'string',
                validationRule: { type: 'exact' }
              }
            ])
          )
        }))
      }));
      
      setAcquisitions(contextAcquisitions);
      setUploadProgress(100);
      
      console.log('✅ Analysis complete');
      
    } catch (error) {
      console.error('❌ Upload failed:', error);
      setUploadStatus('Upload failed. Please try again.');
    } finally {
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        setUploadStatus('');
      }, 500);
    }
  }, [setAcquisitions]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFileUpload(e.dataTransfer.files);
  }, [handleFileUpload]);


  const loadExampleData = async () => {
    try {
      setIsUploading(true);
      setUploadStatus('Loading example data...');
      setUploadProgress(50);
      
      // Get example DICOM data from API in UI format
      const acquisitions = await dicompareAPI.getExampleDicomDataForUI();
      
      // Convert to acquisition context format with validation rules
      const contextAcquisitions = acquisitions.map(acq => ({
        ...acq,
        acquisitionFields: acq.acquisitionFields.map(field => ({
          ...field,
          validationRule: { type: 'exact' as const }
        })),
        seriesFields: acq.seriesFields.map(field => ({
          ...field,
          value: field.values?.[0] || field.value,
          validationRule: { type: 'exact' as const }
        })),
        series: acq.series.map(series => ({
          name: series.name,
          fields: Object.fromEntries(
            Object.entries(series.fields).map(([tag, value]) => [
              tag,
              // If it's already an object with a value property, keep it
              (typeof value === 'object' && value !== null && 'value' in value) ? value : {
                value,
                dataType: typeof value === 'number' ? 'number' : 
                         Array.isArray(value) ? 'list_string' : 'string',
                validationRule: { type: 'exact' }
              }
            ])
          )
        }))
      }));
      
      setAcquisitions(contextAcquisitions);
      setUploadProgress(100);
      
      console.log('✅ Example data loaded');
      
    } catch (error) {
      console.error('❌ Failed to load example data:', error);
      setUploadStatus('Failed to load example data. Please try again.');
    } finally {
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        setUploadStatus('');
      }, 500);
    }
  };

  const clearData = () => {
    setAcquisitions([]);
  };

  const handleContinue = () => {
    navigate('/generate-template/enter-metadata');
  };

  // Component to render upload card (consistent formatting for both empty and additional upload states)
  const renderUploadCard = (isAdditional: boolean = false) => (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm p-6">
      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-medical-400 transition-colors"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <Upload className="h-8 w-8 text-gray-400 mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-gray-900 mb-2">
          {isAdditional ? 'Upload More DICOMs' : 'Upload DICOM Files'}
        </h3>
        <p className="text-xs text-gray-600 mb-4">
          {isAdditional ? 'Add more DICOM files or folders' : 'Drag and drop DICOM files or folders here'}
        </p>
        
        <div className="space-y-3">
          <input
            type="file"
            multiple
            webkitdirectory=""
            className="hidden"
            id={isAdditional ? "file-upload-extra" : "file-upload"}
            onChange={(e) => handleFileUpload(e.target.files)}
          />
          <label
            htmlFor={isAdditional ? "file-upload-extra" : "file-upload"}
            className="inline-flex items-center justify-center w-full px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-medical-600 hover:bg-medical-700 cursor-pointer"
          >
            <Upload className="h-4 w-4 mr-2" />
            Browse Files
          </label>

          <button
            onClick={addNewAcquisition}
            className="inline-flex items-center justify-center w-full px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add New Acquisition
          </button>
        </div>

        {isUploading && (
          <div className="mt-4">
            <div className="flex items-center justify-center mb-2">
              <Loader2 className="h-4 w-4 animate-spin text-medical-600 mr-2" />
              <span className="text-sm font-medium text-gray-700">{uploadStatus}</span>
            </div>
            <div className="bg-gray-200 rounded-full h-2">
              <div 
                className="bg-medical-600 h-2 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {Math.round(uploadProgress)}% complete
            </p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Build Schema - Step 1</h2>
            <p className="text-gray-600">
              {acquisitions.length > 0 ? (
                'Review detected acquisitions and configure which DICOM fields to include in your validation template.'
              ) : (
                'Upload DICOM files to automatically extract metadata and create acquisition templates, or manually add acquisitions.'
              )}
            </p>
          </div>
          
          <div className="flex space-x-3">
            {acquisitions.length === 0 ? (
              <button
                onClick={loadExampleData}
                disabled={isUploading}
                className="inline-flex items-center px-4 py-2 border border-medical-600 text-medical-600 rounded-lg hover:bg-medical-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Database className="h-4 w-4 mr-2" />
                Load Example Data
              </button>
            ) : (
              <button
                onClick={clearData}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Clear Data
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Acquisitions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Show placeholder card when no acquisitions exist */}
        {acquisitions.length === 0 && renderUploadCard(false)}
        
        {/* Show existing acquisitions */}
        {acquisitions.map((acquisition) => (
          <AcquisitionTable
            key={acquisition.id}
            acquisition={acquisition}
            isEditMode={true}
            incompleteFields={incompleteFields}
            onUpdate={(field, value) => updateAcquisition(acquisition.id, { [field]: value })}
            onDelete={() => deleteAcquisition(acquisition.id)}
            onFieldUpdate={(fieldTag, updates) => updateField(acquisition.id, fieldTag, updates)}
            onFieldConvert={(fieldTag, toLevel) => convertFieldLevel(acquisition.id, fieldTag, toLevel)}
            onFieldDelete={(fieldTag) => deleteField(acquisition.id, fieldTag)}
            onFieldAdd={(fields) => addFields(acquisition.id, fields)}
            onSeriesUpdate={(seriesIndex, fieldTag, value) => updateSeries(acquisition.id, seriesIndex, fieldTag, value)}
            onSeriesAdd={() => addSeries(acquisition.id)}
            onSeriesDelete={(seriesIndex) => deleteSeries(acquisition.id, seriesIndex)}
            onSeriesNameUpdate={(seriesIndex, name) => updateSeriesName(acquisition.id, seriesIndex, name)}
          />
        ))}

        {/* Always show upload card for additional DICOMs/acquisitions */}
        {acquisitions.length > 0 && renderUploadCard(true)}
      </div>

      {/* Continue Button */}
      <div className="mt-8 flex flex-col items-end">
        {hasIncompleteFields && (
          <div className="mb-2 text-sm text-red-600 flex items-center">
            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Please complete all field values before continuing ({incompleteFields.size} incomplete)
          </div>
        )}
        <button
          onClick={handleContinue}
          disabled={acquisitions.length === 0 || hasIncompleteFields}
          className="px-6 py-3 bg-medical-600 text-white rounded-lg hover:bg-medical-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          Continue to Metadata
        </button>
      </div>
    </div>
  );
};

export default BuildSchema;