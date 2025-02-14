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
  const [dicomFiles, setDicomFiles] = useState<File[]>([]);
  // Store the reference file (JSON or .py) in state
  const [referenceFile, setReferenceFile] = useState<{ name: string; content: string } | null>(null);

  const steps = [
    {
      title: 'Introduction',
      component: <Introduction onNext={() => {}} />,
    },
    {
      title: 'Upload Files',
      component: (
        <UploadFiles
          pyodide={pyodide}
          onNext={(selectedFiles: File[]) => {
            setDicomFiles(selectedFiles);
          }}
        />
      ),
    },
    {
      title: 'Upload or Select Configuration',
      component: (
        <UploadConfiguration
          pyodide={pyodide}
          onNext={(reference: { name: string; content: string }) => {
            setReferenceFile(reference);
          }}
        />
      ),
    },
    {
      title: 'Finalize Mapping',
      component: (
        <FinalizeMapping
          runPythonCode={runPythonCode}
          pyodide={pyodide}
          dicomFiles={dicomFiles}
          referenceFile={referenceFile}
          onNext={() => {}}
        />
      ),
    },
    {
      title: 'Compliance Results',
      component: <ComplianceResults onNext={() => {}} />,
    },
  ];

  return (
    <>
      <Box position="sticky" top="0" zIndex="100">
        <NavigationBar />
      </Box>
      <VerticalStepper steps={steps} />
    </>
  );
};

export default CheckCompliance;
