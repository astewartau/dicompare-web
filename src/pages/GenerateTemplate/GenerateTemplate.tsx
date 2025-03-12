import React, { useState, useEffect } from 'react';
import VerticalStepper from '../../components/Stepper';
import EnterMetadata from './EnterMetadata';
import NavigationBar from '../../components/NavigationBar';
import { Box } from '@chakra-ui/react';
import EditTemplate from './EditTemplate';
import Review from './Review';

interface GenerateTemplateProps { }

const GenerateTemplate: React.FC<GenerateTemplateProps> = ({ }) => {
  const [acquisitionsData, setAcquisitionsData] = useState<any>(null);
  const [metadata, setMetadata] = useState<{ name: string; description: string; authors: string[] } | null>(null);
  const [templateJson, setTemplateJson] = useState<any>(null);
  
  // Track whether the Next button is disabled
  const [isNextDisabled, setIsNextDisabled] = useState(false);

  // Steps in the stepper. Each step can receive setIsNextDisabled.
  const steps = [
    {
      title: 'Build schema',
      component: (
        <EditTemplate
          setAcquisitionsData={setAcquisitionsData}
          setIsNextDisabled={setIsNextDisabled}
        />
      ),
    },
    {
      title: 'Enter metadata',
      component: (
        <EnterMetadata
          setMetadata={setMetadata}
          setIsNextDisabled={setIsNextDisabled}
        />
      ),
    },
    {
      title: 'Download schema',
      component: (
        <Review
          templateJson={templateJson}
          setIsNextDisabled={setIsNextDisabled}
        />
      ),
    },
  ];

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
        isNextDisabled={isNextDisabled}
        setIsNextDisabled={setIsNextDisabled}
      />
    </>
  );
};

export default GenerateTemplate;
