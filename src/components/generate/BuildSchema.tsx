import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Plus, Loader2 } from 'lucide-react';
import { dicompareAPI, type AnalysisResult } from '../../services/DicompareAPI';
import { useAcquisitions } from '../../hooks/useAcquisitions';
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

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadStatus('Preparing files...');

    try {
      // Convert FileList to file paths (mock)
      const filePaths = Array.from(files).map(file => file.name);
      
      setUploadStatus('Initializing analysis engine...');
      setUploadProgress(20);
      
      // This will lazy-load Pyodide on first use
      if (!dicompareAPI.isInitialized()) {
        setUploadStatus('Loading Python environment (this may take a moment)...');
      }
      
      setUploadProgress(40);
      
      // Simulate file processing
      setUploadStatus('Processing DICOM files...');
      await dicompareAPI.simulateFileProcessing(files.length);
      setUploadProgress(70);
      
      // Analyze files using the API
      setUploadStatus('Analyzing acquisitions...');
      const analysisResult: AnalysisResult = await dicompareAPI.analyzeFiles(filePaths);
      setUploadProgress(90);
      
      // Convert API result to internal format
      setUploadStatus('Finalizing...');
      const acquisitions = analysisResult.acquisitions.map(acq => ({
        id: acq.id,
        protocolName: acq.protocol_name,
        seriesDescription: acq.series_description,
        totalFiles: acq.total_files,
        acquisitionFields: acq.acquisition_fields.map(field => ({
          tag: field.tag,
          name: field.name,
          value: field.value,
          vr: field.vr,
          level: field.level,
          dataType: field.data_type,
          validationRule: { type: 'exact' as const }
        })),
        seriesFields: acq.series_fields.map(field => ({
          tag: field.tag,
          name: field.name,
          value: field.values?.[0] || field.value,
          vr: field.vr,
          level: field.level,
          dataType: field.data_type,
          validationRule: { type: 'exact' as const }
        })),
        series: acq.series.map(series => ({
          name: series.name,
          fields: Object.fromEntries(
            Object.entries(series.field_values).map(([tag, value]) => [
              tag,
              typeof value === 'object' ? value : {
                value,
                dataType: typeof value === 'number' ? 'number' : 
                         Array.isArray(value) ? 'list_string' : 'string',
                validationRule: { type: 'exact' }
              }
            ])
          )
        })),
        metadata: acq.metadata
      }));
      
      setAcquisitions(acquisitions);
      setUploadProgress(100);
      
      console.log('✅ Analysis complete:', analysisResult.summary);
      
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


  const handleContinue = () => {
    navigate('/generate-template/enter-metadata');
  };

  if (acquisitions.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Build Schema - Step 1</h2>
          <p className="text-gray-600">
            Upload DICOM files to automatically extract metadata and create acquisition templates. 
            You can also manually add acquisitions if needed.
          </p>
        </div>

        {/* Upload Area */}
        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-medical-400 transition-colors"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <Upload className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Upload DICOM Files</h3>
          <p className="text-gray-600 mb-6">
            Drag and drop DICOM files or folders here, or click to browse
          </p>
          
          <input
            type="file"
            multiple
            webkitdirectory=""
            className="hidden"
            id="file-upload"
            onChange={(e) => handleFileUpload(e.target.files)}
          />
          <label
            htmlFor="file-upload"
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-medical-600 hover:bg-medical-700 cursor-pointer"
          >
            <Upload className="h-5 w-5 mr-2" />
            Browse Files
          </label>

          {isUploading && (
            <div className="mt-6">
              <div className="flex items-center mb-2">
                <Loader2 className="h-4 w-4 animate-spin text-medical-600 mr-2" />
                <span className="text-sm font-medium text-gray-700">{uploadStatus}</span>
              </div>
              <div className="bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-medical-600 h-3 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {Math.round(uploadProgress)}% complete
                {uploadProgress >= 40 && uploadProgress < 70 && !dicompareAPI.isInitialized() && 
                  " • First-time setup may take up to 30 seconds"
                }
              </p>
            </div>
          )}
        </div>

        {/* Manual Add Option */}
        <div className="mt-8 text-center">
          <p className="text-gray-600 mb-4">Or create an acquisition manually</p>
          <button
            onClick={addNewAcquisition}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add New Acquisition
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Build Schema - Step 1</h2>
        <p className="text-gray-600">
          Review detected acquisitions and configure which DICOM fields to include in your validation template.
        </p>
      </div>

      {/* Acquisitions List */}
      <div className="space-y-4">
        {acquisitions.map((acquisition) => (
          <AcquisitionTable
            key={acquisition.id}
            acquisition={acquisition}
            isEditMode={true}
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
      </div>

      {/* Add New Acquisition Button */}
      <div className="mt-6">
        <button
          onClick={addNewAcquisition}
          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add New Acquisition
        </button>
      </div>

      {/* Continue Button */}
      <div className="mt-8 flex justify-end">
        <button
          onClick={handleContinue}
          disabled={acquisitions.length === 0}
          className="px-6 py-3 bg-medical-600 text-white rounded-lg hover:bg-medical-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          Continue to Metadata
        </button>
      </div>
    </div>
  );
};

export default BuildSchema;