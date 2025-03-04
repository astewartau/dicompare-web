import React from 'react';
import { Box, Heading, Text, Button, Code } from '@chakra-ui/react';
import { saveAs } from 'file-saver';

interface ReviewProps {
  templateJson: any;
}

const Review: React.FC<ReviewProps> = ({ templateJson }) => {
  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(templateJson, null, 2)], {
      type: 'application/json',
    });
    saveAs(blob, 'generatedTemplate.json');
  };

  return (
    <Box p={8}>
      <Heading as="h1" size="xl" color="teal.600" mb={6}>
        Review Template
      </Heading>
      {templateJson ? (
        <>
          <Text fontSize="lg" color="gray.700" mb={4}>
            Displaying the generated template JSON.
            <Button colorScheme="teal" onClick={handleDownload} ml={2}>
              Download
            </Button>
          </Text>
          <Box
            p={4}
            borderWidth="1px"
            borderRadius="md"
            bg="black"
            overflow="auto"
            maxWidth="100%"
            maxHeight="800px"
            boxShadow="lg"
          >
            <Code
              as="pre"
              fontSize="md"
              color="green.300"
              bg="transparent"
              whiteSpace="pre-wrap"
              wordBreak="break-word"
            >
              {JSON.stringify(templateJson, null, 2)}
            </Code>
          </Box>
        </>
      ) : (
        <Text fontSize="lg" color="gray.700">
          No template generated yet.
        </Text>
      )}
    </Box>
  );
};

export default Review;
