import React, { useState, useEffect } from 'react';
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
    StepNumber,
    StepSeparator,
    Text,
} from '@chakra-ui/react';
import { CheckIcon } from '@chakra-ui/icons';

interface VerticalStepperProps {
    steps: { title: string; component: React.ReactNode }[];
    isNextEnabled: boolean;
    setIsNextEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}

const VerticalStepper: React.FC<VerticalStepperProps> = ({ steps, isNextEnabled, setIsNextEnabled }) => {
    const [activeStep, setActiveStep] = useState(0);
    // Track which steps have been completed
    const [completedSteps, setCompletedSteps] = useState<boolean[]>(Array(steps.length).fill(false));

    // Handle step navigation with validation
    const handleStepClick = (index: number) => {
        // Always allow going back to previous steps
        if (index < activeStep) {
            setActiveStep(index);
            return;
        }

        // For next steps, only allow if current step is completed
        if (index > activeStep) {
            // If the current step validation is satisfied
            if (isNextEnabled) {
                // Mark the current step as completed
                const newCompletedSteps = [...completedSteps];
                newCompletedSteps[activeStep] = true;
                setCompletedSteps(newCompletedSteps);

                // Navigate to the next step
                setActiveStep(index);
                setIsNextEnabled(false); // Reset validation for the new step
            }
        }
    };

    const handleNext = () => {
        if (activeStep < steps.length - 1) {
            // Mark the current step as completed
            const newCompletedSteps = [...completedSteps];
            newCompletedSteps[activeStep] = true;
            setCompletedSteps(newCompletedSteps);

            // Move to the next step
            setActiveStep((prev) => prev + 1);
            setIsNextEnabled(false);
        }
    };

    const handlePrev = () => {
        if (activeStep > 0) {
            const prevStepIndex = activeStep - 1;
            setActiveStep(prevStepIndex);

            // If the previous step was already completed, don't disable the Next button
            if (completedSteps[prevStepIndex]) {
                setIsNextEnabled(true);
            } else {
                // Otherwise, set according to the current state of that step
                setIsNextEnabled(false);
            }
        }
    };

    // Update completedSteps when validation status changes
    useEffect(() => {
        if (isNextEnabled) {
            const newCompletedSteps = [...completedSteps];
            newCompletedSteps[activeStep] = true;
            setCompletedSteps(newCompletedSteps);
        } else {
            // this and all subsequent steps are no longer completed
            const newCompletedSteps = [...completedSteps];
            for (let i = activeStep; i < newCompletedSteps.length; i++) {
                newCompletedSteps[i] = false;
            }
            setCompletedSteps(newCompletedSteps);
        }
    }, [isNextEnabled, activeStep]);

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
                        <Step
                            key={index}
                            onClick={() => handleStepClick(index)}
                            cursor={index <= activeStep || completedSteps[index - 1] ? 'pointer' : 'not-allowed'}
                            opacity={index <= activeStep || completedSteps[index - 1] ? 1 : 0.6}
                        >
                            <StepIndicator>
                                <StepStatus
                                    complete={<CheckIcon />}
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
                                setIsNextEnabled,
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
                    <Button onClick={handlePrev} isDisabled={activeStep === 0} colorScheme="teal" variant="outline">
                        Prev
                    </Button>
                    <Button
                        onClick={handleNext}
                        isDisabled={!isNextEnabled || activeStep === steps.length - 1}
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
