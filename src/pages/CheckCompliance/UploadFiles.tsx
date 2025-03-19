import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, Button, Icon, Spinner, VStack, Progress } from '@chakra-ui/react';
import { FiUpload } from 'react-icons/fi';
import { usePyodide } from '../../components/PyodideContext';

interface UploadFilesProps {
  dicomCount: number | null;
  setDicomCount: React.Dispatch<React.SetStateAction<number | null>>;
  dicomFolder: string | null;
  setDicomFolder: React.Dispatch<React.SetStateAction<string | null>>;
  setIsNextEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  isActive?: boolean;
}

const UploadFiles: React.FC<UploadFilesProps> = ({
  dicomCount,
  setDicomCount,
  dicomFolder,
  setDicomFolder,
  setIsNextEnabled,
  isActive,
}) => {
  const { runPythonCode, setPythonGlobal } = usePyodide();
  const [progress, setProgress] = useState<number>(0);
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const hasAnalyzedRef = useRef(false);

  useEffect(() => {
    if (!isActive) return;
    setIsNextEnabled(isValid);
  }, [isActive, isValid, setIsNextEnabled]);

  useEffect(() => {
    if (files.length > 0 && !isUploading && !hasAnalyzedRef.current) {
      hasAnalyzedRef.current = true;
      analyzeFiles();
    }
  }, [files]);

  // Log progress whenever it updates (this will show the latest value)
  useEffect(() => {
    console.log("Progress state updated to", progress);
  }, [progress]);

  // Wrap the update function in useCallback to avoid stale closures.
  const updateProgress = useCallback((p: number) => {
    console.log("Updating progress to", p);
    setProgress(p);
  }, []);

  const analyzeFiles = async () => {
    if (files.length === 0) return;
    setIsUploading(true);
    setIsValid(false);

    // Build a dictionary of DICOM files
    const dicomFiles: Record<string, Uint8Array> = {};
    for (const file of files) {
      const arrayBuf = await file.slice(0, 8192).arrayBuffer();
      const typedArray = new Uint8Array(arrayBuf);
      const key = file.webkitRelativePath || file.name;
      dicomFiles[key] = typedArray;
    }

    // Set globals in Pyodide: dicom_files and update_progress
    await setPythonGlobal("dicom_files", dicomFiles);
    await setPythonGlobal("update_progress", updateProgress);

    // The Python snippet now wraps the synchronous load_dicom_session with asyncio.to_thread.
    const code = `
import sys, json, asyncio
from dicompare import load_dicom_session, assign_acquisition_and_run_numbers

print("Converting DICOMs to Python dict...", flush=True)
dicom_bytes = dicom_files.to_py()

print("Loading DICOM session using dicompare...", flush=True)
in_session = await load_dicom_session(dicom_bytes=dicom_bytes, progress_function=update_progress)

if in_session is None or in_session.empty:
    raise ValueError("No valid DICOM data loaded, or the session is empty.")

print("Assigning acquisition and run numbers...", flush=True)
in_session = assign_acquisition_and_run_numbers(in_session)

json.dumps({"result": True})
`.trim();

    console.log("Python code to execute:", code);
    try {
      const result = await runPythonCode(code);
      console.log("Raw result:", result);
      const parsed = JSON.parse(result);
      if (!parsed.result) {
        throw new Error('No valid DICOM data loaded, or the session is empty.');
      }
      setIsValid(true);
    } catch (error) {
      console.error('Error loading DICOM session:', error);
      setIsValid(false);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) return;
    const uploadedFiles = Array.from(event.target.files);
    let rootFolder: string | null = null;
    if (uploadedFiles.length > 0 && uploadedFiles[0].webkitRelativePath) {
      rootFolder = uploadedFiles[0].webkitRelativePath.split('/')[0];
    }
    setFiles(uploadedFiles);
    setDicomCount(uploadedFiles.length);
    setDicomFolder(rootFolder);
    hasAnalyzedRef.current = false;
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!isDragActive) setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (isDragActive) setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);
    const dtItems = e.dataTransfer.items;
    const droppedFiles: File[] = [];

    const traverseFileTree = (item: any, path: string): Promise<void> => {
      return new Promise((resolve) => {
        if (item.isFile) {
          item.file((file: File) => {
            let newFile: File;
            if (!file.webkitRelativePath) {
              newFile = new File([file], file.name, { type: file.type, lastModified: file.lastModified });
              Object.defineProperty(newFile, 'webkitRelativePath', {
                value: path + file.name,
                writable: false,
                enumerable: true,
                configurable: true,
              });
            } else {
              newFile = file;
            }
            droppedFiles.push(newFile);
            resolve();
          });
        } else if (item.isDirectory) {
          const dirReader = item.createReader();
          dirReader.readEntries((entries: any) => {
            Promise.all(
              entries.map((entry: any) => traverseFileTree(entry, path + item.name + '/'))
            ).then(() => resolve());
          });
        }
      });
    };

    const promises: Promise<void>[] = [];
    for (let i = 0; i < dtItems.length; i++) {
      const entry = dtItems[i].webkitGetAsEntry();
      if (entry) promises.push(traverseFileTree(entry, ''));
    }
    Promise.all(promises).then(() => {
      if (droppedFiles.length > 0) {
        const dataTransfer = new DataTransfer();
        droppedFiles.forEach((file) => dataTransfer.items.add(file));
        const fakeEvent = { target: { files: dataTransfer.files } } as React.ChangeEvent<HTMLInputElement>;
        handleFileUpload(fakeEvent);
      }
    });
  };

  return (
    <Box width="100%">
      <Text mb={4} color="gray.700">
        Drag & drop your DICOM files below, or click to select them. The files will be analyzed automatically.
      </Text>
      <Box
        mb={6}
        p={4}
        borderWidth="1px"
        borderRadius="md"
        bg={isDragActive ? 'gray.200' : 'gray.50'}
        textAlign="center"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isUploading ? (
          <VStack spacing={4}>
            <Spinner size="lg" />
            <Text>Analyzing {dicomCount} DICOMs, please wait... {progress}%</Text>
            <Progress value={progress} size="sm" width="100%" />
          </VStack>
        ) : (
          <>
            <Text mb={2}>Drag & drop your DICOM files here</Text>
            <input
              type="file"
              multiple
              style={{ display: 'none' }}
              id="dicom-upload"
              onChange={handleFileUpload}
              ref={(input) => input && input.setAttribute('webkitdirectory', 'true')}
            />
            <Button as="label" htmlFor="dicom-upload" colorScheme="teal" leftIcon={<Icon as={FiUpload} />}>
              Select DICOMs
            </Button>
          </>
        )}
      </Box>
      {dicomCount !== null && dicomCount > 0 && (
        <Text fontSize="sm" color="gray.600" mb={4}>
          {dicomCount} DICOM(s) selected {dicomFolder ? `(Root: ${dicomFolder})` : ''}
        </Text>
      )}
      {isValid && (
        <Text fontSize="sm" color="green.600">
          DICOM session validated successfully!
        </Text>
      )}
    </Box>
  );
};

export default UploadFiles;
