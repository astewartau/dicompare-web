import React, { useEffect, useState } from 'react';
import {
  Box,
  Heading,
  Text,
  Input,
  Button,
  VStack,
  Spinner,
} from '@chakra-ui/react';

interface UploadFilesProps {
  pyodide: any;
  dicomCount: number | null;
  setDicomCount: React.Dispatch<React.SetStateAction<number | null>>;
  dicomFolder: string | null;
  setDicomFolder: React.Dispatch<React.SetStateAction<string | null>>;
  setNextEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}

const UploadFiles: React.FC<UploadFilesProps> = ({
  pyodide,
  dicomCount,
  setDicomCount,
  dicomFolder,
  setDicomFolder,
  setNextEnabled
}) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isValid, setIsValid] = useState(false);

  // UseEffect to disable the Next button when the component mounts
  useEffect(() => {
    // does pyodide exist?
    if (!pyodide) {
      setNextEnabled(false);
    } else if (dicomCount === null || dicomCount === 0) {
      setNextEnabled(false);
    } else {
      setNextEnabled(true);
    }

  } , [setNextEnabled]);

  // Handle file selection
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) return;
    const uploadedFiles = Array.from(event.target.files);

    // Determine the root folder (from webkitRelativePath if possible)
    let rootFolder = null;
    if (uploadedFiles.length > 0 && uploadedFiles[0].webkitRelativePath) {
      rootFolder = uploadedFiles[0].webkitRelativePath.split('/')[0];
    }

    setFiles(uploadedFiles);
    setDicomCount(uploadedFiles.length);
    setDicomFolder(rootFolder);
  };

  // Analyze: Load DICOMs into Pyodide
  const analyzeClick = async () => {
    if (!pyodide) {
      console.error('Pyodide is not ready.');
      return;
    }
    if (files.length === 0) return;

    setIsLoading(true);

    try {
      // Build a dictionary of { relativePath: Uint8Array } for DICOM files
      const dicomFiles: Record<string, Uint8Array> = {};
      console.log('Reading DICOM headers (first 8 KB)...');

      for (const file of files) {
        const arrayBuf = await file.slice(0, 8192).arrayBuffer(); // Read only the first 8 KB
        const typedArray = new Uint8Array(arrayBuf);
        const key = file.webkitRelativePath || file.name;
        dicomFiles[key] = typedArray;
      }

      console.log('Finished reading DICOMs');

      // Place dicomFiles in Pyodide's global scope
      pyodide.globals.set('dicom_files', dicomFiles);
      console.log('DICOMs loaded into Pyodide globals');

      const code = `
import json
from dicompare.io import load_dicom_session, assign_acquisition_and_run_numbers

global in_session

print("PYTHON: Converting DICOMs to Python dict...")
dicom_bytes = dicom_files.to_py()

print("PYTHON: Loading DICOM session using dicompare...")
in_session = load_dicom_session(
    dicom_bytes=dicom_bytes
)

print("PYTHON: DICOM session loaded successfully.")
if in_session is None or in_session.empty:
    raise ValueError("No valid DICOM data loaded, or the session is empty.")

print("PYTHON: Assigning acquisition and run numbers...")
in_session = assign_acquisition_and_run_numbers(in_session)

json.dumps({
    "result": True,
})
`;
      // Run the code in Pyodide to produce in_session
      console.log('Running Python code...');
      const result = await pyodide.runPythonAsync(code); 
      const parsed = JSON.parse(result);

      if (!parsed.result) {
        throw new Error('No valid DICOM data loaded, or the session is empty.');
      } else {
        setIsValid(true);
        setIsLoading(false);
        setNextEnabled(true);
      }
    } catch (error) {
      console.error('Error loading DICOM session:', error);
      setIsLoading(false);
      setIsValid(false);
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

      {dicomCount !== null && (
        <Text fontSize="sm" color="gray.500" mt={1} mb={4}>
          {dicomCount} DICOMs selected {dicomFolder ? `(Root: ${dicomFolder})` : ''}
        </Text>
      )}

      {isLoading && (
        <VStack spacing={4} mb={4}>
          <Spinner size="lg" color="teal.500" />
          <Text>Loading the DICOM session in Python, please wait...</Text>
        </VStack>
      )}

      <VStack spacing={4}>
        <Button
          colorScheme="blue"
          onClick={analyzeClick}
          isDisabled={isLoading || files.length === 0}
        >
          Analyze
        </Button>
      </VStack>
    </Box>
  );
};

export default UploadFiles;
