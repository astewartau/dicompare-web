import React, { useState, useEffect } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
  ShieldCheck, Github, BookOpen, Check, Square, ArrowLeft,
  Download, Link2, Layers, Quote, Shield, AlertTriangle, Loader, CheckSquare, Printer, Brain,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ThemeToggle from '../components/common/ThemeToggle';
import CitationModal from '../components/common/CitationModal';
import PrivacyModal from '../components/common/PrivacyModal';
import AcquisitionTable from '../components/schema/AcquisitionTable';
import UnifiedSchemaSelector from '../components/schema/UnifiedSchemaSelector';
import { VERSION } from '../version';
import { Acquisition } from '../types';
import { useSchemaService, UnifiedSchema } from '../hooks/useSchemaService';
import { useSchemaContext } from '../contexts/SchemaContext';
import { convertSchemaToAcquisitions } from '../utils/schemaToAcquisition';
import { fetchExternalSchema, validateSchemaStructure } from '../utils/externalSchemaFetch';
import { generateSchemaViewerPrintHtml, openPrintWindow, exportToPdf, isElectron } from '../utils/printReportGenerator';
import { isVolumeUrl, isFlatImageUrl } from '../utils/imageHelpers';
import ImageManagerModal from '../components/schema/ImageManagerModal';
import VolumeThumbnail from '../components/common/VolumeThumbnail';

const noop = () => {};

/** Markdown component overrides matching the app's existing style */
const markdownComponents = {
  h1: ({ children }: any) => <h1 className="text-2xl font-bold text-content-primary mb-4 pb-2 border-b border-border">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-xl font-semibold text-content-primary mt-6 mb-3">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-lg font-semibold text-content-primary mt-4 mb-2">{children}</h3>,
  h4: ({ children }: any) => <h4 className="text-base font-semibold text-content-primary mt-3 mb-2">{children}</h4>,
  p: ({ children }: any) => <p className="text-content-secondary mb-3 leading-relaxed">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc list-inside mb-3 space-y-1 text-content-secondary">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal list-inside mb-3 space-y-1 text-content-secondary">{children}</ol>,
  li: ({ children }: any) => <li className="ml-2">{children}</li>,
  strong: ({ children }: any) => <strong className="font-semibold text-content-primary">{children}</strong>,
  code: ({ className, children, ...props }: any) => {
    const isInline = !className;
    if (isInline) {
      return <code className="bg-surface-secondary text-brand-600 dark:text-brand-400 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>;
    }
    return (
      <code className={`${className} block bg-gray-900 text-gray-100 p-4 rounded-lg text-sm font-mono overflow-x-auto`} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }: any) => <pre className="mb-4">{children}</pre>,
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-4 border-brand-500 pl-4 py-1 my-3 text-content-secondary italic bg-surface-secondary rounded-r">
      {children}
    </blockquote>
  ),
  table: ({ children }: any) => (
    <div className="overflow-x-auto mb-4">
      <table className="min-w-full divide-y divide-border border border-border rounded-lg">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: any) => <thead className="bg-surface-secondary">{children}</thead>,
  th: ({ children }: any) => <th className="px-4 py-2 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider">{children}</th>,
  td: ({ children }: any) => <td className="px-4 py-2 text-sm text-content-secondary border-t border-border">{children}</td>,
  hr: () => <hr className="my-6 border-border" />,
  a: ({ href, children }: any) => (
    <a href={href} className="text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 underline" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

const SchemaViewerPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const externalUrl = searchParams.get('url');
  const navigate = useNavigate();

  // Catalog mode: no specific schema selected
  const isCatalogMode = !id && !externalUrl;
  const schemaService = useSchemaService();
  const { uploadSchema, getUniversalSchemaContent } = useSchemaContext();

  // Schema data state (used in detail mode only)
  const [schemaData, setSchemaData] = useState<any>(null);
  const [schemaContent, setSchemaContent] = useState<string | null>(null);
  const [acquisitions, setAcquisitions] = useState<Acquisition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const acqParam = searchParams.get('acq');
  const [selectedNavItem, setSelectedNavItem] = useState<'schema' | number>(
    acqParam !== null ? parseInt(acqParam, 10) : 'schema'
  );
  const [copiedLink, setCopiedLink] = useState(false);
  const [showCitation, setShowCitation] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [imageModalAcq, setImageModalAcq] = useState<Acquisition | null>(null);
  const [imageModalIndex, setImageModalIndex] = useState(0);

  const schemaId = id || (externalUrl ? `external_${Date.now()}` : null);

  // Load schema once when route params change (detail mode only)
  useEffect(() => {
    if (isCatalogMode) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const loadSchema = async () => {
      setIsLoading(true);
      setError(null);

      try {
        let content: string | null = null;

        if (id) {
          // Try uploaded schemas first, then library schemas
          content = await getUniversalSchemaContent(id);
          if (!content) {
            throw new Error(`Schema "${id}" not found.`);
          }
        } else if (externalUrl) {
          content = await fetchExternalSchema(externalUrl);
        } else {
          throw new Error('No schema ID or URL provided.');
        }

        if (cancelled) return;

        const parsed = JSON.parse(content);
        validateSchemaStructure(parsed);
        setSchemaData(parsed);
        setSchemaContent(content);

        // Build a minimal UnifiedSchema for convertSchemaToAcquisitions
        const unifiedSchema: UnifiedSchema = {
          id: id || `external_${Date.now()}`,
          name: parsed.name || 'Untitled Schema',
          description: parsed.description || '',
          category: id ? 'Library' : 'External',
          content: content,
          format: 'json',
          version: parsed.version,
          authors: parsed.authors,
          acquisitions: [],
          isMultiAcquisition: Object.keys(parsed.acquisitions || {}).length > 1,
        };

        const getContent = async () => content;
        const acqs = await convertSchemaToAcquisitions(unifiedSchema, getContent);
        if (!cancelled) {
          setAcquisitions(acqs);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load schema');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadSchema();
    return () => { cancelled = true; };
  }, [id, externalUrl, isCatalogMode, getUniversalSchemaContent]);

  // Selection handlers
  const toggleSelection = (index: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIndices(new Set(acquisitions.map((_, i) => i)));
  };

  const deselectAll = () => {
    setSelectedIndices(new Set());
  };

  const allSelected = acquisitions.length > 0 && selectedIndices.size === acquisitions.length;

  // Sync nav selection from URL acq param
  useEffect(() => {
    if (acqParam !== null) {
      setSelectedNavItem(parseInt(acqParam, 10));
    } else if (id || externalUrl) {
      setSelectedNavItem('schema');
    }
  }, [acqParam, id, externalUrl]);

  // Reset nav selection if index is out of bounds
  useEffect(() => {
    if (typeof selectedNavItem === 'number' && selectedNavItem >= acquisitions.length && acquisitions.length > 0) {
      setSelectedNavItem('schema');
    }
  }, [acquisitions.length, selectedNavItem]);

  // Actions
  const handleOpenInWorkspace = () => {
    const acquisitionNames = Object.keys(schemaData?.acquisitions || {});
    const payload = {
      schemaId: id || null,
      schemaUrl: externalUrl || null,
      schemaContent: schemaContent, // Always include so workspace can load without waiting for library
      selectedAcquisitionIndices: Array.from(selectedIndices),
      schemaName: schemaData?.name || 'External Schema',
      acquisitionNames,
    };
    sessionStorage.setItem('pendingSchemaImport', JSON.stringify(payload));
    navigate('/workspace');
  };

  const handleDownload = () => {
    if (!schemaData) return;
    const blob = new Blob([JSON.stringify(schemaData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${schemaData.name || 'schema'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handlePrint = async () => {
    if (!schemaData || acquisitions.length === 0) return;

    // If some are selected, print only those; otherwise print all
    const acqsToPrint = selectedIndices.size > 0
      ? acquisitions.filter((_, i) => selectedIndices.has(i))
      : acquisitions;

    const html = generateSchemaViewerPrintHtml({
      schemaName: schemaData.name || 'Untitled Schema',
      schemaVersion: schemaData.version,
      schemaAuthors: schemaData.authors,
      schemaDescription: schemaData.description,
      acquisitions: acqsToPrint,
    });

    if (isElectron()) {
      setPdfExporting(true);
      const filename = `${schemaData.name || 'schema'}-report.pdf`;
      const result = await exportToPdf(html, filename);
      setPdfExporting(false);
      if (!result.success && result.message !== 'Export cancelled') {
        alert(result.message || 'Failed to export PDF');
      }
    } else {
      if (!openPrintWindow(html)) {
        alert('Please allow popups to print the schema.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-surface-primary shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between">
          <div className="flex items-center">
            <Link to="/" className="flex items-center hover:opacity-80 transition-opacity">
              <ShieldCheck className="h-8 w-8 text-brand-600 mr-2" />
              <span className="text-xl font-bold text-content-primary">dicompare</span>
            </Link>
            <span className="mx-4 text-content-muted">/</span>
            {isCatalogMode ? (
              <h1 className="text-xl font-semibold text-content-secondary flex items-center gap-2">
                <BookOpen className="h-5 w-5 flex-shrink-0 text-brand-600" />
                Schema Library
              </h1>
            ) : (
              <>
                <Link to="/schema" className="text-xl font-semibold text-content-secondary hover:text-content-primary transition-colors flex items-center gap-2">
                  <BookOpen className="h-5 w-5 flex-shrink-0 text-brand-600" />
                  Schema Library
                </Link>
                <span className="mx-4 text-content-muted">/</span>
                <h1 className="text-xl font-semibold text-content-secondary truncate max-w-md">
                  {schemaData?.name || 'Schema Viewer'}
                </h1>
              </>
            )}
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button
              onClick={() => setShowPrivacy(true)}
              className="inline-flex items-center gap-1.5 px-2 py-2 rounded-lg text-sm text-content-secondary hover:text-content-primary hover:bg-surface-secondary transition-colors"
              title="Privacy"
            >
              <Shield className="h-5 w-5" />
              <span className="hidden sm:inline">Privacy</span>
            </button>
            <button
              onClick={() => setShowCitation(true)}
              className="inline-flex items-center gap-1.5 px-2 py-2 rounded-lg text-sm text-content-secondary hover:text-content-primary hover:bg-surface-secondary transition-colors"
              title="Cite dicompare"
            >
              <Quote className="h-5 w-5" />
              <span className="hidden sm:inline">Cite</span>
            </button>
            <a
              href="https://github.com/astewartau/dicompare-web"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2 py-2 rounded-lg text-sm text-content-secondary hover:text-content-primary hover:bg-surface-secondary transition-colors"
            >
              <Github className="h-5 w-5" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
            <span className="text-xs font-medium text-content-tertiary opacity-60 ml-1">v{VERSION}</span>
          </div>
        </div>
      </header>
      <CitationModal isOpen={showCitation} onClose={() => setShowCitation(false)} />
      <PrivacyModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
      <ImageManagerModal
        isOpen={imageModalAcq !== null}
        onClose={() => setImageModalAcq(null)}
        title={imageModalAcq?.protocolName || 'Acquisition'}
        images={imageModalAcq?.images || []}
        isReadOnly={true}
        initialSelectedIndex={imageModalIndex}
      />

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Catalog mode — browse all schemas */}
        {isCatalogMode && (
          <div className="h-[calc(100vh-130px)]">
            {schemaService.isLoading ? (
              <div className="flex flex-col items-center justify-center py-24">
                <Loader className="h-8 w-8 text-brand-600 animate-spin mb-4" />
                <p className="text-content-secondary">Loading schemas...</p>
              </div>
            ) : (
              <UnifiedSchemaSelector
                librarySchemas={schemaService.librarySchemas}
                uploadedSchemas={schemaService.uploadedSchemas}
                selectionMode="acquisition"
                expandable={true}
                onAcquisitionSelect={(selectedId, acqIndex) => navigate(`/schema/${selectedId}?acq=${acqIndex}`)}
                onOpenSchema={(selectedId) => navigate(`/schema/${selectedId}`)}
                onSchemaUpload={(file) => uploadSchema(file)}
                getSchemaContent={schemaService.getSchemaContent}
                maxHeight="calc(100vh - 150px)"
              />
            )}
          </div>
        )}

        {/* Detail mode — Loading */}
        {!isCatalogMode && isLoading && (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader className="h-8 w-8 text-brand-600 animate-spin mb-4" />
            <p className="text-content-secondary">Loading schema...</p>
          </div>
        )}

        {/* Detail mode — Error */}
        {!isCatalogMode && !isLoading && error && (
          <div className="max-w-2xl mx-auto py-12">
            <div className="bg-surface-primary rounded-lg border border-status-error/30 p-8 text-center">
              <AlertTriangle className="h-12 w-12 text-status-error mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-content-primary mb-2">Failed to load schema</h2>
              <p className="text-content-secondary mb-6">{error}</p>
              <div className="flex justify-center gap-3">
                <Link
                  to="/schema"
                  className="px-4 py-2 rounded-lg bg-surface-secondary text-content-primary hover:bg-surface-tertiary transition-colors"
                >
                  Browse Schemas
                </Link>
                <Link
                  to="/workspace"
                  className="px-4 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
                >
                  Open Workspace
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Detail mode — sidebar + detail pane layout */}
        {!isCatalogMode && !isLoading && !error && schemaData && (
          <div className="grid grid-cols-12 gap-6 h-auto md:h-[calc(100vh-130px)]">
            {/* Left sidebar — navigation */}
            <div className="col-span-12 md:col-span-3 flex flex-col min-h-0 max-h-[50vh] md:max-h-none">
              <div className="bg-surface-primary rounded-lg border border-border shadow-sm flex flex-col h-full">
                {/* Schema metadata */}
                <div className="p-4 border-b border-border flex-shrink-0">
                  <Link to="/schema" className="flex items-center gap-1 text-xs text-content-secondary hover:text-content-primary transition-colors mb-2">
                    <ArrowLeft className="h-3.5 w-3.5" />
                    All schemas
                  </Link>
                  <h2 className="text-lg font-bold text-content-primary mb-1">
                    {schemaData.name || 'Untitled Schema'}
                  </h2>
                  <div className="flex items-center flex-wrap gap-2 text-xs text-content-tertiary">
                    {schemaData.version && (
                      <span className="px-2 py-0.5 rounded bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 font-medium">
                        v{schemaData.version}
                      </span>
                    )}
                    {schemaData.authors && schemaData.authors.length > 0 && (
                      <span>{schemaData.authors.join(', ')}</span>
                    )}
                    <span>{Object.keys(schemaData.acquisitions || {}).length} acquisitions</span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="px-4 py-3 border-b border-border flex-shrink-0">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleCopyLink}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border border-border text-content-secondary hover:text-content-primary hover:bg-surface-secondary transition-colors"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      {copiedLink ? 'Copied!' : 'Copy link'}
                    </button>
                    <button
                      onClick={handleDownload}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border border-border text-content-secondary hover:text-content-primary hover:bg-surface-secondary transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </button>
                    <button
                      onClick={handlePrint}
                      disabled={pdfExporting || acquisitions.length === 0}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border border-border text-content-secondary hover:text-content-primary hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title={selectedIndices.size > 0 ? `Print ${selectedIndices.size} selected` : 'Print all'}
                    >
                      <Printer className="h-3.5 w-3.5" />
                      {pdfExporting ? 'Exporting...' : isElectron() ? 'PDF' : selectedIndices.size > 0 ? `Print (${selectedIndices.size})` : 'Print'}
                    </button>
                  </div>
                </div>

                {/* Navigation list */}
                <div className="flex-1 overflow-y-auto min-h-0">
                  {/* Schema README nav item */}
                  <button
                    onClick={() => setSearchParams(prev => { prev.delete('acq'); return prev; }, { replace: true })}
                    className={`w-full text-left px-4 py-2.5 flex items-center gap-2 transition-colors border-b border-border ${
                      selectedNavItem === 'schema'
                        ? 'bg-brand-50 dark:bg-brand-900/20 border-l-2 border-l-brand-500'
                        : 'hover:bg-surface-secondary'
                    }`}
                  >
                    <BookOpen className={`h-4 w-4 flex-shrink-0 ${
                      selectedNavItem === 'schema' ? 'text-brand-600' : 'text-content-tertiary'
                    }`} />
                    <span className={`text-sm font-medium truncate ${
                      selectedNavItem === 'schema' ? 'text-brand-700 dark:text-brand-300' : 'text-content-primary'
                    }`}>
                      Schema README
                    </span>
                  </button>

                  {/* Select All / Deselect All */}
                  <div className="px-4 py-2 border-b border-border flex items-center justify-between">
                    <button
                      onClick={allSelected ? deselectAll : selectAll}
                      className="flex items-center gap-1.5 text-xs text-content-secondary hover:text-content-primary transition-colors"
                    >
                      {allSelected ? (
                        <CheckSquare className="h-3.5 w-3.5 text-brand-600" />
                      ) : (
                        <Square className="h-3.5 w-3.5" />
                      )}
                      {allSelected ? 'Deselect all' : 'Select all'}
                    </button>
                    <span className="text-xs text-content-tertiary">
                      {selectedIndices.size}/{acquisitions.length}
                    </span>
                  </div>

                  {/* Acquisition nav items */}
                  {acquisitions.map((acq, index) => {
                    const isNavSelected = selectedNavItem === index;
                    const isChecked = selectedIndices.has(index);

                    return (
                      <div
                        key={acq.id || index}
                        onClick={() => setSearchParams(prev => { prev.set('acq', String(index)); return prev; }, { replace: true })}
                        className={`w-full text-left px-4 py-2.5 flex items-center gap-2 transition-colors border-b border-border cursor-pointer ${
                          isNavSelected
                            ? 'bg-brand-50 dark:bg-brand-900/20 border-l-2 border-l-brand-500'
                            : 'hover:bg-surface-secondary'
                        }`}
                      >
                        {/* Checkbox */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelection(index);
                          }}
                          className="flex-shrink-0"
                        >
                          {isChecked ? (
                            <div className="w-4 h-4 rounded border-2 flex items-center justify-center bg-brand-600 border-brand-600">
                              <Check className="h-2.5 w-2.5 text-white" />
                            </div>
                          ) : (
                            <div className="w-4 h-4 rounded border-2 border-content-muted hover:border-brand-500 transition-colors" />
                          )}
                        </button>

                        {/* Acquisition name */}
                        <span className={`text-sm truncate flex-1 ${
                          isNavSelected ? 'text-brand-700 dark:text-brand-300 font-medium' : 'text-content-primary'
                        }`}>
                          {acq.protocolName || 'Untitled Acquisition'}
                        </span>

                        {/* BookOpen indicator if has detailedDescription */}
                        {acq.detailedDescription && (
                          <BookOpen className="h-3.5 w-3.5 text-content-tertiary flex-shrink-0" />
                        )}
                      </div>
                    );
                  })}

                  {acquisitions.length === 0 && (
                    <div className="px-4 py-6 text-center text-xs text-content-tertiary">
                      No acquisitions in this schema.
                    </div>
                  )}
                </div>

                {/* Open in Workspace button */}
                <div className="p-3 border-t border-border flex-shrink-0">
                  <button
                    onClick={handleOpenInWorkspace}
                    disabled={selectedIndices.size === 0}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Layers className="h-4 w-4" />
                    Open in Workspace
                  </button>
                </div>
              </div>
            </div>

            {/* Right detail pane */}
            <div className="col-span-12 md:col-span-9 overflow-y-auto">
              <div className="bg-surface-primary rounded-lg border border-border shadow-sm p-6 min-h-full">
                {selectedNavItem === 'schema' ? (
                  /* Schema README view */
                  schemaData.description ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                        {schemaData.description}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-content-tertiary">
                      <BookOpen className="h-8 w-8 mx-auto mb-3 opacity-50" />
                      <p>This schema has no README description.</p>
                    </div>
                  )
                ) : (
                  /* Acquisition detail view */
                  (() => {
                    const acq = acquisitions[selectedNavItem];
                    if (!acq) return null;
                    return (
                      <div>
                        {/* Acquisition header */}
                        <div className="mb-4">
                          <h2 className="text-xl font-bold text-content-primary mb-1">
                            {acq.protocolName || 'Untitled Acquisition'}
                          </h2>
                          {acq.seriesDescription && (
                            <p className="text-sm text-content-secondary mb-2">
                              {acq.seriesDescription}
                            </p>
                          )}
                          {acq.tags && acq.tags.length > 0 && (
                            <div className="flex items-center flex-wrap gap-2">
                              {acq.tags.map(tag => (
                                <span
                                  key={tag}
                                  className={`px-2 py-0.5 rounded text-xs ${
                                    tag.startsWith('analysis:')
                                      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                                      : 'bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                                  }`}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Detailed description markdown */}
                        {acq.detailedDescription && (
                          <div className="mb-6 pb-6 border-b border-border">
                            <div className="prose prose-sm max-w-none dark:prose-invert">
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                {acq.detailedDescription}
                              </ReactMarkdown>
                            </div>
                          </div>
                        )}

                        {/* Image strip */}
                        {acq.images && acq.images.length > 0 && (
                          <div className="mb-6 pb-6 border-b border-border">
                            <h3 className="text-xs font-medium text-content-tertiary uppercase tracking-wider mb-2">Images</h3>
                            <div className="flex flex-wrap gap-3">
                              {acq.images.map((img, imgIdx) => (
                                <button
                                  key={imgIdx}
                                  onClick={() => { setImageModalIndex(imgIdx); setImageModalAcq(acq); }}
                                  className="group w-32 rounded-lg border border-border-secondary hover:border-brand-400 overflow-hidden transition-colors bg-surface-secondary"
                                  title={img.label || img.url}
                                >
                                  {isFlatImageUrl(img.url) ? (
                                    <div className="w-32 h-24">
                                      <img
                                        src={img.url}
                                        alt={img.label || ''}
                                        className="w-full h-full object-contain"
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                      />
                                    </div>
                                  ) : isVolumeUrl(img.url) ? (
                                    <div className="w-32 h-24 relative">
                                      <VolumeThumbnail url={img.url} className="w-full h-full" />
                                      <div className="absolute top-1 right-1 p-1 rounded-full bg-brand-600 shadow">
                                        <Brain className="h-3 w-3 text-white" />
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="w-32 h-24 flex items-center justify-center text-content-tertiary">
                                      <span className="text-xs">Preview N/A</span>
                                    </div>
                                  )}
                                  <div className="px-1.5 py-1 border-t border-border-secondary">
                                    <span className="text-[10px] text-content-secondary truncate block">
                                      {img.label || img.url.split('/').pop() || 'Untitled'}
                                    </span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Acquisition table (fields, series, validation rules) */}
                        <AcquisitionTable
                          acquisition={acq}
                          isEditMode={false}
                          mode="view"
                          hideHeader={true}
                          schemaId={schemaId || undefined}
                          onUpdate={noop}
                          onDelete={noop}
                          onFieldUpdate={noop}
                          onFieldConvert={noop}
                          onFieldDelete={noop}
                          onFieldAdd={noop}
                          onSeriesUpdate={noop}
                          onSeriesAdd={noop}
                          onSeriesDelete={noop}
                          onSeriesNameUpdate={noop}
                        />
                      </div>
                    );
                  })()
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SchemaViewerPage;
