// PairingArea.tsx
import React from 'react';
import {
  Box,
  Text,
  Flex,
  IconButton,
  Collapse,
  Tooltip,
  VStack,
  Button
} from '@chakra-ui/react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  WarningIcon,
  DeleteIcon,
  AddIcon,
  ViewIcon
} from '@chakra-ui/icons';
import RulesTable from './RulesTable';
import FieldsTable from './FieldsTable';
import SeriesTable from './SeriesTable';
import ComplianceReport from './ComplianceReport';
import { Acquisition, Pair, FieldCompliance } from './types';

interface PairingAreaProps {
  pairs: Pair[];
  expandedReferences: Record<string, boolean>;
  expandedInputs: Record<string, boolean>;
  complianceMap: Record<string, FieldCompliance>;
  overallCompliance: Record<string, { status: 'ok' | 'error'; message: string }>;
  onToggleReference: (name: string) => void;
  onToggleInput: (name: string) => void;
  onDeleteReference: (name: string) => void;
  onDeleteInput: (name: string) => void;
  onAddSchema: (index: number) => void;
  onVisualizeDicom: (acquisitionName: string) => void;
}

const PairingArea: React.FC<PairingAreaProps> = ({
  pairs,
  expandedReferences,
  expandedInputs,
  complianceMap,
  overallCompliance,
  onToggleReference,
  onToggleInput,
  onDeleteReference,
  onDeleteInput,
  onAddSchema,
  onVisualizeDicom
}) => {
  const renderCard = (acq: Acquisition, type: 'ref' | 'inp', idx: number) => {
    const expanded = (type === 'ref'
      ? expandedReferences[acq.id || acq.name]
      : expandedInputs[acq.name]) || false;

    const toggle = () => {
      if (type === 'ref') {
        onToggleReference(acq.id || acq.name);
      } else {
        onToggleInput(acq.name);
      }
    };

    const handleDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (type === 'ref') {
        onDeleteReference(acq.id || acq.name);
      } else {
        onDeleteInput(acq.name);
      }
    };

    const overallIcon = type === 'ref' && overallCompliance[acq.id || acq.name]
      ? (overallCompliance[acq.id || acq.name].status === 'ok'
        ? <Tooltip label="Fully compliant"><CheckCircleIcon ml={2} color="green.500" /></Tooltip>
        : <Tooltip label={overallCompliance[acq.id || acq.name].message}><WarningIcon ml={2} color="red.500" /></Tooltip>
      )
      : null;

    return (
      <Box
        borderWidth="1px"
        borderRadius="md"
        mb={1}
      >
        <Box
          p={2}
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          cursor="pointer"
          _hover={{ bg: 'gray.100' }}
        >
          <Box flex="1" onClick={toggle}>
            <Text fontWeight="bold">
              {acq.name}{type === 'ref' && overallIcon}
            </Text>
            {acq.source && (
              <Text fontSize="xs" color="gray.500">
                Source: {acq.source}
              </Text>
            )}
          </Box>
          <Flex>
            {/* Add visualize button for input DICOM acquisitions */}
            {type === 'inp' && (
              <IconButton
                size="sm"
                icon={<ViewIcon />}
                aria-label="visualize DICOM"
                colorScheme="blue"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onVisualizeDicom(acq.name);
                }}
                mr={1}
              />
            )}
            <IconButton
              size="sm"
              icon={<DeleteIcon />}
              aria-label="delete"
              colorScheme="red"
              variant="ghost"
              onClick={handleDelete}
              mr={1}
            />
            <IconButton
              size="sm"
              icon={expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
              aria-label="toggle"
              onClick={toggle}
            />
          </Flex>
        </Box>
        <Collapse in={expanded}>
          <Box p={2} bg="gray.50">
            {acq.details.rules
              ? <RulesTable
                rules={acq.details.rules}
                complianceMap={complianceMap}
                referenceId={acq.id} // Pass the ID
              />
              : (
                <>
                  {acq.details.fields &&
                    <FieldsTable
                      fields={acq.details.fields}
                      cardType={type}
                      complianceMap={complianceMap}
                      referenceId={acq.id} // Pass the ID
                    />
                  }
                  {acq.details.series &&
                    <SeriesTable
                      seriesArr={acq.details.series}
                      cardType={type}
                      acqName={acq.name}
                      complianceMap={complianceMap}
                      referenceId={acq.id} // Pass the ID
                    />
                  }
                </>
              )
            }
          </Box>
        </Collapse>
        {/* Add compliance report for reference schemas */}
        {type === 'ref' && (
          <ComplianceReport
            acquisitionName={acq.name}
            acquisitionId={acq.id}
            complianceMap={complianceMap}
            overallCompliance={overallCompliance}
          />
        )}
      </Box>
    );
  };

  return (
    <VStack spacing={2} align="stretch">
      {pairs.map((pair, idx) => (
        <Flex key={idx} gap={2}>
          <Box flex="1" minH="50px">
            {pair.inp ? renderCard(pair.inp, 'inp', idx) : (
              <Box
                minH="50px"
                display="flex"
                alignItems="center"
                justifyContent="center"
                borderWidth="1px"
                borderRadius="md"
                borderStyle="dashed"
                borderColor="gray.300"
              >
                <Text color="gray.500" fontSize="sm">No DICOM Series</Text>
              </Box>
            )}
          </Box>
          <Box flex="1" minH="50px">
            {pair.ref ? renderCard(pair.ref, 'ref', idx) : (
              <Box
                minH="50px"
                display="flex"
                alignItems="center"
                justifyContent="center"
                borderWidth="1px"
                borderRadius="md"
                borderStyle="dashed"
                borderColor="gray.300"
                bg="gray.50"
              >
                <Button
                  leftIcon={<AddIcon />}
                  colorScheme="teal"
                  variant="outline"
                  size="sm"
                  onClick={() => onAddSchema(idx)}
                >
                  Add Schema
                </Button>
              </Box>
            )}
          </Box>
        </Flex>
      ))}
    </VStack>
  );
};

export default PairingArea;
