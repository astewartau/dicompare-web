// components/CollapsibleCard/EditRowModal.tsx
import React, { useState, useEffect } from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  Button,
  FormControl,
  FormLabel,
  Select,
  VStack,
  HStack
} from "@chakra-ui/react";
import { EditableCell } from "./EditableCell";
import { allowedConstraints } from "./EditableCell";
import { VariableRow, DataType } from "./types";

interface EditRowModalProps {
  isOpen: boolean;
  onClose: () => void;
  rowData: VariableRow;
  rowIndex: number;
  onSave: (rowIndex: number, newData: VariableRow) => void;
}

const EditRowModal: React.FC<EditRowModalProps> = ({
  isOpen,
  onClose,
  rowData,
  rowIndex,
  onSave,
}) => {
  // Local state to edit the entire row
  const [localRow, setLocalRow] = useState<VariableRow>(rowData);

  useEffect(() => {
    setLocalRow(rowData);
  }, [rowData]);

  const handleCellChange = (field: string, updates: any) => {
    setLocalRow((prev) => ({
      ...prev,
      [field]: { ...prev[field], ...updates },
    }));
  };

  const handleDataTypeChange = (field: string, dt: DataType) => {
    // For simplicity, choose the first allowed constraint for the new data type.
    const newConstraint = allowedConstraints(dt)[0];
    setLocalRow((prev) => ({
      ...prev,
      [field]: { ...prev[field], dataType: dt, constraintType: newConstraint },
    }));
  };

  const handleConstraintChange = (field: string, ct: string) => {
    setLocalRow((prev) => ({
      ...prev,
      [field]: { ...prev[field], constraintType: ct },
    }));
  };

  const handleSave = () => {
    onSave(rowIndex, localRow);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Edit Row</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4}>
            {Object.keys(localRow).map((field) => (
              <FormControl key={field}>
                <FormLabel>{field}</FormLabel>
                <HStack spacing={4} mb={2}>
                  <Select
                    value={localRow[field].dataType}
                    onChange={(e) =>
                      handleDataTypeChange(field, e.target.value as DataType)
                    }
                    size="sm"
                  >
                    {(["number", "string", "list"] as DataType[]).map((dt) => (
                      <option key={dt} value={dt}>
                        {dt}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={localRow[field].constraintType}
                    onChange={(e) => handleConstraintChange(field, e.target.value)}
                    size="sm"
                  >
                    {allowedConstraints(localRow[field].dataType).map((ct) => (
                      <option key={ct} value={ct}>
                        {ct}
                      </option>
                    ))}
                  </Select>
                </HStack>
                <EditableCell
                  cellData={localRow[field]}
                  editable={true}
                  onChange={(updates) => handleCellChange(field, updates)}
                  fieldName={field}
                  showDataType={false}
                />
              </FormControl>
            ))}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button onClick={handleSave} colorScheme="blue" size="sm">
            Save
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default EditRowModal;
