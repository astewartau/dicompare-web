import React, { useState, useEffect } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
  ShieldCheck, Github, ChevronDown, ChevronRight, Check, Square,
  Download, Link2, Layers, Quote, Shield, AlertTriangle, Loader, CheckSquare, Printer,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ThemeToggle from '../components/common/ThemeToggle';
import CitationModal from '../components/common/CitationModal';
import PrivacyModal from '../components/common/PrivacyModal';
import AcquisitionTable from '../components/schema/AcquisitionTable';
import { VERSION } from '../version';
import { Acquisition } from '../types';
import { UnifiedSchema } from '../hooks/useSchemaService';
import { convertSchemaToAcquisitions } from '../utils/schemaToAcquisition';
import { fetchExternalSchema, validateSchemaStructure } from '../utils/externalSchemaFetch';
import { generateSchemaViewerPrintHtml, openPrintWindow, exportToPdf, isElectron } from '../utils/printReportGenerator';

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
  const [searchParams] = useSearchParams();
  const externalUrl = searchParams.get('url');
  const navigate = useNavigate();

  // Schema data state
  const [schemaData, setSchemaData] = useState<any>(null);
  const [schemaContent, setSchemaContent] = useState<string | null>(null);
  const [acquisitions, setAcquisitions] = useState<Acquisition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());
  const [copiedLink, setCopiedLink] = useState(false);
  const [showCitation, setShowCitation] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);

  const schemaId = id || (externalUrl ? `external_${Date.now()}` : null);

  // Load schema once when route params change
  useEffect(() => {
    let cancelled = false;

    const loadSchema = async () => {
      setIsLoading(true);
      setError(null);

      try {
        let content: string | null = null;

        if (id) {
          // Fetch library schema using absolute base path
          const basePath = import.meta.env.BASE_URL || '/';
          const response = await fetch(`${basePath}schemas/${id}.json`);
          if (response.ok) {
            content = await response.text();
          }
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
  }, [id, externalUrl]);

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

  // Expand/collapse
  const toggleExpand = (index: number) => {
    setExpandedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

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

  // Summary counts for an acquisition
  const getAcquisitionSummary = (acq: Acquisition) => {
    const fieldCount = acq.acquisitionFields?.length || 0;
    const seriesCount = acq.series?.length || 0;
    const ruleCount = acq.validationFunctions?.length || 0;
    return { fieldCount, seriesCount, ruleCount };
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
            <h1 className="text-xl font-semibold text-content-secondary truncate max-w-md">
              {schemaData?.name || 'Schema Viewer'}
            </h1>
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

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader className="h-8 w-8 text-brand-600 animate-spin mb-4" />
            <p className="text-content-secondary">Loading schema...</p>
          </div>
        )}

        {/* Error */}
        {!isLoading && error && (
          <div className="max-w-2xl mx-auto py-12">
            <div className="bg-surface-primary rounded-lg border border-status-error/30 p-8 text-center">
              <AlertTriangle className="h-12 w-12 text-status-error mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-content-primary mb-2">Failed to load schema</h2>
              <p className="text-content-secondary mb-6">{error}</p>
              <div className="flex justify-center gap-3">
                <Link
                  to="/"
                  className="px-4 py-2 rounded-lg bg-surface-secondary text-content-primary hover:bg-surface-tertiary transition-colors"
                >
                  Back to Home
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

        {/* Loaded — two-column layout */}
        {!isLoading && !error && schemaData && (
          <div className="grid grid-cols-12 gap-6 h-[calc(100vh-130px)]">
            {/* Left column — README / metadata */}
            <div className="col-span-12 md:col-span-4 overflow-y-auto">
              <div className="bg-surface-primary rounded-lg border border-border shadow-sm p-6">
                <h2 className="text-2xl font-bold text-content-primary mb-2">
                  {schemaData.name || 'Untitled Schema'}
                </h2>
                <div className="flex items-center flex-wrap gap-2 text-sm text-content-tertiary mb-4">
                  {schemaData.version && (
                    <span className="px-2 py-0.5 rounded bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 text-xs font-medium">
                      v{schemaData.version}
                    </span>
                  )}
                  {schemaData.authors && schemaData.authors.length > 0 && (
                    <span>{schemaData.authors.join(', ')}</span>
                  )}
                  <span>{Object.keys(schemaData.acquisitions || {}).length} acquisitions</span>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 mb-5 pb-5 border-b border-border">
                  <button
                    onClick={handleCopyLink}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-border text-content-secondary hover:text-content-primary hover:bg-surface-secondary transition-colors"
                  >
                    <Link2 className="h-4 w-4" />
                    {copiedLink ? 'Copied!' : 'Copy link'}
                  </button>
                  <button
                    onClick={handleDownload}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-border text-content-secondary hover:text-content-primary hover:bg-surface-secondary transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </button>
                  <button
                    onClick={handlePrint}
                    disabled={pdfExporting || acquisitions.length === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-border text-content-secondary hover:text-content-primary hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title={selectedIndices.size > 0 ? `Print ${selectedIndices.size} selected acquisition${selectedIndices.size === 1 ? '' : 's'}` : 'Print all acquisitions'}
                  >
                    <Printer className="h-4 w-4" />
                    {pdfExporting ? 'Exporting...' : isElectron() ? 'Export PDF' : selectedIndices.size > 0 ? `Print (${selectedIndices.size})` : 'Print'}
                  </button>
                </div>

                {/* Description / README */}
                {schemaData.description && (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {schemaData.description}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>

            {/* Right column — acquisitions */}
            <div className="col-span-12 md:col-span-8 flex flex-col min-h-0">
              {/* Action bar */}
              <div className="bg-surface-primary rounded-lg border border-border shadow-sm px-4 py-3 mb-4 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-4">
                  <button
                    onClick={allSelected ? deselectAll : selectAll}
                    className="flex items-center gap-2 text-sm text-content-secondary hover:text-content-primary transition-colors"
                  >
                    {allSelected ? (
                      <CheckSquare className="h-4 w-4 text-brand-600" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                    {allSelected ? 'Deselect all' : 'Select all'}
                  </button>
                  <span className="text-sm text-content-tertiary">
                    {selectedIndices.size} of {acquisitions.length} selected
                  </span>
                </div>
                <button
                  onClick={handleOpenInWorkspace}
                  disabled={selectedIndices.size === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Layers className="h-4 w-4" />
                  Open in Workspace
                </button>
              </div>

              {/* Acquisition cards */}
              <div className="overflow-y-auto space-y-3 flex-1 min-h-0">
                {acquisitions.map((acq, index) => {
                  const isSelected = selectedIndices.has(index);
                  const isExpanded = expandedIndices.has(index);
                  const { fieldCount, seriesCount, ruleCount } = getAcquisitionSummary(acq);

                  return (
                    <div
                      key={acq.id || index}
                      className={`bg-surface-primary rounded-lg border shadow-sm transition-colors ${
                        isSelected
                          ? 'border-brand-500'
                          : 'border-border'
                      }`}
                    >
                      {/* Card header */}
                      <div
                        className="flex items-start gap-3 p-4 cursor-pointer"
                        onClick={() => toggleExpand(index)}
                      >
                        {/* Checkbox */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelection(index);
                          }}
                          className="mt-0.5 flex-shrink-0"
                        >
                          {isSelected ? (
                            <div className="w-5 h-5 rounded border-2 flex items-center justify-center bg-brand-600 border-brand-600">
                              <Check className="h-3 w-3 text-white" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded border-2 border-content-muted hover:border-brand-500 transition-colors" />
                          )}
                        </button>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium text-content-primary">
                              {acq.protocolName || 'Untitled Acquisition'}
                            </h3>
                          </div>
                          {acq.seriesDescription && (
                            <p className="text-sm text-content-secondary mb-2 line-clamp-2">
                              {acq.seriesDescription}
                            </p>
                          )}
                          <div className="flex items-center flex-wrap gap-2">
                            {/* Tags */}
                            {acq.tags && acq.tags.map(tag => (
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
                            {/* Summary stats */}
                            <span className="text-xs text-content-tertiary">
                              {fieldCount > 0 && `${fieldCount} fields`}
                              {fieldCount > 0 && seriesCount > 0 && ', '}
                              {seriesCount > 0 && `${seriesCount} series`}
                              {(fieldCount > 0 || seriesCount > 0) && ruleCount > 0 && ', '}
                              {ruleCount > 0 && `${ruleCount} rules`}
                            </span>
                          </div>
                        </div>

                        {/* Expand toggle */}
                        <div className="flex-shrink-0 mt-1 text-content-tertiary">
                          {isExpanded ? (
                            <ChevronDown className="h-5 w-5" />
                          ) : (
                            <ChevronRight className="h-5 w-5" />
                          )}
                        </div>
                      </div>

                      {/* Expanded content */}
                      {isExpanded && (
                        <div className="border-t border-border px-4 pb-4">
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
                      )}
                    </div>
                  );
                })}

                {acquisitions.length === 0 && (
                  <div className="bg-surface-primary rounded-lg border border-border p-12 text-center">
                    <p className="text-content-secondary">This schema has no acquisitions.</p>
                  </div>
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
