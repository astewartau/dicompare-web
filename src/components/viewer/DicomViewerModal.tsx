import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Loader2, AlertTriangle, Camera, Download, RotateCcw } from 'lucide-react';
import { Niivue, SLICE_TYPE, MULTIPLANAR_TYPE, SHOW_RENDER, DRAG_MODE } from '@niivue/niivue';
import { Dcm2niix } from '@niivue/dcm2niix';

interface DicomViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: File[];
  acquisitionName: string;
}

type ViewMode = 'multiplanar' | 'axial' | 'coronal' | 'sagittal' | 'render';

const VIEW_MODES: { key: ViewMode; label: string; sliceType: number }[] = [
  { key: 'multiplanar', label: '3-Plane', sliceType: SLICE_TYPE.MULTIPLANAR },
  { key: 'axial', label: 'Axial', sliceType: SLICE_TYPE.AXIAL },
  { key: 'coronal', label: 'Coronal', sliceType: SLICE_TYPE.CORONAL },
  { key: 'sagittal', label: 'Sagittal', sliceType: SLICE_TYPE.SAGITTAL },
  { key: 'render', label: '3D', sliceType: SLICE_TYPE.RENDER },
];

const DicomViewerModal: React.FC<DicomViewerModalProps> = ({
  isOpen,
  onClose,
  files,
  acquisitionName,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nvRef = useRef<Niivue | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Converting DICOM to viewable format...');
  const [error, setError] = useState<string | null>(null);
  const [volumes, setVolumes] = useState<File[]>([]);
  const [selectedVolumeIndex, setSelectedVolumeIndex] = useState(0);

  // Toolbar state
  const [activeView, setActiveView] = useState<ViewMode>('multiplanar');
  const [windowMin, setWindowMin] = useState(0);
  const [windowMax, setWindowMax] = useState(100);
  const [dataRange, setDataRange] = useState({ min: 0, max: 100 });
  const [crosshairVisible, setCrosshairVisible] = useState(true);

  // Keep canvas pixel dimensions in sync with container via ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const syncSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const w = Math.floor(rect.width * dpr);
      const h = Math.floor(rect.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        nvRef.current?.drawScene();
      }
    };

    const ro = new ResizeObserver(syncSize);
    ro.observe(container);
    syncSize();

    return () => ro.disconnect();
  }, [isOpen]);

  // Clean up NiiVue instance
  const cleanup = useCallback(() => {
    if (nvRef.current) {
      try {
        const vols = nvRef.current.volumes;
        for (let i = vols.length - 1; i >= 0; i--) {
          nvRef.current.removeVolume(vols[i]);
        }
      } catch {
        // Ignore cleanup errors
      }
      nvRef.current = null;
    }
  }, []);

  // Load a specific volume into niivue and update windowing state
  const loadVolume = useCallback(async (nv: Niivue, file: File) => {
    const url = URL.createObjectURL(file);
    try {
      await nv.loadVolumes([{ url, name: file.name }]);
    } finally {
      URL.revokeObjectURL(url);
    }

    // Update windowing range from loaded volume
    if (nv.volumes.length > 0) {
      const vol = nv.volumes[0];
      const min = (vol as any).robust_min ?? (vol as any).global_min ?? 0;
      const max = (vol as any).robust_max ?? (vol as any).global_max ?? 100;
      setDataRange({ min, max });
      setWindowMin(vol.cal_min ?? min);
      setWindowMax(vol.cal_max ?? max);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || files.length === 0) return;

    let cancelled = false;

    const initViewer = async () => {
      setIsLoading(true);
      setError(null);
      setLoadingMessage('Converting DICOM to viewable format...');
      setActiveView('multiplanar');
      setCrosshairVisible(true);

      try {
        const dcm2niix = new Dcm2niix();
        await dcm2niix.init();

        if (cancelled) return;

        const resultFiles: File[] = await dcm2niix.input(files).run();
        const niftiFiles = resultFiles.filter(
          (f: File) => f.name.endsWith('.nii') || f.name.endsWith('.nii.gz')
        );

        if (cancelled) return;

        if (niftiFiles.length === 0) {
          setError('No viewable volumes could be created from these DICOM files.');
          setIsLoading(false);
          return;
        }

        setVolumes(niftiFiles);
        setSelectedVolumeIndex(0);
        setLoadingMessage('Initializing viewer...');

        // Wait for layout to settle
        await new Promise(resolve => setTimeout(resolve, 100));

        if (cancelled || !canvasRef.current || !containerRef.current) return;

        // Set canvas pixel dimensions to match container before attaching
        const dpr = window.devicePixelRatio || 1;
        const rect = containerRef.current.getBoundingClientRect();
        canvasRef.current.width = Math.floor(rect.width * dpr);
        canvasRef.current.height = Math.floor(rect.height * dpr);

        const nv = new Niivue({
          loadingText: '',
          isColorbar: false,
          textHeight: 0.03,
          show3Dcrosshair: false,
          crosshairColor: [0.23, 0.51, 0.96, 1.0],
          crosshairWidth: 0.75,
          dragAndDropEnabled: false,
          isResizeCanvas: false,
        });

        await nv.attachToCanvas(canvasRef.current);
        nv.setMultiplanarLayout(MULTIPLANAR_TYPE.ROW);
        nv.setSliceType(SLICE_TYPE.MULTIPLANAR);
        nv.opts.multiplanarShowRender = SHOW_RENDER.NEVER;
        nv.opts.dragMode = DRAG_MODE.slicer3D;
        nv.setInterpolation(true);

        await loadVolume(nv, niftiFiles[0]);

        nvRef.current = nv;
        setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load DICOM viewer:', err);
          setError(err instanceof Error ? err.message : 'Failed to load DICOM images');
          setIsLoading(false);
        }
      }
    };

    initViewer();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [isOpen, files, cleanup, loadVolume]);

  // --- Control handlers ---

  const handleViewChange = (mode: ViewMode) => {
    const nv = nvRef.current;
    if (!nv) return;
    const config = VIEW_MODES.find(v => v.key === mode);
    if (config) {
      nv.setSliceType(config.sliceType);
      setActiveView(mode);
    }
  };

  const handleVolumeChange = async (index: number) => {
    if (!nvRef.current || !volumes[index]) return;
    setSelectedVolumeIndex(index);
    const vols = nvRef.current.volumes;
    for (let i = vols.length - 1; i >= 0; i--) {
      nvRef.current.removeVolume(vols[i]);
    }
    await loadVolume(nvRef.current, volumes[index]);
  };

  const applyWindow = (min: number, max: number) => {
    const nv = nvRef.current;
    if (!nv || nv.volumes.length === 0) return;
    nv.volumes[0].cal_min = min;
    nv.volumes[0].cal_max = max;
    nv.updateGLVolume();
  };

  const handleWindowMinChange = (val: number) => {
    const clamped = Math.min(val, windowMax - 0.01);
    setWindowMin(clamped);
    applyWindow(clamped, windowMax);
  };

  const handleWindowMaxChange = (val: number) => {
    const clamped = Math.max(val, windowMin + 0.01);
    setWindowMax(clamped);
    applyWindow(windowMin, clamped);
  };

  const handleWindowReset = () => {
    const nv = nvRef.current;
    if (!nv || nv.volumes.length === 0) return;
    const vol = nv.volumes[0];
    const min = (vol as any).robust_min ?? (vol as any).global_min ?? 0;
    const max = (vol as any).robust_max ?? (vol as any).global_max ?? 100;
    setWindowMin(min);
    setWindowMax(max);
    applyWindow(min, max);
  };

  const handleCrosshairToggle = () => {
    const nv = nvRef.current;
    if (!nv) return;
    const newVisible = !crosshairVisible;
    nv.setCrosshairWidth(newVisible ? 0.75 : 0);
    setCrosshairVisible(newVisible);
  };

  const handleScreenshot = () => {
    const nv = nvRef.current;
    if (!nv) return;
    const volName = nv.volumes[0]?.name?.replace(/\.(nii|nii\.gz)$/i, '') || 'dicom';
    nv.saveScene(`${volName}_screenshot.png`);
  };

  const handleDownloadNifti = () => {
    const nv = nvRef.current;
    if (!nv || nv.volumes.length === 0) return;
    // NiiVue has saveImage for downloading as NIfTI
    const vol = nv.volumes[0];
    const baseName = (vol.name || 'volume').replace(/\.(nii|nii\.gz)$/i, '');
    nv.saveImage({ filename: `${baseName}.nii`, isSaveDrawing: false, volumeByIndex: 0 });
  };

  if (!isOpen) return null;

  const showToolbar = !isLoading && !error;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-surface-primary rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border flex-shrink-0">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-content-primary">DICOM Viewer</h3>
            <p className="text-sm text-content-secondary truncate">{acquisitionName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-content-tertiary hover:text-content-primary hover:bg-surface-secondary rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Toolbar */}
        {showToolbar && (
          <div className="border-b border-border flex-shrink-0 bg-surface-secondary">
            {/* Row 1: Volume selector (only when multiple volumes) */}
            {volumes.length > 1 && (
              <div className="px-4 py-1.5 flex items-center gap-1.5 border-b border-border-secondary">
                <label className="text-xs text-content-secondary">Volume:</label>
                <select
                  value={selectedVolumeIndex}
                  onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
                  className="text-xs border border-border-secondary rounded px-1.5 py-1 bg-surface-primary text-content-primary"
                >
                  {volumes.map((vol, idx) => (
                    <option key={idx} value={idx}>{vol.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Row 2: View modes, windowing, actions */}
            <div className="px-4 py-1.5 flex items-center gap-3">
              {/* View mode tabs */}
              <div className="flex items-center gap-0.5 bg-surface-primary rounded-md p-0.5 border border-border-secondary">
                {VIEW_MODES.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => handleViewChange(key)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                      activeView === key
                        ? 'bg-brand-600 text-white'
                        : 'text-content-secondary hover:text-content-primary hover:bg-surface-secondary'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Separator */}
              <div className="w-px h-5 bg-border-secondary" />

              {/* Windowing */}
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-content-secondary whitespace-nowrap">Window:</label>
                <input
                  type="number"
                  value={Math.round(windowMin * 100) / 100}
                  onChange={(e) => handleWindowMinChange(parseFloat(e.target.value) || 0)}
                  className="w-20 text-xs border border-border-secondary rounded px-1.5 py-1 bg-surface-primary text-content-primary text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  step="any"
                />
                {/* Dual-range slider */}
                <div className="relative w-28 h-5 flex items-center">
                  {/* Background track */}
                  <div className="absolute w-full h-1 bg-border-secondary rounded pointer-events-none" style={{ zIndex: 1 }} />
                  {/* Selected range bar */}
                  <div
                    className="absolute h-1 rounded pointer-events-none"
                    style={{
                      zIndex: 2,
                      backgroundColor: 'var(--color-brand-500, #3b82f6)',
                      left: `${dataRange.max > dataRange.min ? ((windowMin - dataRange.min) / (dataRange.max - dataRange.min)) * 100 : 0}%`,
                      width: `${dataRange.max > dataRange.min ? ((windowMax - windowMin) / (dataRange.max - dataRange.min)) * 100 : 100}%`,
                    }}
                  />
                  {/* Min slider (higher z-index so left thumb is always grabbable) */}
                  <input
                    type="range"
                    min={dataRange.min}
                    max={dataRange.max}
                    step={(dataRange.max - dataRange.min) / 200}
                    value={windowMin}
                    onChange={(e) => handleWindowMinChange(parseFloat(e.target.value))}
                    className="range-slider range-slider-min"
                    style={{ zIndex: 4 }}
                  />
                  {/* Max slider */}
                  <input
                    type="range"
                    min={dataRange.min}
                    max={dataRange.max}
                    step={(dataRange.max - dataRange.min) / 200}
                    value={windowMax}
                    onChange={(e) => handleWindowMaxChange(parseFloat(e.target.value))}
                    className="range-slider"
                    style={{ zIndex: 3 }}
                  />
                </div>
                <input
                  type="number"
                  value={Math.round(windowMax * 100) / 100}
                  onChange={(e) => handleWindowMaxChange(parseFloat(e.target.value) || 0)}
                  className="w-20 text-xs border border-border-secondary rounded px-1.5 py-1 bg-surface-primary text-content-primary text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  step="any"
                />
                <button
                  onClick={handleWindowReset}
                  className="p-1 text-content-tertiary hover:text-content-primary rounded transition-colors"
                  title="Reset window to auto"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Separator */}
              <div className="w-px h-5 bg-border-secondary" />

              {/* Right-side actions */}
              <div className="flex items-center gap-1 ml-auto">
                {/* Crosshair toggle */}
                <label className="flex items-center gap-1 text-xs text-content-secondary cursor-pointer select-none mr-1">
                  <input
                    type="checkbox"
                    checked={crosshairVisible}
                    onChange={handleCrosshairToggle}
                    className="rounded border-border-secondary text-brand-600 focus:ring-brand-500 h-3.5 w-3.5"
                  />
                  Crosshair
                </label>

                {/* Screenshot */}
                <button
                  onClick={handleScreenshot}
                  className="p-1.5 text-content-tertiary hover:text-content-primary hover:bg-surface-primary rounded transition-colors"
                  title="Save screenshot as PNG"
                >
                  <Camera className="h-4 w-4" />
                </button>

                {/* Download NIfTI */}
                <button
                  onClick={handleDownloadNifti}
                  className="p-1.5 text-content-tertiary hover:text-content-primary hover:bg-surface-primary rounded transition-colors"
                  title="Download as NIfTI"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Canvas area */}
        <div
          ref={containerRef}
          className="flex-1 min-h-0 relative"
          style={{ height: '70vh', background: '#000' }}
        >
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-brand-500" />
                <p className="text-white text-sm">{loadingMessage}</p>
              </div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-center max-w-md px-4">
                <AlertTriangle className="h-8 w-8 mx-auto mb-3 text-amber-400" />
                <p className="text-white text-sm">{error}</p>
              </div>
            </div>
          )}
          <canvas
            ref={canvasRef}
            style={{
              width: '100%',
              height: '100%',
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default DicomViewerModal;
