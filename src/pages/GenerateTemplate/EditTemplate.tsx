import React, { useEffect, useState } from 'react';
import { Box, Heading, Text, VStack, Button } from '@chakra-ui/react';
import CollapsibleCard from '../../components/CollapsibleCard';

interface EditTemplateProps {
  pyodide: any;
  setNextEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}

const EditTemplate: React.FC<EditTemplateProps> = ({ pyodide, setNextEnabled }) => {
  const [acquisitionList, setAcquisitionList] = useState<string[]>([]);
  const [validFields, setValidFields] = useState<string[]>([]);

  useEffect(() => {
    const fetchAcquisitions = async () => {
      try {
        // (1) Get acquisitions from Python
        const pyAcqs = await pyodide.runPythonAsync(`
          import json
          json.dumps(session['Acquisition'].unique().tolist())
        `);
        setAcquisitionList(JSON.parse(pyAcqs));

        // (2) Get all valid fields (column names) from session
        const colNames = await pyodide.runPythonAsync(`
          import json
          json.dumps(list(session.columns))
        `);
        setValidFields(JSON.parse(colNames));
      } catch (err) {
        console.error('Error loading acquisitions or fields', err);
      }
    };

    fetchAcquisitions();
  }, [pyodide]);

  const handleDownloadTemplate = () => {
    // Combine data across acquisitions from child components,
    // then generate and download JSON, as in the original code
    // or store in a parent-level state that each CollapsibleCard populates
  };

  return (
    <Box p={8}>
      <Heading size="2xl" color="teal.600" mb={6}>
        Generate Template
      </Heading>
      <Text fontSize="xl" mb={8} color="gray.700">
        Configure protocol validation below.
      </Text>
      <VStack spacing={6} width="100%">
        {acquisitionList.map((acq, idx) => (
          <CollapsibleCard
            key={idx}
            acquisition={acq}
            pyodide={pyodide}
            validFields={validFields}
          />
        ))}
      </VStack>
      <Button mt={8} colorScheme="teal" onClick={handleDownloadTemplate}>
        Save Template
      </Button>
    </Box>
  );
};

export default EditTemplate;
