// PairingArea.tsx
import React from 'react';
import {
  Box,
  Text,
  Flex,
  IconButton,
  Collapse,
  Tooltip,
  VStack
} from '@chakra-ui/react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  WarningIcon
} from '@chakra-ui/icons';
import { Droppable, Draggable, DraggableProvided } from '@hello-pangea/dnd';
import RulesTable from './RulesTable';
import FieldsTable from './FieldsTable';
import SeriesTable from './SeriesTable';
import { Acquisition, Pair, FieldCompliance } from './types';

interface PairingAreaProps {
  pairs: Pair[];
  expandedReferences: Record<string, boolean>;
  expandedInputs: Record<string, boolean>;
  complianceMap: Record<string, FieldCompliance>;
  overallCompliance: Record<string, { status: 'ok' | 'error'; message: string }>;
  onToggleReference: (name: string) => void;
  onToggleInput: (name: string) => void;
}

const PairingArea: React.FC<PairingAreaProps> = ({
  pairs,
  expandedReferences,
  expandedInputs,
  complianceMap,
  overallCompliance,
  onToggleReference,
  onToggleInput
}) => {
  const renderCard = (acq: Acquisition, type: 'ref' | 'inp', idx: number) => {
    const expanded = (type === 'ref'
      ? expandedReferences[acq.name]
      : expandedInputs[acq.name]) || false;
    
    const toggle = () => {
      if (type === 'ref') {
        onToggleReference(acq.name);
      } else {
        onToggleInput(acq.name);
      }
    };

    const overallIcon = type === 'ref' && overallCompliance[acq.name]
      ? (overallCompliance[acq.name].status === 'ok'
        ? <Tooltip label="Fully compliant"><CheckCircleIcon ml={2} color="green.500" /></Tooltip>
        : <Tooltip label={overallCompliance[acq.name].message}><WarningIcon ml={2} color="red.500" /></Tooltip>
      )
      : null;

    return (
      <Draggable draggableId={`${type}-${acq.name}-${idx}`} index={idx} key={`${type}-${acq.name}-${idx}`}>
        {(provided: DraggableProvided) => (
          <Box
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
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
              onClick={toggle}
              _hover={{ bg: 'gray.100' }}
            >
              <Text fontWeight="bold">
                {acq.name}{type === 'ref' && overallIcon}
              </Text>
              <IconButton
                size="sm"
                icon={expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                aria-label="toggle"
              />
            </Box>
            <Collapse in={expanded}>
              <Box p={2} bg="gray.50">
                {acq.details.rules
                  ? <RulesTable rules={acq.details.rules} complianceMap={complianceMap} />
                  : (
                    <>
                      {acq.details.fields && 
                        <FieldsTable 
                          fields={acq.details.fields} 
                          cardType={type} 
                          complianceMap={complianceMap} 
                        />
                      }
                      {acq.details.series && 
                        <SeriesTable 
                          seriesArr={acq.details.series} 
                          cardType={type} 
                          acqName={acq.name} 
                          complianceMap={complianceMap} 
                        />
                      }
                    </>
                  )
                }
              </Box>
            </Collapse>
          </Box>
        )}
      </Draggable>
    );
  };

  return (
    <VStack spacing={2} align="stretch">
      {pairs.map((pair, idx) => (
        <Flex key={idx} gap={2}>
          <Droppable droppableId={`pair-inp-${idx}`} type="inp">
            {provided => (
              <Box ref={provided.innerRef} {...provided.droppableProps} flex="1" minH="50px">
                {pair.inp ? renderCard(pair.inp, 'inp', idx) : (
                  <Box minH="50px" display="flex" alignItems="center" justifyContent="center">
                    <Text color="gray.500" fontSize="sm">No Input</Text>
                  </Box>
                )}
                {provided.placeholder}
              </Box>
            )}
          </Droppable>
          <Droppable droppableId={`pair-ref-${idx}`} type="ref">
            {provided => (
              <Box ref={provided.innerRef} {...provided.droppableProps} flex="1" minH="50px">
                {pair.ref ? renderCard(pair.ref, 'ref', idx) : (
                  <Text color="gray.500" fontSize="sm" textAlign="center">
                    No Reference
                  </Text>
                )}
                {provided.placeholder}
              </Box>
            )}
          </Droppable>
        </Flex>
      ))}
    </VStack>
  );
};

export default PairingArea;
