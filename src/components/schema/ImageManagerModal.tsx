import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Plus, Trash2, Download, Edit2, Brain, ImageIcon, Check, Database } from 'lucide-react';
import { SchemaImage } from '../../types';
import { isVolumeUrl, isFlatImageUrl } from '../../utils/imageHelpers';
import NiivueViewer, { VolumeInfo } from '../viewer/NiivueViewer';
import VolumeThumbnail from '../common/VolumeThumbnail';

type TabId = 'loaded' | 'schema';

interface ImageManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  images: SchemaImage[];
  onSave?: (images: SchemaImage[]) => void;
  isReadOnly?: boolean;
  /** DICOM File objects from uploaded data (for the "Loaded DICOMs" tab) */
  dicomFiles?: File[];
  /** Which tab to show initially. If not set, defaults to 'loaded' when dicomFiles exist, else 'schema'. */
  initialTab?: TabId;
  /** Which schema image to select initially in the sidebar. */
  initialSelectedIndex?: number;
}

const ImageManagerModal: React.FC<ImageManagerModalProps> = ({
  isOpen,
  onClose,
  title,
  images,
  onSave,
  isReadOnly = false,
  dicomFiles,
  initialTab,
  initialSelectedIndex,
}) => {
  const hasLoadedDicoms = dicomFiles && dicomFiles.length > 0;
  const defaultTab: TabId = initialTab ?? (hasLoadedDicoms ? 'loaded' : 'schema');

  const [activeTab, setActiveTab] = useState<TabId>(defaultTab);
  const [discoveredVolumes, setDiscoveredVolumes] = useState<VolumeInfo[]>([]);
  const [selectedVolumeIndex, setSelectedVolumeIndex] = useState(0);
  const [editedImages, setEditedImages] = useState<SchemaImage[]>(images);
  const lastSavedRef = useRef(images);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Resize state
  const [size, setSize] = useState({ width: 1024, height: 0 });
  const resizing = useRef(false);
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  const onResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = modalRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    resizing.current = true;
    resizeStart.current = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onResizePointerMove = useCallback((e: React.PointerEvent) => {
    if (!resizing.current) return;
    const dx = e.clientX - resizeStart.current.x;
    const dy = e.clientY - resizeStart.current.y;
    setSize({
      width: Math.max(480, resizeStart.current.w + dx * 2),
      height: Math.max(320, resizeStart.current.h + dy * 2),
    });
  }, []);

  const onResizePointerUp = useCallback(() => {
    resizing.current = false;
  }, []);

  // Sync edited images when the source images prop changes
  useEffect(() => {
    setEditedImages(images);
    lastSavedRef.current = images;
  }, [images]);

  // Reset selection and tab only when the modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(initialSelectedIndex ?? 0);
      setEditingIndex(null);
      setActiveTab(initialTab ?? (hasLoadedDicoms ? 'loaded' : 'schema'));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const saveIfChanged = () => {
    if (onSave && JSON.stringify(editedImages) !== JSON.stringify(lastSavedRef.current)) {
      const cleaned = editedImages.filter(img => img.url.trim() !== '');
      onSave(cleaned);
      lastSavedRef.current = cleaned;
    }
  };

  const selected = editedImages[selectedIndex];
  const selectedIsVolume = selected && selected.url.trim() && isVolumeUrl(selected.url);
  const selectedIsFlatImage = selected && selected.url.trim() && isFlatImageUrl(selected.url);

  // Memoize the urls array so NiivueViewer doesn't reinitialize on every render (e.g. during resize)
  const selectedVolumeUrls = useMemo(
    () => {
      if (!selected || !selectedIsVolume) return undefined;
      // Always use the filename from URL for NiiVue — it needs the extension to detect format
      const name = selected.url.split('/').pop() || 'volume.nii.gz';
      return [{ url: selected.url, name }];
    },
    [selected?.url, selectedIsVolume]
  );

  if (!isOpen) return null;

  const handleClose = () => {
    saveIfChanged();
    onClose();
  };

  const handleAdd = () => {
    const newImages = [...editedImages, { url: '', label: '', description: '' }];
    setEditedImages(newImages);
    const newIndex = newImages.length - 1;
    setSelectedIndex(newIndex);
    setEditingIndex(newIndex);
  };

  const handleRemove = (index: number) => {
    const updated = editedImages.filter((_, i) => i !== index);
    setEditedImages(updated);
    setEditingIndex(null);
    if (selectedIndex >= updated.length) {
      setSelectedIndex(Math.max(0, updated.length - 1));
    }
  };

  const handleUpdate = (index: number, field: keyof SchemaImage, value: string) => {
    const updated = [...editedImages];
    updated[index] = { ...updated[index], [field]: value };
    setEditedImages(updated);
  };

  const handleFinishEditing = () => {
    setEditingIndex(null);
    saveIfChanged();
  };

  const handleTabChange = (tab: TabId) => {
    if (tab !== activeTab) {
      if (activeTab === 'schema') saveIfChanged();
      setActiveTab(tab);
    }
  };

  const isEditing = editingIndex === selectedIndex;

  const getFilename = (url: string) => {
    try {
      return url.split('/').pop() || url;
    } catch {
      return url;
    }
  };

  const showTabs = hasLoadedDicoms || editedImages.length > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div
        ref={modalRef}
        className="bg-surface-primary rounded-lg overflow-hidden flex flex-col relative"
        style={{
          width: Math.min(size.width, window.innerWidth - 32),
          height: size.height > 0 ? Math.min(size.height, window.innerHeight - 32) : '80vh',
          maxWidth: '95vw',
          maxHeight: '95vh',
        }}
      >
        {/* Header */}
        <div className="px-6 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-content-primary">{title}</h3>
            <span className="text-sm text-content-tertiary">Images</span>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-content-tertiary hover:text-content-secondary rounded-md hover:bg-surface-secondary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        {showTabs && (
          <div className="flex border-b border-border px-6 flex-shrink-0">
            {hasLoadedDicoms && (
              <button
                onClick={() => handleTabChange('loaded')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'loaded'
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-content-tertiary hover:text-content-secondary'
                }`}
              >
                <Database className="h-3.5 w-3.5 inline mr-1.5" />
                Loaded DICOMs
              </button>
            )}
            <button
              onClick={() => handleTabChange('schema')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'schema'
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-content-tertiary hover:text-content-secondary'
              }`}
            >
              <ImageIcon className="h-3.5 w-3.5 inline mr-1.5" />
              Schema Images{editedImages.length > 0 ? ` (${editedImages.length})` : ''}
            </button>
          </div>
        )}

        {/* Tab content */}
        <div className="flex-1 flex min-h-0">
          {activeTab === 'loaded' && hasLoadedDicoms ? (
            /* Loaded DICOMs tab — sidebar + NiiVue viewer */
            <>
              {/* Volume sidebar */}
              {discoveredVolumes.length > 1 && (
                <div className="w-48 flex-shrink-0 border-r border-border flex flex-col bg-surface-secondary">
                  <div className="flex-1 overflow-auto py-2">
                    {[...discoveredVolumes].sort((a, b) => a.name.localeCompare(b.name)).map((vol) => (
                      <button
                        key={vol.index}
                        onClick={() => setSelectedVolumeIndex(vol.index)}
                        className={`w-full text-left px-3 py-2 flex items-center gap-2 text-sm transition-colors ${
                          selectedVolumeIndex === vol.index
                            ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 border-r-2 border-brand-600'
                            : 'text-content-secondary hover:bg-surface-primary'
                        }`}
                      >
                        <div className="w-8 h-8 rounded border border-border-secondary bg-surface-primary flex-shrink-0 flex items-center justify-center">
                          <Brain className="h-3.5 w-3.5 text-content-tertiary" />
                        </div>
                        <span className="truncate text-xs">{vol.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <NiivueViewer
                files={dicomFiles}
                active={true}
                onVolumesDiscovered={setDiscoveredVolumes}
                externalVolumeIndex={discoveredVolumes.length > 1 ? selectedVolumeIndex : undefined}
              />
            </>
          ) : (
            /* Schema Images tab — sidebar + detail */
            <>
              {/* Sidebar */}
              <div className="w-48 flex-shrink-0 border-r border-border flex flex-col bg-surface-secondary">
                <div className="flex-1 overflow-auto py-2">
                  {editedImages.map((image, index) => (
                    <button
                      key={index}
                      onClick={() => { setSelectedIndex(index); setEditingIndex(null); }}
                      className={`w-full text-left px-3 py-2 flex items-center gap-2 text-sm transition-colors ${
                        selectedIndex === index
                          ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 border-r-2 border-brand-600'
                          : 'text-content-secondary hover:bg-surface-primary'
                      }`}
                    >
                      <div className="w-8 h-8 rounded border border-border-secondary bg-surface-primary flex-shrink-0 flex items-center justify-center overflow-hidden">
                        {image.url.trim() && isFlatImageUrl(image.url) ? (
                          <img
                            src={image.url}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : image.url.trim() && isVolumeUrl(image.url) ? (
                          <Brain className="h-3.5 w-3.5 text-content-tertiary" />
                        ) : (
                          <ImageIcon className="h-3.5 w-3.5 text-content-tertiary" />
                        )}
                      </div>
                      <span className="truncate text-xs">
                        {image.label || getFilename(image.url) || `Image ${index + 1}`}
                      </span>
                    </button>
                  ))}
                </div>
                {onSave && (
                  <div className="p-2 border-t border-border">
                    <button
                      onClick={handleAdd}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-brand-600 hover:text-brand-700 border border-dashed border-brand-300 hover:border-brand-400 rounded transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      Add image
                    </button>
                  </div>
                )}
              </div>

              {/* Detail area */}
              <div className="flex-1 flex flex-col min-w-0">
                {selected ? (
                  <>
                    <div className="flex-1 min-h-0 flex flex-col">
                      {selectedIsVolume ? (
                        <NiivueViewer
                          urls={selectedVolumeUrls}
                          active={activeTab === 'schema'}
                        />
                      ) : selectedIsFlatImage ? (
                        <div className="flex-1 min-h-0 bg-gray-950 flex items-center justify-center p-4">
                          <img
                            src={selected.url}
                            alt={selected.label || 'Image'}
                            className="max-w-full max-h-full object-contain"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                      ) : (
                        <div className="flex-1 min-h-0 bg-gray-950 flex items-center justify-center">
                          <div className="text-gray-500 text-sm flex flex-col items-center gap-2">
                            <ImageIcon className="h-12 w-12" />
                            <span>{selected.url.trim() ? 'Preview not available' : 'No URL set'}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Info bar */}
                    <div className="border-t border-border px-4 py-3 flex-shrink-0">
                      {isEditing ? (
                        <div className="space-y-2">
                          <div>
                            <label className="text-[10px] uppercase tracking-wider text-content-tertiary font-medium">URL</label>
                            <input
                              type="url"
                              value={selected.url}
                              onChange={(e) => handleUpdate(selectedIndex, 'url', e.target.value)}
                              placeholder="https://example.com/image.nii.gz"
                              className="w-full text-sm border border-border-secondary rounded px-2.5 py-1.5 bg-surface-primary text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-500 placeholder:text-content-tertiary"
                              autoFocus
                            />
                            <p className="text-[10px] text-content-tertiary mt-0.5">Supports NIfTI (.nii, .nii.gz), DICOM (.dcm, .IMA), and images (.png, .jpg, .gif, .webp)</p>
                          </div>
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <label className="text-[10px] uppercase tracking-wider text-content-tertiary font-medium">Label</label>
                              <input
                                type="text"
                                value={selected.label || ''}
                                onChange={(e) => handleUpdate(selectedIndex, 'label', e.target.value)}
                                placeholder="e.g., Sagittal view"
                                className="w-full text-sm border border-border-secondary rounded px-2.5 py-1.5 bg-surface-primary text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-500"
                              />
                            </div>
                            <div className="flex-1">
                              <label className="text-[10px] uppercase tracking-wider text-content-tertiary font-medium">Description</label>
                              <input
                                type="text"
                                value={selected.description || ''}
                                onChange={(e) => handleUpdate(selectedIndex, 'description', e.target.value)}
                                placeholder="Optional description"
                                className="w-full text-sm border border-border-secondary rounded px-2.5 py-1.5 bg-surface-primary text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-500"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={handleFinishEditing}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 rounded transition-colors"
                            >
                              <Check className="h-3 w-3" />
                              Done
                            </button>
                            <button
                              onClick={() => handleRemove(selectedIndex)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800 rounded transition-colors"
                            >
                              <Trash2 className="h-3 w-3" />
                              Delete
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-semibold text-content-primary truncate">
                              {selected.label || getFilename(selected.url) || 'Untitled'}
                            </h4>
                            {selected.description && (
                              <p className="text-xs text-content-secondary mt-0.5">{selected.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {selected.url.trim() && (
                              <a
                                href={selected.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                download
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-content-secondary border border-border-secondary rounded hover:bg-surface-secondary transition-colors"
                              >
                                <Download className="h-3 w-3" />
                                Download
                              </a>
                            )}
                            {onSave && (
                              <button
                                onClick={() => setEditingIndex(selectedIndex)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-content-secondary border border-border-secondary rounded hover:bg-surface-secondary transition-colors"
                              >
                                <Edit2 className="h-3 w-3" />
                                Edit
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-content-tertiary">
                    <div className="text-center">
                      <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="text-sm mb-2">No schema images yet</p>
                      {onSave && (
                        <button
                          onClick={handleAdd}
                          className="text-sm text-brand-600 hover:text-brand-700 underline"
                        >
                          Add an image
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Resize handle */}
        <div
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize z-10 flex items-end justify-end p-0.5 touch-none"
          title="Drag to resize"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" className="text-content-tertiary">
            <path d="M9 1L1 9M9 5L5 9M9 9L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default ImageManagerModal;
