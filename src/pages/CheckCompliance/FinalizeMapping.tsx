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
  Progress
} from '@chakra-ui/react';
import { ChevronDownIcon, ChevronRightIcon } from '@chakra-ui/icons';
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

const FinalizeMapping: React.FC<FinalizeMappingProps> = ({ setIsNextEnabled, isActive }) => {
  // --- Schema state ---
  const [referenceFile, setReferenceFile] = useState<{ name: string; content: string } | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [referenceOptions, setReferenceOptions] = useState<Acquisition[]>([]);

  // --- Input state ---
  const [inputDICOMFiles, setInputDICOMFiles] = useState<File[]>([]);
  const [isDICOMUploading, setIsDICOMUploading] = useState(false);
  const [dicomProgress, setDICOMProgress] = useState<number>(0);
  const [inputOptions, setInputOptions] = useState<Acquisition[]>([]);

  // --- UI expansion states ---
  const [expandedReferences, setExpandedReferences] = useState<Record<string, boolean>>({});
  const [expandedInputs, setExpandedInputs] = useState<Record<string, boolean>>({});

  // --- Pairing area state ---
  const [pairs, setPairs] = useState<Pair[]>([]);

  const { runPythonCode, setPythonGlobal, writePythonFile } = usePyodide();

  // --- Drag state for uploads ---
  const [isSchemaDragActive, setIsSchemaDragActive] = useState(false);
  const [isDICOMDragActive, setIsDICOMDragActive] = useState(false);

  // --- useEffect to enable/disable Next button ---
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

  // Load schema and update referenceOptions.
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
        const arrayBuf = await file.slice(0, 8192).arrayBuffer();
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
    reference_fields = []
in_session = await async_load_dicom_session(dicom_bytes=dicom_files.to_py(), progress_function=update_progress)
in_session = assign_acquisition_and_run_numbers(in_session)
in_session.sort_values(by=["Acquisition"] + acquisition_fields + reference_fields, inplace=True)
missing_fields = [field for field in reference_fields if field not in in_session.columns]
if missing_fields:
    raise ValueError(f"Input session is missing required reference fields: {missing_fields}")
input_acquisitions = create_json_reference(in_session, acquisition_fields + reference_fields)
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
    const sessionMap: Record<string, string> = {};

    pairs.forEach((pair) => {
      if (pair.ref && pair.inp) {
        sessionMap[pair.inp.name] = pair.ref.name;
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

  // Helper to render fields as a table
  const renderFieldsTable = (fields: Array<{ field: string; value?: any; tolerance?: number }>) => (
    <Box width="100%" mb={2}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ borderBottom: '1px solid #ccc', padding: '4px', textAlign: 'left' }}>Field</th>
            <th style={{ borderBottom: '1px solid #ccc', padding: '4px', textAlign: 'right' }}>Value</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((fld, idx) => (
            <tr key={idx}>
              <td style={{ borderBottom: '1px solid #eee', padding: '4px' }}>{fld.field}</td>
              <td style={{ borderBottom: '1px solid #eee', padding: '4px', textAlign: 'right' }}>
                {fld.value}{fld.tolerance !== undefined ? ` (tol: ${fld.tolerance})` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );

  // Helper to render series as a table
  const renderSeriesTable = (
    seriesArr: Array<{
      name: string;
      fields: Array<{ field: string; value?: any; tolerance?: number; contains?: any }>;
    }>
  ) => {
    if (!Array.isArray(seriesArr) || seriesArr.length === 0) return null;
    const allFieldNames = new Set<string>();
    seriesArr.forEach((s) => s.fields.forEach((f) => allFieldNames.add(f.field)));
    const fieldArray = Array.from(allFieldNames);
    return (
      <Box>
        <Text fontWeight="bold" mb={1}>
          Series:
        </Text>
        <Box as="table" width="100%" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ borderBottom: '1px solid #ccc', padding: '4px' }}>Series Name</th>
              {fieldArray.map((fieldName) => (
                <th key={fieldName} style={{ borderBottom: '1px solid #ccc', padding: '4px' }}>
                  {fieldName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {seriesArr.map((s, idx) => (
              <tr key={idx}>
                <td style={{ borderBottom: '1px solid #eee', padding: '4px' }}>{s.name}</td>
                {fieldArray.map((fieldName) => {
                  const maybeFieldObj = s.fields.find((x) => x.field === fieldName);
                  const val = maybeFieldObj?.value ?? maybeFieldObj?.contains ?? '';
                  const tol = maybeFieldObj?.tolerance !== undefined ? ` (tol: ${maybeFieldObj.tolerance})` : '';
                  return (
                    <td key={fieldName} style={{ borderBottom: '1px solid #eee', padding: '4px', textAlign: 'right' }}>
                      {String(val) + tol}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </Box>
      </Box>
    );
  };

  // --- 4. UI Handlers for Card Expansion ---
  const toggleReferenceDetails = (name: string) => {
    setExpandedReferences(prev => ({ ...prev, [name]: !prev[name] }));
  };
  const toggleInputDetails = (name: string) => {
    setExpandedInputs(prev => ({ ...prev, [name]: !prev[name] }));
  };

  // --- 5. Helper to Render a Draggable, Expandable Card ---
  const renderCard = (acq: Acquisition, type: 'ref' | 'inp', index: number) => {
    const expanded = type === "ref" ? expandedReferences[acq.name] : expandedInputs[acq.name];
    const toggle = type === "ref" ? () => toggleReferenceDetails(acq.name) : () => toggleInputDetails(acq.name);
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
              <Text fontWeight="bold">{acq.name}</Text>
              <IconButton
                size="sm"
                icon={expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                aria-label="Toggle details"
              />
            </Box>
            <Collapse in={expanded}>
              <Box p={2} bg="gray.50">
                {acq.details.fields && acq.details.fields.length > 0 && renderFieldsTable(acq.details.fields)}
                {acq.details.series && acq.details.series.length > 0 && renderSeriesTable(acq.details.series)}
              </Box>
            </Collapse>
          </Box>
        )}
      </Draggable>
    );
  };

  // --- 6. Drag and Drop Handling for the Pairing Area ---
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

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Box p={4}>
        <Text mb={8} color="gray.700">
          Select a template schema and a DICOM session to verify compliance.
        </Text>
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
              onDragOver={(e) => {
                e.preventDefault();
              }}
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
              onDragOver={(e) => {
                e.preventDefault();
              }}
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
                    <Text mt={4} fontSize="sm" color="gray.600">{inputDICOMFiles.length} DICOM files loaded.</Text>
                  )}
                </>
              )}
            </Box>
          </Box>
        </Flex>

        {/* --- Pairing Area --- */}
        <Box>
          <VStack spacing={2} align="stretch">
            {pairs.map((pair, index) => (
              <Flex key={index} gap={2}>
                <Droppable droppableId={`pair-ref-${index}`} type="ref">
                  {(provided) => (
                    <Box
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      flex="1"
                      minH="50px"
                    >
                      {pair.ref ? (
                        renderCard(pair.ref, "ref", index)
                      ) : (
                        <Text textAlign="center" color="gray.500" fontSize="sm">No Reference</Text>
                      )}
                      {provided.placeholder}
                    </Box>
                  )}
                </Droppable>
                <Droppable droppableId={`pair-inp-${index}`} type="inp">
                  {(provided) => (
                    <Box
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      flex="1"
                      minH="50px"
                    >
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
