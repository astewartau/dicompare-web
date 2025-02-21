import React, { useState, useEffect } from 'react';
import { Box, Heading, Text, Button, VStack, Progress, Input, HStack, Checkbox, Spinner } from '@chakra-ui/react';

interface DicomAnalysisProps {
    pyodide: any;
    setNextEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}

const DicomAnalysis: React.FC<DicomAnalysisProps> = ({ 
    pyodide,
    setNextEnabled
}) => {
    const [files, setFiles] = useState<File[]>([]);
    const [fileCount, setFileCount] = useState(0);
    const [processing, setProcessing] = useState(false);
    const [sessions, setSessions] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [processingComplete, setProcessingComplete] = useState(false);

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files) return;
        const uploadedFiles = Array.from(event.target.files);
        setFiles(uploadedFiles);
        setFileCount(uploadedFiles.length);
        setProcessingComplete(false);
    };

    const analyzeDICOMs = async () => {
        if (!pyodide || files.length === 0) return;
        setIsLoading(true);
        setProcessing(true);
        setSessions([]);

        try {
            const dicomFiles: Record<string, Uint8Array> = {};
            for (const file of files) {
                const arrayBuf = await file.slice(0, 8192).arrayBuffer();
                const typedArray = new Uint8Array(arrayBuf);
                dicomFiles[file.webkitRelativePath || file.name] = typedArray;
            }

            pyodide.globals.set('dicom_files', dicomFiles);
            
            const code = `
import json
from dicompare.io import load_dicom_session, assign_acquisition_and_run_numbers

global session
session = load_dicom_session(dicom_bytes=dicom_files.to_py())
session = assign_acquisition_and_run_numbers(session)
if session is None or session.empty:
    raise ValueError("No valid DICOM data loaded, or the session is empty.")

acquisition_list = [
    {
        'Acquisition': str(acquisition),
        'ProtocolName': str(acquisition_data['ProtocolName'].unique()[0]),
        'SeriesDescription': str(acquisition_data['SeriesDescription'].unique()),
        'TotalFiles': f"{len(acquisition_data)} files"
    } 
    for acquisition in session['Acquisition'].unique()
    for acquisition_data in [session[session['Acquisition'] == acquisition]]
]
json.dumps(acquisition_list)
`;
            
            const result = await pyodide.runPythonAsync(code);
            const acquisitionList = JSON.parse(result);
            
            setSessions(acquisitionList);
            setProcessingComplete(true);
            setNextEnabled(true);
        } catch (error) {
            console.error('Error processing DICOMs:', error);
        } finally {
            setProcessing(false);
            setIsLoading(false);
        }
    };

    return (
        <Box p={6} maxW="container.md" mx="auto">
            <Heading as="h1" size="xl" color="teal.600" mb={4}>DICOM Analysis</Heading>
            <Text fontSize="lg" mb={6} color="gray.700">Analyze your DICOM files locally with privacy-first processing.</Text>
            
            {!processingComplete ? (
                <>
                    <Heading as="h2" size="md" mb={2} color="teal.500">Choose Session DICOMs</Heading>
                    <VStack spacing={4} align="start">
                        <HStack>
                            <Input type="file" multiple webkitdirectory="true" display="none" id="file-upload" onChange={handleFileUpload} />
                            <Button as="label" htmlFor="file-upload" colorScheme="teal">Browse</Button>
                            <Text fontSize="sm" color="gray.600">{fileCount > 0 ? `${fileCount} DICOM files selected` : 'No files selected'}</Text>
                        </HStack>
                        <Button colorScheme="blue" onClick={analyzeDICOMs} isDisabled={isLoading || files.length === 0}>Analyze</Button>
                        {isLoading && (
                            <VStack spacing={4} mb={4}>
                                <Spinner size="lg" color="teal.500" />
                                <Text>Loading DICOM session in Python, please wait...</Text>
                            </VStack>
                        )}
                    </VStack>
                </>
            ) : (
                <>
                    <Heading as="h2" size="md" mb={2} color="teal.500">Sessions Found</Heading>
                    <Text fontSize="sm" color="gray.600" mb={4}>Below are the sessions found in the uploaded DICOM files.</Text>
                    <VStack align="stretch" spacing={4}>
                        {sessions.map((session, index) => (
                            <Box key={index} p={4} borderWidth="1px" borderRadius="md" bg="gray.50" boxShadow="sm">
                                <HStack>
                                    <Checkbox colorScheme="teal" size="lg" />
                                    <Text fontSize="md" fontWeight="bold">{session.Acquisition}</Text>
                                </HStack>
                                <VStack align="start" mt={2} pl={6}>
                                    <Text fontSize="sm"><b>Protocol Name:</b> {session.ProtocolName}</Text>
                                    <Text fontSize="sm"><b>Series Description:</b> {session.SeriesDescription}</Text>
                                    <Text fontSize="sm"><b>Total Files:</b> {session.TotalFiles}</Text>
                                </VStack>
                            </Box>
                        ))}
                    </VStack>
                </>
            )}
        </Box>
    );
};

export default DicomAnalysis;
