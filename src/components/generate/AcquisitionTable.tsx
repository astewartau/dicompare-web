import React, { useState } from 'react';
import { Edit2, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Acquisition, DicomField } from '../../types';
import FieldTable from './FieldTable';
import SeriesTable from './SeriesTable';
import DicomFieldSelector from '../common/DicomFieldSelector';

interface AcquisitionTableProps {
  acquisition: Acquisition;
  isEditMode: boolean;
  onUpdate: (field: keyof Acquisition, value: any) => void;
  onDelete: () => void;
  onFieldUpdate: (fieldTag: string, updates: Partial<DicomField>) => void;
  onFieldConvert: (fieldTag: string, toLevel: 'acquisition' | 'series') => void;
  onFieldDelete: (fieldTag: string) => void;
  onFieldAdd: (fields: string[]) => void;
  onSeriesUpdate: (seriesIndex: number, fieldTag: string, value: any) => void;
  onSeriesAdd: () => void;
  onSeriesDelete: (seriesIndex: number) => void;
  onSeriesNameUpdate: (seriesIndex: number, name: string) => void;
}

const AcquisitionTable: React.FC<AcquisitionTableProps> = ({
  acquisition,
  isEditMode,
  onUpdate,
  onDelete,
  onFieldUpdate,
  onFieldConvert,
  onFieldDelete,
  onFieldAdd,
  onSeriesUpdate,
  onSeriesAdd,
  onSeriesDelete,
  onSeriesNameUpdate,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const hasSeriesFields = acquisition.seriesFields && acquisition.seriesFields.length > 0;

  return (
    <div className="border border-gray-300 rounded-lg bg-white shadow-sm">
      {/* Header Bar */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            {isEditMode ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={acquisition.protocolName}
                  onChange={(e) => onUpdate('protocolName', e.target.value)}
                  className="text-lg font-semibold text-gray-900 bg-white border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-medical-500"
                  placeholder="Acquisition Name"
                />
                <input
                  type="text"
                  value={acquisition.seriesDescription}
                  onChange={(e) => onUpdate('seriesDescription', e.target.value)}
                  className="text-sm text-gray-600 bg-white border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-medical-500"
                  placeholder="Description"
                />
              </div>
            ) : (
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{acquisition.protocolName}</h3>
                <p className="text-sm text-gray-600">{acquisition.seriesDescription}</p>
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            {acquisition.totalFiles > 0 && (
              <span className="text-sm text-gray-500">
                {acquisition.totalFiles} files • {acquisition.acquisitionFields.length} constant fields
                {hasSeriesFields && ` • ${acquisition.seriesFields.length} varying fields`}
              </span>
            )}
            
            {isEditMode && (
              <button
                onClick={onDelete}
                className="p-1.5 text-gray-600 hover:text-red-600 transition-colors"
                title="Delete acquisition"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 text-gray-600 hover:text-gray-800 transition-colors"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Body Content */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Acquisition-Level Fields */}
          <div>
            {/* Always visible field selector */}
            {isEditMode && (
              <div className="mb-3">
                <DicomFieldSelector
                  selectedFields={[]}
                  onFieldsChange={(fields) => onFieldAdd(fields)}
                  placeholder="Search and add DICOM fields..."
                  className="w-full"
                />
              </div>
            )}
            
            <FieldTable
              fields={acquisition.acquisitionFields}
              isEditMode={isEditMode}
              onFieldUpdate={onFieldUpdate}
              onFieldConvert={(fieldTag) => onFieldConvert(fieldTag, 'series')}
              onFieldDelete={onFieldDelete}
            />
          </div>

          {/* Series-Level Fields */}
          {hasSeriesFields && (
            <div>
              <SeriesTable
                seriesFields={acquisition.seriesFields}
                series={acquisition.series || []}
                isEditMode={isEditMode}
                onSeriesUpdate={onSeriesUpdate}
                onSeriesAdd={onSeriesAdd}
                onSeriesDelete={onSeriesDelete}
                onFieldConvert={(fieldTag) => onFieldConvert(fieldTag, 'acquisition')}
                onSeriesNameUpdate={onSeriesNameUpdate}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AcquisitionTable;