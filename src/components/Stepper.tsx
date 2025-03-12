import React, { useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Button,
  Heading,
  Flex,
  Stepper,
  Step,
  StepIndicator,
  StepStatus,
  StepIcon,
  StepNumber,
  StepSeparator,
  Text,
} from '@chakra-ui/react';

interface VerticalStepperProps {
  steps: { title: string; component: React.ReactNode }[];
  isNextDisabled: boolean;
  setIsNextDisabled: React.Dispatch<React.SetStateAction<boolean>>;
}

const VerticalStepper: React.FC<VerticalStepperProps> = ({
  steps,
  isNextDisabled,
  setIsNextDisabled,
}) => {
  const [activeStep, setActiveStep] = useState(0);

  const handleNext = () => {
    if (activeStep < steps.length - 1) {
      setActiveStep((prev) => prev + 1);
      setIsNextDisabled(true);
    }
  };

  const handlePrev = () => {
    if (activeStep > 0) {
      setActiveStep((prev) => prev - 1);
      setIsNextDisabled(true);
    }
  };

  return (
    <Flex direction="row" bg="gray.50">
      <Box
        width={{ base: '100%', md: '250px' }}
        bg="white"
        p={6}
        boxShadow="md"
        position="sticky"
        top={20}
        bottom={20}
        height="100vh"
        overflowY="auto"
        maxHeight="calc(100vh - 90px)"
      >
        <Stepper index={activeStep} orientation="vertical" size="sm" height="100%">
          {steps.map((step, index) => (
            <Step key={index} onClick={() => setActiveStep(index)} cursor="pointer">
              <StepIndicator>
                <StepStatus
                  complete={<StepIcon />}
                  incomplete={<StepNumber />}
                  active={<StepNumber />}
                />
              </StepIndicator>
              <Box flexShrink={0} maxWidth="180px">
                <Text
                  fontSize="sm"
                  whiteSpace="nowrap"
                  overflow="hidden"
                  textOverflow="ellipsis"
                  title={step.title}
                >
                  {step.title}
                </Text>
              </Box>
              {index < steps.length - 1 && <StepSeparator />}
            </Step>
          ))}
        </Stepper>
      </Box>

      <Flex direction="column" flex="1" justifyContent="space-between">
        <VStack align="start" spacing={6} flex="1" p={6}>
          <Heading size="md" color="teal.500">
            Step {activeStep + 1}: {steps[activeStep]?.title}
          </Heading>
          {steps.map((step, index) => (
            <Box key={index} display={activeStep === index ? 'block' : 'none'} width="100%">
              {React.cloneElement(step.component as React.ReactElement, {
                setIsNextDisabled,
                isActive: activeStep === index,
              })}
            </Box>
          ))}
        </VStack>

        <HStack
          p={4}
          bg="white"
          boxShadow="md"
          justifyContent="space-between"
          position="sticky"
          bottom="0"
          width="100%"
        >
          <Button
            onClick={handlePrev}
            isDisabled={activeStep === 0}
            colorScheme="teal"
            variant="outline"
          >
            Prev
          </Button>
          <Button
            onClick={handleNext}
            isDisabled={isNextDisabled || activeStep === steps.length - 1}
            colorScheme="teal"
          >
            {activeStep === steps.length - 1 ? 'Submit' : 'Next'}
          </Button>
        </HStack>
      </Flex>
    </Flex>
  );
};

export default VerticalStepper;
