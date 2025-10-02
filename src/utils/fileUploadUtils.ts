/**
 * Shared utilities for DICOM file uploading across components
 */

import JSZip from 'jszip';

export interface FileObject {
  name: string;
  content: Uint8Array;
}

/**
 * Extract files from a zip archive
 */
async function extractZipFile(zipFile: File): Promise<File[]> {
  console.log(`Extracting zip file: ${zipFile.name}`);
  const zip = new JSZip();

  try {
    const zipContent = await zipFile.arrayBuffer();
    const loadedZip = await zip.loadAsync(zipContent);

    const extractedFiles: File[] = [];

    for (const [path, zipEntry] of Object.entries(loadedZip.files)) {
      // Skip directories
      if (zipEntry.dir) {
        continue;
      }

      // Get the file content as a Blob
      const blob = await zipEntry.async('blob');

      // Extract just the filename from the path
      const fileName = path.split('/').pop() || path;

      // Create a File object from the blob
      const file = new File([blob], fileName, { type: 'application/dicom' });
      extractedFiles.push(file);

      console.log(`Extracted: ${fileName} (${file.size} bytes)`);
    }

    console.log(`Extracted ${extractedFiles.length} files from ${zipFile.name}`);
    return extractedFiles;
  } catch (error) {
    console.error(`Failed to extract zip file ${zipFile.name}:`, error);
    throw new Error(`Failed to extract zip file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Process uploaded files, filtering out directories and non-DICOM files
 * Also extracts .zip files and processes their contents
 */
export async function processUploadedFiles(
  files: FileList,
  onProgress?: (progress: { current: number; total: number; fileName: string }) => void
): Promise<FileObject[]> {
  const filesArray = Array.from(files);

  // First, extract any zip files
  const extractedFiles: File[] = [];
  const nonZipFiles: File[] = [];

  for (const file of filesArray) {
    if (file.name.toLowerCase().endsWith('.zip')) {
      try {
        const extracted = await extractZipFile(file);
        extractedFiles.push(...extracted);
      } catch (error) {
        console.error(`Failed to extract ${file.name}:`, error);
        // Continue processing other files even if one zip fails
      }
    } else {
      nonZipFiles.push(file);
    }
  }

  // Combine extracted files with non-zip files
  const allFiles = [...nonZipFiles, ...extractedFiles];

  // Filter out directories and empty files - only process actual DICOM files
  const actualFiles = allFiles.filter(file => {
    // Skip directories (they have size 0 and specific type indicators)
    if (file.size === 0) {
      console.log(`Skipping directory or empty file: ${file.name}`);
      return false;
    }
    // Skip known non-DICOM files
    const name = file.name.toLowerCase();
    if (name.endsWith('.txt') || name.endsWith('.json') || name.endsWith('.xml') || name.endsWith('.csv')) {
      console.log(`Skipping non-DICOM file: ${file.name}`);
      return false;
    }
    return true;
  });

  if (actualFiles.length === 0) {
    throw new Error('No valid DICOM files found in the uploaded content.');
  }

  console.log(`Processing ${actualFiles.length} files out of ${filesArray.length} total items`);
  console.log('File details:', actualFiles.map(f => ({ name: f.name, size: f.size, type: f.type })));

  const fileObjects: FileObject[] = [];

  for (let i = 0; i < actualFiles.length; i++) {
    const file = actualFiles[i];
    try {
      onProgress?.({ current: i + 1, total: actualFiles.length, fileName: file.name });

      const content = await file.arrayBuffer();
      fileObjects.push({
        name: file.name,
        content: new Uint8Array(content)
      });
    } catch (error) {
      console.error(`Failed to read file ${file.name}:`, error);
      throw new Error(`Failed to read file ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return fileObjects;
}

/**
 * Check if FileList contains any valid DICOM files or zip files (quick check without processing)
 */
export function hasValidDicomFiles(files: FileList): boolean {
  const filesArray = Array.from(files);
  return filesArray.some(file => {
    if (file.size === 0) return false;
    const name = file.name.toLowerCase();
    // Allow .zip files as they may contain DICOM files
    if (name.endsWith('.zip')) return true;
    // Skip known non-DICOM files
    return !name.endsWith('.txt') && !name.endsWith('.json') && !name.endsWith('.xml') && !name.endsWith('.csv');
  });
}