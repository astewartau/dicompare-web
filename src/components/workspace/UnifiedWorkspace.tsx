import React, { useState, useCallback, useEffect, useRef } from 'react';
import { AlertTriangle, FileText, Image, GripVertical, List, Check, X } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { useWorkspace, WorkspaceItem, SchemaMetadata } from '../../contexts/WorkspaceContext';
import { useSchemaService, SchemaBinding } from '../../hooks/useSchemaService';
import { AcquisitionSelection } from '../../types';
import WorkspaceSidebar, { SCHEMA_INFO_ID } from './WorkspaceSidebar';
import WorkspaceDetailPanel from './WorkspaceDetailPanel';
import AttachSchemaModal from './AttachSchemaModal';
import SchemaReadmeModal, { ReadmeItem } from '../schema/SchemaReadmeModal';

const ADD_NEW_ID = '__add_new__';

const UnifiedWorkspace: React.FC = () => {
  const {
    items,
    selectedId,
    isProcessing,
    processingProgress,
    processingError,
    schemaMetadata,
    setSchemaMetadata,
    pendingAttachmentSelection,
    addFromSchema,
    addFromData,
    addFromScratch,
    addEmpty,
    createSchemaForItem,
    detachCreatedSchema,
    selectItem,
    removeItem,
    reorderItems,
    toggleEditing,
    attachData,
    attachSchema,
    uploadSchemaForItem,
    detachData,
    detachSchema,
    confirmAttachmentSelection,
    cancelAttachmentSelection,
    generateTestData,
    updateAcquisition,
    clearAll,
  } = useWorkspace();

  const {
    getSchemaContent,
    getUnifiedSchema,
    librarySchemas,
    uploadedSchemas,
    isLoading: schemasLoading
  } = useSchemaService();

  // Local UI state
  const [activeTab, setActiveTab] = useState<'start' | 'schema' | 'data'>('start');
  const [showAttachSchemaModal, setShowAttachSchemaModal] = useState(false);
  const [pendingSchemaSelections, setPendingSchemaSelections] = useState<AcquisitionSelection[]>([]);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeDragData, setActiveDragData] = useState<any>(null);
  const [activeDragWidth, setActiveDragWidth] = useState<number | null>(null);
  const [isOverDropZone, setIsOverDropZone] = useState(false);

  // README modal state
  const [showReadmeModal, setShowReadmeModal] = useState(false);
  const [readmeModalData, setReadmeModalData] = useState<{
    schemaName: string;
    readmeItems: ReadmeItem[];
    initialSelection: string;
  } | null>(null);

  // Track previous selection to exit edit mode when navigating away
  const previousSelectedId = useRef<string | null>(null);
  useEffect(() => {
    if (previousSelectedId.current && previousSelectedId.current !== selectedId) {
      // Find the previous item and exit edit mode if it was editing
      const previousItem = items.find(item => item.id === previousSelectedId.current);
      if (previousItem?.isEditing) {
        toggleEditing(previousSelectedId.current);
      }
    }
    previousSelectedId.current = selectedId;
  }, [selectedId, items, toggleEditing]);

  // DnD Kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Build README items from schema data
  const buildReadmeItems = (schemaData: any, schemaName: string): ReadmeItem[] => {
    const items: ReadmeItem[] = [];

    items.push({
      id: 'schema',
      type: 'schema',
      name: schemaName,
      description: schemaData.description || ''
    });

    Object.entries(schemaData.acquisitions || {}).forEach(([name, acqData]: [string, any], index) => {
      items.push({
        id: `acquisition-${index}`,
        type: 'acquisition',
        name: name,
        description: acqData?.detailed_description || acqData?.description || '',
        acquisitionIndex: index
      });
    });

    return items;
  };

  // README click handlers
  const handleSchemaReadmeClick = async (schemaId: string, schemaName: string) => {
    try {
      const content = await getSchemaContent(schemaId);
      if (content) {
        const schemaData = JSON.parse(content);
        setReadmeModalData({
          schemaName,
          readmeItems: buildReadmeItems(schemaData, schemaName),
          initialSelection: 'schema'
        });
        setShowReadmeModal(true);
      }
    } catch (error) {
      console.error('Failed to load schema README:', error);
    }
  };

  const handleAcquisitionReadmeClick = async (schemaId: string, schemaName: string, acquisitionIndex: number) => {
    try {
      const content = await getSchemaContent(schemaId);
      if (content) {
        const schemaData = JSON.parse(content);
        setReadmeModalData({
          schemaName,
          readmeItems: buildReadmeItems(schemaData, schemaName),
          initialSelection: `acquisition-${acquisitionIndex}`
        });
        setShowReadmeModal(true);
      }
    } catch (error) {
      console.error('Failed to load acquisition README:', error);
    }
  };

  // Schema selection handlers
  const handleSchemaFirstToggle = (selection: AcquisitionSelection) => {
    setPendingSchemaSelections(prev => {
      const exists = prev.some(
        s => s.schemaId === selection.schemaId && s.acquisitionIndex === selection.acquisitionIndex
      );
      if (exists) {
        return prev.filter(
          s => !(s.schemaId === selection.schemaId && s.acquisitionIndex === selection.acquisitionIndex)
        );
      } else {
        return [...prev, selection];
      }
    });
  };

  const confirmSchemaSelections = async () => {
    if (pendingSchemaSelections.length > 0) {
      await addFromSchema(pendingSchemaSelections, getSchemaContent, getUnifiedSchema);
      setPendingSchemaSelections([]);
    }
  };

  // Data upload handler
  const handleFileUpload = useCallback(async (files: FileList | null, mode: 'schema-template' | 'validation-subject' = 'schema-template') => {
    if (!files) return;
    await addFromData(files, mode);
  }, [addFromData]);

  // Scratch handler (legacy, for backwards compatibility)
  const handleAddFromScratch = useCallback(() => {
    addFromScratch();
  }, [addFromScratch]);

  // Empty handler - creates a truly empty item
  const handleAddEmpty = useCallback(() => {
    addEmpty();
  }, [addEmpty]);

  // Create schema for current empty item
  const handleCreateSchema = useCallback(() => {
    if (selectedId && selectedId !== ADD_NEW_ID) {
      createSchemaForItem(selectedId);
    }
  }, [selectedId, createSchemaForItem]);

  // Detach created schema from current item
  const handleDetachCreatedSchema = useCallback(() => {
    if (selectedId && selectedId !== ADD_NEW_ID) {
      detachCreatedSchema(selectedId);
    }
  }, [selectedId, detachCreatedSchema]);

  // Attach schema handler
  const handleAttachSchema = useCallback((binding: SchemaBinding) => {
    if (selectedId && selectedId !== ADD_NEW_ID) {
      attachSchema(selectedId, binding);
    }
    setShowAttachSchemaModal(false);
  }, [selectedId, attachSchema]);

  // Detach schema handler
  const handleDetachSchema = useCallback(() => {
    if (selectedId && selectedId !== ADD_NEW_ID) {
      detachSchema(selectedId);
    }
  }, [selectedId, detachSchema]);

  // Attach data handler
  const handleAttachData = useCallback(async (files: FileList) => {
    if (selectedId && selectedId !== ADD_NEW_ID) {
      await attachData(selectedId, files);
    }
  }, [selectedId, attachData]);

  // Upload schema for current item handler
  const handleUploadSchemaForItem = useCallback(async (files: FileList) => {
    if (selectedId && selectedId !== ADD_NEW_ID) {
      await uploadSchemaForItem(selectedId, files);
    }
  }, [selectedId, uploadSchemaForItem]);

  // Detach data handler
  const handleDetachData = useCallback(() => {
    if (selectedId && selectedId !== ADD_NEW_ID) {
      detachData(selectedId);
    }
  }, [selectedId, detachData]);

  // Generate test data handler
  const handleGenerateTestData = useCallback(async () => {
    if (selectedId && selectedId !== ADD_NEW_ID) {
      await generateTestData(selectedId, getSchemaContent);
    }
  }, [selectedId, generateTestData, getSchemaContent]);

  // DnD handlers
  const handleDndDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
    setActiveDragData(event.active.data.current);
    // Capture the width of the dragged element for the overlay
    const width = event.active.rect.current.initial?.width;
    setActiveDragWidth(width ?? null);
  };

  const handleDndDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    const activeId = active.id as string;
    const isFromSchemaBrowser = activeId.startsWith('schema-drag-') || activeId.startsWith('acq-drag-');

    if (!isFromSchemaBrowser || !over) {
      setIsOverDropZone(false);
      return;
    }

    const overId = over.id as string;
    const isValidTarget = overId === 'sidebar-drop-zone' || items.some(item => item.id === overId);
    setIsOverDropZone(isValidTarget);
  };

  const handleDndDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);
    setActiveDragData(null);
    setActiveDragWidth(null);
    setIsOverDropZone(false);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const isFromSchemaBrowser = activeId.startsWith('schema-drag-') || activeId.startsWith('acq-drag-');
    const isValidTarget = overId === 'sidebar-drop-zone' || items.some(item => item.id === overId);

    // Handle drop from schema browser
    if (isFromSchemaBrowser && isValidTarget) {
      const dragData = active.data.current;
      if (dragData?.type === 'acquisition') {
        const selection: AcquisitionSelection = dragData.selection;
        await addFromSchema([selection], getSchemaContent, getUnifiedSchema);
      } else if (dragData?.type === 'schema') {
        // Add all acquisitions from schema
        const content = await getSchemaContent(dragData.schemaId);
        if (content) {
          const schemaData = JSON.parse(content);
          const selections: AcquisitionSelection[] = Object.keys(schemaData.acquisitions || {}).map((name, index) => ({
            schemaId: dragData.schemaId,
            acquisitionIndex: index,
            schemaName: dragData.schemaName,
            acquisitionName: name
          }));
          await addFromSchema(selections, getSchemaContent, getUnifiedSchema);
        }
      }
      return;
    }

    // Reordering within list
    if (activeId !== overId) {
      const activeIndex = items.findIndex(item => item.id === activeId);
      const overIndex = items.findIndex(item => item.id === overId);

      if (activeIndex !== -1 && overIndex !== -1) {
        reorderItems(activeIndex, overIndex);
      }
    }
  };

  // Get selected item
  const selectedItem = items.find(item => item.id === selectedId);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Title and actions */}
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-content-primary">Workspace</h2>
        {/* Processing error */}
        {processingError && (
          <div className="mt-4 p-3 bg-status-error-bg border border-status-error/30 text-status-error rounded flex items-start">
            <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Error</p>
              <p className="text-sm mt-1">{processingError}</p>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDndDragStart}
        onDragOver={handleDndDragOver}
        onDragEnd={handleDndDragEnd}
      >
        <div className="grid grid-cols-12 gap-6 min-h-[800px]">
          {/* Left Sidebar */}
          <div className="col-span-12 md:col-span-3">
            <WorkspaceSidebar
              items={items}
              selectedId={selectedId}
              isOverDropZone={isOverDropZone}
              schemaMetadata={schemaMetadata}
              onSelect={selectItem}
              onRemove={removeItem}
              onReset={clearAll}
            />
          </div>

          {/* Right Detail Panel */}
          <div className="col-span-12 md:col-span-9">
            <WorkspaceDetailPanel
              selectedItem={selectedItem}
              isAddNew={selectedId === ADD_NEW_ID || !selectedId}
              isSchemaInfo={selectedId === SCHEMA_INFO_ID}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              isProcessing={isProcessing}
              processingProgress={processingProgress}
              pendingSchemaSelections={pendingSchemaSelections}
              librarySchemas={librarySchemas}
              uploadedSchemas={uploadedSchemas}
              schemaMetadata={schemaMetadata}
              getSchemaContent={getSchemaContent}
              getUnifiedSchema={getUnifiedSchema}
              onSchemaToggle={handleSchemaFirstToggle}
              onConfirmSchemas={confirmSchemaSelections}
              onFileUpload={handleFileUpload}
              onAddFromScratch={handleAddFromScratch}
              onAddEmpty={handleAddEmpty}
              onCreateSchema={handleCreateSchema}
              onDetachCreatedSchema={handleDetachCreatedSchema}
              onToggleEditing={() => selectedId && toggleEditing(selectedId)}
              onAttachData={handleAttachData}
              onUploadSchemaForItem={handleUploadSchemaForItem}
              onDetachData={handleDetachData}
              onAttachSchema={() => setShowAttachSchemaModal(true)}
              onDetachSchema={handleDetachSchema}
              onGenerateTestData={handleGenerateTestData}
              onRemove={() => selectedId && removeItem(selectedId)}
              onUpdateAcquisition={(updates) => selectedId && updateAcquisition(selectedId, updates)}
              onUpdateSchemaMetadata={(updates) => setSchemaMetadata({
                ...schemaMetadata,
                name: updates.name ?? schemaMetadata?.name ?? '',
                description: updates.description ?? schemaMetadata?.description ?? '',
                authors: updates.authors ?? schemaMetadata?.authors ?? [],
                version: updates.version ?? schemaMetadata?.version ?? '1.0',
              })}
              onSchemaReadmeClick={handleSchemaReadmeClick}
              onAcquisitionReadmeClick={handleAcquisitionReadmeClick}
            />
          </div>
        </div>

        {/* Drag Overlay */}
        <DragOverlay dropAnimation={null}>
          {activeDragId ? (() => {
            // For workspace items being reordered
            const draggedItem = items.find(i => i.id === activeDragId);
            if (draggedItem) {
              const hasData = (draggedItem.source === 'data' && draggedItem.dataUsageMode === 'validation-subject') || draggedItem.attachedData !== undefined;
              const hasSchema = draggedItem.source === 'schema' ||
                (draggedItem.source === 'data' && draggedItem.dataUsageMode !== 'validation-subject') ||
                (draggedItem.source === 'empty' && draggedItem.hasCreatedSchema) ||
                draggedItem.attachedSchema !== undefined;
              return (
                <div className="border rounded-lg p-3 bg-surface-primary shadow-lg border-brand-500 w-64">
                  <div className="flex items-start">
                    <GripVertical className="h-4 w-4 text-content-muted mt-0.5 flex-shrink-0 mr-2" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4 text-content-tertiary flex-shrink-0" />
                        <h3 className="text-sm font-medium text-content-primary truncate">
                          {draggedItem.acquisition.protocolName || 'Untitled'}
                        </h3>
                      </div>
                      <div className="flex items-center mt-2 text-xs space-x-3">
                        <span className={`flex items-center ${hasSchema ? 'text-brand-600 dark:text-brand-400' : 'text-content-muted'}`}>
                          <FileText className="h-3 w-3 mr-1" />
                          {hasSchema ? 'Schema' : 'No schema'}
                        </span>
                        <span className={`flex items-center ${hasData ? 'text-brand-600 dark:text-brand-400' : 'text-content-muted'}`}>
                          <Image className="h-3 w-3 mr-1" />
                          {hasData ? 'Data' : 'No data'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
            // For schema drags from schema browser
            if (activeDragId.startsWith('schema-drag-')) {
              return (
                <div className="border rounded-lg p-3 bg-surface-primary shadow-lg border-brand-500">
                  <div className="flex items-center space-x-2">
                    <FileText className="h-4 w-4 text-brand-600" />
                    <span className="text-sm font-medium text-content-primary">
                      {activeDragData?.schemaName || 'Schema'} (all acquisitions)
                    </span>
                  </div>
                </div>
              );
            }
            // For acquisition drag from schema browser - render full preview using stored drag data
            if (activeDragData?.type === 'acquisition' && activeDragData.acquisition) {
              const acq = activeDragData.acquisition;
              const tags = activeDragData.tags || [];
              const fieldCount = (acq.acquisitionFields?.length || 0) + (acq.series?.reduce((acc: number, s: any) => acc + (s.fields?.length || 0), 0) || 0);
              const ruleCount = acq.validationFunctions?.length || 0;
              return (
                <div
                  className="border rounded-lg p-3 bg-surface-primary shadow-lg border-brand-500"
                  style={activeDragWidth ? { width: activeDragWidth } : undefined}
                >
                  <div className="flex items-start space-x-3">
                    <GripVertical className="h-4 w-4 text-content-muted mt-0.5 flex-shrink-0" />
                    <div className="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 bg-brand-600 border-brand-600">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-content-primary">
                        {acq.protocolName || 'Acquisition'}
                      </div>
                      {acq.seriesDescription && (
                        <div className="text-xs text-content-secondary mt-1 line-clamp-2">
                          {acq.seriesDescription}
                        </div>
                      )}
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {tags.slice(0, 4).map((tag: string) => (
                            <span key={tag} className="px-1.5 py-0.5 text-xs rounded bg-surface-tertiary text-content-tertiary">
                              {tag}
                            </span>
                          ))}
                          {tags.length > 4 && (
                            <span className="px-1.5 py-0.5 text-xs rounded bg-surface-tertiary text-content-tertiary">
                              +{tags.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center space-x-4 mt-2 text-xs text-content-tertiary">
                        {fieldCount > 0 && (
                          <span className="flex items-center">
                            <List className="h-3 w-3 mr-1" />
                            {fieldCount} fields
                          </span>
                        )}
                        {ruleCount > 0 && (
                          <span>{ruleCount} validation rules</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
            // Fallback for acquisition drag without full data
            return (
              <div className="border rounded-lg p-3 bg-surface-primary shadow-lg border-brand-500">
                <div className="flex items-center space-x-2">
                  <FileText className="h-4 w-4 text-brand-600" />
                  <span className="text-sm font-medium text-content-primary">Acquisition</span>
                </div>
              </div>
            );
          })() : null}
        </DragOverlay>
      </DndContext>

      {/* Attach Schema Modal */}
      <AttachSchemaModal
        isOpen={showAttachSchemaModal}
        onClose={() => setShowAttachSchemaModal(false)}
        onSelect={handleAttachSchema}
        librarySchemas={librarySchemas}
        uploadedSchemas={uploadedSchemas}
        getSchemaContent={getSchemaContent}
        onSchemaReadmeClick={handleSchemaReadmeClick}
        onAcquisitionReadmeClick={handleAcquisitionReadmeClick}
      />

      {/* README Modal */}
      <SchemaReadmeModal
        isOpen={showReadmeModal}
        onClose={() => {
          setShowReadmeModal(false);
          setReadmeModalData(null);
        }}
        schemaName={readmeModalData?.schemaName || ''}
        readmeItems={readmeModalData?.readmeItems || []}
        initialSelection={readmeModalData?.initialSelection || 'schema'}
      />

      {/* Acquisition Selection Modal (when multiple acquisitions found in data) */}
      {pendingAttachmentSelection && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-primary rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-content-primary">Select Acquisition</h2>
                <p className="text-sm text-content-secondary mt-1">
                  Multiple acquisitions found. Select one to use for validation.
                </p>
              </div>
              <button
                onClick={cancelAttachmentSelection}
                className="text-content-muted hover:text-content-secondary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Acquisition List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {pendingAttachmentSelection.acquisitions.map((acq, index) => (
                <button
                  key={acq.id || index}
                  onClick={() => confirmAttachmentSelection(index)}
                  className="w-full text-left p-4 border border-border rounded-lg hover:border-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-content-tertiary mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-content-primary">
                        {acq.protocolName || `Acquisition ${index + 1}`}
                      </div>
                      {acq.seriesDescription && (
                        <div className="text-sm text-content-secondary mt-1 line-clamp-2">
                          {acq.seriesDescription}
                        </div>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-content-tertiary">
                        <span>{acq.acquisitionFields?.length || 0} fields</span>
                        <span>{acq.series?.length || 0} series</span>
                        {acq.totalFiles && <span>{acq.totalFiles} files</span>}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border">
              <button
                onClick={cancelAttachmentSelection}
                className="w-full px-4 py-2 border border-border-secondary text-content-secondary rounded-lg hover:bg-surface-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedWorkspace;
