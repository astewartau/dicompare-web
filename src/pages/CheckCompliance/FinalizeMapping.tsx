import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Text,
  Button,
  VStack,
  Flex,
  IconButton,
  Collapse,
  Spinner,
  Progress,
  Tooltip
} from '@chakra-ui/react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  WarningIcon,
  CloseIcon
} from '@chakra-ui/icons';
import { usePyodide } from '../../components/PyodideContext';
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
  DraggableProvided
} from 'react-beautiful-dnd';

interface Acquisition {
  name: string;
  details: Record<string, any>;
}

interface Pair {
  ref: Acquisition | null;
  inp: Acquisition | null;
}

interface FinalizeMappingProps {
  setIsNextEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  isActive?: boolean;
}

interface FieldCompliance {
  status: 'ok' | 'error' | 'warning';
  message?: string;
  // For series-level compliance records.
  matched?: string | string[] | null;
}

const FinalizeMapping: React.FC<FinalizeMappingProps> = ({ setIsNextEnabled, isActive }) => {
  // State for schema upload and reference options.
  const [referenceFile, setReferenceFile] = useState<{ name: string; content: string } | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [referenceOptions, setReferenceOptions] = useState<Acquisition[]>([]);

  // State for DICOM input and input options.
  const [inputDICOMFiles, setInputDICOMFiles] = useState<File[]>([]);
  const [isDICOMUploading, setIsDICOMUploading] = useState(false);
  const [dicomProgress, setDICOMProgress] = useState<number>(0);
  const [inputOptions, setInputOptions] = useState<Acquisition[]>([]);

  // UI expansion states.
  const [expandedReferences, setExpandedReferences] = useState<Record<string, boolean>>({});
  const [expandedInputs, setExpandedInputs] = useState<Record<string, boolean>>({});

  // Pairing area state.
  const [pairs, setPairs] = useState<Pair[]>([]);

  // Compliance mapping state.
  const [complianceMap, setComplianceMap] = useState<Record<string, FieldCompliance>>({});
  // Overall compliance per reference acquisition.
  const [overallCompliance, setOverallCompliance] = useState<Record<string, { status: 'ok' | 'error'; message: string }>>({});
  // Store the raw JSON compliance report from Python.
  const [complianceReport, setComplianceReport] = useState<string>("");

  const { runPythonCode, setPythonGlobal, writePythonFile } = usePyodide();

  // Drag states for uploads.
  const [isSchemaDragActive, setIsSchemaDragActive] = useState(false);
  const [isDICOMDragActive, setIsDICOMDragActive] = useState(false);

  // Enable Next button when there is at least one reference and one input.
  useEffect(() => {
    if (!isActive) return;
    const isValid = referenceOptions.length > 0 && inputOptions.length > 0;
    setIsNextEnabled(isValid);
  }, [referenceOptions, inputOptions, setIsNextEnabled, isActive]);

  const updateProgress = useCallback((p: number) => {
    setDICOMProgress(p);
  }, []);

  // --- 1. Schema Upload Handlers ---
  const handleSchemaUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      const text = await file.text();
      setReferenceFile({ name: file.name, content: text });
    }
  };

  const handleSchemaDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsSchemaDragActive(true);
  };

  const handleSchemaDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsSchemaDragActive(false);
  };

  const handleSchemaDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsSchemaDragActive(false);
    const dtItems = e.dataTransfer.items;
    if (dtItems && dtItems.length > 0) {
      const fileItem = dtItems[0];
      if (fileItem.kind === 'file') {
        const file = fileItem.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const content = ev.target?.result;
            if (typeof content === 'string') {
              setReferenceFile({ name: file.name, content });
            }
          };
          reader.readAsText(file);
        }
      }
    }
  };

  // Effect to load schema acquisitions.
  useEffect(() => {
    if (referenceFile) {
      const loadSchemaAcquisitions = async () => {
        setSchemaLoading(true);
        try {
          await writePythonFile(referenceFile.name, referenceFile.content);
          const isJson = referenceFile.name.endsWith('.json');
          await setPythonGlobal('ref_config_name', referenceFile.name);
          await setPythonGlobal('is_json', isJson);
          const code = `
import sys, json
sys.path.append('.')
global ref_session, reference_fields
ref_session = None
reference_fields = None
from dicompare.io import load_json_session, load_python_session
if is_json:
    reference_fields, ref_session = load_json_session(json_ref=ref_config_name)
else:
    ref_models = load_python_session(module_path=ref_config_name)
    if ref_models is not None:
        ref_session = {"acquisitions": {k: {} for k in ref_models.keys()}}
json.dumps(ref_session["acquisitions"])
          `.trim();
          const result = await runPythonCode(code);
          const parsed = JSON.parse(result);
          const refs = Object.entries(parsed).map(([acqName, obj]) => ({
            name: acqName,
            details: obj as Record<string, any>
          }));
          setReferenceOptions(refs);
          console.log(`Schema "${referenceFile.name}" loaded.`);
        } catch (error) {
          console.error("Error loading schema acquisitions:", error);
        } finally {
          setSchemaLoading(false);
        }
      };
      loadSchemaAcquisitions();
    }
  }, [referenceFile, runPythonCode, setPythonGlobal, writePythonFile]);

  // --- 2. Input DICOM Handlers ---
  const analyzeDICOMFiles = async (files: File[]) => {
    setIsDICOMUploading(true);
    try {
      const dicomFiles: Record<string, Uint8Array> = {};
      for (const file of files) {
        const arrayBuf = await file.arrayBuffer();
        const typedArray = new Uint8Array(arrayBuf);
        const key = file.webkitRelativePath || file.name;
        dicomFiles[key] = typedArray;
      }
      await setPythonGlobal("dicom_files", dicomFiles);
      await setPythonGlobal("update_progress", updateProgress);
      const code = `
import sys, json, asyncio
from dicompare.cli.gen_session import create_json_reference
from dicompare import async_load_dicom_session, assign_acquisition_and_run_numbers
acquisition_fields = ["ProtocolName"]
global in_session
if "reference_fields" not in globals():
    reference_fields = ["ProtocolName"]
in_session = await async_load_dicom_session(dicom_bytes=dicom_files.to_py(), progress_function=update_progress)
in_session = assign_acquisition_and_run_numbers(in_session)
in_session.sort_values(by=["Acquisition"] + reference_fields, inplace=True)
missing_fields = [field for field in reference_fields if field not in in_session.columns]
if missing_fields:
    raise ValueError(f"Input session is missing required reference fields: {missing_fields}")
input_acquisitions = create_json_reference(in_session, reference_fields)
json.dumps(input_acquisitions["acquisitions"])
          `.trim();
      const result = await runPythonCode(code);
      const parsed = JSON.parse(result);
      const ins = Object.entries(parsed).map(([acqName, acqObj]) => ({
        name: acqName,
        details: acqObj as Record<string, any>
      }));
      setInputOptions(ins);
      console.log("Input DICOMs loaded.");
    } catch (error) {
      console.error("Error loading input acquisitions:", error);
    } finally {
      setIsDICOMUploading(false);
    }
  };

  const handleInputDICOMUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const files = Array.from(event.target.files);
      setInputDICOMFiles(files);
      await analyzeDICOMFiles(files);
    }
  };

  const handleInputDICOMDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDICOMDragActive(true);
    const dtItems = e.dataTransfer.items;
    const files: File[] = [];

    const traverseFileTree = (item: any, path: string): Promise<void> => {
      return new Promise((resolve) => {
        if (item.isFile) {
          item.file((file: File) => {
            let newFile: File;
            if (!file.webkitRelativePath) {
              newFile = new File([file], file.name, { type: file.type, lastModified: file.lastModified });
              Object.defineProperty(newFile, "webkitRelativePath", {
                value: path + file.name,
                writable: false,
                enumerable: true,
                configurable: true
              });
            } else {
              newFile = file;
            }
            files.push(newFile);
            resolve();
          });
        } else if (item.isDirectory) {
          const dirReader = item.createReader();
          dirReader.readEntries((entries: any) => {
            Promise.all(
              entries.map((entry: any) => traverseFileTree(entry, path + item.name + "/"))
            ).then(() => resolve());
          });
        }
      });
    };

    const promises: Promise<void>[] = [];
    for (let i = 0; i < dtItems.length; i++) {
      const entry = dtItems[i].webkitGetAsEntry();
      if (entry) promises.push(traverseFileTree(entry, ""));
    }

    Promise.all(promises).then(async () => {
      if (files.length > 0) {
        setInputDICOMFiles(files);
        setIsDICOMDragActive(false);
        await analyzeDICOMFiles(files);
      }
    });
  };

  // --- 3. Update Pairing Area ---
  useEffect(() => {
    const numRows = Math.max(referenceOptions.length, inputOptions.length);
    const newPairs: Pair[] = [];
    for (let i = 0; i < numRows; i++) {
      newPairs.push({
        ref: referenceOptions[i] || null,
        inp: inputOptions[i] || null
      });
    }
    setPairs(newPairs);
  }, [referenceOptions, inputOptions]);

  useEffect(() => {
    // Build the session map so that the key is the reference acquisition name and the value is the input.
    const sessionMap: Record<string, string> = {};
    pairs.forEach((pair) => {
      if (pair.ref && pair.inp) {
        sessionMap[pair.ref.name] = pair.inp.name;
      }
    });
    const updateSessionMap = async () => {
      try {
        await setPythonGlobal("session_map", JSON.stringify(sessionMap));
        console.log("Updated session_map:", sessionMap);
      } catch (error) {
        console.error("Failed to update session_map:", error);
      }
    };
    updateSessionMap();
  }, [pairs, setPythonGlobal]);

  // --- 4. Compliance Analysis ---
  const analyzeCompliance = async () => {
    try {
      const code = `
import json
import pyodide
from dicompare.compliance import check_session_compliance_with_json_reference, check_session_compliance_with_python_module

if 'session_map' not in globals():
    global session_map
    session_map = {}
elif isinstance(session_map, str):
    session_map = json.loads(session_map)
elif isinstance(session_map, pyodide.ffi.JsProxy):
    session_map = session_map.to_py()

if is_json:
    compliance_summary = check_session_compliance_with_json_reference(
        in_session=in_session, ref_session=ref_session, session_map=session_map
    )
else:
    acquisition_map = {
        k if isinstance(k, str) else k.split("::")[0]: v
        for k, v in session_map.items()
    }
    compliance_summary = check_session_compliance_with_python_module(
        in_session=in_session, ref_models=ref_models, session_map=acquisition_map
    )
json.dumps(compliance_summary)
      `.trim();
      const pyResult = await runPythonCode(code);
      // Save raw JSON for download.
      setComplianceReport(pyResult);
      const results: Array<any> = JSON.parse(pyResult);
      // Build mapping for both acquisition-level and series-level results.
      // For series-level, we expect a record with a "series" key.
      const map: Record<string, FieldCompliance> = {};
      const overall: Record<string, { status: 'ok' | 'error'; message: string }> = {};
      results.forEach(item => {
        const refAcq = item["reference acquisition"];
        if (refAcq) {
          if (!overall[refAcq]) {
            overall[refAcq] = { status: 'ok', message: 'Passed.' };
          }
          if (!item.passed) {
            overall[refAcq] = { status: 'error', message: item.message || "Issue found." };
          }
        }
        if (item.series) {
          map["reference series:" + item.series] = {
            status: item.passed ? 'ok' : 'error',
            message: item.message,
            matched: item["input series"] || null
          };
        } else if (item.field) {
          map[item.field] = {
            status: item.passed ? 'ok' : 'error',
            message: item.message,
          };
        }
      });
      setComplianceMap(map);
      setOverallCompliance(overall);
    } catch (error) {
      console.error("Compliance analysis error:", error);
    }
  };

  // Trigger compliance analysis when pairings update.
  useEffect(() => {
    if (pairs.length > 0) {
      analyzeCompliance();
    }
  }, [pairs]);

  // --- 6. Render Draggable, Expandable Card ---
  const renderCard = (acq: Acquisition, type: 'ref' | 'inp', index: number) => {
    const expanded = type === "ref" ? expandedReferences[acq.name] : expandedInputs[acq.name];
    const toggle = type === "ref"
      ? () => setExpandedReferences(prev => ({ ...prev, [acq.name]: !prev[acq.name] }))
      : () => setExpandedInputs(prev => ({ ...prev, [acq.name]: !prev[acq.name] }));
    // For reference acquisitions, show overall compliance next to the acquisition name.
    const overallIcon = type === "ref" && overallCompliance[acq.name] ? (
      overallCompliance[acq.name].status === 'ok' ? (
        <Tooltip label="Fully compliant">
          <CheckCircleIcon ml={2} color="green.500" />
        </Tooltip>
      ) : (
        <Tooltip label={overallCompliance[acq.name].message}>
          <WarningIcon ml={2} color="red.500" />
        </Tooltip>
      )
    ) : null;
    // If a reference is unmapped (overallCompliance indicates "not mapped"), then render its details as input (no compliance).
    const isMapped = type === "ref" ? overallCompliance[acq.name]?.message.indexOf("not mapped") === -1 : true;
    const detailCardType = type === "ref" && !isMapped ? "inp" : type;
    return (
      <Draggable draggableId={`${type}-${acq.name}-${index}`} index={index} key={`${type}-${acq.name}-${index}`}>
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
              alignItems="center"
              justifyContent="space-between"
              cursor="pointer"
              onClick={toggle}
              _hover={{ bg: "gray.100" }}
            >
              <Text fontWeight="bold">
                {acq.name}
                {type === "ref" && overallIcon}
              </Text>
              <IconButton
                size="sm"
                icon={expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                aria-label="Toggle details"
              />
            </Box>
            <Collapse in={expanded}>
              <Box p={2} bg="gray.50">
                {acq.details.fields && acq.details.fields.length > 0 && renderFieldsTable(acq.details.fields, detailCardType)}
                {acq.details.series && acq.details.series.length > 0 && renderSeriesTable(acq.details.series, detailCardType)}
              </Box>
            </Collapse>
          </Box>
        )}
      </Draggable>
    );
  };

  // --- 7. Render Fields Table with Compliance Icons ---
  const renderFieldsTable = (
    fields: Array<{ field: string; value?: any; tolerance?: number }>,
    cardType: 'ref' | 'inp'
  ) => (
    <Box width="100%" mb={2}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ borderBottom: '1px solid #ccc', padding: '4px', textAlign: 'left' }}>Field</th>
            <th style={{ borderBottom: '1px solid #ccc', padding: '4px', textAlign: 'right' }}>Value</th>
            {cardType === 'ref' && (
              <th style={{ borderBottom: '1px solid #ccc', padding: '4px' }}>Compliance</th>
            )}
          </tr>
        </thead>
        <tbody>
          {fields.map((fld, idx) => {
            const compliance = complianceMap[fld.field];
            let icon = null;
            if (cardType === 'ref' && compliance) {
              icon = compliance.status === 'ok' ? (
                <Tooltip label="OK">
                  <CheckCircleIcon color="green.500" />
                </Tooltip>
              ) : (
                <Tooltip label={compliance.message || "Issue found"}>
                  <WarningIcon color="red.500" />
                </Tooltip>
              );
            }
            return (
              <tr key={idx}>
                <td style={{ borderBottom: '1px solid #eee', padding: '4px' }}>{fld.field}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: '4px', textAlign: 'right' }}>
                  {fld.value}{fld.tolerance !== undefined ? ` (tol: ${fld.tolerance})` : ''}
                </td>
                {cardType === 'ref' && (
                  <td style={{ borderBottom: '1px solid #eee', padding: '4px', textAlign: 'center' }}>
                    {icon}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Box>
  );

  // --- 8. Render Series Table with Compliance Icons ---
  const renderSeriesTable = (
    seriesArr: Array<{
      name: string;
      fields: Array<{ field: string; value?: any; tolerance?: number; contains?: any }>;
    }>,
    cardType: 'ref' | 'inp'
  ) => {
    if (!Array.isArray(seriesArr) || seriesArr.length === 0) return null;

    // Collect all field names across series.
    const allFieldNames = new Set<string>();
    seriesArr.forEach(s => s.fields.forEach(f => allFieldNames.add(f.field)));
    const fieldArray = Array.from(allFieldNames);

    return (
      <Box>
        <Box as="table" width="100%" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ borderBottom: '1px solid #ccc', padding: '4px' }}>Series</th>
              {fieldArray.map(fieldName => (
                <th key={fieldName} style={{ borderBottom: '1px solid #ccc', padding: '4px' }}>
                  {fieldName}
                </th>
              ))}
              {cardType === 'ref' && (
                <th style={{ borderBottom: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                  Compliance
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {seriesArr.map((s, idx) => {
              // Use the schema series name directly.
              const key = "reference series:" + s.name;
              const seriesComp = complianceMap[key];
              return (
                <tr key={idx}>
                  <td style={{ borderBottom: '1px solid #eee', padding: '4px' }}>{s.name}</td>
                  {fieldArray.map(fieldName => {
                    const fieldObj = s.fields.find(f => f.field === fieldName);
                    const val = fieldObj?.value ?? fieldObj?.contains ?? '';
                    const tol =
                      fieldObj?.tolerance !== undefined ? ` (tol: ${fieldObj.tolerance})` : '';
                    return (
                      <td
                        key={fieldName}
                        style={{ borderBottom: '1px solid #eee', padding: '4px', textAlign: 'right' }}
                      >
                        {String(val) + tol}
                      </td>
                    );
                  })}
                  {cardType === 'ref' && (
                    <td style={{ borderBottom: '1px solid #eee', padding: '4px', textAlign: 'center' }}>
                      {seriesComp ? (
                        seriesComp.status === 'ok' ? (
                          <Tooltip label="OK">
                            <CheckCircleIcon color="green.500" />
                          </Tooltip>
                        ) : (
                          <Tooltip label={seriesComp.message || "Issue found"}>
                            <WarningIcon color="red.500" />
                          </Tooltip>
                        )
                      ) : (
                        <Tooltip label="Series missing">
                          <WarningIcon color="red.500" />
                        </Tooltip>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </Box>
      </Box>
    );
  };

  // --- 9. Drag and Drop Handler for Pairing ---
  const handleDragEnd = async (result: DropResult) => {
    const { source, destination } = result;
    if (!destination) return;

    const srcParts = source.droppableId.split("-");
    const destParts = destination.droppableId.split("-");
    const sIndex = parseInt(srcParts[2]);
    const dIndex = parseInt(destParts[2]);

    setPairs(prev => {
      const newPairs = [...prev];
      if (srcParts[1] === "ref" && destParts[1] === "ref") {
        const temp = newPairs[sIndex].ref;
        newPairs[sIndex].ref = newPairs[dIndex].ref;
        newPairs[dIndex].ref = temp;
      } else if (srcParts[1] === "inp" && destParts[1] === "inp") {
        const temp = newPairs[sIndex].inp;
        newPairs[sIndex].inp = newPairs[dIndex].inp;
        newPairs[dIndex].inp = temp;
      }
      return newPairs;
    });
  };

  // --- 10. Download Compliance Report Button ---
  const handleDownloadReport = () => {
    try {
      const parsed = JSON.parse(complianceReport);
      const pretty = JSON.stringify(parsed, null, 2);
      const blob = new Blob([pretty], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'compliance_report.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to prettify JSON", e);
    }
  };  

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Box p={4}>
        <Text mb={4} color="gray.700">
          Select a template schema and a DICOM session to verify compliance.
        </Text>
        {/* Download button appears as soon as we have a report */}
        {complianceReport && (
          <Button colorScheme="teal" mb={4} onClick={handleDownloadReport}>
            Download Compliance Report
          </Button>
        )}
        <Flex gap={8} mb={8}>
          <Box flex="1">
            <Text mb={4} fontWeight="medium" color="teal.600">Schema Template</Text>
            <Box
              mb={6}
              p={4}
              borderWidth="1px"
              borderRadius="md"
              bg={isSchemaDragActive ? "gray.200" : "gray.50"}
              textAlign="center"
              onDragEnter={handleSchemaDragOver}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={handleSchemaDragLeave}
              onDrop={handleSchemaDrop}
            >
              {schemaLoading ? (
                <>
                  <Spinner size="lg" color="teal.500" />
                  <Text mt={2}>Loading schema, please wait...</Text>
                </>
              ) : (
                <>
                  <Text mb={2}>Drag & drop your schema file or click to select.</Text>
                  <input
                    type="file"
                    accept=".py,.json"
                    style={{ display: 'none' }}
                    id="schema-upload"
                    onChange={handleSchemaUpload}
                  />
                  <Button as="label" htmlFor="schema-upload" colorScheme="teal">
                    Upload Schema
                  </Button>
                  {referenceFile && (
                    <Text mt={4} fontSize="sm" color="gray.600">Loaded: {referenceFile.name}</Text>
                  )}
                </>
              )}
            </Box>
          </Box>
          <Box flex="1">
            <Text mb={4} fontWeight="medium" color="teal.600">DICOM Files</Text>
            <Box
              mb={6}
              p={4}
              borderWidth="1px"
              borderRadius="md"
              bg={isDICOMDragActive ? "gray.200" : "gray.50"}
              textAlign="center"
              onDragEnter={(e) => {
                e.preventDefault();
                setIsDICOMDragActive(true);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDICOMDragActive(false);
              }}
              onDrop={handleInputDICOMDrop}
            >
              {isDICOMUploading ? (
                <>
                  <Spinner size="lg" color="teal.500" />
                  <Text mt={2}>Processing DICOM files, please wait...</Text>
                  <Progress value={dicomProgress} size="sm" mt={2} />
                </>
              ) : (
                <>
                  <Text mb={2}>Drag & drop your DICOM files or click to select.</Text>
                  <input
                    type="file"
                    multiple
                    style={{ display: 'none' }}
                    id="dicom-upload"
                    onChange={handleInputDICOMUpload}
                    ref={(input) => input && input.setAttribute('webkitdirectory', 'true')}
                  />
                  <Button as="label" htmlFor="dicom-upload" colorScheme="teal">
                    Upload DICOMs
                  </Button>
                  {inputDICOMFiles.length > 0 && (
                    <Text mt={4} fontSize="sm" color="gray.600">
                      {inputDICOMFiles.length} DICOM files loaded.
                    </Text>
                  )}
                </>
              )}
            </Box>
          </Box>
        </Flex>
        {/* Pairing Area */}
        <Box>
          <VStack spacing={2} align="stretch">
            {pairs.map((pair, index) => (
              <Flex key={index} gap={2}>
                <Droppable droppableId={`pair-ref-${index}`} type="ref">
                  {(provided) => (
                    <Box ref={provided.innerRef} {...provided.droppableProps} flex="1" minH="50px">
                      {pair.ref ? (
                        renderCard(pair.ref, "ref", index)
                      ) : (
                        <Text textAlign="center" color="gray.500" fontSize="sm">
                          No Reference
                        </Text>
                      )}
                      {provided.placeholder}
                    </Box>
                  )}
                </Droppable>
                <Droppable droppableId={`pair-inp-${index}`} type="inp">
                  {(provided) => (
                    <Box ref={provided.innerRef} {...provided.droppableProps} flex="1" minH="50px">
                      {pair.inp ? (
                        renderCard(pair.inp, "inp", index)
                      ) : (
                        <Box minH="50px" display="flex" alignItems="center" justifyContent="center">
                          <Text textAlign="center" color="gray.500" fontSize="sm">
                            No Input
                          </Text>
                        </Box>
                      )}
                      {provided.placeholder}
                    </Box>
                  )}
                </Droppable>
              </Flex>
            ))}
          </VStack>
        </Box>
      </Box>
    </DragDropContext>
  );
};

export default FinalizeMapping;
