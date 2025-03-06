import React, { useState, useEffect } from 'react';
import {
  Box,
  Heading,
  Text,
  VStack,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  FormHelperText,
} from '@chakra-ui/react';

interface EnterMetadataProps {
  setNextEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setMetadata: (data: { name: string; description: string; authors: string[] }) => void;
}

const EnterMetadata: React.FC<EnterMetadataProps> = ({ setNextEnabled, setMetadata }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [authors, setAuthors] = useState('');

  // Enable "Next" when name is non-empty
  useEffect(() => {
    setNextEnabled(name.trim().length > 0);
  }, [name, setNextEnabled]);

  // Update the parent metadata state when any field changes.
  useEffect(() => {
    setMetadata({
      name,
      description,
      // Split comma-separated authors into an array (trimming extra spaces)
      authors: authors.split(',').map(a => a.trim()).filter(a => a.length > 0),
    });
  }, [name, description, authors, setMetadata]);

  return (
    <Box width="100%">
      <VStack align="start" spacing={6}>
        <Heading size="xl" color="teal.600">
          Enter Metadata
        </Heading>
        <Text fontSize="md" color="gray.700">
          Let’s start by creating a template. Please provide a name, description, and authors for the
          template. This will help identify and describe the purpose of the template.
        </Text>
      </VStack>

      <VStack as="form" spacing={6} marginTop={8}>
        <FormControl id="template-name" isRequired>
          <Text fontSize="3xl" fontWeight="bold">
            Template Name
          </Text>
          <FormHelperText fontSize="lg">
            Provide a name for your template.
          </FormHelperText>
          <Input
            placeholder="Enter template name"
            focusBorderColor="teal.500"
            size="lg"
            variant="filled"
            mt={5}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </FormControl>

        <FormControl id="template-description">
          <Text fontSize="3xl" fontWeight="bold">
            Template Description
          </Text>
          <FormHelperText fontSize="lg">
            Describe the purpose and scope of this template.
          </FormHelperText>
          <Textarea
            placeholder="Enter a short description of the template"
            focusBorderColor="teal.500"
            mt={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormControl>

        <FormControl id="authors">
          <Text fontSize="3xl" fontWeight="bold">
            Authors
          </Text>
          <FormHelperText fontSize="lg">
            Specify the authors (comma-separated).
          </FormHelperText>
          <Input
            placeholder="John Doe, Jane Doe"
            focusBorderColor="teal.500"
            size="lg"
            variant="filled"
            mt={5}
            value={authors}
            onChange={(e) => setAuthors(e.target.value)}
          />
        </FormControl>
      </VStack>
    </Box>
  );
};

export default EnterMetadata;
