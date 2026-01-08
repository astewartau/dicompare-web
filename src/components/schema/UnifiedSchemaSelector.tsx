import React, { useState, useMemo, useEffect } from 'react';
import { Upload, Library, FolderOpen, Trash2, Download, FileText, List, ChevronDown, ChevronUp, X, Tag, Check, Minus, Search, GripVertical, BookOpen } from 'lucide-react';
import { UnifiedSchema } from '../../hooks/useSchemaService';
import { useSchemaContext } from '../../contexts/SchemaContext';
import { convertSchemaToAcquisitions } from '../../utils/schemaToAcquisition';
import { Acquisition, AcquisitionSelection } from '../../types';

interface UnifiedSchemaSelectorProps {
  // Data
  librarySchemas: UnifiedSchema[];
  uploadedSchemas: UnifiedSchema[];

  // Selection behavior
  selectionMode: 'schema' | 'acquisition';

  // Callbacks
  onSchemaSelect?: (schemaId: string) => void;
  onAcquisitionSelect?: (schemaId: string, acquisitionIndex: number) => void;
  onSchemaUpload?: (file: File) => void;
  onSchemaDownload?: (schemaId: string) => void;

  // Multi-select mode (for selecting multiple acquisitions)
  multiSelectMode?: boolean;
  selectedAcquisitions?: AcquisitionSelection[];
  onAcquisitionToggle?: (selection: AcquisitionSelection) => void;

  // UI Options
  expandable?: boolean;
  selectedSchemaId?: string;

  // Utility
  getSchemaContent: (schemaId: string) => Promise<string | null>;

  // Drag-and-drop support
  enableDragDrop?: boolean;
  onAcquisitionDragStart?: (selection: AcquisitionSelection, event: React.DragEvent) => void;
  onSchemaDragStart?: (schemaId: string, schemaName: string, acquisitionCount: number, event: React.DragEvent) => void;

  // README support
  onSchemaReadmeClick?: (schemaId: string, schemaName: string) => void;
  onAcquisitionReadmeClick?: (schemaId: string, schemaName: string, acquisitionIndex: number, acquisitionName: string) => void;
}

interface DeleteConfirmModalProps {
  isOpen: boolean;
  schemaName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  schemaName,
  onConfirm,
  onCancel
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-surface-primary rounded-lg max-w-md w-full p-6">
        <div className="flex items-start mb-4">
          <div className="flex-shrink-0">
            <div className="h-12 w-12 rounded-full bg-status-error-bg flex items-center justify-center">
              <Trash2 className="h-6 w-6 text-status-error" />
            </div>
          </div>
          <div className="ml-4 flex-1">
            <h3 className="text-lg font-medium text-content-primary">Delete Schema</h3>
            <p className="mt-2 text-sm text-content-secondary">
              Are you sure you want to delete <strong>{schemaName}</strong>? This action cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-content-secondary bg-surface-primary border border-border-secondary rounded-md hover:bg-surface-secondary"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-content-inverted bg-status-error border border-transparent rounded-md hover:opacity-90"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

const UnifiedSchemaSelector: React.FC<UnifiedSchemaSelectorProps> = ({
  librarySchemas,
  uploadedSchemas,
  selectionMode,
  onSchemaSelect,
  onAcquisitionSelect,
  onSchemaUpload,
  onSchemaDownload,
  multiSelectMode = false,
  selectedAcquisitions = [],
  onAcquisitionToggle,
  expandable = true,
  selectedSchemaId,
  getSchemaContent,
  enableDragDrop = false,
  onAcquisitionDragStart,
  onSchemaDragStart,
  onSchemaReadmeClick,
  onAcquisitionReadmeClick
}) => {
  const { deleteSchema } = useSchemaContext();

  // Filter state (replaces tab-based navigation)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showLibrary, setShowLibrary] = useState(true);
  const [showCustom, setShowCustom] = useState(true);

  // UI state
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set());
  const [dragActive, setDragActive] = useState(false);
  const [schemaAcquisitions, setSchemaAcquisitions] = useState<Record<string, Acquisition[]>>({});
  const [loadingSchemas, setLoadingSchemas] = useState<Set<string>>(new Set());
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; schemaId: string; schemaName: string }>({
    isOpen: false,
    schemaId: '',
    schemaName: ''
  });
  const [showNonMatchingFor, setShowNonMatchingFor] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'nested' | 'flat'>('nested');

  // Combine all schemas with source indicator
  const allSchemas = useMemo(() => [
    ...librarySchemas.map(s => ({ ...s, source: 'library' as const })),
    ...uploadedSchemas.map(s => ({ ...s, source: 'uploaded' as const }))
  ], [librarySchemas, uploadedSchemas]);

  // Filter schemas based on search, tags, and source toggles
  const filteredSchemas = useMemo(() => {
    let schemas = allSchemas;

    // Filter by source
    schemas = schemas.filter(s =>
      (showLibrary && s.source === 'library') ||
      (showCustom && s.source === 'uploaded')
    );

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      schemas = schemas.filter(s =>
        s.name.toLowerCase().includes(query) ||
        s.description?.toLowerCase().includes(query)
      );
    }

    // Filter by selected tags (AND logic - show schemas where at least one acquisition has ALL selected tags)
    if (selectedTags.length > 0) {
      schemas = schemas.filter(s => {
        const schemaTags = s.tags || [];
        // Check if at least one acquisition has ALL selected tags (inheriting schema tags)
        return s.acquisitions?.some((acq, _) => {
          const effectiveTags = [...new Set([...schemaTags, ...(acq.tags || [])])];
          return selectedTags.every(tag => effectiveTags.includes(tag));
        }) || false;
      });
    }

    return schemas;
  }, [allSchemas, showLibrary, showCustom, searchQuery, selectedTags]);

  // Get all unique tags with counts (counting acquisitions, not schemas)
  const tagsWithCounts = useMemo(() => {
    // Use schemas filtered by source and search, but not by tags
    let schemasForTags = allSchemas;

    // Filter by source
    schemasForTags = schemasForTags.filter(s =>
      (showLibrary && s.source === 'library') ||
      (showCustom && s.source === 'uploaded')
    );

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      schemasForTags = schemasForTags.filter(s =>
        s.name.toLowerCase().includes(query) ||
        s.description?.toLowerCase().includes(query)
      );
    }

    const tagCounts = new Map<string, number>();

    schemasForTags.forEach(schema => {
      const schemaTags = schema.tags || [];

      // Count each acquisition's effective tags (schema tags + acquisition tags)
      if (schema.acquisitions) {
        schema.acquisitions.forEach(acq => {
          const effectiveTags = new Set([...schemaTags, ...(acq.tags || [])]);
          effectiveTags.forEach(tag => {
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
          });
        });
      } else {
        // Single-acquisition schema: count schema tags once
        schemaTags.forEach(tag => {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        });
      }
    });

    return Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [allSchemas, showLibrary, showCustom, searchQuery]);

  // Toggle a tag in the selected tags list
  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  // Toggle showing non-matching acquisitions for a schema
  const toggleShowNonMatching = (schemaId: string) => {
    setShowNonMatchingFor(prev => {
      const newSet = new Set(prev);
      if (newSet.has(schemaId)) newSet.delete(schemaId);
      else newSet.add(schemaId);
      return newSet;
    });
  };

  // Auto-expand schemas when tag filter is applied
  useEffect(() => {
    if (selectedTags.length > 0) {
      const schemaIds = filteredSchemas.map(s => s.id);
      setExpandedSchemas(new Set(schemaIds));
      // Also reset the non-matching visibility when filter changes
      setShowNonMatchingFor(new Set());
    }
  }, [selectedTags.join(',')]);

  // Load acquisitions for expanded schemas
  useEffect(() => {
    expandedSchemas.forEach(id => {
      if (!schemaAcquisitions[id] && !loadingSchemas.has(id)) {
        loadSchemaAcquisitions(id);
      }
    });
  }, [expandedSchemas]);

  // Load all acquisitions when in flat view mode
  useEffect(() => {
    if (viewMode === 'flat') {
      filteredSchemas.forEach(s => {
        if (!schemaAcquisitions[s.id] && !loadingSchemas.has(s.id)) {
          loadSchemaAcquisitions(s.id);
        }
      });
    }
  }, [viewMode, filteredSchemas.map(s => s.id).join(',')]);

  // Check if an acquisition has a specific tag (including inherited schema tags)
  const acquisitionHasTag = (acq: { tags?: string[] }, schemaTags: string[], tag: string): boolean => {
    const effectiveTags = [...(schemaTags || []), ...(acq.tags || [])];
    return effectiveTags.includes(tag);
  };

  // Get indices of acquisitions that match the current tag filter (AND logic)
  const getMatchingAcquisitionIndices = (schema: UnifiedSchema, acquisitions: Acquisition[]): number[] => {
    if (selectedTags.length === 0) {
      // No filter - all acquisitions match
      return acquisitions.map((_, index) => index);
    }
    return acquisitions.map((_, index) => index).filter(index =>
      selectedTags.every(tag =>
        acquisitionHasTag(
          { tags: schema.acquisitions?.[index]?.tags },
          schema.tags || [],
          tag
        )
      )
    );
  };

  // Flattened acquisitions list for flat view mode
  const flattenedAcquisitions = useMemo(() => {
    if (viewMode !== 'flat') return [];

    return filteredSchemas.flatMap(schema => {
      const acquisitions = schemaAcquisitions[schema.id] || [];
      return acquisitions
        .map((acquisition, index) => {
          const matchesTag = selectedTags.length === 0 ||
            selectedTags.every(tag => acquisitionHasTag(
              { tags: schema.acquisitions?.[index]?.tags },
              schema.tags || [],
              tag
            ));
          return { schema, acquisition, index, matchesTag };
        })
        .filter(item => item.matchesTag);
    });
  }, [viewMode, filteredSchemas, schemaAcquisitions, selectedTags]);

  // Multi-select helpers
  const isAcquisitionSelected = (schemaId: string, acquisitionIndex: number): boolean => {
    return selectedAcquisitions.some(
      sel => sel.schemaId === schemaId && sel.acquisitionIndex === acquisitionIndex
    );
  };

  // Get selection state - optionally filtered to only count specific indices
  const getSchemaSelectionState = (schemaId: string, totalAcquisitions: number, matchingIndices?: number[]): 'all' | 'some' | 'none' => {
    if (matchingIndices !== undefined) {
      // Only count selections within the matching indices
      const selectedMatchingCount = matchingIndices.filter(index => isAcquisitionSelected(schemaId, index)).length;
      if (selectedMatchingCount === 0) return 'none';
      if (selectedMatchingCount === matchingIndices.length) return 'all';
      return 'some';
    }
    // Original behavior - count all
    const selectedCount = selectedAcquisitions.filter(sel => sel.schemaId === schemaId).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === totalAcquisitions) return 'all';
    return 'some';
  };

  // Select/deselect acquisitions - optionally filtered to specific indices
  const handleSelectAllInSchema = (schema: UnifiedSchema, acquisitions: Acquisition[], matchingIndices?: number[]) => {
    if (!onAcquisitionToggle) return;

    const indicesToToggle = matchingIndices ?? acquisitions.map((_, i) => i);
    const selectionState = getSchemaSelectionState(schema.id, indicesToToggle.length, matchingIndices);

    if (selectionState === 'all') {
      // Deselect all matching - toggle each selected one
      indicesToToggle.forEach((index) => {
        if (isAcquisitionSelected(schema.id, index)) {
          onAcquisitionToggle({
            schemaId: schema.id,
            acquisitionIndex: index,
            schemaName: schema.name,
            acquisitionName: acquisitions[index].protocolName
          });
        }
      });
    } else {
      // Select all matching not yet selected
      indicesToToggle.forEach((index) => {
        if (!isAcquisitionSelected(schema.id, index)) {
          onAcquisitionToggle({
            schemaId: schema.id,
            acquisitionIndex: index,
            schemaName: schema.name,
            acquisitionName: acquisitions[index].protocolName
          });
        }
      });
    }
  };

  // Handler for Select All checkbox in schema header - loads acquisitions on demand
  const handleSelectAllClick = (schema: UnifiedSchema, e: React.MouseEvent) => {
    e.stopPropagation(); // Don't trigger expand/collapse

    const acquisitions = schemaAcquisitions[schema.id];

    if (!acquisitions) {
      // Trigger loading - checkbox will work once loaded
      loadSchemaAcquisitions(schema.id);
      return;
    }

    // If we have tag filters, only toggle matching acquisitions
    const matchingIndices = selectedTags.length > 0 ? getMatchingAcquisitionIndices(schema, acquisitions) : undefined;
    handleSelectAllInSchema(schema, acquisitions, matchingIndices);
  };

  const toggleSchemaExpansion = async (schemaId: string) => {
    if (!expandable) return;

    setExpandedSchemas(prev => {
      const newSet = new Set(prev);
      if (newSet.has(schemaId)) {
        newSet.delete(schemaId);
      } else {
        newSet.add(schemaId);
        loadSchemaAcquisitions(schemaId);
      }
      return newSet;
    });
  };

  const loadSchemaAcquisitions = async (schemaId: string) => {
    if (schemaAcquisitions[schemaId] || loadingSchemas.has(schemaId)) return;

    setLoadingSchemas(prev => new Set(prev).add(schemaId));

    try {
      const schema = [...librarySchemas, ...uploadedSchemas].find(s => s.id === schemaId);
      if (schema) {
        const acquisitions = await convertSchemaToAcquisitions(schema, getSchemaContent);
        setSchemaAcquisitions(prev => ({ ...prev, [schemaId]: acquisitions }));
      }
    } catch (error) {
      console.error(`Failed to load acquisitions for schema ${schemaId}:`, error);
    } finally {
      setLoadingSchemas(prev => {
        const newSet = new Set(prev);
        newSet.delete(schemaId);
        return newSet;
      });
    }
  };

  const handleSchemaClick = (schemaId: string) => {
    if (selectionMode === 'schema' && onSchemaSelect) {
      onSchemaSelect(schemaId);
    } else if (selectionMode === 'acquisition' && expandable) {
      toggleSchemaExpansion(schemaId);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.json')) {
        onSchemaUpload?.(file);
      }
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onSchemaUpload?.(e.target.files[0]);
    }
  };

  const handleDelete = (schemaId: string, schemaName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteModal({
      isOpen: true,
      schemaId,
      schemaName
    });
  };

  const confirmDelete = async () => {
    if (deleteModal.schemaId) {
      try {
        await deleteSchema(deleteModal.schemaId);
        console.log('Schema deleted successfully:', deleteModal.schemaId);
      } catch (error) {
        console.error('Failed to delete schema:', error);
      }
    }
    setDeleteModal({ isOpen: false, schemaId: '', schemaName: '' });
  };

  const handleDownload = async (schemaId: string, schemaName: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (onSchemaDownload) {
      onSchemaDownload(schemaId);
    } else {
      // Default download implementation
      try {
        const content = await getSchemaContent(schemaId);
        if (content) {
          const blob = new Blob([content], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${schemaName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_schema.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      } catch (error) {
        console.error('Failed to download schema:', error);
      }
    }
  };

  // Render a schema card
  const renderSchemaCard = (schema: UnifiedSchema & { source: 'library' | 'uploaded' }) => {
    const isExpanded = expandedSchemas.has(schema.id);
    const acquisitions = schemaAcquisitions[schema.id] || [];
    const isLoading = loadingSchemas.has(schema.id);
    const isSelected = selectedSchemaId === schema.id;

    // For tag filtering, compute matching indices
    const loadedAcqs = schemaAcquisitions[schema.id];
    const matchingIndices = loadedAcqs && selectedTags.length > 0
      ? getMatchingAcquisitionIndices(schema, loadedAcqs)
      : undefined;
    const matchingCount = matchingIndices?.length ??
      (selectedTags.length > 0
        ? (schema.acquisitions?.filter((_, i) =>
            selectedTags.every(tag => acquisitionHasTag({ tags: schema.acquisitions?.[i]?.tags }, schema.tags || [], tag))
          ).length || 0)
        : (schema.acquisitions?.length || 1));
    const selectionState = getSchemaSelectionState(schema.id, matchingCount, matchingIndices);

    return (
      <div
        key={schema.id}
        className={`border rounded-lg bg-surface-primary shadow-sm transition-all ${
          isSelected ? 'border-brand-500 ring-2 ring-brand-100' : 'border-border'
        }`}
      >
        {/* Schema Header */}
        <div
          draggable={enableDragDrop}
          onDragStart={(e) => {
            if (enableDragDrop && onSchemaDragStart) {
              onSchemaDragStart(schema.id, schema.name, schema.acquisitions?.length || 1, e);
            }
          }}
          className={`px-4 py-3 rounded-t-lg cursor-pointer transition-colors ${
            selectionMode === 'schema'
              ? 'hover:bg-surface-secondary'
              : expandable
                ? 'hover:bg-surface-secondary'
                : ''
          } ${enableDragDrop ? 'cursor-grab active:cursor-grabbing' : ''}`}
          onClick={() => handleSchemaClick(schema.id)}
        >
          <div className="flex items-center justify-between">
            {/* Drag handle for schema */}
            {enableDragDrop && (
              <GripVertical className="h-4 w-4 text-content-muted mr-2 flex-shrink-0" />
            )}
            {/* Select All checkbox in header */}
            {multiSelectMode && (
              <div
                className="flex items-center justify-center mr-3 cursor-pointer"
                onClick={(e) => handleSelectAllClick(schema, e)}
                title={selectedTags.length > 0 ? `Select all ${matchingCount} matching acquisitions` : `Select all ${schema.acquisitions?.length || 1} acquisitions`}
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                  loadingSchemas.has(schema.id)
                    ? 'border-border-secondary bg-surface-secondary'
                    : selectionState === 'all'
                      ? 'bg-brand-600 border-brand-600'
                      : selectionState === 'some'
                        ? 'bg-brand-600 border-brand-600'
                        : 'border-border-secondary bg-surface-primary hover:border-brand-400'
                }`}>
                  {loadingSchemas.has(schema.id) ? (
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-brand-600"></div>
                  ) : selectionState === 'all' ? (
                    <Check className="h-3 w-3 text-white" />
                  ) : selectionState === 'some' ? (
                    <Minus className="h-3 w-3 text-white" />
                  ) : null}
                </div>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center">
                <h3 className="text-sm font-semibold text-content-primary truncate">
                  {schema.name}
                </h3>
                {schema.source === 'library' && (
                  <Library className="h-3 w-3 text-content-tertiary ml-2 flex-shrink-0" title="Library schema" />
                )}
                {schema.source === 'uploaded' && (
                  <FolderOpen className="h-3 w-3 text-content-tertiary ml-2 flex-shrink-0" title="Custom schema" />
                )}
              </div>
              <p className="text-xs text-content-secondary truncate mt-1">
                {schema.description || 'No description available'}
              </p>
              {/* Show tags */}
              {schema.tags && schema.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {schema.tags.map(tag => (
                    <span
                      key={tag}
                      className={`px-2 py-0.5 text-xs rounded-full ${
                        selectedTags.includes(tag)
                          ? 'bg-brand-500/20 text-brand-700 dark:text-brand-300'
                          : 'bg-surface-secondary text-content-tertiary'
                      }`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-2 flex items-center space-x-3 text-xs text-content-tertiary">
                <span>v{schema.version || '1.0.0'}</span>
                {schema.isMultiAcquisition && (
                  <>
                    <span>•</span>
                    <span className="px-2 py-0.5 bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 rounded-full">
                      {schema.acquisitions.length} acquisitions
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-2 ml-4">
              {/* README button */}
              {onSchemaReadmeClick && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSchemaReadmeClick(schema.id, schema.name);
                  }}
                  className="p-1 text-content-tertiary hover:text-brand-600 transition-colors"
                  title="View README"
                >
                  <BookOpen className="h-4 w-4" />
                </button>
              )}

              {/* Download button */}
              <button
                onClick={(e) => handleDownload(schema.id, schema.name, e)}
                className="p-1 text-content-tertiary hover:text-brand-600 transition-colors"
                title="Save schema"
              >
                <Download className="h-4 w-4" />
              </button>

              {/* Delete button - only for custom schemas */}
              {schema.source === 'uploaded' && (
                <button
                  onClick={(e) => handleDelete(schema.id, schema.name, e)}
                  className="p-1 text-content-tertiary hover:text-status-error transition-colors"
                  title="Delete schema"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}

              {/* Expand chevron */}
              {expandable && selectionMode === 'acquisition' && (
                <div className="p-1 text-content-secondary">
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Expanded Acquisitions */}
        {expandable && isExpanded && selectionMode === 'acquisition' && (
          <div className="p-4 border-t border-border bg-surface-secondary max-h-[800px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600"></div>
                <span className="ml-2 text-sm text-content-secondary">Loading acquisitions...</span>
              </div>
            ) : acquisitions.length > 0 ? (
              (() => {
                // Split acquisitions into matching and non-matching
                const allAcqs = acquisitions.map((acquisition, index) => ({
                  acquisition,
                  index,
                  matchesTag: selectedTags.length === 0 ||
                    selectedTags.every(tag =>
                      acquisitionHasTag(
                        { tags: schema.acquisitions?.[index]?.tags },
                        schema.tags || [],
                        tag
                      )
                    )
                }));
                const matchingAcqs = allAcqs.filter(a => a.matchesTag);
                const nonMatchingAcqs = allAcqs.filter(a => !a.matchesTag);
                const showNonMatching = showNonMatchingFor.has(schema.id);

                const renderAcquisitionCard = ({ acquisition, index, matchesTag }: { acquisition: Acquisition; index: number; matchesTag: boolean }) => {
                  const isAcqSelected = multiSelectMode && isAcquisitionSelected(schema.id, index);

                  return multiSelectMode ? (
                    <div
                      key={acquisition.id}
                      draggable={enableDragDrop}
                      onDragStart={(e) => {
                        if (enableDragDrop && onAcquisitionDragStart) {
                          const selection: AcquisitionSelection = {
                            schemaId: schema.id,
                            acquisitionIndex: index,
                            schemaName: schema.name,
                            acquisitionName: acquisition.protocolName
                          };
                          onAcquisitionDragStart(selection, e);
                        }
                      }}
                      onClick={() => onAcquisitionToggle?.({
                        schemaId: schema.id,
                        acquisitionIndex: index,
                        schemaName: schema.name,
                        acquisitionName: acquisition.protocolName
                      })}
                      className={`w-full text-left border rounded-lg p-3 bg-surface-primary cursor-pointer transition-all ${
                        isAcqSelected
                          ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                          : 'border-border-secondary hover:bg-surface-secondary hover:border-border'
                      } ${enableDragDrop ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    >
                      <div className="flex items-start space-x-3">
                        {/* Drag handle icon */}
                        {enableDragDrop && (
                          <GripVertical className="h-4 w-4 text-content-muted mt-0.5 flex-shrink-0" />
                        )}
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                          isAcqSelected
                            ? 'bg-brand-600 border-brand-600'
                            : 'border-border-secondary bg-surface-primary'
                        }`}>
                          {isAcqSelected && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-content-primary">
                            {acquisition.protocolName}
                          </div>
                          {acquisition.seriesDescription && (
                            <div className="text-xs text-content-secondary mt-1">
                              {acquisition.seriesDescription}
                            </div>
                          )}
                          {/* Show acquisition tags */}
                          {schema.acquisitions?.[index]?.tags && schema.acquisitions[index].tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {schema.acquisitions[index].tags.map(tag => (
                                <span
                                  key={tag}
                                  className={`px-1.5 py-0.5 text-xs rounded ${
                                    selectedTags.includes(tag)
                                      ? 'bg-brand-500/20 text-brand-700 dark:text-brand-300'
                                      : 'bg-surface-tertiary text-content-tertiary'
                                  }`}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center space-x-4 mt-2 text-xs text-content-tertiary">
                            {(acquisition.acquisitionFields.length + (acquisition.seriesFields?.length || 0)) > 0 && (
                              <span className="flex items-center">
                                <List className="h-3 w-3 mr-1" />
                                {acquisition.acquisitionFields.length + (acquisition.seriesFields?.length || 0)} fields
                              </span>
                            )}
                            {acquisition.series && acquisition.series.length > 0 && (
                              <span>
                                {acquisition.series.length} series
                              </span>
                            )}
                            {acquisition.validationFunctions && acquisition.validationFunctions.length > 0 && (
                              <span className="text-brand-600 dark:text-brand-400">
                                {acquisition.validationFunctions.length} validation {acquisition.validationFunctions.length === 1 ? 'rule' : 'rules'}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* README button for acquisition */}
                        {onAcquisitionReadmeClick && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onAcquisitionReadmeClick(schema.id, schema.name, index, acquisition.protocolName);
                            }}
                            className="p-1.5 text-content-tertiary hover:text-brand-600 transition-colors flex-shrink-0 self-start"
                            title="View README"
                          >
                            <BookOpen className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <button
                      key={acquisition.id}
                      onClick={() => onAcquisitionSelect?.(schema.id, index)}
                      className="w-full text-left border border-border-secondary rounded-lg p-3 bg-surface-primary transition-all hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:border-brand-300 dark:hover:border-brand-700"
                    >
                      <div className="flex items-start space-x-3">
                        <FileText className="h-5 w-5 text-content-tertiary mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-content-primary">
                            {acquisition.protocolName}
                          </div>
                          {acquisition.seriesDescription && (
                            <div className="text-xs text-content-secondary mt-1">
                              {acquisition.seriesDescription}
                            </div>
                          )}
                          {/* Show acquisition tags */}
                          {schema.acquisitions?.[index]?.tags && schema.acquisitions[index].tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {schema.acquisitions[index].tags.map(tag => (
                                <span
                                  key={tag}
                                  className={`px-1.5 py-0.5 text-xs rounded ${
                                    selectedTags.includes(tag)
                                      ? 'bg-brand-500/20 text-brand-700 dark:text-brand-300'
                                      : 'bg-surface-tertiary text-content-tertiary'
                                  }`}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center space-x-4 mt-2 text-xs text-content-tertiary">
                            {(acquisition.acquisitionFields.length + (acquisition.seriesFields?.length || 0)) > 0 && (
                              <span className="flex items-center">
                                <List className="h-3 w-3 mr-1" />
                                {acquisition.acquisitionFields.length + (acquisition.seriesFields?.length || 0)} fields
                              </span>
                            )}
                            {acquisition.series && acquisition.series.length > 0 && (
                              <span>
                                {acquisition.series.length} series
                              </span>
                            )}
                            {acquisition.validationFunctions && acquisition.validationFunctions.length > 0 && (
                              <span className="text-brand-600 dark:text-brand-400">
                                {acquisition.validationFunctions.length} validation {acquisition.validationFunctions.length === 1 ? 'rule' : 'rules'}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* README button for acquisition */}
                        {onAcquisitionReadmeClick && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              onAcquisitionReadmeClick(schema.id, schema.name, index, acquisition.protocolName);
                            }}
                            className="p-1.5 text-content-tertiary hover:text-brand-600 transition-colors flex-shrink-0 self-start cursor-pointer"
                            title="View README"
                          >
                            <BookOpen className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                };

                return (
                  <div className="space-y-2">
                    {/* Render matching acquisitions */}
                    {matchingAcqs.map(renderAcquisitionCard)}

                    {/* Show non-matching summary if there are any and tags are selected */}
                    {nonMatchingAcqs.length > 0 && selectedTags.length > 0 && (
                      <>
                        <button
                          onClick={() => toggleShowNonMatching(schema.id)}
                          className="w-full flex items-center justify-center gap-2 py-2 px-3 border border-dashed border-border-secondary rounded-lg text-sm text-content-tertiary hover:text-content-secondary hover:border-content-muted transition-colors"
                        >
                          {showNonMatching ? (
                            <>
                              <ChevronUp className="h-4 w-4" />
                              Hide {nonMatchingAcqs.length} acquisition{nonMatchingAcqs.length !== 1 ? 's' : ''} not matching criteria
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-4 w-4" />
                              Show {nonMatchingAcqs.length} acquisition{nonMatchingAcqs.length !== 1 ? 's' : ''} not matching criteria
                            </>
                          )}
                        </button>

                        {/* Render non-matching acquisitions when expanded */}
                        {showNonMatching && (
                          <div className="space-y-2 opacity-60">
                            {nonMatchingAcqs.map(renderAcquisitionCard)}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })()
            ) : (
              <div className="text-center py-4 text-sm text-content-tertiary">
                No acquisitions found in this schema
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="bg-surface-primary rounded-lg shadow-md border border-border h-[800px] flex">
        {/* Left Sidebar - Tags */}
        <div className="w-48 border-r border-border p-4 flex-shrink-0 flex flex-col">
          <h3 className="font-medium text-sm text-content-primary mb-3 flex items-center flex-shrink-0">
            <Tag className="h-4 w-4 mr-2" />
            Filter by Tag
          </h3>
          {tagsWithCounts.length > 0 ? (
            <div className="space-y-1 flex-1 overflow-y-auto min-h-0">
              {tagsWithCounts.map(({ tag, count }) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`flex items-center justify-between w-full px-2 py-1.5 rounded text-sm transition-colors ${
                    selectedTags.includes(tag)
                      ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                      : 'hover:bg-surface-secondary text-content-secondary'
                  }`}
                >
                  <span className="truncate">{tag}</span>
                  <span className={`text-xs ml-2 ${selectedTags.includes(tag) ? 'text-brand-600 dark:text-brand-400' : 'text-content-tertiary'}`}>
                    {count}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-content-tertiary">No tags available</p>
          )}
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header with search and source toggles */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-4">
              {/* Search */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-tertiary" />
                <input
                  type="text"
                  placeholder="Search schemas..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-border-secondary rounded-lg bg-surface-primary text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>

              {/* Source toggles */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowLibrary(!showLibrary)}
                  className={`flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${
                    showLibrary
                      ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                      : 'bg-surface-secondary text-content-tertiary hover:text-content-secondary'
                  }`}
                  title="Toggle library schemas"
                >
                  <Library className="h-4 w-4 mr-1.5" />
                  Library
                  {showLibrary && <Check className="h-3 w-3 ml-1.5" />}
                </button>
                <button
                  onClick={() => setShowCustom(!showCustom)}
                  className={`flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${
                    showCustom
                      ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                      : 'bg-surface-secondary text-content-tertiary hover:text-content-secondary'
                  }`}
                  title="Toggle custom schemas"
                >
                  <FolderOpen className="h-4 w-4 mr-1.5" />
                  Custom
                  {showCustom && <Check className="h-3 w-3 ml-1.5" />}
                </button>
              </div>

              {/* View mode toggle */}
              <div className="border-l border-border-secondary pl-4 ml-2">
                <label className="flex items-center gap-2 text-sm text-content-secondary cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={viewMode === 'flat'}
                    onChange={(e) => setViewMode(e.target.checked ? 'flat' : 'nested')}
                    className="w-4 h-4 rounded border-border-secondary text-brand-600 focus:ring-brand-500 focus:ring-offset-0"
                  />
                  Flat list
                </label>
              </div>
            </div>

            {/* Active filters */}
            {selectedTags.length > 0 && (
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className="text-sm text-content-secondary">Filters:</span>
                {selectedTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className="flex items-center px-2 py-1 bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 rounded text-xs hover:bg-brand-200 dark:hover:bg-brand-900/50 transition-colors"
                  >
                    {tag}
                    <X className="h-3 w-3 ml-1" />
                  </button>
                ))}
                <button
                  onClick={() => setSelectedTags([])}
                  className="text-xs text-content-tertiary hover:text-content-secondary transition-colors"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          {/* Upload Area - show when Custom is enabled */}
          {onSchemaUpload && showCustom && (
            <div className="px-4 pt-4">
              <div
                className={`relative border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                  dragActive
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                    : 'border-border-secondary hover:border-content-muted'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileInput}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Upload className="h-6 w-6 text-content-muted mx-auto mb-2" />
                <p className="text-sm text-content-secondary mb-1">
                  Drop schema file here or click to browse
                </p>
                <p className="text-xs text-content-tertiary">
                  Supports .json files
                </p>
              </div>
            </div>
          )}

          {/* Schema list */}
          <div className="flex-1 overflow-y-auto p-4">
            {viewMode === 'nested' ? (
              <>
                <div className="text-sm text-content-secondary mb-3">
                  {filteredSchemas.length} {filteredSchemas.length === 1 ? 'schema' : 'schemas'} found
                </div>
                {filteredSchemas.length > 0 ? (
                  <div className="space-y-4">
                    {filteredSchemas.map(schema => renderSchemaCard(schema))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-sm text-content-tertiary">
                      {searchQuery || selectedTags.length > 0
                        ? 'No schemas match your filters.'
                        : !showLibrary && !showCustom
                          ? 'Enable Library or Custom to see schemas.'
                          : 'No schemas available.'}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="text-sm text-content-secondary mb-3">
                  {flattenedAcquisitions.length} {flattenedAcquisitions.length === 1 ? 'acquisition' : 'acquisitions'}{selectedTags.length > 0 ? ' matching' : ' found'}
                </div>
                {flattenedAcquisitions.length > 0 ? (
                  <div className="space-y-2">
                    {flattenedAcquisitions.map(({ schema, acquisition, index }) => {
                      const isAcqSelected = multiSelectMode && isAcquisitionSelected(schema.id, index);

                      return multiSelectMode ? (
                        <div
                          key={`${schema.id}-${index}`}
                          draggable={enableDragDrop}
                          onDragStart={(e) => {
                            if (enableDragDrop && onAcquisitionDragStart) {
                              const selection: AcquisitionSelection = {
                                schemaId: schema.id,
                                acquisitionIndex: index,
                                schemaName: schema.name,
                                acquisitionName: acquisition.protocolName
                              };
                              onAcquisitionDragStart(selection, e);
                            }
                          }}
                          onClick={() => onAcquisitionToggle?.({
                            schemaId: schema.id,
                            acquisitionIndex: index,
                            schemaName: schema.name,
                            acquisitionName: acquisition.protocolName
                          })}
                          className={`w-full text-left border rounded-lg p-3 bg-surface-primary cursor-pointer transition-all ${
                            isAcqSelected
                              ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                              : 'border-border-secondary hover:bg-surface-secondary hover:border-border'
                          } ${enableDragDrop ? 'cursor-grab active:cursor-grabbing' : ''}`}
                        >
                          <div className="flex items-start space-x-3">
                            {enableDragDrop && (
                              <GripVertical className="h-4 w-4 text-content-muted mt-0.5 flex-shrink-0" />
                            )}
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                              isAcqSelected
                                ? 'bg-brand-600 border-brand-600'
                                : 'border-border-secondary bg-surface-primary'
                            }`}>
                              {isAcqSelected && <Check className="h-3 w-3 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm text-content-primary">
                                  {acquisition.protocolName}
                                </span>
                                <span className="text-xs text-content-tertiary bg-surface-tertiary px-2 py-0.5 rounded flex-shrink-0">
                                  {schema.name}
                                </span>
                              </div>
                              {acquisition.seriesDescription && (
                                <div className="text-xs text-content-secondary mt-1">
                                  {acquisition.seriesDescription}
                                </div>
                              )}
                              {schema.acquisitions?.[index]?.tags && schema.acquisitions[index].tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {schema.acquisitions[index].tags.map(tag => (
                                    <span
                                      key={tag}
                                      className={`px-1.5 py-0.5 text-xs rounded ${
                                        selectedTags.includes(tag)
                                          ? 'bg-brand-500/20 text-brand-700 dark:text-brand-300'
                                          : 'bg-surface-tertiary text-content-tertiary'
                                      }`}
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div className="flex items-center space-x-4 mt-2 text-xs text-content-tertiary">
                                {(acquisition.acquisitionFields.length + (acquisition.seriesFields?.length || 0)) > 0 && (
                                  <span className="flex items-center">
                                    <List className="h-3 w-3 mr-1" />
                                    {acquisition.acquisitionFields.length + (acquisition.seriesFields?.length || 0)} fields
                                  </span>
                                )}
                                {acquisition.series && acquisition.series.length > 0 && (
                                  <span>{acquisition.series.length} series</span>
                                )}
                                {acquisition.validationFunctions && acquisition.validationFunctions.length > 0 && (
                                  <span className="text-brand-600 dark:text-brand-400">
                                    {acquisition.validationFunctions.length} validation {acquisition.validationFunctions.length === 1 ? 'rule' : 'rules'}
                                  </span>
                                )}
                              </div>
                            </div>
                            {onAcquisitionReadmeClick && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAcquisitionReadmeClick(schema.id, schema.name, index, acquisition.protocolName);
                                }}
                                className="p-1.5 text-content-tertiary hover:text-brand-600 transition-colors flex-shrink-0 self-start"
                                title="View README"
                              >
                                <BookOpen className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <button
                          key={`${schema.id}-${index}`}
                          onClick={() => onAcquisitionSelect?.(schema.id, index)}
                          className="w-full text-left border border-border-secondary rounded-lg p-3 bg-surface-primary transition-all hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:border-brand-300 dark:hover:border-brand-700"
                        >
                          <div className="flex items-start space-x-3">
                            <FileText className="h-5 w-5 text-content-tertiary mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm text-content-primary">
                                  {acquisition.protocolName}
                                </span>
                                <span className="text-xs text-content-tertiary bg-surface-tertiary px-2 py-0.5 rounded flex-shrink-0">
                                  {schema.name}
                                </span>
                              </div>
                              {acquisition.seriesDescription && (
                                <div className="text-xs text-content-secondary mt-1">
                                  {acquisition.seriesDescription}
                                </div>
                              )}
                              {schema.acquisitions?.[index]?.tags && schema.acquisitions[index].tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {schema.acquisitions[index].tags.map(tag => (
                                    <span
                                      key={tag}
                                      className={`px-1.5 py-0.5 text-xs rounded ${
                                        selectedTags.includes(tag)
                                          ? 'bg-brand-500/20 text-brand-700 dark:text-brand-300'
                                          : 'bg-surface-tertiary text-content-tertiary'
                                      }`}
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div className="flex items-center space-x-4 mt-2 text-xs text-content-tertiary">
                                {(acquisition.acquisitionFields.length + (acquisition.seriesFields?.length || 0)) > 0 && (
                                  <span className="flex items-center">
                                    <List className="h-3 w-3 mr-1" />
                                    {acquisition.acquisitionFields.length + (acquisition.seriesFields?.length || 0)} fields
                                  </span>
                                )}
                                {acquisition.series && acquisition.series.length > 0 && (
                                  <span>{acquisition.series.length} series</span>
                                )}
                                {acquisition.validationFunctions && acquisition.validationFunctions.length > 0 && (
                                  <span className="text-brand-600 dark:text-brand-400">
                                    {acquisition.validationFunctions.length} validation {acquisition.validationFunctions.length === 1 ? 'rule' : 'rules'}
                                  </span>
                                )}
                              </div>
                            </div>
                            {onAcquisitionReadmeClick && (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAcquisitionReadmeClick(schema.id, schema.name, index, acquisition.protocolName);
                                }}
                                className="p-1.5 text-content-tertiary hover:text-brand-600 transition-colors flex-shrink-0 self-start cursor-pointer"
                                title="View README"
                              >
                                <BookOpen className="h-4 w-4" />
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-sm text-content-tertiary">
                      {searchQuery || selectedTags.length > 0
                        ? 'No acquisitions match your filters.'
                        : !showLibrary && !showCustom
                          ? 'Enable Library or Custom to see acquisitions.'
                          : 'No acquisitions available.'}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={deleteModal.isOpen}
        schemaName={deleteModal.schemaName}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteModal({ isOpen: false, schemaId: '', schemaName: '' })}
      />
    </>
  );
};

export default UnifiedSchemaSelector;
