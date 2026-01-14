import React, { useCallback, useState, useEffect } from 'react';
import { Upload, FileText, Plus, Edit2, Save, Database, Loader, X, Book, Pencil, FlaskConical, ShieldCheck, Eye, Download, Code, Settings, Check, AlertTriangle } from 'lucide-react';
import { WorkspaceItem, ProcessingProgress, SchemaMetadata } from '../../contexts/WorkspaceContext';
import { UnifiedSchema } from '../../hooks/useSchemaService';
import { Acquisition, AcquisitionSelection } from '../../types';
import UnifiedSchemaSelector from '../schema/UnifiedSchemaSelector';
import AcquisitionTable from '../schema/AcquisitionTable';
import InlineTagInput from '../common/InlineTagInput';
import DetailedDescriptionModal from '../schema/DetailedDescriptionModal';
import SchemaReadmeModal, { ReadmeItem } from '../schema/SchemaReadmeModal';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useSchemaContext } from '../../contexts/SchemaContext';
import { useTagSuggestions } from '../../hooks/useTagSuggestions';
import { getAllFilesFromDirectory } from '../../utils/fileUploadUtils';
import { convertSchemaToAcquisition } from '../../utils/schemaToAcquisition';
import { dicompareAPI } from '../../services/DicompareAPI';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { useTheme } from '../../contexts/ThemeContext';

export const SCHEMA_INFO_ID = '__schema_info__';

interface WorkspaceDetailPanelProps {
  selectedItem: WorkspaceItem | undefined;
  isAddNew: boolean;
  isSchemaInfo: boolean;
  activeTab: 'start' | 'schema' | 'data';
  setActiveTab: (tab: 'start' | 'schema' | 'data') => void;
  isProcessing: boolean;
  processingProgress: ProcessingProgress | null;
  pendingSchemaSelections: AcquisitionSelection[];
  librarySchemas: UnifiedSchema[];
  uploadedSchemas: UnifiedSchema[];
  schemaMetadata: SchemaMetadata | null;
  getSchemaContent: (id: string) => Promise<string | null>;
  getUnifiedSchema: (id: string) => UnifiedSchema | null;
  onSchemaToggle: (selection: AcquisitionSelection) => void;
  onConfirmSchemas: () => void;
  onFileUpload: (files: FileList | null, mode?: 'schema-template' | 'validation-subject') => void;
  onAddFromScratch: () => void;
  onToggleEditing: () => void;
  onAttachData: (files: FileList) => void;
  onDetachData: () => void;
  onAttachSchema: () => void;
  onDetachSchema: () => void;
  onGenerateTestData: () => void;
  onRemove: () => void;
  onUpdateAcquisition: (updates: Partial<Acquisition>) => void;
  onUpdateSchemaMetadata: (updates: Partial<SchemaMetadata>) => void;
  onSchemaReadmeClick: (schemaId: string, schemaName: string) => void;
  onAcquisitionReadmeClick: (schemaId: string, schemaName: string, acquisitionIndex: number) => void;
}

const WorkspaceDetailPanel: React.FC<WorkspaceDetailPanelProps> = ({
  selectedItem,
  isAddNew,
  isSchemaInfo,
  activeTab,
  setActiveTab,
  isProcessing,
  processingProgress,
  pendingSchemaSelections,
  librarySchemas,
  uploadedSchemas,
  schemaMetadata,
  getSchemaContent,
  getUnifiedSchema,
  onSchemaToggle,
  onConfirmSchemas,
  onFileUpload,
  onAddFromScratch,
  onToggleEditing,
  onAttachData,
  onDetachData,
  onAttachSchema,
  onDetachSchema,
  onGenerateTestData,
  onRemove,
  onUpdateAcquisition,
  onUpdateSchemaMetadata,
  onSchemaReadmeClick,
  onAcquisitionReadmeClick
}) => {
  const workspace = useWorkspace();
  const { uploadSchema, schemas, updateExistingSchema } = useSchemaContext();
  const { allTags } = useTagSuggestions();
  const { theme } = useTheme();
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragOverReference, setIsDragOverReference] = useState(false);

  // Schema info editing state
  const [authorInput, setAuthorInput] = useState('');
  const [isEditingReadme, setIsEditingReadme] = useState(true);  // Default to edit tab
  const [editedReadme, setEditedReadme] = useState('');
  const [schemaInfoTab, setSchemaInfoTab] = useState<'metadata' | 'preview'>('metadata');
  const [previewJson, setPreviewJson] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [isSavingToLibrary, setIsSavingToLibrary] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [pendingSaveJson, setPendingSaveJson] = useState<string | null>(null);
  const [existingSchemaId, setExistingSchemaId] = useState<string | null>(null);
  const [isDragOverTest, setIsDragOverTest] = useState(false);
  const [showDetailedDescription, setShowDetailedDescription] = useState(false);
  const [loadedSchemaAcquisition, setLoadedSchemaAcquisition] = useState<Acquisition | null>(null);

  // Schema README modal state (with sidebar showing all acquisitions from schema)
  const [showReadmeModal, setShowReadmeModal] = useState(false);
  const [readmeModalData, setReadmeModalData] = useState<{
    schemaName: string;
    readmeItems: ReadmeItem[];
    initialSelection: string;
  } | null>(null);

  // Load schema acquisition when attachedSchema changes (for data-sourced items)
  useEffect(() => {
    if (selectedItem?.source === 'data' && selectedItem?.attachedSchema) {
      const loadSchemaAcquisition = async () => {
        const schemaAcq = await convertSchemaToAcquisition(
          selectedItem.attachedSchema!.schema,
          selectedItem.attachedSchema!.acquisitionId || '0',
          getSchemaContent
        );
        setLoadedSchemaAcquisition(schemaAcq);
      };
      loadSchemaAcquisition();
    } else {
      setLoadedSchemaAcquisition(null);
    }
  }, [selectedItem?.id, selectedItem?.source, selectedItem?.attachedSchema?.schemaId, selectedItem?.attachedSchema?.acquisitionId, getSchemaContent]);

  // Build README items from schema data for the sidebar
  const buildReadmeItems = (schemaData: any, schemaName: string): ReadmeItem[] => {
    const items: ReadmeItem[] = [];

    // Schema-level README
    items.push({
      id: 'schema',
      type: 'schema',
      name: schemaName,
      description: schemaData.description || ''
    });

    // Acquisition READMEs
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

  // Open README with sidebar showing all acquisitions from the schema
  const openReadmeWithSidebar = async () => {
    if (!selectedItem) return;

    // Determine which schema to use
    const schemaId = selectedItem.schemaOrigin?.schemaId || selectedItem.attachedSchema?.schemaId;
    const acquisitionIndex = selectedItem.schemaOrigin?.acquisitionIndex ??
      (selectedItem.attachedSchema?.acquisitionId ? parseInt(selectedItem.attachedSchema.acquisitionId) : 0);

    if (!schemaId) {
      // No schema context - fall back to simple modal
      setShowDetailedDescription(true);
      return;
    }

    try {
      const content = await getSchemaContent(schemaId);
      if (content) {
        const schemaData = JSON.parse(content);
        const schemaName = schemaData.name || selectedItem.schemaOrigin?.schemaName ||
          selectedItem.attachedSchema?.schema.name || 'Schema';
        setReadmeModalData({
          schemaName,
          readmeItems: buildReadmeItems(schemaData, schemaName),
          initialSelection: `acquisition-${acquisitionIndex}`
        });
        setShowReadmeModal(true);
      } else {
        // Fallback to simple modal if schema content unavailable
        setShowDetailedDescription(true);
      }
    } catch (error) {
      console.error('Failed to load schema README:', error);
      setShowDetailedDescription(true);
    }
  };

  // Handle editing a schema (load entire schema into workspace)
  const handleSchemaEdit = useCallback(async (schemaId: string) => {
    // Check if workspace has unsaved changes
    if (workspace.items.length > 0) {
      const confirmLoad = window.confirm(
        'Loading a schema will replace your current workspace. Continue?'
      );
      if (!confirmLoad) return;
    }

    await workspace.loadSchema(schemaId, getSchemaContent, getUnifiedSchema);
  }, [workspace, getSchemaContent, getUnifiedSchema]);

  // Handle schema upload from the schema selector
  const handleSchemaUpload = useCallback(async (file: File) => {
    try {
      await uploadSchema(file);
    } catch (error) {
      console.error('Failed to upload schema:', error);
    }
  }, [uploadSchema]);

  // Drag and drop handlers for file upload
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  // Helper to process dropped files
  const processDroppedFiles = useCallback(async (e: React.DragEvent): Promise<File[]> => {
    const items = Array.from(e.dataTransfer.items);
    const files: File[] = [];

    for (const item of items) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          if (entry.isDirectory) {
            const dirFiles = await getAllFilesFromDirectory(entry as FileSystemDirectoryEntry);
            files.push(...dirFiles);
          } else {
            const file = item.getAsFile();
            if (file) files.push(file);
          }
        } else {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
    }
    return files;
  }, []);

  // Convert files array to FileList-like object
  const filesToFileList = useCallback((files: File[]): FileList => {
    const fileList = {
      length: files.length,
      item: (index: number) => files[index] || null,
      [Symbol.iterator]: function* () {
        for (let i = 0; i < files.length; i++) {
          yield files[i];
        }
      }
    };
    files.forEach((file, index) => {
      (fileList as any)[index] = file;
    });
    return fileList as FileList;
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = await processDroppedFiles(e);
    if (files.length > 0) {
      const fileList = filesToFileList(files);
      if (isAddNew) {
        onFileUpload(fileList);
      } else {
        onAttachData(fileList);
      }
    }
  }, [isAddNew, onFileUpload, onAttachData, processDroppedFiles, filesToFileList]);

  // Reference Data zone handlers (for building schemas)
  const handleReferenceDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverReference(true);
  }, []);

  const handleReferenceDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOverReference(false);
    }
  }, []);

  const handleReferenceDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverReference(false);

    const files = await processDroppedFiles(e);
    if (files.length > 0) {
      onFileUpload(filesToFileList(files), 'schema-template');
    }
  }, [onFileUpload, processDroppedFiles, filesToFileList]);

  // Test Data zone handlers (for validation)
  const handleTestDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverTest(true);
  }, []);

  const handleTestDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOverTest(false);
    }
  }, []);

  const handleTestDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverTest(false);

    const files = await processDroppedFiles(e);
    if (files.length > 0) {
      onFileUpload(filesToFileList(files), 'validation-subject');
    }
  }, [onFileUpload, processDroppedFiles, filesToFileList]);

  // Sync editedReadme with schemaMetadata when switching to schema info view
  useEffect(() => {
    if (isSchemaInfo) {
      setEditedReadme(schemaMetadata?.description || '');
    }
  }, [isSchemaInfo, schemaMetadata?.description]);

  // Helper functions for author management
  const addAuthor = (name: string) => {
    const trimmed = name.trim();
    if (trimmed && !schemaMetadata?.authors?.includes(trimmed)) {
      const currentAuthors = schemaMetadata?.authors || [];
      onUpdateSchemaMetadata({ authors: [...currentAuthors, trimmed] });
    }
  };

  const removeAuthor = (authorToRemove: string) => {
    const currentAuthors = schemaMetadata?.authors || [];
    onUpdateSchemaMetadata({ authors: currentAuthors.filter(a => a !== authorToRemove) });
  };

  const handleAuthorInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Check if user typed a comma
    if (value.includes(',')) {
      const parts = value.split(',');
      // Add all complete parts as authors
      parts.slice(0, -1).forEach(part => addAuthor(part));
      // Keep the last part (after the comma) in the input
      setAuthorInput(parts[parts.length - 1]);
    } else {
      setAuthorInput(value);
    }
  };

  const handleAuthorKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && authorInput.trim()) {
      e.preventDefault();
      addAuthor(authorInput);
      setAuthorInput('');
    } else if (e.key === 'Backspace' && !authorInput && schemaMetadata?.authors?.length) {
      // Remove last author when backspace on empty input
      const authors = schemaMetadata.authors;
      removeAuthor(authors[authors.length - 1]);
    }
  };

  // Generate preview JSON
  const generatePreview = async () => {
    // First, save any pending README edits
    const currentDescription = editedReadme || schemaMetadata?.description || '';
    if (editedReadme && editedReadme !== schemaMetadata?.description) {
      onUpdateSchemaMetadata({ description: editedReadme });
    }

    setIsGeneratingPreview(true);
    try {
      const { acquisitions } = workspace.getSchemaExport();
      const schema = await dicompareAPI.generateSchemaJS(acquisitions, {
        name: schemaMetadata?.name || 'Untitled Schema',
        description: currentDescription,
        version: schemaMetadata?.version || '1.0',
        authors: schemaMetadata?.authors || []
      });
      const { statistics, ...schemaContent } = schema;
      setPreviewJson(JSON.stringify(schemaContent, null, 2));
    } catch (err) {
      console.error('Failed to generate schema preview:', err);
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  // Handle tab switch to preview
  const handlePreviewTabClick = () => {
    setSchemaInfoTab('preview');
    // Always regenerate to pick up any metadata changes
    generatePreview();
  };

  // Download JSON
  const handleDownloadJson = async () => {
    let jsonToDownload = previewJson;

    // Generate preview if it doesn't exist
    if (!jsonToDownload) {
      // Save any pending README edits first
      const currentDescription = editedReadme || schemaMetadata?.description || '';
      if (editedReadme && editedReadme !== schemaMetadata?.description) {
        onUpdateSchemaMetadata({ description: editedReadme });
      }

      try {
        const { acquisitions } = workspace.getSchemaExport();
        const schema = await dicompareAPI.generateSchemaJS(acquisitions, {
          name: schemaMetadata?.name || 'Untitled Schema',
          description: currentDescription,
          version: schemaMetadata?.version || '1.0',
          authors: schemaMetadata?.authors || []
        });
        const { statistics, ...schemaContent } = schema;
        jsonToDownload = JSON.stringify(schemaContent, null, 2);
        setPreviewJson(jsonToDownload);
      } catch (err) {
        console.error('Failed to generate schema:', err);
        return;
      }
    }

    const blob = new Blob([jsonToDownload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const name = schemaMetadata?.name || 'schema';
    const version = schemaMetadata?.version || '1.0';
    a.download = `${name.replace(/\s+/g, '_')}_v${version}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Generate JSON for saving
  const generateJsonForSave = async (): Promise<string | null> => {
    if (previewJson) return previewJson;

    // Save any pending README edits first
    const currentDescription = editedReadme || schemaMetadata?.description || '';
    if (editedReadme && editedReadme !== schemaMetadata?.description) {
      onUpdateSchemaMetadata({ description: editedReadme });
    }

    try {
      const { acquisitions } = workspace.getSchemaExport();
      const schema = await dicompareAPI.generateSchemaJS(acquisitions, {
        name: schemaMetadata?.name || 'Untitled Schema',
        description: currentDescription,
        version: schemaMetadata?.version || '1.0',
        authors: schemaMetadata?.authors || []
      });
      const { statistics, ...schemaContent } = schema;
      const json = JSON.stringify(schemaContent, null, 2);
      setPreviewJson(json);
      return json;
    } catch (err) {
      console.error('Failed to generate schema:', err);
      return null;
    }
  };

  // Perform the actual save
  const performSave = async (jsonToSave: string, overwriteId?: string) => {
    setIsSavingToLibrary(true);
    setSaveMessage(null);
    try {
      const name = schemaMetadata?.name || 'schema';
      const version = schemaMetadata?.version || '1.0';

      if (overwriteId) {
        // Update existing schema
        const schemaContent = JSON.parse(jsonToSave);
        await updateExistingSchema(overwriteId, schemaContent, {
          title: name,
          description: schemaMetadata?.description || '',
          authors: schemaMetadata?.authors || [],
          version: version,
        });
      } else {
        // Create new schema
        const blob = new Blob([jsonToSave], { type: 'application/json' });
        const fileName = `${name.replace(/\s+/g, '_')}_v${version}.json`;
        const file = new File([blob], fileName, { type: 'application/json' });

        await uploadSchema(file, {
          title: name,
          description: schemaMetadata?.description || '',
          authors: schemaMetadata?.authors || [],
          version: version,
        });
      }

      setSaveMessage({ type: 'success', text: `Schema "${name}" saved to library successfully!` });
      // Clear message after 5 seconds
      setTimeout(() => setSaveMessage(null), 5000);
    } catch (err) {
      console.error('Failed to save schema:', err);
      setSaveMessage({ type: 'error', text: 'Failed to save schema. Please try again.' });
    } finally {
      setIsSavingToLibrary(false);
      setShowOverwriteConfirm(false);
      setPendingSaveJson(null);
      setExistingSchemaId(null);
    }
  };

  // Save to library - checks for existing schema first
  const handleSaveToLibrary = async () => {
    const jsonToSave = await generateJsonForSave();
    if (!jsonToSave) {
      setSaveMessage({ type: 'error', text: 'Failed to generate schema.' });
      return;
    }

    // Check if a schema with the same name already exists
    const schemaName = schemaMetadata?.name?.trim().toLowerCase();
    const existingSchema = schemas.find(s =>
      s.title?.trim().toLowerCase() === schemaName
    );

    if (existingSchema) {
      // Show confirmation dialog
      setPendingSaveJson(jsonToSave);
      setExistingSchemaId(existingSchema.id);
      setShowOverwriteConfirm(true);
    } else {
      // No duplicate, save directly
      await performSave(jsonToSave);
    }
  };

  // Handle overwrite confirmation
  const handleConfirmOverwrite = async () => {
    if (pendingSaveJson && existingSchemaId) {
      await performSave(pendingSaveJson, existingSchemaId);
    }
  };

  // Handle save as new (when duplicate exists)
  const handleSaveAsNew = async () => {
    if (pendingSaveJson) {
      await performSave(pendingSaveJson);
    }
  };

  // Cancel overwrite dialog
  const handleCancelOverwrite = () => {
    setShowOverwriteConfirm(false);
    setPendingSaveJson(null);
    setExistingSchemaId(null);
  };

  // Check if metadata is valid for saving
  const isMetadataValid = schemaMetadata?.name?.trim() &&
    schemaMetadata?.authors?.length > 0 &&
    schemaMetadata?.version?.trim();

  // Render Schema Info editing view
  if (isSchemaInfo) {
    return (
      <div className="border border-border rounded-lg bg-surface-primary shadow-sm flex flex-col h-full">
        {/* Header with tabs */}
        <div className="px-6 pt-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-content-primary">Schema Information</h2>
              <p className="text-sm text-content-secondary mt-1">
                Define your schema's identity and documentation
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadJson}
                disabled={isGeneratingPreview}
                className="flex items-center px-3 py-2 text-sm border border-border-secondary rounded-lg hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed text-content-secondary"
              >
                <Download className="h-4 w-4 mr-1.5" />
                Download JSON
              </button>
              <button
                onClick={handleSaveToLibrary}
                disabled={isGeneratingPreview || isSavingToLibrary || !isMetadataValid}
                className="flex items-center px-3 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingToLibrary ? (
                  <>
                    <Loader className="h-4 w-4 mr-1.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-1.5" />
                    Save to Library
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Success/Error Message */}
          {saveMessage && (
            <div className={`mt-3 px-3 py-2 rounded-lg text-sm flex items-center ${
              saveMessage.type === 'success'
                ? 'bg-status-success-bg text-status-success border border-status-success/30'
                : 'bg-status-error-bg text-status-error border border-status-error/30'
            }`}>
              {saveMessage.type === 'success' ? (
                <Check className="h-4 w-4 mr-2 flex-shrink-0" />
              ) : (
                <X className="h-4 w-4 mr-2 flex-shrink-0" />
              )}
              {saveMessage.text}
              <button
                onClick={() => setSaveMessage(null)}
                className="ml-auto p-1 hover:bg-black/10 rounded"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Overwrite Confirmation Dialog */}
          {showOverwriteConfirm && (
            <div className="mt-3 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Schema already exists
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    A schema named "{schemaMetadata?.name}" already exists in your library. What would you like to do?
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={handleConfirmOverwrite}
                      disabled={isSavingToLibrary}
                      className="px-3 py-1.5 text-sm font-medium rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {isSavingToLibrary ? 'Saving...' : 'Overwrite'}
                    </button>
                    <button
                      onClick={handleSaveAsNew}
                      disabled={isSavingToLibrary}
                      className="px-3 py-1.5 text-sm font-medium rounded-md border border-amber-600 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-50"
                    >
                      Save as New
                    </button>
                    <button
                      onClick={handleCancelOverwrite}
                      disabled={isSavingToLibrary}
                      className="px-3 py-1.5 text-sm font-medium rounded-md text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1">
            <button
              onClick={() => setSchemaInfoTab('metadata')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                schemaInfoTab === 'metadata'
                  ? 'bg-surface-primary text-brand-600 border border-b-0 border-border -mb-px'
                  : 'text-content-tertiary hover:text-content-secondary'
              }`}
            >
              <Settings className="h-4 w-4 inline mr-1.5" />
              Metadata
            </button>
            <button
              onClick={handlePreviewTabClick}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                schemaInfoTab === 'preview'
                  ? 'bg-surface-primary text-brand-600 border border-b-0 border-border -mb-px'
                  : 'text-content-tertiary hover:text-content-secondary'
              }`}
            >
              <Code className="h-4 w-4 inline mr-1.5" />
              Preview JSON
            </button>
          </div>
        </div>

        {/* Content */}
        {schemaInfoTab === 'metadata' ? (
        <div className="flex-1 overflow-y-auto p-6">
          {/* Basic Info Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            {/* Schema Name - Takes 2 columns */}
            <div className="lg:col-span-2">
              <label htmlFor="schema-name" className="block text-sm font-medium text-content-secondary mb-1.5">
                Schema Name <span className="text-status-error">*</span>
              </label>
              <input
                type="text"
                id="schema-name"
                value={schemaMetadata?.name || ''}
                onChange={(e) => onUpdateSchemaMetadata({ name: e.target.value })}
                className="w-full px-3 py-2 border border-border-secondary rounded-lg bg-surface-primary text-content-primary focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-lg"
                placeholder="e.g., Brain MRI Protocol"
              />
            </div>

            {/* Version - Takes 1 column */}
            <div>
              <label htmlFor="schema-version" className="block text-sm font-medium text-content-secondary mb-1.5">
                Version <span className="text-status-error">*</span>
              </label>
              <input
                type="text"
                id="schema-version"
                value={schemaMetadata?.version || ''}
                onChange={(e) => onUpdateSchemaMetadata({ version: e.target.value })}
                className="w-full px-3 py-2 border border-border-secondary rounded-lg bg-surface-primary text-content-primary focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-lg"
                placeholder="1.0"
              />
            </div>
          </div>

          {/* Authors Section */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-content-secondary mb-1.5">
              Authors <span className="text-status-error">*</span>
            </label>
            <div
              className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 border border-border-secondary rounded-lg bg-surface-primary focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-brand-500 min-h-[42px] cursor-text"
              onClick={(e) => {
                // Focus the input when clicking the container
                const input = e.currentTarget.querySelector('input');
                input?.focus();
              }}
            >
              {schemaMetadata?.authors?.map((author, index) => (
                <span
                  key={index}
                  className="inline-flex items-center pl-2.5 pr-1 py-0.5 rounded-md text-sm bg-surface-secondary border border-border text-content-primary"
                >
                  {author}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeAuthor(author);
                    }}
                    className="ml-1 p-0.5 rounded hover:bg-surface-tertiary text-content-tertiary hover:text-content-secondary"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={authorInput}
                onChange={handleAuthorInputChange}
                onKeyDown={handleAuthorKeyDown}
                onBlur={() => {
                  if (authorInput.trim()) {
                    addAuthor(authorInput);
                    setAuthorInput('');
                  }
                }}
                className="flex-1 min-w-[120px] px-1 py-1 bg-transparent text-content-primary focus:outline-none"
                placeholder={schemaMetadata?.authors?.length ? '' : 'Type name, then comma or Enter...'}
              />
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-border my-6" />

          {/* README Section */}
          <div className="flex-1 flex flex-col">
            {/* Tab Header */}
            <div className="flex border-b border-border mb-0">
              <button
                onClick={() => setIsEditingReadme(true)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  isEditingReadme
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-content-tertiary hover:text-content-secondary'
                }`}
              >
                <Edit2 className="h-3.5 w-3.5 inline mr-1.5" />
                Edit
              </button>
              <button
                onClick={() => {
                  // Auto-save when switching to preview
                  if (isEditingReadme && editedReadme !== (schemaMetadata?.description || '')) {
                    onUpdateSchemaMetadata({ description: editedReadme });
                  }
                  setIsEditingReadme(false);
                }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  !isEditingReadme
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-content-tertiary hover:text-content-secondary'
                }`}
              >
                <Eye className="h-3.5 w-3.5 inline mr-1.5" />
                Preview
              </button>
            </div>

            {/* Tab Content */}
            {isEditingReadme ? (
              <textarea
                value={editedReadme}
                onChange={(e) => setEditedReadme(e.target.value)}
                className="flex-1 w-full min-h-[350px] p-4 border border-t-0 border-border-secondary rounded-b-lg font-mono text-sm bg-surface-secondary text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                placeholder="# My Schema

Describe the purpose of this schema...

## Overview
What imaging protocol does this schema define?

## Acquisitions
- **T1w MPRAGE**: High-resolution structural imaging
- **T2w FLAIR**: White matter lesion detection

## Clinical Purpose
Explain the clinical use case.

## Notes
Any additional technical details or vendor-specific information."
              />
            ) : (
              <div className="flex-1 border border-t-0 border-border-secondary rounded-b-lg bg-surface-secondary min-h-[200px] overflow-auto">
                {schemaMetadata?.description ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert p-4">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ children }) => <h1 className="text-2xl font-bold text-content-primary mb-4 pb-2 border-b border-border">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-xl font-semibold text-content-primary mt-6 mb-3">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-lg font-semibold text-content-primary mt-4 mb-2">{children}</h3>,
                        h4: ({ children }) => <h4 className="text-base font-semibold text-content-primary mt-3 mb-2">{children}</h4>,
                        p: ({ children }) => <p className="text-content-secondary mb-3 leading-relaxed">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1 text-content-secondary">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-inside mb-3 space-y-1 text-content-secondary">{children}</ol>,
                        li: ({ children }) => <li className="ml-2">{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold text-content-primary">{children}</strong>,
                        code: ({ className, children, ...props }) => {
                          const isInline = !className;
                          if (isInline) {
                            return <code className="bg-surface-tertiary text-brand-600 dark:text-brand-400 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>;
                          }
                          return (
                            <code className={`${className} block bg-gray-900 text-gray-100 p-4 rounded-lg text-sm font-mono overflow-x-auto`} {...props}>
                              {children}
                            </code>
                          );
                        },
                        pre: ({ children }) => <pre className="mb-4">{children}</pre>,
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-4 border-brand-500 pl-4 py-1 my-3 text-content-secondary italic bg-surface-tertiary rounded-r">
                            {children}
                          </blockquote>
                        ),
                      }}
                    >
                      {schemaMetadata.description}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-content-tertiary">
                    <Book className="h-10 w-10 mb-3 opacity-40" />
                    <p className="text-sm mb-2">No documentation yet</p>
                    <button
                      onClick={() => setIsEditingReadme(true)}
                      className="text-sm text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                    >
                      Add a README →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        ) : (
        /* Preview JSON Tab */
        <div className="flex-1 overflow-y-auto p-6">
          {isGeneratingPreview || !previewJson ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader className="h-8 w-8 animate-spin text-brand-600 mx-auto mb-3" />
                <p className="text-content-secondary">Generating schema preview...</p>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col">
              <div className="flex-1 border border-border-secondary rounded-lg overflow-hidden">
                <CodeMirror
                  value={previewJson}
                  extensions={[json()]}
                  theme={theme === 'dark' ? 'dark' : 'light'}
                  editable={false}
                  height="100%"
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    highlightActiveLine: false,
                  }}
                />
              </div>
            </div>
          )}
        </div>
        )}
      </div>
    );
  }

  // Render "Add New" tabbed interface
  if (isAddNew) {
    return (
      <div className="border border-border rounded-lg bg-surface-primary shadow-sm flex flex-col h-full">
        {/* Tab Headers */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('start')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'start'
                ? 'text-brand-600 border-b-2 border-brand-600 bg-surface-primary'
                : 'text-content-secondary hover:text-content-primary bg-surface-secondary'
            }`}
          >
            Start
          </button>
          <button
            onClick={() => setActiveTab('schema')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'schema'
                ? 'text-brand-600 border-b-2 border-brand-600 bg-surface-primary'
                : 'text-content-secondary hover:text-content-primary bg-surface-secondary'
            }`}
          >
            <FileText className="h-4 w-4 inline mr-2" />
            From schema
          </button>
          <button
            onClick={() => setActiveTab('data')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'data'
                ? 'text-brand-600 border-b-2 border-brand-600 bg-surface-primary'
                : 'text-content-secondary hover:text-content-primary bg-surface-secondary'
            }`}
          >
            <Upload className="h-4 w-4 inline mr-2" />
            From data
          </button>
          <button
            onClick={onAddFromScratch}
            className="flex-1 px-4 py-3 text-sm font-medium transition-colors text-content-secondary hover:text-content-primary bg-surface-secondary"
          >
            <Plus className="h-4 w-4 inline mr-2" />
            From scratch
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {activeTab === 'start' ? (
            <div className="flex-1 flex flex-col items-center pt-6 p-4">
              <div className="text-center mb-4">
                <h2 className="text-base font-semibold text-content-primary mb-1">Add to workspace</h2>
                <p className="text-sm text-content-secondary">Choose how to add acquisitions</p>
              </div>
              <div className="grid grid-cols-3 gap-4 max-w-lg">
                {/* Browse schemas */}
                <button
                  onClick={() => setActiveTab('schema')}
                  className="flex flex-col items-center p-4 border border-border-secondary rounded-lg hover:border-brand-500 hover:shadow-md transition-all group bg-surface-primary"
                >
                  <div className="p-3 bg-brand-100 dark:bg-brand-900/30 rounded-full mb-2 group-hover:bg-brand-200 dark:group-hover:bg-brand-900/50 group-hover:scale-105 transition-all">
                    <FileText className="h-5 w-5 text-brand-600" />
                  </div>
                  <span className="text-sm font-medium text-content-primary">Browse schemas</span>
                  <span className="text-xs text-content-tertiary mt-1 text-center">Start from the library</span>
                </button>

                {/* Upload */}
                <button
                  onClick={() => setActiveTab('data')}
                  className="flex flex-col items-center p-4 border border-border-secondary rounded-lg hover:border-brand-500 hover:shadow-md transition-all group bg-surface-primary"
                >
                  <div className="p-3 bg-brand-100 dark:bg-brand-900/30 rounded-full mb-2 group-hover:bg-brand-200 dark:group-hover:bg-brand-900/50 group-hover:scale-105 transition-all">
                    <Upload className="h-5 w-5 text-brand-600" />
                  </div>
                  <span className="text-sm font-medium text-content-primary">Load data</span>
                  <span className="text-xs text-content-tertiary mt-1 text-center">Analyse DICOMs or protocols</span>
                </button>

                {/* Blank */}
                <button
                  onClick={onAddFromScratch}
                  className="flex flex-col items-center p-4 border border-border-secondary rounded-lg hover:border-brand-500 hover:shadow-md transition-all group bg-surface-primary"
                >
                  <div className="p-3 bg-brand-100 dark:bg-brand-900/30 rounded-full mb-2 group-hover:bg-brand-200 dark:group-hover:bg-brand-900/50 group-hover:scale-105 transition-all">
                    <Plus className="h-5 w-5 text-brand-600" />
                  </div>
                  <span className="text-sm font-medium text-content-primary">Blank</span>
                  <span className="text-xs text-content-tertiary mt-1 text-center">Create from scratch</span>
                </button>
              </div>
            </div>
          ) : activeTab === 'schema' ? (
            <div className="h-full flex flex-col">
              {/* Inline Schema Browser */}
              <div className="flex-1 overflow-y-auto p-4">
                <UnifiedSchemaSelector
                  librarySchemas={librarySchemas}
                  uploadedSchemas={uploadedSchemas}
                  selectionMode="acquisition"
                  multiSelectMode={true}
                  selectedAcquisitions={pendingSchemaSelections}
                  onAcquisitionToggle={onSchemaToggle}
                  expandable={true}
                  getSchemaContent={getSchemaContent}
                  enableDragDrop={true}
                  onSchemaReadmeClick={onSchemaReadmeClick}
                  onAcquisitionReadmeClick={onAcquisitionReadmeClick}
                  onSchemaEdit={handleSchemaEdit}
                  onSchemaUpload={handleSchemaUpload}
                />
              </div>

              {/* Footer with Add Button */}
              <div className="px-4 py-3 border-t border-border flex items-center justify-between bg-surface-secondary">
                <p className="text-sm text-content-secondary">
                  {pendingSchemaSelections.length} selected
                </p>
                <button
                  onClick={onConfirmSchemas}
                  disabled={pendingSchemaSelections.length === 0}
                  className={`px-4 py-2 rounded-lg ${
                    pendingSchemaSelections.length === 0
                      ? 'bg-surface-tertiary text-content-muted cursor-not-allowed'
                      : 'bg-brand-600 text-content-inverted hover:bg-brand-700'
                  }`}
                >
                  Add {pendingSchemaSelections.length} Acquisition{pendingSchemaSelections.length !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          ) : activeTab === 'data' ? (
            <div className="p-4 flex-1 overflow-y-auto flex flex-col">
              {/* Privacy notice */}
              <div className="mb-3 px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                <p className="text-xs text-green-800 dark:text-green-200">
                  Your data stays private. Files are analysed locally and never uploaded.
                </p>
              </div>

              {isProcessing ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <Loader className="h-10 w-10 text-brand-600 mx-auto mb-3 animate-spin" />
                  <h3 className="text-base font-semibold text-content-primary mb-1">Processing Files</h3>
                  <p className="text-sm text-content-secondary mb-3">{processingProgress?.currentOperation}</p>

                  {processingProgress && (
                    <div className="space-y-2 w-full max-w-xs">
                      <div className="w-full bg-surface-secondary rounded-full h-1.5">
                        <div
                          className="bg-brand-600 h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${processingProgress.percentage}%` }}
                        />
                      </div>
                      <p className="text-xs text-content-secondary text-center">
                        {Math.round(processingProgress.percentage)}% complete
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Reference Data Zone */}
                  <div
                    className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors flex flex-col items-center justify-center ${
                      isDragOverReference
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                        : 'border-border-secondary hover:border-brand-500'
                    }`}
                    onDragOver={handleReferenceDragOver}
                    onDragLeave={handleReferenceDragLeave}
                    onDrop={handleReferenceDrop}
                  >
                    <div className="p-2 bg-brand-100 dark:bg-brand-900/30 rounded-full mb-2">
                      <FileText className="h-5 w-5 text-brand-600" />
                    </div>
                    <h3 className="text-sm font-semibold text-content-primary mb-0.5">
                      Reference Data
                    </h3>
                    <p className="text-content-secondary text-xs mb-1">
                      For building or editing schemas
                    </p>
                    <p className="text-content-tertiary text-xs mb-2">
                      DICOMs, protocols (.pro), exam cards
                    </p>

                    <input
                      type="file"
                      multiple
                      webkitdirectory=""
                      accept=".dcm,.dicom,.zip,.pro,.exar1,.ExamCard,.examcard,LxProtocol"
                      className="hidden"
                      id="file-upload-reference"
                      onChange={(e) => onFileUpload(e.target.files, 'schema-template')}
                    />
                    <label
                      htmlFor="file-upload-reference"
                      className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-content-inverted bg-brand-600 hover:bg-brand-700 cursor-pointer"
                    >
                      <Upload className="h-4 w-4 mr-1.5" />
                      Browse
                    </label>
                  </div>

                  {/* Test Data Zone */}
                  <div
                    className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors flex flex-col items-center justify-center ${
                      isDragOverTest
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                        : 'border-border-secondary hover:border-amber-500'
                    }`}
                    onDragOver={handleTestDragOver}
                    onDragLeave={handleTestDragLeave}
                    onDrop={handleTestDrop}
                  >
                    <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-full mb-2">
                      <FlaskConical className="h-5 w-5 text-amber-600" />
                    </div>
                    <h3 className="text-sm font-semibold text-content-primary mb-0.5">
                      Test Data
                    </h3>
                    <p className="text-content-secondary text-xs mb-1">
                      For validating against a schema
                    </p>
                    <p className="text-content-tertiary text-xs mb-2">
                      DICOM files only
                    </p>

                    <input
                      type="file"
                      multiple
                      webkitdirectory=""
                      accept=".dcm,.dicom,.zip"
                      className="hidden"
                      id="file-upload-test"
                      onChange={(e) => onFileUpload(e.target.files, 'validation-subject')}
                    />
                    <label
                      htmlFor="file-upload-test"
                      className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-amber-600 hover:bg-amber-700 cursor-pointer"
                    >
                      <Upload className="h-4 w-4 mr-1.5" />
                      Browse
                    </label>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // Render selected item details
  if (!selectedItem) {
    return (
      <div className="bg-surface-primary rounded-lg border border-border shadow-sm p-6 h-full flex items-center justify-center">
        <div className="text-center">
          <FileText className="h-12 w-12 text-content-muted mx-auto mb-4" />
          <h3 className="text-lg font-medium text-content-primary mb-2">No Acquisition Selected</h3>
          <p className="text-content-secondary">Select an acquisition from the sidebar</p>
        </div>
      </div>
    );
  }

  // Determine what actions are available based on source and mode
  // Items used as schema (either schema-sourced or data used as schema template) can have data attached
  const isUsedAsSchema = selectedItem.source === 'schema' ||
    (selectedItem.source === 'data' && (selectedItem.dataUsageMode === 'schema-template' || !selectedItem.dataUsageMode));
  const canAttachData = isUsedAsSchema;
  // Only allow attaching schema when in validation-subject mode
  const canAttachSchema = selectedItem.source === 'data' && selectedItem.dataUsageMode === 'validation-subject';
  const hasAttachedData = selectedItem.attachedData !== undefined;
  const hasAttachedSchema = selectedItem.attachedSchema !== undefined;
  // For data-sourced items, only allow editing in schema-template mode
  const canEdit = isUsedAsSchema;

  // Helper to render acquisition info panel
  const renderAcquisitionInfo = (isSchema: boolean) => {
    const isEditable = selectedItem.isEditing && canEdit && !hasAttachedData && !hasAttachedSchema;
    const icon = isSchema ? (
      <FileText className="h-5 w-5 text-brand-600" />
    ) : (
      <Database className="h-5 w-5 text-amber-600" />
    );

    return (
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg flex-shrink-0 ${isSchema ? 'bg-brand-100 dark:bg-brand-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            {isEditable ? (
              <div className="space-y-1">
                <input
                  type="text"
                  value={selectedItem.acquisition.protocolName || ''}
                  onChange={(e) => onUpdateAcquisition({ protocolName: e.target.value })}
                  className="text-lg font-semibold text-content-primary bg-surface-primary border border-border-secondary rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Acquisition Name"
                />
                <input
                  type="text"
                  value={selectedItem.acquisition.seriesDescription || ''}
                  onChange={(e) => onUpdateAcquisition({ seriesDescription: e.target.value })}
                  className="text-sm text-content-secondary bg-surface-primary border border-border-secondary rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Short description"
                />
              </div>
            ) : (
              <>
                <h4 className="text-lg font-semibold text-content-primary truncate">
                  {selectedItem.acquisition.protocolName || 'Untitled Acquisition'}
                </h4>
                <p className="text-sm text-content-secondary truncate">
                  {selectedItem.acquisition.seriesDescription || 'No description'}
                </p>
              </>
            )}
            {/* Origin info for schema-sourced items */}
            {isSchema && selectedItem.schemaOrigin && (
              <p className="text-xs text-content-tertiary mt-1 truncate">
                From {selectedItem.schemaOrigin.schemaName}
              </p>
            )}
            {/* Source indicator for data items */}
            {!isSchema && selectedItem.source === 'data' && (
              <p className="text-xs text-content-tertiary mt-1">
                {selectedItem.dataUsageMode === 'validation-subject' ? 'Test data' : 'Reference data'}
              </p>
            )}
          </div>
        </div>
        {/* Tags - only show in schema panel */}
        {isSchema && (selectedItem.isEditing || (selectedItem.acquisition.tags && selectedItem.acquisition.tags.length > 0)) && (
          <div className="mt-3 pl-12">
            <InlineTagInput
              tags={selectedItem.acquisition.tags || []}
              onChange={(tags) => onUpdateAcquisition({ tags })}
              suggestions={allTags}
              placeholder="Add tags..."
              disabled={!selectedItem.isEditing || hasAttachedData || hasAttachedSchema}
            />
          </div>
        )}
      </div>
    );
  };

  // Helper to render attachment zone (for missing schema or data)
  const renderAttachmentZone = (type: 'schema' | 'data') => {
    const isSchemaZone = type === 'schema';

    if (isSchemaZone) {
      // Schema attachment zone (for validation-subject items)
      if (hasAttachedSchema && selectedItem.attachedSchema) {
        // Show attached schema info
        return (
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg flex-shrink-0 bg-green-100 dark:bg-green-900/30">
                <FileText className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-lg font-semibold text-content-primary truncate">
                  {selectedItem.attachedSchema.schema?.name || 'Schema'}
                </h4>
                {selectedItem.attachedSchema.acquisitionName && (
                  <p className="text-sm text-content-secondary truncate">
                    {selectedItem.attachedSchema.acquisitionName}
                  </p>
                )}
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  Schema attached for validation
                </p>
              </div>
              <button
                onClick={onDetachSchema}
                className="flex-shrink-0 p-1.5 text-content-tertiary hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                title="Detach schema"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      }
      // Show schema attachment prompt
      return (
        <div className="flex-1 min-w-0">
          <div
            className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
              'border-border-secondary hover:border-brand-400 bg-surface-secondary/50'
            }`}
          >
            <FileText className="h-6 w-6 text-content-muted mx-auto mb-2" />
            <p className="text-sm font-medium text-content-secondary mb-1">No schema selected</p>
            <p className="text-xs text-content-tertiary mb-3">Choose a schema to validate against</p>
            <button
              onClick={onAttachSchema}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md text-content-inverted bg-brand-600 hover:bg-brand-700"
            >
              Choose Schema
            </button>
          </div>
        </div>
      );
    } else {
      // Data attachment zone (for schema items)
      if (hasAttachedData && selectedItem.attachedData) {
        // Show attached data info
        return (
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg flex-shrink-0 bg-green-100 dark:bg-green-900/30">
                <Database className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-lg font-semibold text-content-primary">
                  {selectedItem.attachedData.totalFiles} {selectedItem.attachedData.totalFiles === 1 ? 'file' : 'files'}
                </h4>
                <p className="text-sm text-content-secondary truncate">
                  {selectedItem.attachedData.acquisitions?.[0]?.seriesDescription || 'DICOM data'}
                </p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  Data attached for validation
                </p>
              </div>
              <button
                onClick={onDetachData}
                className="flex-shrink-0 p-1.5 text-content-tertiary hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                title="Detach data"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      }
      // Show data attachment prompt with drop zone
      return (
        <div className="flex-1 min-w-0">
          <div
            className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
              isDragOver
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                : 'border-border-secondary hover:border-brand-400 bg-surface-secondary/50'
            }`}
            onDragOver={!isProcessing ? handleDragOver : undefined}
            onDragLeave={!isProcessing ? handleDragLeave : undefined}
            onDrop={!isProcessing ? handleDrop : undefined}
          >
            {isProcessing ? (
              <>
                <Loader className="h-6 w-6 text-brand-600 mx-auto mb-2 animate-spin" />
                <p className="text-sm font-medium text-content-secondary mb-1">Processing...</p>
                {processingProgress && (
                  <div className="w-full max-w-[120px] mx-auto">
                    <div className="w-full bg-surface-tertiary rounded-full h-1.5">
                      <div
                        className="bg-brand-600 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${processingProgress.percentage}%` }}
                      />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <Upload className={`h-6 w-6 mx-auto mb-2 ${isDragOver ? 'text-brand-600' : 'text-content-muted'}`} />
                <p className="text-sm font-medium text-content-secondary mb-1">No data attached</p>
                <p className="text-xs text-content-tertiary mb-3">Drop files or browse to validate</p>
                <div className="flex items-center justify-center gap-2">
                  <input
                    type="file"
                    multiple
                    webkitdirectory=""
                    className="hidden"
                    id={`attach-data-header-${selectedItem.id}`}
                    onChange={(e) => e.target.files && onAttachData(e.target.files)}
                  />
                  <label
                    htmlFor={`attach-data-header-${selectedItem.id}`}
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md text-content-inverted bg-brand-600 hover:bg-brand-700 cursor-pointer"
                  >
                    Browse
                  </label>
                  <button
                    onClick={onGenerateTestData}
                    className="inline-flex items-center px-3 py-1.5 border border-border-secondary text-content-secondary text-sm rounded-md hover:bg-surface-secondary"
                    title="Generate test data"
                  >
                    <Database className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      );
    }
  };

  return (
    <div className="bg-surface-primary rounded-lg border border-border shadow-sm">
      {/* Header with split layout */}
      <div className="px-6 py-4 border-b border-border">
        {/* Split layout: Schema (left) | Data (right) */}
        <div className="grid grid-cols-2 gap-6">
          {/* Left side - Schema */}
          <div className="border-r border-border pr-6">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-medium text-content-tertiary uppercase tracking-wider">Schema</div>
              {/* Schema actions - README and Edit */}
              {isUsedAsSchema && (
                <div className="flex items-center gap-1.5">
                  {/* README button */}
                  {!selectedItem.isEditing ? (
                    (() => {
                      const hasReadme = selectedItem.acquisition.detailedDescription || selectedItem.schemaOrigin || selectedItem.attachedSchema;
                      return (
                        <button
                          onClick={hasReadme ? openReadmeWithSidebar : undefined}
                          disabled={!hasReadme}
                          className={`inline-flex items-center px-2 py-1 border text-xs rounded ${
                            hasReadme
                              ? 'border-border-secondary text-content-secondary hover:bg-surface-secondary'
                              : 'border-border-secondary text-content-muted cursor-not-allowed opacity-50'
                          }`}
                          title={hasReadme ? "View documentation" : "No README available"}
                        >
                          <Book className="h-3.5 w-3.5 mr-1" />
                          README
                        </button>
                      );
                    })()
                  ) : canEdit && !hasAttachedData && !hasAttachedSchema ? (
                    <button
                      onClick={() => setShowDetailedDescription(true)}
                      className="inline-flex items-center px-2 py-1 border text-xs rounded border-border-secondary text-content-secondary hover:bg-surface-secondary"
                      title={selectedItem.acquisition.detailedDescription ? 'Edit detailed description' : 'Add detailed description'}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      README
                    </button>
                  ) : null}

                  {/* Edit toggle */}
                  {canEdit && !hasAttachedData && !hasAttachedSchema && (
                    <button
                      onClick={onToggleEditing}
                      className={`inline-flex items-center px-2 py-1 border text-xs rounded ${
                        selectedItem.isEditing
                          ? 'border-brand-500 text-brand-600 bg-brand-50 dark:bg-brand-900/20'
                          : 'border-border-secondary text-content-secondary hover:bg-surface-secondary'
                      }`}
                    >
                      {selectedItem.isEditing ? (
                        <>
                          <Save className="h-3.5 w-3.5 mr-1" />
                          Save
                        </>
                      ) : (
                        <>
                          <Edit2 className="h-3.5 w-3.5 mr-1" />
                          Edit
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
            {isUsedAsSchema ? (
              // This item IS the schema - show its info
              renderAcquisitionInfo(true)
            ) : (
              // This item is data - show schema attachment zone
              renderAttachmentZone('schema')
            )}
          </div>

          {/* Right side - Data */}
          <div className="pl-0">
            <div className="text-xs font-medium text-content-tertiary uppercase tracking-wider mb-3">Data</div>
            {isUsedAsSchema ? (
              // This item is schema - show data attachment zone
              renderAttachmentZone('data')
            ) : (
              // This item IS the data - show its info
              renderAcquisitionInfo(false)
            )}
          </div>
        </div>
      </div>

      {/* Content - AcquisitionTable */}
      <div className="px-6 py-4 space-y-4">
        <AcquisitionTable
            acquisition={
              // For validation-subject items with attached schema, show the schema as "expected"
              // For schema items (including data-as-schema), show the item's acquisition
              !isUsedAsSchema && hasAttachedSchema && loadedSchemaAcquisition
                ? loadedSchemaAcquisition
                : selectedItem.acquisition
            }
            isEditMode={selectedItem.isEditing}
            mode={hasAttachedData || hasAttachedSchema ? 'compliance' : 'edit'}
            realAcquisition={
              // For items used as schema, attached data is the "real" data to validate
              // For validation-subject items, the acquisition itself is the real data
              isUsedAsSchema
                ? selectedItem.attachedData     // Schema mode: attached data is real data
                : selectedItem.acquisition      // Validation mode: acquisition is real data
            }
            schemaId={
              // Schema-sourced items have a schemaOrigin
              // Data-as-schema items don't have a schemaId (we'll handle this separately)
              // Validation-subject items use attachedSchema
              isUsedAsSchema
                ? selectedItem.schemaOrigin?.schemaId             // From schema origin (may be undefined for data-as-schema)
                : selectedItem.attachedSchema?.schemaId           // From attached schema
            }
            schemaAcquisitionId={
              isUsedAsSchema
                ? selectedItem.schemaOrigin?.acquisitionIndex?.toString()  // From schema origin
                : selectedItem.attachedSchema?.acquisitionId      // From attached schema
            }
            schemaAcquisition={
              // For data-as-schema items without a schemaId, pass the acquisition directly
              isUsedAsSchema && !selectedItem.schemaOrigin?.schemaId
                ? selectedItem.acquisition
                : undefined
            }
            getSchemaContent={getSchemaContent}
            hideHeader={true}
            onUpdate={(key, value) => onUpdateAcquisition({ [key]: value })}
            onDelete={onRemove}
            onFieldUpdate={(fieldTag, updates) => workspace.updateField(selectedItem.id, fieldTag, updates)}
            onFieldConvert={(fieldTag, toLevel, mode) => workspace.convertFieldLevel(selectedItem.id, fieldTag, toLevel, mode)}
            onFieldDelete={(fieldTag) => workspace.deleteField(selectedItem.id, fieldTag)}
            onFieldAdd={(fieldTags) => workspace.addFields(selectedItem.id, fieldTags)}
            onSeriesUpdate={(seriesIndex, fieldTag, updates) => workspace.updateSeries(selectedItem.id, seriesIndex, fieldTag, updates)}
            onSeriesAdd={() => workspace.addSeries(selectedItem.id)}
            onSeriesDelete={(seriesIndex) => workspace.deleteSeries(selectedItem.id, seriesIndex)}
            onSeriesNameUpdate={(seriesIndex, name) => workspace.updateSeriesName(selectedItem.id, seriesIndex, name)}
            onValidationFunctionAdd={(func) => workspace.addValidationFunction(selectedItem.id, func)}
            onValidationFunctionUpdate={(index, func) => workspace.updateValidationFunction(selectedItem.id, index, func)}
            onValidationFunctionDelete={(index) => workspace.deleteValidationFunction(selectedItem.id, index)}
          />
      </div>


      {/* Detailed Description Modal - for editing mode or when no schema context */}
      <DetailedDescriptionModal
        isOpen={showDetailedDescription}
        onClose={() => setShowDetailedDescription(false)}
        title={selectedItem.acquisition.protocolName || 'Acquisition'}
        description={selectedItem.acquisition.detailedDescription || ''}
        onSave={selectedItem.isEditing && !hasAttachedData && !hasAttachedSchema
          ? (description) => onUpdateAcquisition({ detailedDescription: description })
          : undefined
        }
        isReadOnly={!selectedItem.isEditing || hasAttachedData || hasAttachedSchema}
      />

      {/* Schema README Modal - for viewing mode with schema context (shows sidebar with all acquisitions) */}
      <SchemaReadmeModal
        isOpen={showReadmeModal}
        onClose={() => setShowReadmeModal(false)}
        schemaName={readmeModalData?.schemaName || ''}
        readmeItems={readmeModalData?.readmeItems || []}
        initialSelection={readmeModalData?.initialSelection || 'schema'}
      />
    </div>
  );
};

export default WorkspaceDetailPanel;
