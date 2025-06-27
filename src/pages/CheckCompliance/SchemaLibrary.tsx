// SchemaLibrary.tsx
import React, { useState } from 'react';
import {
  Box,
  Text,
  Button,
  Flex,
  Grid,
  Badge,
  IconButton,
  useToast,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon
} from '@chakra-ui/react';
import { DeleteIcon, AddIcon } from '@chakra-ui/icons';
import { SchemaFile } from './types';
import AcquisitionSelector from './AcquisitionSelector';

interface SchemaLibraryProps {
  schemas: SchemaFile[];
  onSelectSchema: (schema: SchemaFile, acquisitionName?: string) => void;
  onAddSchema: (schema: SchemaFile) => void;
  onDeleteSchema: (schemaName: string) => void;
}

const SchemaLibrary: React.FC<SchemaLibraryProps> = ({
  schemas,
  onSelectSchema,
  onAddSchema,
  onDeleteSchema
}) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const [selectedSchema, setSelectedSchema] = useState<SchemaFile | null>(null);
  const toast = useToast();

  // Group schemas by type (Python or JSON)
  const pythonSchemas = schemas.filter(s => s.name.endsWith('.py'));
  const jsonSchemas = schemas.filter(s => s.name.endsWith('.json'));
  const otherSchemas = schemas.filter(s => !s.name.endsWith('.py') && !s.name.endsWith('.json'));

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    
    for (const file of files) {
      try {
        const content = await file.text();
        const extension = file.name.split('.').pop()?.toLowerCase();
        
        if (extension !== 'py' && extension !== 'json') {
          toast({
            title: 'Unsupported file type',
            description: 'Only .py and .json schema files are supported',
            status: 'warning',
            duration: 3000,
            isClosable: true,
          });
          continue;
        }
        
        onAddSchema({ name: file.name, content });
        
        toast({
          title: 'Schema added',
          description: `${file.name} has been added to the library`,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      } catch (err) {
        toast({
          title: 'Error adding schema',
          description: `Failed to add ${file.name}`,
          status: 'error',
          duration: 3000,
          isClosable: true,
        });
      }
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    
    for (const file of Array.from(e.target.files)) {
      try {
        const content = await file.text();
        onAddSchema({ name: file.name, content });
        
        toast({
          title: 'Schema added',
          description: `${file.name} has been added to the library`,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      } catch (err) {
        toast({
          title: 'Error adding schema',
          description: `Failed to add ${file.name}`,
          status: 'error',
          duration: 3000,
          isClosable: true,
        });
      }
    }
    
    // Reset the input
    e.target.value = '';
  };

  const handleSchemaClick = (schema: SchemaFile) => {
    // For JSON schemas, show the acquisition selector
    if (schema.name.endsWith('.json')) {
      setSelectedSchema(schema);
    } else {
      // For Python schemas, select directly
      onSelectSchema(schema);
    }
  };

  const handleSelectAcquisition = (schema: SchemaFile, acquisitionName: string) => {
    onSelectSchema(schema, acquisitionName);
    setSelectedSchema(null);
  };

  const renderSchemaGroup = (groupSchemas: SchemaFile[], title: string) => {
    if (groupSchemas.length === 0) return null;
    
    return (
      <AccordionItem>
        <h2>
          <AccordionButton>
            <Box flex="1" textAlign="left" fontWeight="medium">
              {title} ({groupSchemas.length})
            </Box>
            <AccordionIcon />
          </AccordionButton>
        </h2>
        <AccordionPanel pb={4}>
          <Grid templateColumns="repeat(auto-fill, minmax(200px, 1fr))" gap={3}>
            {groupSchemas.map((schema, idx) => (
              <Flex 
                key={idx}
                p={3}
                borderWidth="1px"
                borderRadius="md"
                direction="column"
                justify="space-between"
                _hover={{ bg: 'gray.50' }}
              >
                <Box>
                  <Text fontWeight="bold" isTruncated>{schema.name}</Text>
                  <Badge colorScheme={schema.name.endsWith('.py') ? 'purple' : 'blue'}>
                    {schema.name.endsWith('.py') ? 'Python' : 'JSON'}
                  </Badge>
                </Box>
                <Flex mt={3} justify="space-between">
                  <Button 
                    size="sm" 
                    leftIcon={<AddIcon />} 
                    colorScheme="teal"
                    onClick={() => handleSchemaClick(schema)}
                  >
                    {schema.name.endsWith('.json') ? 'View' : 'Select'}
                  </Button>
                  <IconButton
                    size="sm"
                    icon={<DeleteIcon />}
                    aria-label="Delete schema"
                    colorScheme="red"
                    variant="ghost"
                    onClick={() => onDeleteSchema(schema.name)}
                  />
                </Flex>
              </Flex>
            ))}
          </Grid>
        </AccordionPanel>
      </AccordionItem>
    );
  };

  // If a schema is selected, show the acquisition selector
  if (selectedSchema) {
    return (
      <AcquisitionSelector 
        schema={selectedSchema}
        onSelectAcquisition={handleSelectAcquisition}
        onBack={() => setSelectedSchema(null)}
      />
    );
  }

  return (
    <Box>
      <Box
        p={4}
        mb={4}
        borderWidth="1px"
        borderRadius="md"
        bg={isDragActive ? 'gray.200' : 'gray.50'}
        textAlign="center"
        onDragEnter={handleDragOver}
        onDragOver={e => e.preventDefault()}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Text mb={2}>Drag & drop schema files to add to library</Text>
        <input
          type="file"
          accept=".json,.py"
          multiple
          style={{ display: 'none' }}
          id="schema-library-upload"
          onChange={handleUpload}
        />
        <Button as="label" htmlFor="schema-library-upload" colorScheme="teal">
          Upload Schemas
        </Button>
      </Box>

      {schemas.length === 0 ? (
        <Box textAlign="center" p={4} color="gray.500">
          <Text>No schemas in library yet. Add some to get started.</Text>
        </Box>
      ) : (
        <Accordion defaultIndex={[0]} allowMultiple>
          {renderSchemaGroup(pythonSchemas, 'Python Schemas')}
          {renderSchemaGroup(jsonSchemas, 'JSON Schemas')}
          {renderSchemaGroup(otherSchemas, 'Other Schemas')}
        </Accordion>
      )}
    </Box>
  );
};

export default SchemaLibrary;
