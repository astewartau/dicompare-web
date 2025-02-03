import React, { useState } from 'react';
import { Box, Heading, Text, Input, Button, VStack, RadioGroup, Radio, Select } from '@chakra-ui/react';

const UploadConfiguration = ({ onNext }) => {
    const [option, setOption] = useState('existing');
    const [existingConfig, setExistingConfig] = useState('');

    // Array of configuration options
    const configurations = [
        {
            value: 'qsm',
            label: 'Quantitative Susceptibility Mapping (QSM)',
            description:
                'Quantitative Susceptibility Mapping (QSM) is a technique for mapping magnetic susceptibility variations in tissue.',
        },
        {
            value: 'abcd',
            label: 'Adolescent Brain Cognitive Development (ABCD) Study',
            description:
                'Adolescent Brain Cognitive Development (ABCD) Study focuses on understanding brain development in adolescence.',
        },
        {
            value: 'dti',
            label: 'Diffusion Tensor Imaging (DTI) Analysis',
            description:
                'Diffusion Tensor Imaging (DTI) Analysis is used to visualize and study the diffusion of water molecules in tissue.',
        },
        {
            value: 'fmri',
            label: 'Functional MRI (fMRI) Preprocessing',
            description:
                'Functional MRI (fMRI) Preprocessing involves analyzing brain activity by detecting changes in blood flow.',
        },
        {
            value: 'mra',
            label: 'Magnetic Resonance Angiography (MRA) Pipeline',
            description:
                'Magnetic Resonance Angiography (MRA) Pipeline is used to visualize blood vessels using magnetic resonance imaging.',
        },
    ];

    // Get the description of the selected configuration
    const selectedConfig = configurations.find((config) => config.value === existingConfig);

    return (
        <Box p={8}>
            <Heading as="h2" size="md" mb={4}>
                Upload or Select Configuration
            </Heading>
            <Text fontSize="sm" mb={4}>
                Choose an existing configuration. Alternatively, upload a new configuration file.
            </Text>
            <RadioGroup onChange={setOption} value={option} mb={4}>
                <VStack align="start" spacing={2}>
                    <Radio value="existing">Use Existing Configuration</Radio>
                    <Radio value="upload">Upload New Configuration</Radio>
                </VStack>
            </RadioGroup>

            {/* Existing Configuration Dropdown */}
            {option === 'existing' && (
                <VStack align="start" spacing={4} mb={4}>
                    <Select
                        placeholder="Select a configuration"
                        value={existingConfig}
                        onChange={(e) => setExistingConfig(e.target.value)}
                    >
                        {configurations.map((config) => (
                            <option key={config.value} value={config.value}>
                                {config.label}
                            </option>
                        ))}
                    </Select>

                    {/* Display Description */}
                    {selectedConfig && (
                        <Text fontSize="sm" color="gray.700">
                            {selectedConfig.description}
                        </Text>
                    )}
                </VStack>
            )}

            {/* Upload New Configuration Input */}
            {option === 'upload' && <Input type="file" accept=".py" mb={4} />}
        </Box>
    );
};

export default UploadConfiguration;
