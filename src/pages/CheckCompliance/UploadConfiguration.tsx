import React, { useState } from 'react';
import {
  Box,
  Heading,
  Text,
  Input,
  Button,
  VStack,
  RadioGroup,
  Radio,
  Select,
} from '@chakra-ui/react';

/**
 * Example built-in configurations. In practice, you might fetch these from a server.
 */
const BUILT_IN_CONFIGS: Record<string, { name: string; content: string }> = {
  qsm: {
    name: 'ref_qsm.py',
    content: `# QSM Python reference code here`,
  },
  abcd: {
    name: 'ref_abcd.py',
    content: `# ABCD Python reference code here`,
  },
  dti: {
    name: 'ref_dti.py',
    content: `# DTI Python reference code here`,
  },
  fmri: {
    name: 'ref_fmri.py',
    content: `# fMRI Python reference code here`,
  },
  mra: {
    name: 'ref_mra.py',
    content: `# MRA Python reference code here`,
  },
};

interface ConfigOption {
  value: string;
  label: string;
  description: string;
}

const configurations: ConfigOption[] = [
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

interface UploadConfigurationProps {
  pyodide: any;
  referenceFile: { name: string; content: string } | null;
  setReferenceFile: React.Dispatch<React.SetStateAction<{ name: string; content: string } | null>>;

  // Radio + existing config states
  option: 'existing' | 'upload';
  setOption: React.Dispatch<React.SetStateAction<'existing' | 'upload'>>;
  existingConfig: string;
  setExistingConfig: React.Dispatch<React.SetStateAction<string>>;

  setNextEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}

const UploadConfiguration: React.FC<UploadConfigurationProps> = ({
  pyodide,
  referenceFile,
  setReferenceFile,
  option,
  setOption,
  existingConfig,
  setExistingConfig,
  setNextEnabled
}) => {
  const selectedConfig = configurations.find((c) => c.value === existingConfig);

  // Handle file upload for new configuration
  const handleUploadFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      const text = await file.text();
      setReferenceFile({ name: file.name, content: text });
    }
  };

  // When Next is clicked, write the configuration file to Pyodide FS,
  // set globals, and run the code that loads the configuration.
  const handleNextClick = async () => {
    if (!pyodide) {
      console.error('Pyodide instance is not ready.');
      return;
    }

    let configName = '';
    let configContent = '';

    if (option === 'existing') {
      if (!existingConfig) {
        console.warn('No existing configuration selected.');
        return;
      }
      const entry = BUILT_IN_CONFIGS[existingConfig];
      if (!entry) {
        console.warn(`No built-in configuration found for ${existingConfig}`);
        return;
      }
      configName = entry.name;
      configContent = entry.content;
    } else {
      if (!referenceFile) {
        console.warn('No file uploaded.');
        return;
      }
      configName = referenceFile.name;
      configContent = referenceFile.content;
    }

    // Write the configuration file to Pyodide FS
    pyodide.FS.writeFile(configName, configContent);

    // Determine if the file is JSON or Python based on its extension
    const isJson = configName.endsWith('.json');

    // Instead of embedding the values in the Python code,
    // set them in Pyodide globals.
    pyodide.globals.set('ref_config_name', configName);
    pyodide.globals.set('is_json', isJson);

    // Now run a Python snippet that uses the globals.
    const code = `
import sys
sys.path.append('.')  # ensure current directory is on the path

global ref_models
global ref_session
global reference_fields

ref_models = None
ref_session = None
reference_fields = None

from dicompare.io import load_json_session, load_python_session

if is_json:
    reference_fields, ref_session = load_json_session(json_ref=ref_config_name)
else:
    ref_models = load_python_session(module_path=ref_config_name)
    if ref_models is not None:
        ref_session = {"acquisitions": {k: {} for k in ref_models.keys()}}
`;
    try {
      await pyodide.runPythonAsync(code);
      setNextEnabled(true);
      console.log(`Configuration "${configName}" loaded into Python globals.`);
    } catch (error) {
      setNextEnabled(false);
      console.error('Error loading configuration:', error);
      return;
    }

  };

  return (
    <Box p={8}>
      <Heading as="h2" size="md" mb={4}>
        Upload or Select Configuration
      </Heading>
      <Text fontSize="sm" mb={4}>
        Choose an existing configuration or upload a new .py/.json configuration file.
      </Text>

      {/* RadioGroup uses parent's option + setOption */}
      <RadioGroup onChange={(val) => setOption(val as 'existing' | 'upload')} value={option} mb={4}>
        <VStack align="start" spacing={2}>
          <Radio value="existing">Use Existing Configuration</Radio>
          <Radio value="upload">Upload New Configuration</Radio>
        </VStack>
      </RadioGroup>

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
          {selectedConfig && (
            <Text fontSize="sm" color="gray.700">
              {selectedConfig.description}
            </Text>
          )}
        </VStack>
      )}

      {option === 'upload' && (
        <>
          <Input type="file" accept=".py,.json" mb={4} onChange={handleUploadFile} />
          {referenceFile && (
            <Text fontSize="sm" color="gray.500">
              Currently selected file: {referenceFile.name}
            </Text>
          )}
        </>
      )}

      <Button colorScheme="teal" onClick={handleNextClick}>
        Next
      </Button>
    </Box>
  );
};

export default UploadConfiguration;
