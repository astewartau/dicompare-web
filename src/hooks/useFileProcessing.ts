import { useState, useCallback } from 'react';
import { Acquisition } from '../types';
import { ProcessingProgress } from '../contexts/WorkspaceContext';
import { dicompareWorkerAPI as dicompareAPI } from '../services/DicompareWorkerAPI';
import { processUploadedFiles } from '../utils/fileUploadUtils';
import { filesToFileList } from '../utils/workspaceHelpers';

export type ProcessingTarget = 'schema' | 'data' | 'addNew' | null;

export interface UseFileProcessingReturn {
  isProcessing: boolean;
  processingTarget: ProcessingTarget;
  processingProgress: ProcessingProgress | null;
  processingError: string | null;
  processFiles: (files: FileList, target: ProcessingTarget) => Promise<Acquisition[]>;
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

  return {
    isProcessing,
    processingTarget,
    processingProgress,
    processingError,
    processFiles,
    clearError,
  };
}
