import React, { useState, useEffect, useRef } from 'react';
import VerticalStepper from '../../components/Stepper';
import EnterMetadata from './EnterMetadata';
import NavigationBar from '../../components/NavigationBar';
import { Box } from '@chakra-ui/react';
import EditTemplate from './EditTemplate';
import Review from './Review';

interface GenerateTemplateProps {
  runPythonCode: (code: string) => Promise<string>;
  pyodide: any;
}

const GenerateTemplate: React.FC<GenerateTemplateProps> = ({ runPythonCode, pyodide }) => {
  // State for acquisitions data from the EditTemplate step
  const [acquisitionsData, setAcquisitionsData] = useState<any>(null);
  // State for metadata from the EnterMetadata step
  const [metadata, setMetadata] = useState<{ name: string; description: string; authors: string[] } | null>(null);
  // Final JSON that Review will display
  const [templateJson, setTemplateJson] = useState<any>(null);
  const [nextEnabled, setNextEnabled] = useState(false);
  const actionOnNext = useRef<(() => void) | null>(null);

  // Steps in the stepper. Note we pass callbacks to update acquisitionsData and metadata.
  const steps = [
    {
      title: 'Build schema',
      component: (
        <EditTemplate
          pyodide={pyodide}
          setNextEnabled={setNextEnabled}
          setAcquisitionsData={setAcquisitionsData}
          actionOnNext={actionOnNext}
        />
      ),
    },
    {
      title: 'Enter metadata',
      component: (
        <EnterMetadata setNextEnabled={setNextEnabled} setMetadata={setMetadata} />
      ),
    },
    { title: 'Download schema', component: <Review templateJson={templateJson} /> },
  ];

  // When both acquisitionsData and metadata are available, combine them into final JSON.
  useEffect(() => {
    if (acquisitionsData && metadata) {
      const finalJson = {
        name: metadata.name,
        description: metadata.description,
        authors: metadata.authors,
        acquisitions: acquisitionsData,
      };
      setTemplateJson(finalJson);
    }
  }, [acquisitionsData, metadata]);

  return (
    <>
      <Box position="sticky" top="0" zIndex="100">
        <NavigationBar />
      </Box>
      <VerticalStepper
        steps={steps}
        setNextEnabled={setNextEnabled}
        nextEnabled={nextEnabled}
        actionOnNext={actionOnNext}
      />
    </>
  );
};

export default GenerateTemplate;
