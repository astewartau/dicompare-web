import React, { ReactNode } from 'react';
import { ProcessingProvider } from './ProcessingContext';
import { SchemaMetadataProvider } from './SchemaMetadataContext';
import { ItemManagementProvider } from './ItemManagementContext';
import { SchemaEditingProvider } from './SchemaEditingContext';
import { WorkspaceProvider } from './WorkspaceContext';

interface WorkspaceProvidersProps {
  children: ReactNode;
}

/**
 * Composite provider that wraps all workspace-related contexts.
 * Order matters: inner providers may depend on outer ones.
 *
 * Provider hierarchy:
 * - ProcessingProvider: File processing state (independent)
 * - SchemaMetadataProvider: Schema export metadata (independent)
 * - ItemManagementProvider: Items list and selection (independent)
 * - SchemaEditingProvider: Field/series/validation mutations (depends on ItemManagement)
 * - WorkspaceProvider: Cross-cutting operations (depends on all above)
 */
export const WorkspaceProviders: React.FC<WorkspaceProvidersProps> = ({ children }) => {
  return (
    <ProcessingProvider>
      <SchemaMetadataProvider>
        <ItemManagementProvider>
          <SchemaEditingProvider>
            <WorkspaceProvider>
              {children}
            </WorkspaceProvider>
          </SchemaEditingProvider>
        </ItemManagementProvider>
      </SchemaMetadataProvider>
    </ProcessingProvider>
  );
};
