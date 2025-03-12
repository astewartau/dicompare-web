import React from "react";
import { Box, Heading, Text, Button } from "@chakra-ui/react";
import { saveAs } from "file-saver";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { materialLight } from "react-syntax-highlighter/dist/esm/styles/prism";

interface ReviewProps {
  templateJson: any;
}

const Review: React.FC<ReviewProps> = ({ templateJson }) => {
  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(templateJson, null, 2)], {
      type: "application/json",
    });
    saveAs(blob, "generatedTemplate.json");
  };

  return (
    <Box p={8}>
      {templateJson ? (
        <>
          <Text fontSize="lg" color="gray.700" mb={4}>
            Displaying the generated template JSON.
            <Button colorScheme="teal" onClick={handleDownload} ml={2}>
              Download
            </Button>
          </Text>
          <Box
            p={0}
            borderWidth="1px"
            borderRadius="md"
            overflow="auto"
            maxWidth="100%"
            maxHeight="800px"
            boxShadow="lg"
          >
            <SyntaxHighlighter language="json" style={materialLight}>
              {JSON.stringify(templateJson, null, 2)}
            </SyntaxHighlighter>
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
