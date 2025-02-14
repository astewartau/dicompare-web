import React, { useState } from 'react';
import {
  Box,
  Heading,
  Text,
  Input,
  Button,
  VStack,
  IconButton,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Spinner,
} from '@chakra-ui/react';
import { CloseIcon } from '@chakra-ui/icons';

interface UploadFilesProps {
  pyodide: any;                // The Pyodide instance from parent
  onNext: () => void;          // Callback when user wants to go to the next step
}

const UploadFiles: React.FC<UploadFilesProps> = ({ pyodide, onNext }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Handle file selection
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) return;
    const uploadedFiles = Array.from(event.target.files);
    setFiles((prevFiles) => [...prevFiles, ...uploadedFiles]);
  };

  // Remove a file from the list
  const handleFileRemove = (index: number) => {
    setFiles((prevFiles) => prevFiles.filter((_, i) => i !== index));
  };

  // When user clicks "Next": load DICOMs, create a global in_session variable in Python
  const handleNextClick = async () => {
    if (!pyodide) {
      console.error('Pyodide is not ready or not provided.');
      return;
    }
    if (files.length === 0) return;

    setIsLoading(true);

    try {
      //
      // 1) Build a dictionary of { relativePath: Uint8Array } for DICOM files
      //
      const dicomFiles: Record<string, Uint8Array> = {};
      for (const file of files) {
        // If you only want part of each file, you can slice the file. Otherwise read all:
        const arrayBuf = await file.arrayBuffer();
        const typedArray = new Uint8Array(arrayBuf);
        // If you want folder paths, use `file.webkitRelativePath`, else just use file.name
        const key = file.webkitRelativePath || file.name;
        dicomFiles[key] = typedArray;
      }

      // 2) Place dicomFiles in Pyodide's global scope.
      //    Then run Python code that uses load_dicom_session(dicom_bytes=dicom_files).
      pyodide.globals.set('dicom_files', dicomFiles);

      const code = `
from dicompare.io import load_dicom_session

# Create a global variable in Python called "in_session"
global in_session

in_session = load_dicom_session(
    dicom_bytes=dicom_files,    # dict of {filename: bytes}
    acquisition_fields=["ProtocolName"]
)

if in_session is None or in_session.empty:
    raise ValueError("No valid DICOM data loaded, or the session is empty.")
`;

      // 3) Actually run the code in Pyodide to produce the global in_session
      await pyodide.runPythonAsync(code);

      // We don't need to parse or return the session data here, because
      // we've stored it in Python memory (in_session). We'll just proceed:
      onNext();
    } catch (error) {
      console.error('Error loading DICOM session:', error);
      // Optionally show a user-facing error message
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box p={8}>
      <Heading as="h2" size="md" mb={4}>
        Upload DICOM Files
      </Heading>
      <Text fontSize="sm" mb={4}>
        Please upload the DICOM files from the scanning session for compliance checking.
      </Text>

      <Input
        type="file"
        multiple
        webkitdirectory="true"
        directory=""
        mb={4}
        onChange={handleFileUpload}
        isDisabled={isLoading}
      />

      {isLoading && (
        <VStack spacing={4} mb={4}>
          <Spinner size="lg" color="teal.500" />
          <Text>Loading the DICOM session in Python, please wait...</Text>
        </VStack>
      )}

      {!isLoading && files.length > 0 && (
        <Box
          p={4}
          borderWidth="1px"
          borderRadius="md"
          bg="gray.50"
          maxHeight="500px"
          overflowY="auto"
          mb={4}
        >
          <Text fontWeight="bold" mb={4}>
            Uploaded Files:
          </Text>
          <Table variant="simple" size="sm">
            <Thead>
              <Tr>
                <Th>Filename</Th>
                <Th isNumeric>Size (KB)</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {files.map((file, index) => (
                <Tr key={index}>
                  <Td>{file.name}</Td>
                  <Td isNumeric>{(file.size / 1024).toFixed(2)}</Td>
                  <Td>
                    <IconButton
                      aria-label="Remove file"
                      icon={<CloseIcon />}
                      size="sm"
                      colorScheme="red"
                      onClick={() => handleFileRemove(index)}
                    />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      )}

      <VStack spacing={4}>
        <Button
          colorScheme="teal"
          onClick={handleNextClick}
          isDisabled={isLoading || files.length === 0}
        >
          Next
        </Button>
      </VStack>
    </Box>
  );
};

export default UploadFiles;
