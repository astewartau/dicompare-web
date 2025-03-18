import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Text,
  VStack,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  FormHelperText,
} from '@chakra-ui/react';
import Tagify from '@yaireo/tagify';
import '@yaireo/tagify/dist/tagify.css';

interface EnterMetadataProps {
  setMetadata: (data: { name: string; description: string; authors: string[] }) => void;
  setIsNextDisabled: React.Dispatch<React.SetStateAction<boolean>>;
}

const EnterMetadata: React.FC<EnterMetadataProps> = ({ setMetadata, setIsNextDisabled }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [authors, setAuthors] = useState<string[]>([]);
  const authorsInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let tagify: Tagify;
    if (authorsInputRef.current) {
      tagify = new Tagify(authorsInputRef.current, {
        delimiters: ",", // use comma as a delimiter to create new tags
      });
      tagify.on('change', () => {
        const tags = tagify.value.map((tag: any) => tag.value);
        setAuthors(tags);
      });
    }
    return () => {
      tagify && tagify.destroy();
    };
  }, []);

  useEffect(() => {
    setMetadata({
      name,
      description,
      authors,
    });
    const isValid = name.trim() !== '' && authors.length > 0;
    setIsNextDisabled(!isValid);
  }, [name, description, authors, setMetadata, setIsNextDisabled]);

  return (
    <Box width="100%">
      <VStack align="start" spacing={6}>
        <Text fontSize="md" color="gray.700">
          Provide a name, description, and authors for the template.
        </Text>
      </VStack>

      <VStack as="form" spacing={6} marginTop={8}>
        <FormControl id="template-name" isRequired>
          <FormLabel fontSize="3xl" fontWeight="bold">
            Template Name
          </FormLabel>
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
          <FormLabel fontSize="3xl" fontWeight="bold">
            Template Description
          </FormLabel>
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

        <FormControl id="authors" isRequired>
          <FormLabel fontSize="3xl" fontWeight="bold">
            Authors
          </FormLabel>
          <FormHelperText fontSize="lg">
            Specify the authors. Use comma to create new tags.
          </FormHelperText>
          <Input
            ref={authorsInputRef}
            placeholder="Enter authors"
            focusBorderColor="teal.500"
            size="lg"
            variant="filled"
            mt={5}
          />
        </FormControl>
      </VStack>
    </Box>
  );
};

export default EnterMetadata;
