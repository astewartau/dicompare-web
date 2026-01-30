import { useState, useCallback } from 'react';
import { Acquisition } from '../types';
import { ProcessingProgress } from '../contexts/WorkspaceContext';
import { dicompareWorkerAPI as dicompareAPI } from '../services/DicompareWorkerAPI';
import { processUploadedFiles, FileObject } from '../utils/fileUploadUtils';
import { filesToFileList } from '../utils/workspaceHelpers';
import { FileHandleManager, ManagedFileHandle } from '../utils/fileHandleManager';
import { readFileHandle } from '../utils/fileSystemAccessUtils';

// Batch config - based on Pyodide's buffer size limits (~2GB safe limit)
const BATCH_SIZE_BYTES = 1 * 1024 * 1024 * 1024; // 1GB per batch - safe margin under Pyodide's ~2GB limit
const NO_BATCH_THRESHOLD_BYTES = BATCH_SIZE_BYTES; // Below 1GB, no batching needed

// Parallel file reading - read multiple files concurrently for speed
const READ_CONCURRENCY = 100; // Read 100 files in parallel

export type ProcessingTarget = 'schema' | 'data' | 'addNew' | null;

export interface UseFileProcessingReturn {
  isProcessing: boolean;
  processingTarget: ProcessingTarget;
  processingProgress: ProcessingProgress | null;
  processingError: string | null;
  processFiles: (files: FileList, target: ProcessingTarget) => Promise<Acquisition[]>;
  processFileHandles: (manager: FileHandleManager, target: ProcessingTarget) => Promise<Acquisition[]>;
  clearError: () => void;
}

/**
 * Detect protocol file type from filename.
 */
export function getProtocolFileType(fileName: string): 'pro' | 'exar1' | 'examcard' | 'lxprotocol' | null {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.pro')) return 'pro';
  if (lowerName.endsWith('.exar1')) return 'exar1';
  if (lowerName.endsWith('.examcard')) return 'examcard';
  if (lowerName === 'lxprotocol') return 'lxprotocol';
  return null;
}

/**
 * Hook for processing DICOM and protocol files with progress tracking.
 * Consolidates duplicate file processing logic from WorkspaceContext.
 */
export function useFileProcessing(): UseFileProcessingReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingTarget, setProcessingTarget] = useState<ProcessingTarget>(null);
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setProcessingError(null);
  }, []);

  /**
   * Process a batch of files (DICOM or protocol) and return acquisitions.
   */
  const processFiles = useCallback(async (
    files: FileList,
    target: ProcessingTarget
  ): Promise<Acquisition[]> => {
    setIsProcessing(true);
    setProcessingTarget(target);
    setProcessingError(null);
    setProcessingProgress({
      currentFile: 0,
      totalFiles: files.length,
      currentOperation: 'Initializing...',
      percentage: 0
    });

    try {
      const fileArray = Array.from(files);
      const protocolFiles = fileArray.filter(f => getProtocolFileType(f.name) !== null);
      const dicomFiles = fileArray.filter(f => getProtocolFileType(f.name) === null);

      const acquisitions: Acquisition[] = [];

      // Process protocol files
      if (protocolFiles.length > 0) {
        setProcessingProgress(prev => ({
          ...prev!,
          currentOperation: 'Processing protocol files...',
          percentage: 10
        }));

        for (const file of protocolFiles) {
          const fileType = getProtocolFileType(file.name)!;
          const fileContent = await file.arrayBuffer();
          const uint8Content = new Uint8Array(fileContent);

          let result: Acquisition[] = [];
          if (fileType === 'pro') {
            const proResult = await dicompareAPI.loadProFile(uint8Content, file.name);
            result = [proResult];
          } else if (fileType === 'exar1') {
            result = await dicompareAPI.loadExarFile(uint8Content, file.name);
          } else if (fileType === 'examcard') {
            result = await dicompareAPI.loadExamCardFile(uint8Content, file.name);
          } else if (fileType === 'lxprotocol') {
            result = await dicompareAPI.loadLxProtocolFile(uint8Content, file.name);
          }

          acquisitions.push(...result);
        }
      }

      // Process DICOM files
      if (dicomFiles.length > 0) {
        const fileObjects = await processUploadedFiles(
          filesToFileList(dicomFiles),
          {
            onProgress: (fileProgress) => {
              setProcessingProgress(prev => ({
                ...prev!,
                currentOperation: `Reading file ${fileProgress.current} of ${fileProgress.total}`,
                percentage: (fileProgress.current / fileProgress.total) * 5
              }));
            }
          }
        );

        const result = await dicompareAPI.analyzeFilesForUI(fileObjects, (progress) => {
          setProcessingProgress({
            currentFile: progress.currentFile,
            totalFiles: progress.totalFiles,
            currentOperation: progress.currentOperation,
            percentage: progress.percentage
          });
        });

        acquisitions.push(...(result || []));
      }

      return acquisitions;
    } catch (error) {
      console.error('Failed to process files:', error);
      setProcessingError(error instanceof Error ? error.message : 'Unknown error occurred');
      return [];
    } finally {
      setIsProcessing(false);
      setProcessingTarget(null);
      setProcessingProgress(null);
    }
  }, []);

  /**
   * Process files using File System Access API handles (for large datasets).
   * Uses smart batching - no batching for small datasets, larger batches for big ones.
   */
  const processFileHandles = useCallback(async (
    manager: FileHandleManager,
    target: ProcessingTarget
  ): Promise<Acquisition[]> => {
    setIsProcessing(true);
    setProcessingTarget(target);
    setProcessingError(null);

    const handles = manager.getDicomHandles();
    const totalFiles = handles.length;
    const totalSize = manager.totalSize;

    // Decide if we need batching (only based on size)
    const needsBatching = totalSize > NO_BATCH_THRESHOLD_BYTES;

    if (!needsBatching) {
      // Small dataset - load all at once
      return processAllFilesAtOnce(handles, totalFiles);
    }

    // Large dataset - use batching
    const batches = createBatches(handles);
    console.log(`[useFileProcessing] Processing ${totalFiles} files (${manager.totalSizeGB.toFixed(2)} GB) in ${batches.length} batches`);

    setProcessingProgress({
      currentFile: 0,
      totalFiles,
      currentOperation: 'Initializing...',
      percentage: 0
    });

    try {
      const allResults: Acquisition[][] = [];
      let processedFiles = 0;

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];

        // Load batch files in parallel
        setProcessingProgress({
          currentFile: processedFiles,
          totalFiles,
          currentOperation: `Loading batch ${batchIndex + 1}/${batches.length}...`,
          percentage: Math.round((processedFiles / totalFiles) * 100)
        });

        const fileObjects = await readFilesParallel(batch);

        // Process batch
        setProcessingProgress({
          currentFile: processedFiles,
          totalFiles,
          currentOperation: `Processing batch ${batchIndex + 1}/${batches.length} (${fileObjects.length} files)...`,
          percentage: Math.round((processedFiles / totalFiles) * 100)
        });

        const batchResult = await dicompareAPI.analyzeBatchForUI(
          fileObjects,
          batchIndex,
          batches.length
        );

        allResults.push(batchResult);
        processedFiles += batch.length;

        console.log(`[useFileProcessing] Batch ${batchIndex + 1}/${batches.length} complete: ${batchResult.length} acquisitions`);
      }

      // Aggregate results
      const aggregated = dicompareAPI.aggregateAcquisitions(allResults);
      console.log(`[useFileProcessing] Done: ${aggregated.length} acquisitions from ${batches.length} batches`);

      return aggregated;
    } catch (error) {
      console.error('Failed to process files:', error);
      setProcessingError(error instanceof Error ? error.message : 'Unknown error occurred');
      return [];
    } finally {
      setIsProcessing(false);
      setProcessingTarget(null);
      setProcessingProgress(null);
    }
  }, []);

  // Helper: read files in parallel with concurrency limit
  const readFilesParallel = async (
    handles: ManagedFileHandle[],
    onProgress?: (loaded: number) => void
  ): Promise<FileObject[]> => {
    const results: FileObject[] = [];
    let loaded = 0;

    // Process in chunks of READ_CONCURRENCY
    for (let i = 0; i < handles.length; i += READ_CONCURRENCY) {
      const chunk = handles.slice(i, i + READ_CONCURRENCY);

      const chunkResults = await Promise.all(
        chunk.map(async (handle) => {
          try {
            const content = await readFileHandle(handle.handle);
            return { name: handle.path, content };
          } catch (error) {
            console.warn(`Failed to read ${handle.path}:`, error);
            return null;
          }
        })
      );

      // Filter out failed reads and add to results
      for (const result of chunkResults) {
        if (result) results.push(result);
      }

      loaded += chunk.length;
      onProgress?.(loaded);
    }

    return results;
  };

  // Helper: process all files at once (for small datasets)
  const processAllFilesAtOnce = async (
    handles: ManagedFileHandle[],
    totalFiles: number
  ): Promise<Acquisition[]> => {
    setProcessingProgress({
      currentFile: 0,
      totalFiles,
      currentOperation: 'Loading files...',
      percentage: 0
    });

    try {
      const fileObjects = await readFilesParallel(handles, (loaded) => {
        setProcessingProgress({
          currentFile: loaded,
          totalFiles,
          currentOperation: `Loading files... (${loaded}/${totalFiles})`,
          percentage: Math.round((loaded / totalFiles) * 20)
        });
      });

      console.log(`[useFileProcessing] Loaded ${fileObjects.length} files, analyzing...`);

      const result = await dicompareAPI.analyzeFilesForUI(fileObjects, (progress) => {
        setProcessingProgress({
          currentFile: progress.currentFile,
          totalFiles: progress.totalFiles,
          currentOperation: progress.currentOperation,
          percentage: 20 + Math.round(progress.percentage * 0.8)
        });
      });

      return result || [];
    } catch (error) {
      console.error('Failed to process files:', error);
      setProcessingError(error instanceof Error ? error.message : 'Unknown error occurred');
      return [];
    } finally {
      setIsProcessing(false);
      setProcessingTarget(null);
      setProcessingProgress(null);
    }
  };

  // Helper: create batches based on size only
  const createBatches = (handles: ManagedFileHandle[]): ManagedFileHandle[][] => {
    const batches: ManagedFileHandle[][] = [];
    let currentBatch: ManagedFileHandle[] = [];
    let currentSize = 0;

    for (const handle of handles) {
      // Start new batch if adding this file would exceed size limit
      if (currentSize + handle.size > BATCH_SIZE_BYTES && currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
        currentSize = 0;
      }

      currentBatch.push(handle);
      currentSize += handle.size;
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  };

  return {
    isProcessing,
    processingTarget,
    processingProgress,
    processingError,
    processFiles,
    processFileHandles,
    clearError,
  };
}
