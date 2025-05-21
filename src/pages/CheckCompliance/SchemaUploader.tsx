// SchemaUploader.tsx
import React, { useState } from 'react';
import {
  Box,
  Text,
  Button,
  Spinner
} from '@chakra-ui/react';
import { SchemaFile } from './types';

interface SchemaUploaderProps {
  onSchemaLoad: (file: SchemaFile) => void;
  isLoading: boolean;
  loadedFile: SchemaFile | null;
}

const SchemaUploader: React.FC<SchemaUploaderProps> = ({ 
  onSchemaLoad, 
  isLoading, 
  loadedFile 
}) => {
  const [isDragActive, setIsDragActive] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    const content = await file.text();
    onSchemaLoad({ name: file.name, content });
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => { 
    e.preventDefault(); 
    setIsDragActive(true); 
  };
  
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => { 
    e.preventDefault(); 
    setIsDragActive(false); 
  };
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);
    const item = e.dataTransfer.items[0];
    if (item.kind !== 'file') return;
    const file = item.getAsFile();
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const txt = ev.target?.result;
      if (typeof txt === 'string') onSchemaLoad({ name: file.name, content: txt });
    };
    reader.readAsText(file);
  };

  return (
    <Box>
      <Text mb={4} fontWeight="medium" color="teal.600">
        Schema Template
      </Text>
      <Box
        p={4}
        mb={6}
        borderWidth="1px"
        borderRadius="md"
        bg={isDragActive ? 'gray.200' : 'gray.50'}
        textAlign="center"
        onDragEnter={handleDragOver}
        onDragOver={e => e.preventDefault()}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isLoading ? (
          <>
            <Spinner size="lg" color="teal.500" />
            <Text mt={2}>Loading schema…</Text>
          </>
        ) : (
          <>
            <Text mb={2}>Drag & drop .json or .py schema here</Text>
            <input
              type="file"
              accept=".json,.py"
              style={{ display: 'none' }}
              id="schema-upload"
              onChange={handleUpload}
            />
            <Button as="label" htmlFor="schema-upload" colorScheme="teal">
              Upload Schema
            </Button>
            {loadedFile && (
              <Text mt={2} fontSize="sm" color="gray.600">
                Loaded: {loadedFile.name}
              </Text>
            )}
          </>
        )}
      </Box>
    </Box>
  );
};

export default SchemaUploader;
