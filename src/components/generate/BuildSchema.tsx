import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Plus } from 'lucide-react';
import { Acquisition, DicomField, Series } from '../../types';
import { mockAcquisitions } from '../../data/mockAcquisitions';
import AcquisitionTable from './AcquisitionTable';

const BuildSchema: React.FC = () => {
  const navigate = useNavigate();
  const [acquisitions, setAcquisitions] = useState<Acquisition[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files) return;

    setIsUploading(true);
    setUploadProgress(0);

    // Simulate file processing
    for (let i = 0; i < files.length; i++) {
      setUploadProgress((i + 1) / files.length * 100);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Use mock data to simulate processed acquisitions
    setAcquisitions(mockAcquisitions);
    setIsUploading(false);
    setUploadProgress(0);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFileUpload(e.dataTransfer.files);
  }, [handleFileUpload]);

  const addNewAcquisition = () => {
    const newAcquisition: Acquisition = {
      id: `acq_${Date.now()}`,
      protocolName: 'New Acquisition',
      seriesDescription: '',
      totalFiles: 0,
      acquisitionFields: [],
      seriesFields: [],
      series: [],
      metadata: {}
    };
    setAcquisitions([...acquisitions, newAcquisition]);
  };

  const updateAcquisition = (acquisitionId: string, field: keyof Acquisition, value: any) => {
    setAcquisitions(prev => prev.map(acq => 
      acq.id === acquisitionId ? { ...acq, [field]: value } : acq
    ));
  };

  const deleteAcquisition = (acquisitionId: string) => {
    setAcquisitions(prev => prev.filter(acq => acq.id !== acquisitionId));
  };

  const updateField = (acquisitionId: string, fieldTag: string, updates: Partial<DicomField>) => {
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;
      
      return {
        ...acq,
        acquisitionFields: acq.acquisitionFields.map(f => 
          f.tag === fieldTag ? { ...f, ...updates } : f
        ),
        seriesFields: acq.seriesFields.map(f => 
          f.tag === fieldTag ? { ...f, ...updates } : f
        ),
      };
    }));
  };

  const convertFieldLevel = (acquisitionId: string, fieldTag: string, toLevel: 'acquisition' | 'series') => {
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;
      
      const acquisitionField = acq.acquisitionFields.find(f => f.tag === fieldTag);
      const seriesField = acq.seriesFields.find(f => f.tag === fieldTag);
      const field = acquisitionField || seriesField;
      
      if (!field) return acq;
      
      if (toLevel === 'acquisition') {
        return {
          ...acq,
          acquisitionFields: [...acq.acquisitionFields.filter(f => f.tag !== fieldTag), { ...field, level: 'acquisition' }],
          seriesFields: acq.seriesFields.filter(f => f.tag !== fieldTag)
        };
      } else {
        // When converting to series level, ensure we have at least 2 series and populate them with the acquisition field's value
        const currentSeries = acq.series || [];
        const seriesCount = Math.max(2, currentSeries.length);
        
        const updatedSeries = [];
        for (let i = 0; i < seriesCount; i++) {
          const existingSeries = currentSeries[i];
          updatedSeries.push({
            name: existingSeries?.name || `Series ${i + 1}`,
            fields: {
              ...(existingSeries?.fields || {}),
              [fieldTag]: {
                value: field.value,
                dataType: field.dataType,
                validationRule: field.validationRule,
              }
            }
          });
        }

        return {
          ...acq,
          seriesFields: [...acq.seriesFields.filter(f => f.tag !== fieldTag), { ...field, level: 'series' }],
          acquisitionFields: acq.acquisitionFields.filter(f => f.tag !== fieldTag),
          series: updatedSeries
        };
      }
    }));
  };

  const deleteField = (acquisitionId: string, fieldTag: string) => {
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;
      
      return {
        ...acq,
        acquisitionFields: acq.acquisitionFields.filter(f => f.tag !== fieldTag),
        seriesFields: acq.seriesFields.filter(f => f.tag !== fieldTag)
      };
    }));
  };

  const addFields = async (acquisitionId: string, fieldTags: string[]) => {
    if (fieldTags.length === 0) return;
    
    const { getFieldByTag, suggestDataType, suggestValidationConstraint } = await import('../../services/dicomFieldService');
    
    // Process each field tag to get enhanced field data
    const newFieldsPromises = fieldTags.map(async tag => {
      try {
        const fieldDef = await getFieldByTag(tag);
        const vr = fieldDef?.vr || 'UN';
        const name = fieldDef?.keyword || fieldDef?.name || tag;
        const dataType = suggestDataType(vr, fieldDef?.valueMultiplicity);
        const validationRule = fieldDef ? {
          type: suggestValidationConstraint(fieldDef)
        } : { type: 'exact' as const };
        
        return {
          tag,
          name,
          value: '',
          vr,
          level: 'acquisition' as const,
          dataType,
          validationRule
        };
      } catch (error) {
        // Fallback if field lookup fails
        return {
          tag,
          name: tag,
          value: '',
          vr: 'UN',
          level: 'acquisition' as const,
          dataType: 'string' as const,
          validationRule: { type: 'exact' as const }
        };
      }
    });
    
    const newFields = await Promise.all(newFieldsPromises);
    
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;
      
      return {
        ...acq,
        acquisitionFields: [...acq.acquisitionFields, ...newFields]
      };
    }));
  };

  const updateSeries = (acquisitionId: string, seriesIndex: number, fieldTag: string, value: any) => {
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;
      
      const updatedSeries = [...(acq.series || [])];
      if (!updatedSeries[seriesIndex]) {
        updatedSeries[seriesIndex] = { name: `Series ${seriesIndex + 1}`, fields: {} };
      }
      
      updatedSeries[seriesIndex] = {
        ...updatedSeries[seriesIndex],
        fields: {
          ...updatedSeries[seriesIndex].fields,
          [fieldTag]: value
        }
      };
      
      return { ...acq, series: updatedSeries };
    }));
  };

  const addSeries = (acquisitionId: string) => {
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;
      
      const currentSeries = acq.series || [];
      const newSeries: Series = {
        name: `Series ${currentSeries.length + 1}`,
        fields: {}
      };
      
      return { ...acq, series: [...currentSeries, newSeries] };
    }));
  };

  const deleteSeries = (acquisitionId: string, seriesIndex: number) => {
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;
      
      const updatedSeries = [...(acq.series || [])];
      updatedSeries.splice(seriesIndex, 1);
      
      return { ...acq, series: updatedSeries };
    }));
  };

  const updateSeriesName = (acquisitionId: string, seriesIndex: number, name: string) => {
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;
      
      const updatedSeries = [...(acq.series || [])];
      if (updatedSeries[seriesIndex]) {
        updatedSeries[seriesIndex] = {
          ...updatedSeries[seriesIndex],
          name
        };
      }
      
      return { ...acq, series: updatedSeries };
    }));
  };

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
              <div className="bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-medical-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-sm text-gray-600 mt-2">Processing files... {Math.round(uploadProgress)}%</p>
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
            onUpdate={(field, value) => updateAcquisition(acquisition.id, field, value)}
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