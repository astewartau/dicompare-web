import React, { useState } from 'react';
import VerticalStepper from '../../components/Stepper';
import ComplianceResults from './ComplianceResults';
import NavigationBar from '../../components/NavigationBar';
import FinalizeMapping from './FinalizeMapping';
import { Box } from '@chakra-ui/react';

interface CheckComplianceProps {
}

const CheckCompliance: React.FC<CheckComplianceProps> = ({ }) => {
  // Control the Next button across all steps
  const [isNextDisabled, setIsNextDisabled] = useState(false);

  const steps = [
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
