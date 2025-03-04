import React, { useEffect, useState, useCallback } from 'react';
import { Box, Heading, Text, Wrap, WrapItem, Button } from '@chakra-ui/react';
import CollapsibleCard from '../../components/CollapsibleCard';

interface EditTemplateProps {
  pyodide: any;
  setNextEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setTemplateJson: React.Dispatch<React.SetStateAction<any>>;
  actionOnNext: React.MutableRefObject<(() => void) | null>;
}

const EditTemplate: React.FC<EditTemplateProps> = ({ pyodide, setNextEnabled, setTemplateJson, actionOnNext }) => {
  const [acquisitionList, setAcquisitionList] = useState<string[]>([]);
  const [validFields, setValidFields] = useState<string[]>([]);
  const [acquisitionData, setAcquisitionData] = useState<Record<string, any>>({});

  useEffect(() => {
    const fetchAcquisitions = async () => {
      try {
        const pyAcqs = await pyodide.runPythonAsync(`
          import json
          json.dumps(session['Acquisition'].unique().tolist())
        `);
        setAcquisitionList(JSON.parse(pyAcqs));

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

  // Memoize the function so its reference stays stable.
  const handleAcquisitionDataChange = useCallback((acqName: string, data: any) => {
    setAcquisitionData(prev => ({ ...prev, [acqName]: data }));
  }, []);

  const handleDownloadTemplate = () => {
    const generatedTemplate = { acquisitions: acquisitionData };
    setTemplateJson(generatedTemplate);
  };

  // Register the function with the parent via the ref.
  useEffect(() => {
    if (actionOnNext) {
      actionOnNext.current = handleDownloadTemplate;
    }
  }, [actionOnNext, handleDownloadTemplate]);

  return (
    <Box p={8}>
      <Heading size="2xl" color="teal.600" mb={6}>
        Generate Template
      </Heading>
      <Text fontSize="xl" mb={8} color="gray.700">
        Configure protocol validation below.
      </Text>
      {/* Use Wrap to display cards side-by-side when possible */}
      <Wrap spacing="6">
        {acquisitionList.map((acq, idx) => (
          <WrapItem key={idx}>
            <CollapsibleCard
              acquisition={acq}
              pyodide={pyodide}
              validFields={validFields}
              onDataChange={handleAcquisitionDataChange}
            />
          </WrapItem>
        ))}
      </Wrap>
    </Box>
  );
};

export default EditTemplate;
