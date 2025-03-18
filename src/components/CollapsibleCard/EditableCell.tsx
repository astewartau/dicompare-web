// components/CollapsibleCard/EditableCell.tsx

import React, { useState, useEffect } from "react";
import { VStack, HStack, Text, Input } from "@chakra-ui/react";
import { EditableCellProps, DataType, ConstraintType } from "./types";

export const allowedConstraints = (dataType: DataType): ConstraintType[] => {
  return dataType === "number"
    ? ["value", "range", "value+tolerance"]
    : ["value", "contains"];
};

export const EditableCell: React.FC<EditableCellProps> = ({
  cellData,
  editable,
  onChange,
  showDataType = false,
}) => {
  const [localValue, setLocalValue] = useState(cellData.value);
  const [localMin, setLocalMin] = useState(cellData.minValue || "");
  const [localMax, setLocalMax] = useState(cellData.maxValue || "");
  const [localTolerance, setLocalTolerance] = useState(cellData.tolerance || "");

  useEffect(() => {
    if (!editable) {
      setLocalValue(cellData.value);
      setLocalMin(cellData.minValue || "");
      setLocalMax(cellData.maxValue || "");
      setLocalTolerance(cellData.tolerance || "");
    }
  }, [editable, cellData]);

  if (!editable) {
    let display = "";
    switch (cellData.constraintType) {
      case "value":
        display = cellData.value;
        break;
      case "range":
        display = `range: [${cellData.minValue || ""}, ${cellData.maxValue || ""}]`;
        break;
      case "value+tolerance":
        display = `${cellData.value} +/- ${cellData.tolerance || ""}`;
        break;
      case "contains":
        display = `contains: ${cellData.value}`;
        break;
      default:
        display = cellData.value;
    }
    return (
      <VStack align="start" spacing={1}>
        <Text>{display}</Text>
        {showDataType && <Text fontSize="xs" color="gray.500">{cellData.dataType}</Text>}
      </VStack>
    );
  }

  const renderInput = () => {
    if (cellData.constraintType === "value") {
      if (cellData.dataType === "list") {
        // You could import TagifyInput from Inputs.tsx if needed.
        return (
          <div>
            {/* Render TagifyInput here if separated */}
            <Input
              size="xs"
              value={localValue}
              onChange={(e) => setLocalValue(e.target.value)}
              onBlur={() => onChange({ value: localValue })}
              width={40}
            />
          </div>
        );
      } else {
        return (
          <Input
            size="xs"
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={() => onChange({ value: localValue })}
            width={40}
          />
        );
      }
    }
    if (cellData.constraintType === "range") {
      return (
        <HStack spacing={1}>
          <Input
            size="xs"
            placeholder="Min"
            value={localMin}
            onChange={(e) => setLocalMin(e.target.value)}
            onBlur={() => onChange({ minValue: localMin })}
            width={20}
          />
          <Input
            size="xs"
            placeholder="Max"
            value={localMax}
            onChange={(e) => setLocalMax(e.target.value)}
            onBlur={() => onChange({ maxValue: localMax })}
            width={20}
          />
        </HStack>
      );
    }
    if (cellData.constraintType === "value+tolerance") {
      return (
        <>
          <Input
            size="xs"
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={() => onChange({ value: localValue })}
            width={40}
          />
          <Input
            size="xs"
            placeholder="Tolerance"
            value={localTolerance}
            onChange={(e) => setLocalTolerance(e.target.value)}
            onBlur={() => onChange({ tolerance: localTolerance })}
            width={40}
          />
        </>
      );
    }
    if (cellData.constraintType === "contains") {
      return (
        <Input
          size="xs"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={() => onChange({ value: localValue })}
          width={40}
        />
      );
    }
    return null;
  };

  return (
    <VStack align="start" spacing={2}>
      {renderInput()}
    </VStack>
  );
};
