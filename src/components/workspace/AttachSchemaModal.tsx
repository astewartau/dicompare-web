import React from 'react';
import { X } from 'lucide-react';
import UnifiedSchemaSelector from '../schema/UnifiedSchemaSelector';
import { UnifiedSchema, SchemaBinding } from '../../hooks/useSchemaService';

interface AttachSchemaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (binding: SchemaBinding) => void;
  librarySchemas: UnifiedSchema[];
  uploadedSchemas: UnifiedSchema[];
  getSchemaContent: (schemaId: string) => Promise<string | null>;
  onSchemaReadmeClick?: (schemaId: string, schemaName: string) => void;
  onAcquisitionReadmeClick?: (schemaId: string, schemaName: string, acquisitionIndex: number) => void;
}

const AttachSchemaModal: React.FC<AttachSchemaModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  librarySchemas,
  uploadedSchemas,
  getSchemaContent,
  onSchemaReadmeClick,
  onAcquisitionReadmeClick
}) => {
  if (!isOpen) return null;

  const handleAcquisitionSelect = (schemaId: string, acquisitionIndex: number) => {
    // Find the schema
    const allSchemas = [...librarySchemas, ...uploadedSchemas];
    const schema = allSchemas.find(s => s.id === schemaId);

    if (schema) {
      const acquisition = schema.acquisitions[acquisitionIndex];
      const binding: SchemaBinding = {
        schemaId,
        acquisitionId: acquisitionIndex.toString(),
        acquisitionName: acquisition?.protocolName,
        schema
      };
      onSelect(binding);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-primary rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-content-primary">Attach Schema</h2>
            <p className="text-sm text-content-secondary mt-1">
              Select a schema acquisition to validate against
            </p>
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
            multiSelectMode={false}
            onAcquisitionSelect={handleAcquisitionSelect}
            expandable={true}
            getSchemaContent={getSchemaContent}
            onSchemaReadmeClick={onSchemaReadmeClick}
            onAcquisitionReadmeClick={onAcquisitionReadmeClick}
          />
        </div>
      </div>
    </div>
  );
};

export default AttachSchemaModal;
