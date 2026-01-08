import React from 'react';
import { X } from 'lucide-react';
import UnifiedSchemaSelector from '../schema/UnifiedSchemaSelector';
import { UnifiedSchema, AcquisitionSelection } from '../../types';

interface SchemaSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  librarySchemas: UnifiedSchema[];
  uploadedSchemas: UnifiedSchema[];
  getSchemaContent: (schemaId: string) => Promise<string | null>;
  onSchemaUpload: (file: File) => Promise<void>;
  onSchemaReadmeClick: (schemaId: string, schemaName: string) => void;
  onAcquisitionReadmeClick: (schemaId: string, schemaName: string, acquisitionIndex: number, acquisitionName: string) => void;
  // Single select mode
  onAcquisitionSelect?: (schemaId: string, acquisitionId: number) => void;
  // Multi select mode
  multiSelectMode?: boolean;
  selectedAcquisitions?: AcquisitionSelection[];
  onAcquisitionToggle?: (selection: AcquisitionSelection) => void;
  // Footer for multi-select mode
  footer?: React.ReactNode;
}

const SchemaSelectionModal: React.FC<SchemaSelectionModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  librarySchemas,
  uploadedSchemas,
  getSchemaContent,
  onSchemaUpload,
  onSchemaReadmeClick,
  onAcquisitionReadmeClick,
  onAcquisitionSelect,
  multiSelectMode = false,
  selectedAcquisitions = [],
  onAcquisitionToggle,
  footer,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-primary rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-content-primary">{title}</h2>
            <p className="text-sm text-content-secondary mt-1">{description}</p>
          </div>
          <button
            onClick={onClose}
            className="text-content-muted hover:text-content-secondary"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          <UnifiedSchemaSelector
            librarySchemas={librarySchemas}
            uploadedSchemas={uploadedSchemas}
            selectionMode="acquisition"
            multiSelectMode={multiSelectMode}
            selectedAcquisitions={multiSelectMode ? selectedAcquisitions : undefined}
            onAcquisitionSelect={!multiSelectMode ? onAcquisitionSelect : undefined}
            onAcquisitionToggle={multiSelectMode ? onAcquisitionToggle : undefined}
            onSchemaUpload={onSchemaUpload}
            expandable={true}
            getSchemaContent={getSchemaContent}
            onSchemaReadmeClick={onSchemaReadmeClick}
            onAcquisitionReadmeClick={onAcquisitionReadmeClick}
          />
        </div>

        {/* Optional Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-border">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default SchemaSelectionModal;
