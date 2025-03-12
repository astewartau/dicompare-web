import React, { useState } from 'react';
import VerticalStepper from '../../components/Stepper';
import Introduction from './Introduction';
import UploadFiles from './UploadFiles';
import UploadConfiguration from './UploadConfiguration';
import ComplianceResults from './ComplianceResults';
import NavigationBar from '../../components/NavigationBar';
import FinalizeMapping from './FinalizeMapping';
import { Box } from '@chakra-ui/react';

interface CheckComplianceProps {
}

const CheckCompliance: React.FC<CheckComplianceProps> = ({ }) => {
  // DICOM state
  const [dicomCount, setDicomCount] = useState<number | null>(null);
  const [dicomFolder, setDicomFolder] = useState<string | null>(null);

  // Reference file state (JSON or .py)
  const [referenceFile, setReferenceFile] = useState<{ name: string; content: string } | null>(null);
  const [option, setOption] = useState<'existing' | 'upload'>('existing');
  const [existingConfig, setExistingConfig] = useState('');

  // Control the Next button across all steps
  const [isNextDisabled, setIsNextDisabled] = useState(false);

  const steps = [
    {
      title: 'Introduction',
      component: (
        <Introduction
          // For example, you can leave the introduction always enabling "Next":
          setIsNextDisabled={setIsNextDisabled}
        />
      ),
    },
    {
      title: 'Upload Files',
      component: (
        <UploadFiles
          dicomCount={dicomCount}
          setDicomCount={setDicomCount}
          dicomFolder={dicomFolder}
          setDicomFolder={setDicomFolder}
          setIsNextDisabled={setIsNextDisabled}
        />
      ),
    },
    {
      title: 'Upload or Select Configuration',
      component: (
        <UploadConfiguration
          referenceFile={referenceFile}
          setReferenceFile={setReferenceFile}
          option={option}
          setOption={setOption}
          existingConfig={existingConfig}
          setExistingConfig={setExistingConfig}
        />
      ),
    },
    {
      title: 'Finalize Mapping',
      component: (
        <FinalizeMapping
        />
      ),
    },
    {
      title: 'Compliance Results',
      component: (
        <ComplianceResults
        />
      ),
    },
  ];

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

export default CheckCompliance;
