import React, { useState } from 'react';
import { Plus, FileText, FlaskConical, X, GripVertical, Pencil, Trash2 } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { WorkspaceItem, SchemaMetadata } from '../../contexts/WorkspaceContext';
import { getItemFlags } from '../../utils/workspaceHelpers';

interface WorkspaceSidebarProps {
  items: WorkspaceItem[];
  selectedId: string | null;
  isOverDropZone: boolean;
  schemaMetadata: SchemaMetadata;
  onSelect: (id: string | null) => void;
  onRemove: (id: string) => void;
  onReset: () => void;
}

const ADD_NEW_ID = '__add_new__';
export const SCHEMA_INFO_ID = '__schema_info__';

// Sortable workspace item
const SortableWorkspaceItem: React.FC<{
  item: WorkspaceItem;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}> = ({ item, isSelected, onSelect, onRemove }) => {
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

  // Use shared helper for derived state
  const { hasSchema, hasData } = getItemFlags(item);

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`border rounded-lg p-3 cursor-pointer transition-all ${
        isSelected
          ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 shadow-md'
          : 'border-border hover:border-brand-300 dark:hover:border-brand-700 hover:bg-surface-secondary'
      }`}
    >
      <div className="flex items-start">
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none mr-2"
        >
          <GripVertical className="h-4 w-4 text-content-muted mt-0.5 flex-shrink-0" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <FileText className="h-4 w-4 text-content-tertiary flex-shrink-0" />
            <h3 className="text-sm font-medium text-content-primary truncate">
              {item.acquisition.protocolName || 'Untitled'}
            </h3>
          </div>


          {/* Status indicators */}
          <div className="flex items-center mt-2 text-xs space-x-3">
            {hasSchema ? (
              <span className="text-brand-600 dark:text-brand-400 flex items-center">
                <FileText className="h-3 w-3 mr-1" />
                Schema
              </span>
            ) : (
              <span className="text-content-muted flex items-center">
                <FileText className="h-3 w-3 mr-1" />
                No schema
              </span>
            )}
            {hasData ? (
              <span className="text-brand-600 dark:text-brand-400 flex items-center">
                <FlaskConical className="h-3 w-3 mr-1" />
                Data
              </span>
            ) : (
              <span className="text-content-muted flex items-center">
                <FlaskConical className="h-3 w-3 mr-1" />
                No data
              </span>
            )}
          </div>
        </div>

        {/* Remove button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="p-1 text-content-tertiary hover:text-status-error rounded ml-1"
          title="Remove"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  items,
  selectedId,
  isOverDropZone,
  schemaMetadata,
  onSelect,
  onRemove,
  onReset
}) => {
  const { setNodeRef } = useDroppable({ id: 'sidebar-drop-zone' });
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const isAddNewSelected = selectedId === ADD_NEW_ID || !selectedId;
  const isSchemaInfoSelected = selectedId === SCHEMA_INFO_ID;

  // Determine if schema has a name set
  const hasSchemaName = schemaMetadata.name && schemaMetadata.name.trim() !== '';
  const displayTitle = hasSchemaName ? schemaMetadata.name : 'Acquisitions';

  // Check if there's anything to reset
  const hasContent = items.length > 0 || hasSchemaName || schemaMetadata.authors?.length > 0 || schemaMetadata.description;

  const handleReset = () => {
    onReset();
    setShowResetConfirm(false);
  };

  return (
    <div
      ref={setNodeRef}
      className={`bg-surface-primary rounded-lg border shadow-sm transition-colors ${
        isOverDropZone ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-900/10' : 'border-border'
      }`}
    >
      {/* Header - Shows schema name or "Acquisitions" as placeholder */}
      <div
        className={`px-4 py-3 border-b transition-colors cursor-pointer ${
          isSchemaInfoSelected
            ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
            : 'border-border hover:bg-surface-secondary'
        }`}
        onClick={() => onSelect(SCHEMA_INFO_ID)}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h3 className={`text-lg font-medium truncate ${
              hasSchemaName ? 'text-content-primary' : 'text-content-tertiary'
            }`}>
              {displayTitle}
            </h3>
            <p className="text-sm text-content-secondary">
              {items.length === 0 ? 'Add acquisitions to begin' : `${items.length} acquisition${items.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (hasContent) {
                  setShowResetConfirm(true);
                }
              }}
              disabled={!hasContent}
              className={`p-1.5 rounded transition-colors ${
                hasContent
                  ? 'text-content-tertiary hover:text-status-error hover:bg-red-50 dark:hover:bg-red-900/20'
                  : 'text-content-muted cursor-not-allowed opacity-40'
              }`}
              title="Reset workspace"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              className={`p-1.5 rounded transition-colors ${
                isSchemaInfoSelected
                  ? 'text-brand-600 bg-brand-100 dark:bg-brand-800/30'
                  : 'text-content-tertiary hover:text-content-secondary hover:bg-surface-tertiary'
              }`}
              title="Edit schema metadata"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-surface-primary rounded-lg shadow-xl max-w-sm w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-content-primary">Reset Workspace</h3>
            </div>
            <p className="text-content-secondary mb-6">
              This will clear all acquisitions and schema metadata. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-border-secondary text-content-secondary hover:bg-surface-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-2 space-y-2 max-h-[700px] overflow-y-auto">
        {/* Add New Item */}
        <div
          onClick={() => onSelect(ADD_NEW_ID)}
          className={`border rounded-lg p-3 cursor-pointer transition-all ${
            isAddNewSelected
              ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 shadow-md'
              : 'border-dashed border-border-secondary hover:border-brand-300 dark:hover:border-brand-700 hover:bg-surface-secondary'
          }`}
        >
          <div className="flex items-center space-x-2">
            <Plus className="h-4 w-4 text-brand-500 flex-shrink-0" />
            <h3 className="text-sm font-medium text-content-primary">
              Add acquisitions
            </h3>
          </div>
        </div>

        {/* Drop zone indicator */}
        {isOverDropZone && items.length === 0 && (
          <div className="p-3 text-center text-brand-600 dark:text-brand-400 text-sm border-2 border-dashed border-brand-500 rounded-lg bg-brand-50 dark:bg-brand-900/30">
            Drop to add
          </div>
        )}

        {/* Sortable items */}
        <SortableContext
          items={items.map(item => item.id)}
          strategy={verticalListSortingStrategy}
        >
          {items.map(item => (
            <SortableWorkspaceItem
              key={item.id}
              item={item}
              isSelected={selectedId === item.id}
              onSelect={() => onSelect(item.id)}
              onRemove={() => onRemove(item.id)}
            />
          ))}
        </SortableContext>

        {/* Drop zone indicator when items exist */}
        {isOverDropZone && items.length > 0 && (
          <div className="p-3 text-center text-brand-600 dark:text-brand-400 text-sm border-2 border-dashed border-brand-500 rounded-lg bg-brand-50 dark:bg-brand-900/30">
            Drop to add
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkspaceSidebar;
