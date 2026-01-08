import React, { useState, useEffect } from 'react';
import { FileText, Image, X, GripVertical } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Acquisition, AcquisitionSelection } from '../../types';
import { SchemaBinding } from '../../hooks/useSchemaService';
import AcquisitionTable from '../schema/AcquisitionTable';

// Unified sidebar item type for drag-and-drop
export interface SidebarItem {
  id: string;
  type: 'schema-first' | 'data';
  data: AcquisitionSelection | Acquisition;
}

// Schema acquisition display component with memoization
export const SchemaAcquisitionDisplay = React.memo<{
  binding: SchemaBinding;
  realAcquisition?: Acquisition;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onDeselect?: () => void;
  isDataProcessing?: boolean;
  hideHeader?: boolean;
  getSchemaContent: (schemaId: string) => Promise<string | null>;
  getSchemaAcquisition: (binding: SchemaBinding) => Promise<Acquisition | null>;
}>(({ binding, realAcquisition, isCollapsed, onToggleCollapse, onDeselect, isDataProcessing, hideHeader, getSchemaContent, getSchemaAcquisition }) => {
  const [schemaAcquisition, setSchemaAcquisition] = useState<Acquisition | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Skip loading during data processing to prevent interference
    if (isDataProcessing) {
      return;
    }

    // Check if we already have the RIGHT acquisition loaded (matching current binding)
    const expectedId = `schema-${binding.schemaId}-${binding.acquisitionId || 'default'}`;
    if (schemaAcquisition && schemaAcquisition.id === expectedId) {
      setIsLoading(false);
      return;
    }

    const loadSchema = async () => {
      setIsLoading(true);
      // Clear previous acquisition when loading a new one
      setSchemaAcquisition(null);
      try {
        const acquisition = await getSchemaAcquisition(binding);
        setSchemaAcquisition(acquisition);
      } catch (error) {
        console.error('Failed to load schema:', error);
        setSchemaAcquisition(null);
      }
      setIsLoading(false);
    };

    loadSchema();
  }, [binding.schemaId, binding.acquisitionId]);

  // If we have a schema, ALWAYS show it regardless of any other state
  if (schemaAcquisition) {
    return (
      <AcquisitionTable
        acquisition={schemaAcquisition}
        isEditMode={false}
        mode="compliance"
        realAcquisition={realAcquisition}
        isDataProcessing={isDataProcessing}
        schemaId={binding.schemaId}
        schemaAcquisitionId={binding.acquisitionId}
        getSchemaContent={getSchemaContent}
        title={binding.schema.name}
        version={binding.schema.version}
        authors={binding.schema.authors}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
        onDeselect={onDeselect}
        hideHeader={hideHeader}
        // Disabled handlers for compliance mode
        onUpdate={() => {}}
        onDelete={() => {}}
        onFieldUpdate={() => {}}
        onFieldConvert={() => {}}
        onFieldDelete={() => {}}
        onFieldAdd={() => {}}
        onSeriesUpdate={() => {}}
        onSeriesAdd={() => {}}
        onSeriesDelete={() => {}}
        onSeriesNameUpdate={() => {}}
      />
    );
  }

  // Only show loading when we don't have schema and we're not processing
  if (isLoading && !isDataProcessing) {
    return (
      <div className="border border-border-secondary rounded-lg bg-surface-primary shadow-sm h-fit p-4 text-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600 mx-auto mb-2"></div>
        <span className="text-sm text-content-secondary">Loading schema...</span>
      </div>
    );
  }

  // Error state when not processing
  if (!isDataProcessing) {
    return (
      <div className="border border-border-secondary rounded-lg bg-surface-primary shadow-sm h-fit p-4 text-center">
        <span className="text-sm text-status-error">Failed to load schema</span>
      </div>
    );
  }

  // During processing without schema - minimal loading
  return (
    <div className="border border-border-secondary rounded-lg bg-surface-primary shadow-sm h-fit p-4 text-center">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600 mx-auto mb-2"></div>
      <span className="text-sm text-content-secondary">Loading schema...</span>
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if meaningful props have changed
  // Completely ignore isDataProcessing, callback functions to prevent re-renders
  const bindingChanged = (
    prevProps.binding.schemaId !== nextProps.binding.schemaId ||
    prevProps.binding.acquisitionId !== nextProps.binding.acquisitionId
  );
  const realAcquisitionChanged = prevProps.realAcquisition?.id !== nextProps.realAcquisition?.id;
  const collapsedChanged = prevProps.isCollapsed !== nextProps.isCollapsed;

  // Only re-render if binding, realAcquisition, or collapsed state actually changed
  return !bindingChanged && !realAcquisitionChanged && !collapsedChanged;
});

// Sortable sidebar item component
export const SortableAcquisitionItem: React.FC<{
  item: SidebarItem;
  isSelected: boolean;
  linkedData?: Acquisition;
  pairing?: SchemaBinding | null;
  onSelect: () => void;
  onRemove?: () => void;
}> = ({ item, isSelected, linkedData, pairing, onSelect, onRemove }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  if (item.type === 'schema-first') {
    const selection = item.data as AcquisitionSelection;
    return (
      <div
        ref={setNodeRef}
        style={style}
        onClick={onSelect}
        className={`border rounded-lg p-4 cursor-pointer transition-all ${
          isSelected
            ? 'border-brand-500 bg-brand-50 shadow-md'
            : 'border-border hover:border-border-secondary hover:bg-surface-secondary'
        }`}
      >
        <div className="flex items-start">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing touch-none"
          >
            <GripVertical className="h-4 w-4 text-content-muted mt-0.5 mr-2 flex-shrink-0" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <FileText className="h-4 w-4 text-content-tertiary flex-shrink-0" />
              <h3 className="text-sm font-medium text-content-primary truncate">
                {selection.acquisitionName}
              </h3>
            </div>
            <p className="text-xs text-content-secondary mt-1 truncate">
              {selection.schemaName}
            </p>
            <div className="flex items-center mt-2 text-xs space-x-3">
              {linkedData ? (
                <span className="text-brand-600 flex items-center">
                  <Image className="h-3 w-3 mr-1" />
                  Data loaded
                </span>
              ) : (
                <span className="text-status-warning flex items-center">
                  <Image className="h-3 w-3 mr-1" />
                  No data
                </span>
              )}
              <span className="text-brand-600 flex items-center">
                <FileText className="h-3 w-3 mr-1" />
                Schema loaded
              </span>
            </div>
          </div>
          {onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="p-1 text-content-tertiary hover:text-status-error rounded ml-2"
              title="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Data acquisition item
  const acquisition = item.data as Acquisition;
  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`border rounded-lg p-4 cursor-pointer transition-all ${
        isSelected
          ? 'border-brand-500 bg-brand-50 shadow-md'
          : 'border-border hover:border-border-secondary hover:bg-surface-secondary'
      }`}
    >
      <div className="flex items-start">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="h-4 w-4 text-content-muted mt-0.5 mr-2 flex-shrink-0" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <FileText className="h-4 w-4 text-content-tertiary flex-shrink-0" />
            <h3 className="text-sm font-medium text-content-primary truncate">
              {acquisition.protocolName || 'Untitled Acquisition'}
            </h3>
          </div>
          <p className="text-xs text-content-secondary mt-1 truncate">
            {acquisition.seriesDescription || 'No description'}
          </p>
          <div className="flex items-center mt-2 text-xs space-x-3">
            <span className="text-brand-600 flex items-center">
              <Image className="h-3 w-3 mr-1" />
              Data loaded
            </span>
            {pairing ? (
              <span className="text-brand-600 flex items-center">
                <FileText className="h-3 w-3 mr-1" />
                Schema loaded
              </span>
            ) : (
              <span className="text-status-warning flex items-center">
                <FileText className="h-3 w-3 mr-1" />
                No schema
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Droppable zone for receiving new items from schema browser
export const DroppableZone: React.FC<{ children: React.ReactNode; isOver: boolean }> = ({ children, isOver }) => {
  const { setNodeRef } = useDroppable({ id: 'sidebar-drop-zone' });

  return (
    <div
      ref={setNodeRef}
      className={`p-2 space-y-2 max-h-[800px] overflow-y-auto transition-colors ${
        isOver ? 'bg-brand-50 dark:bg-brand-900/20' : ''
      }`}
    >
      {children}
      {isOver && (
        <div className="p-3 text-center text-brand-600 text-sm border-2 border-dashed border-brand-500 rounded-lg bg-brand-50 dark:bg-brand-900/30">
          Drop to add
        </div>
      )}
    </div>
  );
};
