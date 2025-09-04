/**
 * Shared utilities for DICOM file uploading across components
 */

export interface FileObject {
  name: string;
  content: Uint8Array;
}

/**
 * Process uploaded files, filtering out directories and non-DICOM files
 */
export async function processUploadedFiles(
  files: FileList,
  onProgress?: (progress: { current: number; total: number; fileName: string }) => void
): Promise<FileObject[]> {
  const filesArray = Array.from(files);
  
  // Filter out directories and empty files - only process actual DICOM files
  const actualFiles = filesArray.filter(file => {
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
 * Check if FileList contains any valid DICOM files (quick check without processing)
 */
export function hasValidDicomFiles(files: FileList): boolean {
  const filesArray = Array.from(files);
  return filesArray.some(file => {
    if (file.size === 0) return false;
    const name = file.name.toLowerCase();
    return !name.endsWith('.txt') && !name.endsWith('.json') && !name.endsWith('.xml') && !name.endsWith('.csv');
  });
}