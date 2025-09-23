import React, { MouseEvent, Suspense, lazy } from 'react';
import { SchemaTemplate } from '../../types/schema';
import { useSchemaService } from '../../hooks/useSchemaService';

/**
 * @deprecated Use SchemaSelector component directly for new code.
 * This component is kept for backward compatibility.
 */
interface SchemaSelectionCardProps {
  schemas: SchemaTemplate[];
  selectedSchemaId?: string | null;
  onSchemaSelect: (schemaId: string, acquisitionId?: string) => void;
  onSchemaDelete: (schemaId: string, event: MouseEvent) => void;
  onSchemaUpload?: (file: File) => void;
  getSchemaContent?: (schemaId: string) => Promise<string | null>;
  title?: string;
  emptyMessage?: string;
}

const SchemaSelectionCard: React.FC<SchemaSelectionCardProps> = ({
  schemas,
  selectedSchemaId,
  onSchemaSelect,
  onSchemaDelete,
  onSchemaUpload,
  getSchemaContent, // Legacy prop - ignored in favor of useSchemaService
  title = "Select Validation Schema",
  emptyMessage = "No templates available. Upload a template to get started."
}) => {
  // Use the unified schema service instead of props
  const { librarySchemas, uploadedSchemas } = useSchemaService();

  // For backward compatibility, if schemas are passed via props and our service is empty,
  // we should fall back to a simple display (this shouldn't happen in practice)
  const effectiveLibrarySchemas = librarySchemas.length > 0 ? librarySchemas :
    schemas.filter(s => s.category === 'Library').map(s => ({
      ...s,
      acquisitions: [],
      isMultiAcquisition: false
    }));

  const effectiveUploadedSchemas = uploadedSchemas.length > 0 ? uploadedSchemas :
    schemas.filter(s => s.category === 'Uploaded Schema').map(s => ({
      ...s,
      acquisitions: [],
      isMultiAcquisition: false
    }));

  // Import SchemaSelector dynamically to avoid circular import
  const SchemaSelector = lazy(() => import('../schema/SchemaSelector'));

  return (
    <Suspense fallback={<div className="p-4 text-center text-gray-500">Loading...</div>}>
      <SchemaSelector
        librarySchemas={effectiveLibrarySchemas}
        uploadedSchemas={effectiveUploadedSchemas}
        selectedSchemaId={selectedSchemaId}
        onSchemaSelect={onSchemaSelect}
        onSchemaDelete={onSchemaDelete}
        onSchemaUpload={onSchemaUpload}
        title={title}
      />
    </Suspense>
  );
};

export default SchemaSelectionCard;