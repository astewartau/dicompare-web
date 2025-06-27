// DicomUploader.tsx
import React, { useState } from 'react';
import {
  Box,
  Text,
  Button,
  Spinner,
  Progress,
  HStack
} from '@chakra-ui/react';

interface DicomUploaderProps {
  onDicomLoad: (files: File[]) => void;
  onExampleLoad?: () => void;
  isLoading: boolean;
  progress: number;
  fileCount: number;
}

const DicomUploader: React.FC<DicomUploaderProps> = ({ 
  onDicomLoad, 
  onExampleLoad,
  isLoading, 
  progress,
  fileCount
}) => {
  const [isDragActive, setIsDragActive] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    onDicomLoad(files);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);
    const items = e.dataTransfer.items;
    const files: File[] = [];
    
    const traverse = (entry: any, path = ''): Promise<void> =>
      new Promise(resolve => {
        if (entry.isFile) {
          entry.file((f: File) => {
            const newFile = f.webkitRelativePath
              ? f
              : new File([f], f.name, { type: f.type, lastModified: f.lastModified });
            Object.defineProperty(newFile, 'webkitRelativePath', {
              value: path + f.name,
              writable: false
            });
            files.push(newFile);
            resolve();
          });
        } else if (entry.isDirectory) {
          const reader = entry.createReader();
          reader.readEntries((entries: any[]) =>
            Promise.all(entries.map((en: any) => traverse(en, path + entry.name + '/'))).then(() => resolve())
          );
        }
      });

    await Promise.all(
      Array.from({ length: items.length }, (_, i) => {
        const entry = items[i].webkitGetAsEntry();
        return entry ? traverse(entry) : Promise.resolve();
      })
    );

    if (files.length) {
      onDicomLoad(files);
    }
  };

  return (
    <Box>
      <Text mb={4} fontWeight="medium" color="teal.600">
        DICOM Files
      </Text>
      <Box
        p={4}
        mb={6}
        borderWidth="1px"
        borderRadius="md"
        bg={isDragActive ? 'gray.200' : 'gray.50'}
        textAlign="center"
        onDragEnter={e => { e.preventDefault(); setIsDragActive(true); }}
        onDragOver={e => e.preventDefault()}
        onDragLeave={e => { e.preventDefault(); setIsDragActive(false); }}
        onDrop={handleDrop}
      >
        {isLoading ? (
          <>
            <Spinner size="lg" color="teal.500" />
            <Text mt={2}>Processing DICOMs…</Text>
            <Progress mt={2} size="sm" value={progress} />
          </>
        ) : (
          <>
            <Text mb={2}>Drag & drop DICOM folder or files</Text>
            <input
              type="file"
              multiple
              style={{ display: 'none' }}
              id="dicom-upload"
              onChange={handleUpload}
              ref={el => el?.setAttribute('webkitdirectory', 'true')}
            />
            <HStack spacing={4} justify="center">
              <Button as="label" htmlFor="dicom-upload" colorScheme="teal">
                Load DICOMs
              </Button>
              {onExampleLoad && (
                <Button onClick={onExampleLoad} colorScheme="blue" variant="outline">
                  Load example DICOMs
                </Button>
              )}
            </HStack>
            {fileCount > 0 && (
              <Text mt={2} fontSize="sm" color="gray.600">
                {fileCount} files
              </Text>
            )}
          </>
        )}
      </Box>
    </Box>
  );
};

export default DicomUploader;
