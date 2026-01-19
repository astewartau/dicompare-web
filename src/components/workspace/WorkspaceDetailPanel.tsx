import React, { useCallback, useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import { Upload, FileText, Plus, Edit2, Save, Database, Loader, X, Book, Pencil, FlaskConical, ShieldCheck, Eye, Download, Code, Settings, Check, AlertTriangle, Layers, ArrowRight, FolderOpen, Printer, Copy } from 'lucide-react';
import { formatFieldDisplay, buildValidationRuleFromField } from '../../utils/fieldFormatters';
import { WorkspaceItem, ProcessingProgress, SchemaMetadata } from '../../contexts/WorkspaceContext';
import { UnifiedSchema } from '../../hooks/useSchemaService';
import { Acquisition, AcquisitionSelection } from '../../types';
import { ComplianceFieldResult } from '../../types/schema';
import UnifiedSchemaSelector from '../schema/UnifiedSchemaSelector';
import AcquisitionTable from '../schema/AcquisitionTable';
import InlineTagInput from '../common/InlineTagInput';
import DetailedDescriptionModal from '../schema/DetailedDescriptionModal';
import SchemaReadmeModal, { ReadmeItem } from '../schema/SchemaReadmeModal';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useSchemaContext } from '../../contexts/SchemaContext';
import { useTagSuggestions } from '../../hooks/useTagSuggestions';
import { convertSchemaToAcquisition } from '../../utils/schemaToAcquisition';
import { buildReadmeItems } from '../../utils/readmeHelpers';
import { getItemFlags } from '../../utils/workspaceHelpers';
import { useDropZone } from '../../hooks/useDropZone';
import { dicompareWorkerAPI as dicompareAPI } from '../../services/DicompareWorkerAPI';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { useTheme } from '../../contexts/ThemeContext';
import { ADD_NEW_ID, ADD_FROM_DATA_ID, SCHEMA_INFO_ID } from './WorkspaceSidebar';

export type SchemaInfoTab = 'welcome' | 'metadata' | 'preview';

interface WorkspaceDetailPanelProps {
  selectedItem: WorkspaceItem | undefined;
  isAddNew: boolean;
  isAddFromData: boolean;
  isSchemaInfo: boolean;
  schemaInfoTab: SchemaInfoTab;
  setSchemaInfoTab: (tab: SchemaInfoTab) => void;
  activeTab: 'schema' | 'data';
  setActiveTab: (tab: 'schema' | 'data') => void;
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
  onAddEmpty: () => void;
  onCreateSchema: () => void;  // Create schema for current empty item
  onDetachCreatedSchema: () => void;  // Detach created schema from current item
  onToggleEditing: () => void;
  onAttachData: (files: FileList) => void;
  onUploadSchemaForItem: (files: FileList) => void;  // Upload DICOMs to build schema for current item
  onDetachData: () => void;
  onDetachValidationData: () => void;
  onAttachSchema: () => void;
  onDetachSchema: () => void;
  onGenerateTestData: () => void;
  onRemove: () => void;
  onUpdateAcquisition: (updates: Partial<Acquisition>) => void;
  onUpdateSchemaMetadata: (updates: Partial<SchemaMetadata>) => void;
  onSchemaReadmeClick: (schemaId: string, schemaName: string) => void;
  onAcquisitionReadmeClick: (schemaId: string, schemaName: string, acquisitionIndex: number) => void;
  // Staged "from data" handlers - create item first, then perform action
  onStagedCreateBlank: () => void;
  onStagedAttachSchema: () => void;
}

const WorkspaceDetailPanel: React.FC<WorkspaceDetailPanelProps> = ({
  selectedItem,
  isAddNew,
  isAddFromData,
  isSchemaInfo,
  schemaInfoTab,
  setSchemaInfoTab,
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
  onAddEmpty,
  onCreateSchema,
  onDetachCreatedSchema,
  onToggleEditing,
  onAttachData,
  onUploadSchemaForItem,
  onDetachData,
  onDetachValidationData,
  onAttachSchema,
  onDetachSchema,
  onGenerateTestData,
  onRemove,
  onUpdateAcquisition,
  onUpdateSchemaMetadata,
  onSchemaReadmeClick,
  onAcquisitionReadmeClick,
  onStagedCreateBlank,
  onStagedAttachSchema,
}) => {
  const workspace = useWorkspace();
  const { processingTarget } = workspace;
  const { uploadSchema, schemas, updateExistingSchema } = useSchemaContext();
  const { allTags } = useTagSuggestions();
  const { theme } = useTheme();

  // Drop zones using shared hook
  const mainDropZone = useDropZone({
    onDrop: (files) => isAddNew ? onFileUpload(files) : onAttachData(files),
    disabled: isProcessing,
  });
  const referenceDropZone = useDropZone({
    onDrop: (files) => onFileUpload(files, 'schema-template'),
    disabled: isProcessing,
  });
  const schemaDropZone = useDropZone({
    onDrop: (files) => {
      // For empty items or validation-subject items needing a schema, upload to current item
      const shouldUploadToCurrentItem = selectedItem?.source === 'empty' ||
        (selectedItem?.dataUsageMode === 'validation-subject' && !selectedItem?.attachedSchema);
      if (shouldUploadToCurrentItem) {
        onUploadSchemaForItem(files);
      } else {
        onFileUpload(files, 'schema-template');
      }
    },
    disabled: isProcessing,
  });
  const testDropZone = useDropZone({
    onDrop: (files) => onFileUpload(files, 'validation-subject'),
    disabled: isProcessing,
  });

  // Schema info editing state
  const [authorInput, setAuthorInput] = useState('');
  const [isEditingReadme, setIsEditingReadme] = useState(true);  // Default to edit tab
  const [editedReadme, setEditedReadme] = useState('');
  const [previewJson, setPreviewJson] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [isSavingToLibrary, setIsSavingToLibrary] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [pendingSaveJson, setPendingSaveJson] = useState<string | null>(null);
  const [existingSchemaId, setExistingSchemaId] = useState<string | null>(null);
  const [showDetailedDescription, setShowDetailedDescription] = useState(false);
  const [showTestDataNotes, setShowTestDataNotes] = useState(false);
  const [loadedSchemaAcquisition, setLoadedSchemaAcquisition] = useState<Acquisition | null>(null);
  const [cachedComplianceResults, setCachedComplianceResults] = useState<ComplianceFieldResult[]>([]);

  // Use a ref to store latest compliance results for print view (refs update synchronously)
  const complianceResultsRef = useRef<ComplianceFieldResult[]>([]);

  // Schema README modal state (with sidebar showing all acquisitions from schema)
  const [showReadmeModal, setShowReadmeModal] = useState(false);
  const [readmeModalData, setReadmeModalData] = useState<{
    schemaName: string;
    readmeItems: ReadmeItem[];
    initialSelection: string;
  } | null>(null);

  // Load schema acquisition when attachedSchema changes (for data-sourced or empty items)
  useEffect(() => {
    if ((selectedItem?.source === 'data' || selectedItem?.source === 'empty') && selectedItem?.attachedSchema) {
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

  // Clear cached compliance results when the reference (schema or data) changes
  // This prevents stale results from appearing in print view after switching references
  useEffect(() => {
    complianceResultsRef.current = [];
    setCachedComplianceResults([]);
  }, [selectedItem?.id, selectedItem?.attachedSchema?.schemaId, selectedItem?.attachedSchema?.acquisitionId, selectedItem?.attachedData?.protocolName]);

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

  // Sync editedReadme with schemaMetadata when switching to schema info view
  useEffect(() => {
    if (isSchemaInfo) {
      setEditedReadme(schemaMetadata?.description || '');
    }
  }, [isSchemaInfo, schemaMetadata?.description]);

  // Invalidate preview when workspace items change (including schema attachments/detachments)
  const itemsKey = workspace.items.map(i =>
    `${i.id}:${i.source}:${i.attachedSchema?.schemaId || ''}:${i.attachedSchema?.acquisitionId || ''}:${i.hasCreatedSchema || ''}`
  ).join(',');
  useEffect(() => {
    setPreviewJson(null);
  }, [itemsKey]);

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
  const generatePreview = useCallback(async () => {
    // First, save any pending README edits
    const currentDescription = editedReadme || schemaMetadata?.description || '';
    if (editedReadme && editedReadme !== schemaMetadata?.description) {
      onUpdateSchemaMetadata({ description: editedReadme });
    }

    setIsGeneratingPreview(true);
    try {
      const { acquisitions } = await workspace.getSchemaExport(getSchemaContent);
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
  }, [editedReadme, schemaMetadata, workspace, getSchemaContent, onUpdateSchemaMetadata]);

  // Auto-generate preview when on preview tab with no preview
  useEffect(() => {
    if (isSchemaInfo && schemaInfoTab === 'preview' && !previewJson && !isGeneratingPreview) {
      generatePreview();
    }
  }, [isSchemaInfo, schemaInfoTab, previewJson, isGeneratingPreview, generatePreview]);

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
        const { acquisitions } = await workspace.getSchemaExport(getSchemaContent);
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

  // Copy JSON to clipboard
  const handleCopyJson = async () => {
    if (!previewJson) return;
    try {
      await navigator.clipboard.writeText(previewJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
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
      const { acquisitions } = await workspace.getSchemaExport(getSchemaContent);
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

  // Print acquisition
  const handlePrintAcquisition = useCallback(async () => {
    if (!selectedItem) return;

    // Compute flags inside callback to avoid initialization order issues
    const flags = getItemFlags(selectedItem);
    const { isEmptyItem, hasCreatedSchema, hasAttachedData, hasAttachedSchema, isUsedAsSchema } = flags;

    // Determine schema acquisition (what we're validating against)
    const schemaAcquisition = hasAttachedSchema && loadedSchemaAcquisition
      ? loadedSchemaAcquisition
      : (isEmptyItem && !hasCreatedSchema && !hasAttachedSchema && hasAttachedData && selectedItem.attachedData)
        ? selectedItem.attachedData
        : selectedItem.acquisition;

    // Determine if we're in compliance mode
    const isComplianceMode =
      (selectedItem.source === 'data' && selectedItem.dataUsageMode === 'validation-subject' && hasAttachedSchema) ||
      (isUsedAsSchema && hasAttachedData) ||
      (!isUsedAsSchema && hasAttachedSchema);

    // Get the real data (if compliance mode)
    const realAcquisition = isComplianceMode
      ? (selectedItem.source === 'data' && selectedItem.dataUsageMode === 'validation-subject'
          ? selectedItem.acquisition
          : isUsedAsSchema
            ? selectedItem.attachedData
            : selectedItem.acquisition)
      : null;

    // Use ref for compliance results (ref updates synchronously, state is async)
    // This ensures print sees the latest results even if called right after setState
    const complianceResults = isComplianceMode ? complianceResultsRef.current : [];

    // Debug: Log compliance results in print view
    console.log('[Print] isComplianceMode:', isComplianceMode);
    console.log('[Print] complianceResultsRef.current length:', complianceResultsRef.current.length);
    console.log('[Print] complianceResults:', complianceResults);

    // Build header info
    const schemaName = schemaAcquisition.protocolName || 'Acquisition';
    const schemaDescription = schemaAcquisition.seriesDescription || '';
    const dataName = realAcquisition?.protocolName || '';
    const dataDescription = realAcquisition?.seriesDescription || '';

    // Get schema source info (name, tags, authors) - be explicit about source to avoid stale data
    let schemaSource = '';
    let schemaTags: string[] = [];
    let schemaAuthors: string[] = [];
    let schemaVersion = '';

    if (hasAttachedSchema && selectedItem.attachedSchema?.schema) {
      // Use attached schema as the source
      const schema = selectedItem.attachedSchema.schema;
      // Get acquisition-specific tags if available, otherwise fall back to schema tags
      const acquisitionTags = schemaAcquisition.tags || (schemaAcquisition as any).acquisitionTags;
      schemaSource = schema.name || '';
      schemaTags = acquisitionTags || schema.tags || [];
      schemaAuthors = schema.authors || [];
      schemaVersion = schema.version || '';
    } else if (hasCreatedSchema && schemaMetadata) {
      // Use schema metadata for user-created schemas
      schemaSource = schemaMetadata.name || '';
      schemaTags = schemaMetadata.tags || [];
      schemaAuthors = schemaMetadata.authors || [];
      schemaVersion = schemaMetadata.version || '';
    } else if (selectedItem.schemaOrigin) {
      // Use schema origin info
      schemaSource = selectedItem.schemaOrigin.schemaName || '';
    }

    const fields = schemaAcquisition.acquisitionFields || [];
    const series = schemaAcquisition.series || [];
    const validationFunctions = schemaAcquisition.validationFunctions || [];

    // Helper to normalize tag for comparison
    const normalizeTag = (t: string) => t?.replace(/[(), ]/g, '').toUpperCase() || '';

    // Helper to find compliance result for a field by tag, keyword, or name
    const findFieldCompliance = (tag: string, fieldName?: string, keyword?: string) => {
      return complianceResults.find(r => {
        // Skip validation rules
        if (r.validationType === 'validation_rule') return false;

        // Try exact tag match first (most reliable)
        if (tag && r.fieldPath === tag) return true;

        // Try exact keyword match
        if (keyword && r.fieldName === keyword) return true;

        // Try exact name match
        if (fieldName && r.fieldName === fieldName) return true;

        // Try tag inclusion
        if (tag && r.fieldPath?.includes(tag)) return true;

        // Try normalized tag match
        const normalizedTag = normalizeTag(tag);
        if (normalizedTag && r.fieldPath && normalizeTag(r.fieldPath) === normalizedTag) return true;

        return false;
      });
    };

    // Helper to find compliance result for a validation rule
    const findRuleCompliance = (ruleName: string) => {
      return complianceResults.find(r =>
        (r.validationType === 'validation_rule' || r.rule_name) &&
        (r.rule_name === ruleName || r.fieldName === ruleName)
      );
    };

    // Helper to escape HTML
    const escapeHtml = (str: any) => {
      if (str === null || str === undefined) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };

    // Determine if this is data-only (no schema attached or created)
    const isDataOnly = !isUsedAsSchema && !hasAttachedSchema && !hasCreatedSchema;

    // Build HTML for printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print the acquisition.');
      return;
    }

    const fieldsHtml = fields.length > 0 ? `
      <h2>Fields</h2>
      <table>
        <thead>
          <tr>
            <th style="width: 30%">Field</th>
            <th style="width: ${isComplianceMode ? '25%' : '50%'}">${isDataOnly ? 'Value' : 'Expected Value'}</th>
            ${isComplianceMode ? '<th style="width: 25%">Actual Value</th><th style="width: 20%">Status</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${fields.map(f => {
            const fieldName = f.name || f.keyword || f.field || '';
            const keyword = f.keyword || '';
            const tag = f.tag || '';
            // Build validation rule from field properties and format properly
            const validationRule = buildValidationRuleFromField(f);
            const expectedValue = escapeHtml(formatFieldDisplay(f.value, validationRule, { showValue: true, showConstraint: true }));

            // Get compliance result from dicompare (via cached results)
            const fieldCompliance = isComplianceMode ? findFieldCompliance(tag, fieldName, keyword) : null;

            // Use actual value from dicompare compliance result
            const actualValue = fieldCompliance?.actualValue;
            const actualDisplay = actualValue !== null && actualValue !== undefined
              ? escapeHtml(formatFieldDisplay(actualValue, undefined, { showValue: true, showConstraint: false }))
              : '<span class="na">—</span>';

            // Use status from dicompare compliance result
            let status = '';
            let statusClass = '';
            if (fieldCompliance) {
              status = fieldCompliance.message || (fieldCompliance.status === 'pass' ? 'Passed' : 'Failed');
              statusClass = fieldCompliance.status === 'pass' ? 'pass' :
                           fieldCompliance.status === 'fail' ? 'fail' :
                           fieldCompliance.status === 'warning' ? 'warning' : 'unknown';
            } else if (isComplianceMode) {
              status = 'Checking...'; statusClass = 'unknown';
            }

            return `
              <tr>
                <td><span class="field-name">${escapeHtml(fieldName)}</span>${tag ? ` <code>${escapeHtml(tag)}</code>` : ''}</td>
                <td>${expectedValue}</td>
                ${isComplianceMode ? `<td>${actualDisplay}</td><td class="${statusClass}">${status}</td>` : ''}
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    ` : '';

    // Build series table - collect all unique fields across all series
    const allSeriesFields: Array<{ tag: string; name: string; keyword?: string }> = [];
    const seenFieldKeys = new Set<string>();
    series.forEach(s => {
      const seriesFields = Array.isArray(s.fields) ? s.fields : Object.values(s.fields || {});
      seriesFields.forEach((f: any) => {
        const fieldKey = f.tag || f.name;
        if (!seenFieldKeys.has(fieldKey)) {
          seenFieldKeys.add(fieldKey);
          allSeriesFields.push({ tag: f.tag || '', name: f.name || f.keyword || f.field || '', keyword: f.keyword });
        }
      });
    });

    const seriesHtml = series.length > 0 && allSeriesFields.length > 0 ? `
      <h2>Series</h2>
      <table>
        <thead>
          <tr>
            <th>Series</th>
            ${allSeriesFields.map(f => `<th><span class="field-name">${escapeHtml(f.keyword || f.name)}</span>${f.tag ? ` <code>${escapeHtml(f.tag)}</code>` : ''}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${series.map((s, i) => {
            const seriesFields = Array.isArray(s.fields) ? s.fields : Object.values(s.fields || {});
            return `
              <tr>
                <td><span class="field-name">${escapeHtml(s.name || `Series ${i + 1}`)}</span></td>
                ${allSeriesFields.map(headerField => {
                  const field = seriesFields.find((f: any) => (f.tag || f.name) === (headerField.tag || headerField.name));
                  const value = field?.value !== undefined ? escapeHtml(field.value) : '—';
                  return `<td>${value}</td>`;
                }).join('')}
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    ` : '';

    // Calculate unchecked fields (fields in data not validated by schema)
    let uncheckedFields: Array<{ name?: string; keyword?: string; tag: string; value?: any }> = [];
    if (isComplianceMode && realAcquisition) {
      const realFields = realAcquisition.acquisitionFields || [];
      const schemaFields = fields;

      // Get all field identifiers from the schema
      const schemaFieldIds = new Set<string>();
      const schemaKeywords = new Set<string>();
      const schemaNames = new Set<string>();

      schemaFields.forEach(f => {
        const normalizedTag = normalizeTag(f.tag);
        if (normalizedTag) schemaFieldIds.add(normalizedTag);
        if (f.keyword) schemaKeywords.add(f.keyword.toLowerCase());
        if (f.name) schemaNames.add(f.name.toLowerCase());
      });

      // Also include series fields from schema
      series.forEach(s => {
        const seriesFields = Array.isArray(s.fields) ? s.fields : Object.values(s.fields || {});
        seriesFields.forEach((f: any) => {
          const normalizedTag = normalizeTag(f.tag);
          if (normalizedTag) schemaFieldIds.add(normalizedTag);
          if (f.keyword) schemaKeywords.add(f.keyword.toLowerCase());
          if (f.name) schemaNames.add(f.name.toLowerCase());
        });
      });

      // Find fields in realAcquisition that aren't in the schema
      if (schemaFieldIds.size > 0 || schemaKeywords.size > 0 || schemaNames.size > 0) {
        uncheckedFields = realFields.filter(f => {
          const normalizedTag = normalizeTag(f.tag);
          const hasTag = normalizedTag && schemaFieldIds.has(normalizedTag);
          const hasKeyword = f.keyword && schemaKeywords.has(f.keyword.toLowerCase());
          const hasName = f.name && schemaNames.has(f.name.toLowerCase());
          return !hasTag && !hasKeyword && !hasName;
        });
      }
    }

    const uncheckedFieldsHtml = uncheckedFields.length > 0 ? `
      <div class="unchecked-section">
        <h2 class="unchecked-header">${uncheckedFields.length} field${uncheckedFields.length === 1 ? '' : 's'} in data not validated by schema</h2>
        <table class="unchecked-table">
        <thead>
          <tr>
            <th style="width: 40%">Field</th>
            <th style="width: 60%">Value in Data</th>
          </tr>
        </thead>
        <tbody>
          ${uncheckedFields.map(f => {
            const fieldName = f.name || f.keyword || '';
            const tag = f.tag || '';
            return `
              <tr>
                <td><span class="field-name">${escapeHtml(fieldName)}</span>${tag ? ` <code>${escapeHtml(tag)}</code>` : ''}</td>
                <td>${escapeHtml(f.value)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      </div>
    ` : '';

    // Get README content - check acquisition detailedDescription and schema metadata
    const readmeContent = schemaAcquisition.detailedDescription || schemaMetadata?.description || '';

    const readmeHtml = readmeContent ? `
      <div class="readme-section">
        <h2>Reference Documentation</h2>
        ${schemaSource ? `
          <div class="readme-meta">
            <div class="readme-meta-item"><strong>Schema:</strong> ${escapeHtml(schemaSource)}${schemaVersion ? ` v${escapeHtml(schemaVersion)}` : ''}</div>
            ${schemaAuthors.length > 0 ? `<div class="readme-meta-item"><strong>Authors:</strong> ${schemaAuthors.map(a => escapeHtml(a)).join(', ')}</div>` : ''}
          </div>
        ` : ''}
        <div class="readme-content">
          ${marked.parse(readmeContent)}
        </div>
      </div>
    ` : '';

    // Test data notes (only shown in compliance mode when notes exist)
    const testNotesHtml = (isComplianceMode && selectedItem.testDataNotes) ? `
      <div class="test-notes-section">
        <h2>Test Data Notes</h2>
        <div class="test-notes-content">
          ${marked.parse(selectedItem.testDataNotes)}
        </div>
      </div>
    ` : '';

    const rulesHtml = validationFunctions.length > 0 ? `
      <h2>Validation Rules</h2>
      <table>
        <thead>
          <tr>
            <th style="width: 25%">Rule</th>
            <th style="width: ${isComplianceMode ? '45%' : '75%'}">Description</th>
            ${isComplianceMode ? '<th style="width: 30%">Status</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${validationFunctions.map(v => {
            const ruleName = v.customName || v.name || 'Unnamed Rule';
            const ruleDescription = v.customDescription || v.description || '';
            const ruleFields = v.customFields || v.fields || [];

            // Find compliance result for this rule
            const ruleCompliance = isComplianceMode ? complianceResults.find(r =>
              r.rule_name === ruleName ||
              r.fieldName === ruleName
            ) : null;

            let ruleStatus = '';
            let ruleStatusClass = '';
            if (ruleCompliance) {
              ruleStatus = ruleCompliance.message || (ruleCompliance.status === 'pass' ? 'OK' : 'Failed');
              ruleStatusClass = ruleCompliance.status === 'pass' ? 'pass' :
                               ruleCompliance.status === 'fail' ? 'fail' :
                               ruleCompliance.status === 'warning' ? 'warning' : 'unknown';
            } else if (isComplianceMode) {
              ruleStatus = 'No result';
              ruleStatusClass = 'unknown';
            }

            return `
              <tr>
                <td>
                  <div class="field-name">${escapeHtml(ruleName)}</div>
                  ${ruleFields.length > 0 ? `
                    <div class="rule-fields">
                      ${ruleFields.map(f => `<span class="field-tag-badge">${escapeHtml(f)}</span>`).join('')}
                    </div>
                  ` : ''}
                </td>
                <td>${escapeHtml(ruleDescription)}</td>
                ${isComplianceMode ? `<td class="${ruleStatusClass}">${escapeHtml(ruleStatus)}</td>` : ''}
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    ` : '';

    const primaryLabel = isDataOnly ? 'Data' : 'Reference';
    const primaryItemClass = isDataOnly ? 'data' : 'schema';

    const headerHtml = `
      <div class="header-section">
        <div class="header-row">
          <div class="header-item ${primaryItemClass}">
            <div class="header-label">${primaryLabel}</div>
            ${schemaSource && !isDataOnly ? `<div class="schema-source">From <strong>${escapeHtml(schemaSource)}</strong>${schemaVersion ? ` v${escapeHtml(schemaVersion)}` : ''}</div>` : ''}
            <div class="header-title">${escapeHtml(schemaName)}</div>
            ${schemaDescription ? `<div class="header-subtitle">${escapeHtml(schemaDescription)}</div>` : ''}
            ${schemaTags.length > 0 && !isDataOnly ? `<div class="schema-tags">${schemaTags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
          </div>
          ${isComplianceMode && realAcquisition ? `
            <div class="header-item data">
              <div class="header-label">Test Data</div>
              <div class="header-title">${escapeHtml(dataName) || 'DICOM Data'}</div>
              ${dataDescription ? `<div class="header-subtitle">${escapeHtml(dataDescription)}</div>` : ''}
            </div>
          ` : ''}
        </div>
      </div>
    `;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${schemaName} - Acquisition Details</title>
          <style>
            * { box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              padding: 40px;
              max-width: 1000px;
              margin: 0 auto;
              color: #1a1a1a;
            }
            .header-section { margin-bottom: 32px; padding-bottom: 24px; border-bottom: 2px solid #e5e5e5; }
            .schema-source { font-size: 12px; color: #666; margin-bottom: 4px; }
            .schema-source strong { color: #333; }
            .schema-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
            .tag { display: inline-block; padding: 3px 10px; background: #e0e7ff; color: #3730a3; font-size: 11px; border-radius: 12px; font-weight: 500; }
            .header-row { display: flex; gap: 40px; }
            .header-item { flex: 1; }
            .header-item.schema { border-left: 3px solid #2563eb; padding-left: 12px; }
            .header-item.data { border-left: 3px solid #d97706; padding-left: 12px; }
            .header-label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #666; margin-bottom: 4px; }
            .header-title { font-size: 20px; font-weight: 600; margin-bottom: 4px; }
            .header-subtitle { font-size: 14px; color: #666; }
            h2 { font-size: 16px; margin-top: 28px; margin-bottom: 12px; border-bottom: 1px solid #ddd; padding-bottom: 8px; color: #333; }
            h3 { font-size: 14px; margin-top: 20px; margin-bottom: 8px; color: #444; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; vertical-align: top; }
            th { background: #f5f5f5; font-weight: 600; }
            code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 10px; color: #666; }
            .field-name { font-weight: 500; color: #1a1a1a; }
            .rule-fields { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
            .field-tag-badge { display: inline-block; padding: 2px 6px; background: #dbeafe; color: #1d4ed8; font-size: 10px; border-radius: 3px; }
            .pass { color: #16a34a; font-weight: 500; }
            .fail { color: #dc2626; font-weight: 500; }
            .warning { color: #ca8a04; font-weight: 500; }
            .unknown { color: #9ca3af; font-style: italic; }
            .na { color: #9ca3af; }
            .note { font-size: 11px; color: #666; font-style: italic; margin-top: 8px; }
            .unchecked-section { margin-top: 24px; }
            .unchecked-header { color: #333; margin-top: 0; }
            .unchecked-table th { background: #f9fafb; }
            .unchecked-table td { color: #1a1a1a; }
            .readme-section { margin-top: 32px; padding-top: 24px; border-top: 2px solid #e5e5e5; }
            .readme-meta { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; }
            .readme-meta-item { font-size: 12px; color: #475569; margin: 4px 0; }
            .readme-meta-item strong { color: #1e293b; }
            .readme-content { font-size: 13px; line-height: 1.6; color: #333; }
            .readme-content h2.readme-h2 { font-size: 18px; margin-top: 24px; margin-bottom: 12px; border-bottom: none; padding-bottom: 0; }
            .readme-content h3 { font-size: 15px; margin-top: 20px; margin-bottom: 8px; border-bottom: none; padding-bottom: 0; }
            .readme-content h4 { font-size: 13px; margin-top: 16px; margin-bottom: 6px; }
            .readme-content p { margin: 12px 0; }
            .readme-content ul, .readme-content ol { margin: 12px 0; padding-left: 24px; }
            .readme-content li { margin: 4px 0; }
            .readme-content a { color: #2563eb; text-decoration: underline; }
            .readme-content code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 11px; }
            .test-notes-section { margin-top: 32px; padding-top: 24px; border-top: 2px solid #fbbf24; background: #fffbeb; border-radius: 8px; padding: 20px; }
            .test-notes-section h2 { color: #92400e; margin-top: 0; margin-bottom: 16px; }
            .test-notes-content { font-size: 13px; line-height: 1.6; color: #451a03; }
            .test-notes-content h2 { font-size: 18px; margin-top: 24px; margin-bottom: 12px; }
            .test-notes-content h3 { font-size: 15px; margin-top: 20px; margin-bottom: 8px; }
            .test-notes-content p { margin: 12px 0; }
            .test-notes-content ul, .test-notes-content ol { margin: 12px 0; padding-left: 24px; }
            .test-notes-content li { margin: 4px 0; }
            .test-notes-content code { background: #fef3c7; padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 11px; }
            .print-date { color: #999; font-size: 11px; margin-top: 40px; text-align: center; }
            @media print {
              body { padding: 20px; }
              h2 { page-break-after: avoid; }
              table { page-break-inside: auto; }
              tr { page-break-inside: avoid; }
              thead { display: table-header-group; }
              .unchecked-section { page-break-before: auto; }
              .unchecked-header { page-break-after: avoid; }
            }
          </style>
        </head>
        <body>
          ${headerHtml}
          ${testNotesHtml}
          ${rulesHtml}
          ${fieldsHtml}
          ${seriesHtml}
          ${uncheckedFieldsHtml}
          ${readmeHtml}
          ${!fieldsHtml && !seriesHtml && !rulesHtml && !readmeHtml && !testNotesHtml ? '<p style="color: #666;">No fields, series, or validation rules defined.</p>' : ''}
          <div class="print-date">Printed on ${new Date().toLocaleDateString()}</div>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
  }, [selectedItem, loadedSchemaAcquisition, getSchemaContent, schemaMetadata]);

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
        {/* Tab bar */}
        <div className="px-6 pt-4 border-b border-border">
          <div className="flex gap-1">
            <button
              onClick={() => setSchemaInfoTab('welcome')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                schemaInfoTab === 'welcome'
                  ? 'bg-surface-primary text-brand-600 border border-b-0 border-border -mb-px'
                  : 'text-content-tertiary hover:text-content-secondary'
              }`}
            >
              <Layers className="h-4 w-4 inline mr-1.5" />
              Welcome
            </button>
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

        {/* Action bar with buttons - only for Metadata and Preview tabs */}
        {schemaInfoTab !== 'welcome' && (
          <div className="px-6 py-3 border-b border-border">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-content-tertiary uppercase tracking-wider">
                {schemaInfoTab === 'metadata' ? 'Schema Metadata' : 'JSON Preview'}
              </h3>
              <div className="flex items-center gap-2">
                {schemaInfoTab === 'preview' && (
                  <button
                    onClick={handleCopyJson}
                    disabled={isGeneratingPreview || !previewJson}
                    className="flex items-center px-3 py-2 text-sm border border-border-secondary rounded-lg hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed text-content-secondary"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 mr-1.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-1.5" />
                        Copy
                      </>
                    )}
                  </button>
                )}
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
          </div>
        )}

        {/* Content */}
        {schemaInfoTab === 'welcome' ? (
          <div className="flex-1 overflow-y-auto p-6">
            {/* Quick Start */}
            <div className="mb-8">
              <h3 className="text-sm font-medium text-content-tertiary uppercase tracking-wider mb-4">Get Started</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* From Data */}
                <button
                  onClick={() => workspace.selectItem(ADD_FROM_DATA_ID)}
                  className="flex items-start gap-4 p-5 rounded-xl border-2 border-border hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/10 transition-all text-left group"
                >
                  <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg group-hover:scale-105 transition-transform">
                    <Upload className="h-6 w-6 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-content-primary mb-1 flex items-center">
                      From Data
                      <ArrowRight className="h-4 w-4 ml-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </h4>
                    <p className="text-sm text-content-secondary">
                      Load DICOM files or protocol files to automatically extract and compare acquisitions
                    </p>
                  </div>
                </button>

                {/* From Schema */}
                <button
                  onClick={() => workspace.selectItem(ADD_NEW_ID)}
                  className="flex items-start gap-4 p-5 rounded-xl border-2 border-border hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/10 transition-all text-left group"
                >
                  <div className="p-3 bg-brand-100 dark:bg-brand-900/30 rounded-lg group-hover:scale-105 transition-transform">
                    <FileText className="h-6 w-6 text-brand-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-content-primary mb-1 flex items-center">
                      From Schema
                      <ArrowRight className="h-4 w-4 ml-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </h4>
                    <p className="text-sm text-content-secondary">
                      Browse the schema library and add existing acquisitions to your workspace
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* How it works */}
            <div>
              <h3 className="text-sm font-medium text-content-tertiary uppercase tracking-wider mb-4">How It Works</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 text-sm font-medium">
                    1
                  </div>
                  <div>
                    <p className="text-content-primary font-medium">Add acquisitions</p>
                    <p className="text-sm text-content-secondary">Load data to extract parameters, or select from existing schemas in the library</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 text-sm font-medium">
                    2
                  </div>
                  <div>
                    <p className="text-content-primary font-medium">Edit and refine</p>
                    <p className="text-sm text-content-secondary">Customize field requirements, add validation rules, and document your schema</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 text-sm font-medium">
                    3
                  </div>
                  <div>
                    <p className="text-content-primary font-medium">Validate data</p>
                    <p className="text-sm text-content-secondary">Attach test data to verify compliance before exporting your schema</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 text-sm font-medium">
                    4
                  </div>
                  <div>
                    <p className="text-content-primary font-medium">Save and share</p>
                    <p className="text-sm text-content-secondary">Download as JSON or save to your library for reuse</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : schemaInfoTab === 'metadata' ? (
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
            <div className="border border-border-secondary rounded-lg overflow-hidden max-h-[calc(100vh-350px)]">
              <CodeMirror
                value={previewJson}
                extensions={[json()]}
                theme={theme === 'dark' ? 'dark' : 'light'}
                editable={false}
                height="100%"
                maxHeight="calc(100vh - 350px)"
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  highlightActiveLine: false,
                }}
              />
            </div>
          )}
        </div>
        )}
      </div>
    );
  }

  // Render Schema Library browser
  if (isAddNew) {
    return (
      <div className="border border-border rounded-lg bg-surface-primary shadow-sm flex flex-col h-full">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-base font-semibold text-content-primary">Schema Library</h2>
          <p className="text-sm text-content-secondary">Select acquisitions to add to your workspace</p>
        </div>

        {/* Schema Browser */}
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
    );
  }

  // Render staged "From Data" view - same layout as empty item but not yet in list
  if (isAddFromData) {
    return (
      <div className="bg-surface-primary rounded-lg border border-border shadow-sm">
        {/* Header with split layout */}
        <div className="px-6 py-4 border-b border-border">
          {/* Split layout: Reference (left) | Test data (right) */}
          <div className="grid grid-cols-2 gap-6">
            {/* Left side - Reference */}
            <div className="border-r border-border pr-6">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-medium text-content-tertiary uppercase tracking-wider">Reference</div>
              </div>
              {/* Reference attachment zone */}
              <div className="flex-1 min-w-0">
                <div
                  className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                    isProcessing && processingTarget !== 'schema'
                      ? 'border-border-secondary bg-surface-tertiary/50 opacity-50 cursor-not-allowed'
                      : schemaDropZone.isDragOver
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                        : 'border-border-secondary hover:border-brand-400 bg-surface-secondary/50'
                  }`}
                  {...(isProcessing && processingTarget !== 'schema' ? {} : schemaDropZone.handlers)}
                >
                  {isProcessing && processingTarget === 'schema' ? (
                    <>
                      <Loader className="h-6 w-6 text-brand-600 mx-auto mb-2 animate-spin" />
                      <p className="text-sm font-medium text-content-secondary mb-1">{processingProgress?.currentOperation || 'Processing...'}</p>
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
                      <Download className={`h-6 w-6 mx-auto mb-2 ${schemaDropZone.isDragOver ? 'text-brand-600' : 'text-content-muted'}`} />
                      <p className="text-sm font-medium text-content-secondary mb-1">No reference</p>
                      <p className="text-xs text-content-tertiary mb-3">
                        Drop DICOMs or protocols (.pro, .exar1, ExamCard)
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <input
                          type="file"
                          multiple
                          webkitdirectory=""
                          accept=".dcm,.dicom,.zip,.pro,.exar1,.ExamCard,.examcard,LxProtocol"
                          className="hidden"
                          id="staged-load-schema"
                          disabled={isProcessing}
                          onChange={(e) => {
                            if (e.target.files) {
                              onFileUpload(e.target.files, 'schema-template');
                            }
                          }}
                        />
                        <label
                          htmlFor="staged-load-schema"
                          className={`inline-flex items-center px-2.5 py-1.5 text-sm font-medium rounded-md ${
                            isProcessing
                              ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                              : 'text-content-inverted bg-brand-600 hover:bg-brand-700 cursor-pointer'
                          }`}
                        >
                          <FolderOpen className="h-4 w-4 mr-1" />
                          Browse
                        </label>
                        <button
                          onClick={onStagedAttachSchema}
                          disabled={isProcessing}
                          className={`inline-flex items-center px-2.5 py-1.5 text-sm font-medium rounded-md border ${
                            isProcessing
                              ? 'border-gray-300 text-gray-400 cursor-not-allowed'
                              : 'border-brand-600 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20'
                          }`}
                        >
                          <Book className="h-4 w-4 mr-1" />
                          Library
                        </button>
                        <button
                          onClick={onStagedCreateBlank}
                          disabled={isProcessing}
                          className={`inline-flex items-center px-2.5 py-1.5 text-sm font-medium rounded-md border ${
                            isProcessing
                              ? 'border-gray-300 text-gray-400 cursor-not-allowed'
                              : 'border-border-secondary text-content-secondary hover:bg-surface-secondary'
                          }`}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Blank
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Right side - Test data */}
            <div className="pl-0">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-medium text-content-tertiary uppercase tracking-wider">Test data</div>
              </div>
              {/* Data attachment zone */}
              <div className="flex-1 min-w-0">
                <div
                  className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                    isProcessing && processingTarget !== 'data'
                      ? 'border-border-secondary bg-surface-tertiary/50 opacity-50 cursor-not-allowed'
                      : testDropZone.isDragOver
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                        : 'border-border-secondary hover:border-brand-400 bg-surface-secondary/50'
                  }`}
                  {...(isProcessing && processingTarget !== 'data' ? {} : testDropZone.handlers)}
                >
                  {isProcessing && processingTarget === 'data' ? (
                    <>
                      <Loader className="h-6 w-6 text-brand-600 mx-auto mb-2 animate-spin" />
                      <p className="text-sm font-medium text-content-secondary mb-1">{processingProgress?.currentOperation || 'Processing...'}</p>
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
                      <Download className={`h-6 w-6 mx-auto mb-2 ${testDropZone.isDragOver ? 'text-brand-600' : 'text-content-muted'}`} />
                      <p className="text-sm font-medium text-content-secondary mb-1">No test data</p>
                      <p className="text-xs text-content-tertiary mb-3">Drop DICOMs or protocols (.pro, .exar1, ExamCard)</p>
                      <div className="flex items-center justify-center gap-2">
                        <input
                          type="file"
                          multiple
                          webkitdirectory=""
                          className="hidden"
                          id="staged-load-data"
                          disabled={isProcessing}
                          onChange={(e) => {
                            if (e.target.files) {
                              onFileUpload(e.target.files, 'validation-subject');
                            }
                          }}
                        />
                        <label
                          htmlFor="staged-load-data"
                          className={`inline-flex items-center px-2.5 py-1.5 text-sm font-medium rounded-md ${
                            isProcessing
                              ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                              : 'text-content-inverted bg-brand-600 hover:bg-brand-700 cursor-pointer'
                          }`}
                        >
                          <FolderOpen className="h-4 w-4 mr-1" />
                          Browse
                        </label>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Privacy notice - prominent */}
        <div className="px-6 py-4 bg-green-50 dark:bg-green-900/20 border-t border-green-200 dark:border-green-800">
          <p className="text-sm text-green-800 dark:text-green-200 flex items-center justify-center gap-2 font-medium">
            <ShieldCheck className="h-5 w-5 flex-shrink-0" />
            <span>Your data never leaves your computer — all processing happens locally in your browser</span>
          </p>
        </div>
      </div>
    );
  }

  // Use shared helper for derived state
  const {
    isEmptyItem,
    hasCreatedSchema,
    hasAttachedData,
    hasAttachedSchema,
    hasSchema,
    hasData,
    isUsedAsSchema,
  } = getItemFlags(selectedItem);

  const canAttachData = hasSchema;
  const canAttachSchema = !hasSchema && !hasCreatedSchema;
  const canEdit = hasSchema;

  // Helper to render acquisition info panel
  const renderAcquisitionInfo = (isSchema: boolean) => {
    const isEditable = selectedItem.isEditing && canEdit && !hasAttachedData && !hasAttachedSchema;
    const icon = isSchema ? (
      <FileText className="h-5 w-5 text-brand-600" />
    ) : (
      <Database className="h-5 w-5 text-amber-600" />
    );

    // For items with attached schema, use the loaded schema acquisition for display
    const displayAcquisition = (isSchema && hasAttachedSchema && loadedSchemaAcquisition)
      ? loadedSchemaAcquisition
      : selectedItem.acquisition;

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
                  {displayAcquisition.protocolName || 'Untitled Acquisition'}
                </h4>
                <p className="text-sm text-content-secondary truncate">
                  {displayAcquisition.seriesDescription || 'No description'}
                </p>
              </>
            )}
            {/* Origin info for schema-sourced items */}
            {isSchema && selectedItem.schemaOrigin && (
              <p className="text-xs text-content-tertiary mt-1 truncate">
                From {selectedItem.schemaOrigin.schemaName}
              </p>
            )}
            {/* Origin info for items with attached schema */}
            {isSchema && hasAttachedSchema && selectedItem.attachedSchema && (
              <p className="text-xs text-content-tertiary mt-1 truncate">
                From {selectedItem.attachedSchema.schema?.name || 'Schema'}
              </p>
            )}
            {/* Source indicator for data items */}
            {!isSchema && selectedItem.source === 'data' && (
              <p className="text-xs text-content-tertiary mt-1">
                {selectedItem.dataUsageMode === 'validation-subject' ? 'Data attached for validation' : 'Reference data'}
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
              <div className="p-2 rounded-lg flex-shrink-0 bg-brand-100 dark:bg-brand-900/30">
                <FileText className="h-5 w-5 text-brand-600" />
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
                <p className="text-xs text-content-tertiary mt-1">
                  Schema attached for validation
                </p>
              </div>
            </div>
          </div>
        );
      }
      // Show schema attachment/creation prompt with upload option
      return (
        <div className="flex-1 min-w-0">
          <div
            className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
              isProcessing && processingTarget !== 'schema'
                ? 'border-border-secondary bg-surface-tertiary/50 opacity-50 cursor-not-allowed'
                : schemaDropZone.isDragOver
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                  : 'border-border-secondary hover:border-brand-400 bg-surface-secondary/50'
            }`}
            {...(isProcessing && processingTarget !== 'schema' ? {} : schemaDropZone.handlers)}
          >
            {isProcessing && processingTarget === 'schema' ? (
              <>
                <Loader className="h-6 w-6 text-brand-600 mx-auto mb-2 animate-spin" />
                <p className="text-sm font-medium text-content-secondary mb-1">{processingProgress?.currentOperation || 'Processing...'}</p>
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
                <Download className={`h-6 w-6 mx-auto mb-2 ${schemaDropZone.isDragOver ? 'text-brand-600' : 'text-content-muted'}`} />
                <p className="text-sm font-medium text-content-secondary mb-1">No reference</p>
                <p className="text-xs text-content-tertiary mb-3">
                  Drop DICOMs or protocols (.pro, .exar1, ExamCard)
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <input
                    type="file"
                    multiple
                    webkitdirectory=""
                    accept=".dcm,.dicom,.zip,.pro,.exar1,.ExamCard,.examcard,LxProtocol"
                    className="hidden"
                    id={`load-schema-ref-${selectedItem.id}`}
                    disabled={isProcessing}
                    onChange={(e) => {
                      if (!e.target.files) return;
                      // For empty items or validation-subject items needing a schema,
                      // load to the current item (preserving attachedData)
                      // For other cases, create new items
                      const shouldLoadToCurrentItem = isEmptyItem ||
                        (selectedItem.dataUsageMode === 'validation-subject' && !hasSchema);
                      if (shouldLoadToCurrentItem) {
                        onUploadSchemaForItem(e.target.files);
                      } else {
                        onFileUpload(e.target.files, 'schema-template');
                      }
                    }}
                  />
                  <label
                    htmlFor={`load-schema-ref-${selectedItem.id}`}
                    className={`inline-flex items-center px-2.5 py-1.5 text-sm font-medium rounded-md ${
                      isProcessing
                        ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                        : 'text-content-inverted bg-brand-600 hover:bg-brand-700 cursor-pointer'
                    }`}
                  >
                    <FolderOpen className="h-4 w-4 mr-1" />
                    Browse
                  </label>
                  <button
                    onClick={onAttachSchema}
                    disabled={isProcessing}
                    className={`inline-flex items-center px-2.5 py-1.5 text-sm font-medium rounded-md border ${
                      isProcessing
                        ? 'border-gray-300 text-gray-400 cursor-not-allowed'
                        : 'border-brand-600 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20'
                    }`}
                  >
                    <Book className="h-4 w-4 mr-1" />
                    Library
                  </button>
                  {/* Only show Blank option for empty items - can't create blank schema when data exists */}
                  {!hasAttachedData && isEmptyItem && (
                    <button
                      onClick={onCreateSchema}
                      disabled={isProcessing}
                      className={`inline-flex items-center px-2.5 py-1.5 text-sm font-medium rounded-md border ${
                        isProcessing
                          ? 'border-gray-300 text-gray-400 cursor-not-allowed'
                          : 'border-border-secondary text-content-secondary hover:bg-surface-secondary'
                      }`}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Blank
                    </button>
                  )}
                </div>
              </>
            )}
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
              <div className="p-2 rounded-lg flex-shrink-0 bg-amber-100 dark:bg-amber-900/30">
                <Database className="h-5 w-5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-lg font-semibold text-content-primary">
                  {selectedItem.attachedData.protocolName || 'DICOM Data'}
                </h4>
                <p className="text-sm text-content-secondary truncate">
                  {selectedItem.attachedData.seriesDescription || `${selectedItem.attachedData.totalFiles || 0} files`}
                </p>
                <p className="text-xs text-content-tertiary mt-1">
                  Data attached for validation
                </p>
              </div>
            </div>
          </div>
        );
      }
      // Show data attachment prompt with drop zone
      return (
        <div className="flex-1 min-w-0">
          <div
            className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
              isProcessing && processingTarget !== 'data'
                ? 'border-border-secondary bg-surface-tertiary/50 opacity-50 cursor-not-allowed'
                : mainDropZone.isDragOver
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                  : 'border-border-secondary hover:border-brand-400 bg-surface-secondary/50'
            }`}
            {...(isProcessing && processingTarget !== 'data' ? {} : mainDropZone.handlers)}
          >
            {isProcessing && processingTarget === 'data' ? (
              <>
                <Loader className="h-6 w-6 text-brand-600 mx-auto mb-2 animate-spin" />
                <p className="text-sm font-medium text-content-secondary mb-1">{processingProgress?.currentOperation || 'Processing...'}</p>
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
                <Download className={`h-6 w-6 mx-auto mb-2 ${mainDropZone.isDragOver ? 'text-brand-600' : 'text-content-muted'}`} />
                <p className="text-sm font-medium text-content-secondary mb-1">No test data</p>
                <p className="text-xs text-content-tertiary mb-3">Drop DICOMs or protocols (.pro, .exar1, ExamCard)</p>
                <div className="flex items-center justify-center gap-2">
                  <input
                    type="file"
                    multiple
                    webkitdirectory=""
                    className="hidden"
                    id={`load-data-${selectedItem.id}`}
                    disabled={isProcessing}
                    onChange={(e) => e.target.files && onAttachData(e.target.files)}
                  />
                  <label
                    htmlFor={`load-data-${selectedItem.id}`}
                    className={`inline-flex items-center px-2.5 py-1.5 text-sm font-medium rounded-md ${
                      isProcessing
                        ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                        : 'text-content-inverted bg-brand-600 hover:bg-brand-700 cursor-pointer'
                    }`}
                  >
                    <FolderOpen className="h-4 w-4 mr-1" />
                    Browse
                  </label>
                </div>
              </>
            )}
          </div>
        </div>
      );
    }
  };

  return (
    <div className="bg-surface-primary rounded-lg border border-border shadow-sm relative">
      {/* Print button as floating tab extending upward */}
      <button
        onClick={handlePrintAcquisition}
        className="absolute -top-7 right-4 inline-flex items-center px-2.5 py-1.5 text-xs rounded-t border border-b-0 border-border bg-surface-primary text-content-secondary hover:bg-surface-secondary hover:text-content-primary z-10"
        title="Print acquisition report"
      >
        <Printer className="h-3.5 w-3.5 mr-1" />
        Print
      </button>

      {/* Header with split layout */}
      <div className="px-6 py-4 border-b border-border">
        {/* Split layout: Schema (left) | Data (right) */}
        <div className="grid grid-cols-2 gap-6">
          {/* Left side - Schema */}
          <div className="border-r border-border pr-6">
            <div className="flex items-center justify-between mb-3">
              {/* Left: label */}
              <div className="text-xs font-medium text-content-tertiary uppercase tracking-wider">Reference</div>
              {/* Right: README, Edit, and X buttons */}
              {isUsedAsSchema && (
                <div className="flex items-center gap-1.5">
                  {/* README button - always opens editable modal */}
                  <button
                    onClick={() => setShowDetailedDescription(true)}
                    className="inline-flex items-center px-2 py-1 border text-xs rounded border-border-secondary text-content-secondary hover:bg-surface-secondary"
                    title={selectedItem.acquisition.detailedDescription ? 'View/edit README' : 'Add README'}
                  >
                    <Book className="h-3.5 w-3.5 mr-1" />
                    README
                  </button>

                  {/* Edit toggle */}
                  {canEdit && (
                    <button
                      onClick={onToggleEditing}
                      disabled={hasAttachedData}
                      className={`inline-flex items-center px-2 py-1 border text-xs rounded ${
                        hasAttachedData
                          ? 'border-border-secondary text-content-muted cursor-not-allowed opacity-50'
                          : selectedItem.isEditing
                            ? 'border-brand-500 text-brand-600 bg-brand-50 dark:bg-brand-900/20'
                            : 'border-border-secondary text-content-secondary hover:bg-surface-secondary'
                      }`}
                      title={hasAttachedData ? "Detach data to edit" : undefined}
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

                  {/* Detach X button */}
                  {!selectedItem.isEditing && (
                    <>
                      {isEmptyItem && hasCreatedSchema && (
                        <button
                          onClick={onDetachCreatedSchema}
                          className="inline-flex items-center p-1 text-content-tertiary hover:text-red-600 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                          title="Remove schema"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {isEmptyItem && hasAttachedSchema && (
                        <button
                          onClick={onDetachSchema}
                          className="inline-flex items-center p-1 text-content-tertiary hover:text-red-600 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                          title="Detach schema"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {selectedItem.source === 'data' && selectedItem.dataUsageMode !== 'validation-subject' && (
                        <button
                          onClick={onDetachSchema}
                          className="inline-flex items-center p-1 text-content-tertiary hover:text-red-600 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                          title="Detach schema"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {selectedItem.source === 'data' && selectedItem.dataUsageMode === 'validation-subject' && hasAttachedSchema && (
                        <button
                          onClick={onDetachSchema}
                          className="inline-flex items-center p-1 text-content-tertiary hover:text-red-600 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                          title="Detach schema"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {selectedItem.source === 'schema' && (
                        <button
                          onClick={onDetachSchema}
                          className="inline-flex items-center p-1 text-content-tertiary hover:text-red-600 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                          title="Detach schema"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </>
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
            <div className="flex items-center justify-between mb-3">
              {/* Left: label */}
              <div className="text-xs font-medium text-content-tertiary uppercase tracking-wider">Test data</div>
              {/* Right: Notes button + X button when data is attached */}
              {(hasAttachedData || (selectedItem.source === 'data' && selectedItem.dataUsageMode === 'validation-subject')) && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowTestDataNotes(true)}
                    className={`inline-flex items-center px-2 py-1 border text-xs rounded ${
                      selectedItem.testDataNotes
                        ? 'text-amber-700 border-amber-500/30 bg-amber-50 hover:bg-amber-100 dark:text-amber-400 dark:bg-amber-900/20 dark:hover:bg-amber-900/30'
                        : 'border-border-secondary text-content-secondary hover:bg-surface-secondary'
                    }`}
                    title={selectedItem.testDataNotes ? 'View/edit notes' : 'Add notes'}
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    Notes
                  </button>
                  <button
                    onClick={selectedItem.source === 'data' && selectedItem.dataUsageMode === 'validation-subject'
                      ? onDetachValidationData
                      : onDetachData}
                    className="inline-flex items-center p-1 text-content-tertiary hover:text-red-600 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                    title="Detach data"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
            {selectedItem.source === 'data' && selectedItem.dataUsageMode === 'validation-subject' ? (
              // This item IS the data (validation-subject) - show its info
              renderAcquisitionInfo(false)
            ) : isUsedAsSchema ? (
              // This item is schema - show data attachment zone
              renderAttachmentZone('data')
            ) : isEmptyItem ? (
              // Empty item - always show data attachment zone (whether data attached or not)
              renderAttachmentZone('data')
            ) : (
              // Fallback - show acquisition info
              renderAcquisitionInfo(false)
            )}
          </div>
        </div>
      </div>

      {/* Content - AcquisitionTable */}
      <div className="px-6 py-4 space-y-4">
        <AcquisitionTable
            acquisition={
              // For items with attached schema (empty or data-sourced), show the loaded schema acquisition
              // For schema items (schema-sourced or data-as-schema), show the item's own acquisition
              // For empty items with only attached data (no schema), show the attached data
              hasAttachedSchema && loadedSchemaAcquisition
                ? loadedSchemaAcquisition
                : (isEmptyItem && !hasCreatedSchema && !hasAttachedSchema && hasAttachedData && selectedItem.attachedData)
                  ? selectedItem.attachedData
                  : selectedItem.acquisition
            }
            isEditMode={selectedItem.isEditing}
            mode={
              // Compliance mode requires BOTH schema and data to compare
              // - Validation-subject with attachedSchema: compliance mode
              // - Schema items with attachedData: compliance mode
              // - Empty items with attachedSchema: compliance mode (if also has data)
              (selectedItem.source === 'data' && selectedItem.dataUsageMode === 'validation-subject' && hasAttachedSchema) ||
              (isUsedAsSchema && hasAttachedData) ||
              (!isUsedAsSchema && hasAttachedSchema)
                ? 'compliance'
                : 'edit'
            }
            realAcquisition={
              // For validation-subject items, the acquisition itself is the real data
              // For other schema items, attached data is the "real" data to validate
              selectedItem.source === 'data' && selectedItem.dataUsageMode === 'validation-subject'
                ? selectedItem.acquisition      // Validation-subject: acquisition is real data
                : isUsedAsSchema
                  ? selectedItem.attachedData   // Schema mode: attached data is real data
                  : selectedItem.acquisition    // Fallback: acquisition is real data
            }
            schemaId={
              // Priority: attachedSchema > schemaOrigin
              // Empty items with attachedSchema use attachedSchema
              // Schema-sourced items use schemaOrigin
              // Data-as-schema items don't have a schemaId
              selectedItem.attachedSchema?.schemaId ||
              selectedItem.schemaOrigin?.schemaId
            }
            schemaAcquisitionId={
              // Priority: attachedSchema > schemaOrigin
              selectedItem.attachedSchema?.acquisitionId ||
              selectedItem.schemaOrigin?.acquisitionIndex?.toString()
            }
            schemaAcquisition={
              // For data-as-schema items without a schemaId or attachedSchema, pass the acquisition directly
              isUsedAsSchema && !selectedItem.schemaOrigin?.schemaId && !selectedItem.attachedSchema?.schemaId
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
            onComplianceResultsChange={(results) => {
              console.log('[WorkspaceDetailPanel] Received compliance results from AcquisitionTable, count:', results.length);
              // Update both state and ref - ref updates synchronously for print view
              complianceResultsRef.current = results;
              setCachedComplianceResults(results);
            }}
          />
      </div>


      {/* Detailed Description Modal - always editable */}
      <DetailedDescriptionModal
        isOpen={showDetailedDescription}
        onClose={() => setShowDetailedDescription(false)}
        title={selectedItem.acquisition.protocolName || 'Acquisition'}
        description={
          // Use loaded schema acquisition's README as starting point when available (for Library-attached schemas)
          // but allow editing to create custom README
          selectedItem.acquisition.detailedDescription ||
          (hasAttachedSchema && loadedSchemaAcquisition?.detailedDescription) ||
          ''
        }
        onSave={(description) => onUpdateAcquisition({ detailedDescription: description })}
      />

      {/* Test Data Notes Modal - for adding notes about test data (print report only) */}
      <DetailedDescriptionModal
        isOpen={showTestDataNotes}
        onClose={() => setShowTestDataNotes(false)}
        title={`Notes: ${selectedItem.attachedData?.protocolName || selectedItem.acquisition.protocolName || 'Test Data'}`}
        description={selectedItem.testDataNotes || ''}
        onSave={(notes) => workspace.updateTestDataNotes(selectedItem.id, notes)}
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
