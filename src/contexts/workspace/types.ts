/**
 * Workspace context type definitions.
 * Extracted from WorkspaceContext.tsx for cleaner imports.
 */

import { Acquisition } from '../../types';
import { SchemaBinding } from '../../hooks/useSchemaService';

// Core workspace item model
export interface WorkspaceItem {
  id: string;
  acquisition: Acquisition;
  source: 'schema' | 'data' | 'empty';  // 'empty' = created without initial content
  isEditing: boolean;

  // For data-sourced items: how should the data be used?
  // - 'schema-template': Use extracted parameters to build a schema (can edit)
  // - 'validation-subject': Validate this data against a schema (attach schema)
  dataUsageMode?: 'schema-template' | 'validation-subject';

  // For compliance - one of these may be set
  attachedData?: Acquisition;         // Real DICOM data (when item has schema)
  attachedSchema?: SchemaBinding;     // Schema to validate against (when item has data)

  // Does this item have a user-created schema? (for empty items that got a schema created)
  hasCreatedSchema?: boolean;

  // Track origin for schema-sourced items
  schemaOrigin?: {
    schemaId: string;
    acquisitionIndex: number;
    schemaName: string;
    acquisitionName: string;
  };

  // User notes about test data (for print report only, not exported to schema)
  testDataNotes?: string;
}

// Schema metadata for export
export interface SchemaMetadata {
  name: string;
  description: string;
  authors: string[];
  version: string;
  tags?: string[];
}

// Processing progress
export interface ProcessingProgress {
  currentFile: number;
  totalFiles: number;
  currentOperation: string;
  percentage: number;
}

// Pending attachment selection (when multiple acquisitions found)
export interface PendingAttachmentSelection {
  targetItemId: string;
  acquisitions: Acquisition[];
}

// Default schema metadata
export const DEFAULT_SCHEMA_METADATA: SchemaMetadata = {
  name: '',
  description: '',
  authors: [],
  version: '1.0',
};
