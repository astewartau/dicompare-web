// CheckCompliance.tsx
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
  runPythonCode: (code: string) => Promise<string>;
  pyodide: any;
}

const CheckCompliance: React.FC<CheckComplianceProps> = ({ runPythonCode, pyodide }) => {
  // Store the user’s uploaded DICOM files in state
  const [dicomCount, setDicomCount] = useState<number | null>(null);
  const [dicomFolder, setDicomFolder] = useState<string | null>(null);
  const [nextEnabled, setNextEnabled] = useState(false);
  
  // Store the reference file (JSON or .py) in state
  const [referenceFile, setReferenceFile] = useState<{ name: string; content: string } | null>(null);

  const [option, setOption] = useState<'existing' | 'upload'>('existing');
  const [existingConfig, setExistingConfig] = useState('');

  const steps = [
    {
      title: 'Introduction',
      component: <Introduction 
        setNextEnabled={setNextEnabled}
      />,
    },
    {
      title: 'Upload Files',
      component: (
        <UploadFiles
          pyodide={pyodide}
          dicomCount={dicomCount}
          setDicomCount={setDicomCount}
          dicomFolder={dicomFolder}
          setDicomFolder={setDicomFolder}
          setNextEnabled={setNextEnabled}
        />
      ),
    },
    {
      title: 'Upload or Select Configuration',
      component: (
        <UploadConfiguration
          pyodide={pyodide}
          referenceFile={referenceFile}
          setReferenceFile={setReferenceFile}
          option={option}
          setOption={setOption}
          existingConfig={existingConfig}
          setExistingConfig={setExistingConfig}
          setNextEnabled={setNextEnabled}
        />
      ),
    },
    {
      title: 'Finalize Mapping',
      component: (
        <FinalizeMapping
          runPythonCode={runPythonCode}
          setNextEnabled={setNextEnabled}
        />
      ),
    },
    {
      title: 'Compliance Results',
      component: <ComplianceResults 
        runPythonCode={runPythonCode}
        setNextEnabled={setNextEnabled}
      />,
    },
  ];

  return (
    <>
      <Box position="sticky" top="0" zIndex="100">
        <NavigationBar />
      </Box>
      <VerticalStepper steps={steps} setNextEnabled={setNextEnabled} nextEnabled={nextEnabled} />
    </>
  );
};

export default CheckCompliance;
