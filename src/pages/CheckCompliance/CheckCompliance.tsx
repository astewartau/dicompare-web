import React, { useState } from 'react';
import VerticalStepper from '../../components/Stepper';
import NavigationBar from '../../components/NavigationBar';
import FinalizeMapping from './FinalizeMapping';
import { Box } from '@chakra-ui/react';

interface CheckComplianceProps {
}

const CheckCompliance: React.FC<CheckComplianceProps> = ({ }) => {
  // Control the Next button across all steps
  const [isNextEnabled, setIsNextEnabled] = useState(false);

  const steps = [
    {
      title: 'Finalize Mapping',
      component: (
        <FinalizeMapping
          setIsNextEnabled={setIsNextEnabled}
        />
      ),
    }
  ];

  return (
    <>
      <Box position="sticky" top="0" zIndex="100">
        <NavigationBar />
      </Box>
      <VerticalStepper
        steps={steps}
        isNextEnabled={isNextEnabled}
        setIsNextEnabled={setIsNextEnabled}
      />
    </>
  );
};

export default CheckCompliance;
