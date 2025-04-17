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
  WarningIcon
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
    const ok = referenceOptions.length > 0 && inputOptions.length > 0;
    setIsNextEnabled(ok);
  }, [referenceOptions, inputOptions, setIsNextEnabled, isActive]);

  const updateProgress = useCallback((p: number) => {
    setDICOMProgress(p);
  }, []);

  // 1. Schema Upload Handlers
  const handleSchemaUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) {
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
    const item = e.dataTransfer.items[0];
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) {
        const reader = new FileReader();
        reader.onload = ev => {
          const content = ev.target?.result;
          if (typeof content === 'string') {
            setReferenceFile({ name: file.name, content });
          }
        };
        reader.readAsText(file);
      }
    }
  };

  // 1a. Load schema acquisitions (JSON or Python)
  useEffect(() => {
    if (!referenceFile) return;

    const loadSchemaAcquisitions = async () => {
      setSchemaLoading(true);
      try {
        await writePythonFile(referenceFile.name, referenceFile.content);

        const isJson = referenceFile.name.endsWith('.json');
        const isPy   = referenceFile.name.endsWith('.py');

        await setPythonGlobal('ref_config_name', referenceFile.name);
        await setPythonGlobal('is_json', isJson);
        await setPythonGlobal('is_py',   isPy);

        const code = `
import sys, json
sys.path.append('.')
global ref_session, reference_fields, ref_models
ref_session = None
reference_fields = []
from dicompare.io import load_json_session, load_python_session

if is_json:
    reference_fields, ref_session = load_json_session(json_ref=ref_config_name)

elif is_py:
    ref_models = load_python_session(module_path=ref_config_name)
    print([list(ref_models[acq].reference_fields) for acq in ref_models.keys()])
    ref_session = {
      "acquisitions": {
        acq: {
          "fields": [
            { "field": field, "value": None }
            for field in list(ref_models[acq].reference_fields)
          ],
          "series": []
        }
        for acq in ref_models.keys()
      }
    }

else:
    raise RuntimeError(f"Unsupported schema type: {ref_config_name}")

json.dumps(ref_session["acquisitions"])
        `.trim();

        const result = await runPythonCode(code);
        const parsed = JSON.parse(result);
        const refs = Object.entries(parsed).map(([acqName, details]) => ({
          name: acqName,
          details: details as Record<string, any>
        }));
        setReferenceOptions(refs);
      } catch (e) {
        console.error('Error loading schema:', e);
      } finally {
        setSchemaLoading(false);
      }
    };

    loadSchemaAcquisitions();
  }, [referenceFile, runPythonCode, setPythonGlobal, writePythonFile]);

  // 2. Input DICOM Handlers
  const analyzeDICOMFiles = async (files: File[]) => {
    setIsDICOMUploading(true);
    try {
      const dicomBytes: Record<string, Uint8Array> = {};
      for (const file of files) {
        const buf = await file.arrayBuffer();
        const arr = new Uint8Array(buf);
        const key = file.webkitRelativePath || file.name;
        dicomBytes[key] = arr;
      }

      await setPythonGlobal('dicom_files', dicomBytes);
      await setPythonGlobal('update_progress', updateProgress);

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
    } catch (error) {
      console.error("Error loading input acquisitions:", error);
    } finally {
      setIsDICOMUploading(false);
    }
  };

  const handleInputDICOMUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setInputDICOMFiles(files);
      await analyzeDICOMFiles(files);
    }
  };

  const handleInputDICOMDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDICOMDragActive(true);

    const items = e.dataTransfer.items;
    const files: File[] = [];
    const traverse = (entry: any, path = ''): Promise<void> => {
      return new Promise(resolve => {
        if (entry.isFile) {
          entry.file((f: File) => {
            const newFile = f.webkitRelativePath
              ? f
              : new File([f], f.name, { type: f.type, lastModified: f.lastModified });
            Object.defineProperty(newFile, 'webkitRelativePath', {
              value: path + f.name,
              writable: false,
            });
            files.push(newFile);
            resolve();
          });
        } else if (entry.isDirectory) {
          const reader = entry.createReader();
          reader.readEntries(entries => {
            Promise.all(entries.map(en => traverse(en, path + entry.name + '/')))
              .then(() => resolve());
          });
        }
      });
    };

    const promises = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry();
      if (entry) promises.push(traverse(entry));
    }
    await Promise.all(promises);

    if (files.length) {
      setInputDICOMFiles(files);
      setIsDICOMDragActive(false);
      await analyzeDICOMFiles(files);
    }
  };

  // 3. Build pairing
  useEffect(() => {
    const count = Math.max(referenceOptions.length, inputOptions.length);
    const newPairs: Pair[] = [];
    for (let i = 0; i < count; i++) {
      newPairs.push({
        ref: referenceOptions[i] || null,
        inp: inputOptions[i] || null
      });
    }
    setPairs(newPairs);
  }, [referenceOptions, inputOptions]);

  // 4. Update session_map in Python
  useEffect(() => {
    const sessionMap: Record<string, string> = {};
    pairs.forEach(p => {
      if (p.ref && p.inp) sessionMap[p.ref.name] = p.inp.name;
    });
    setPythonGlobal('session_map', JSON.stringify(sessionMap)).catch(console.error);
  }, [pairs, setPythonGlobal]);

  // 5. Analyze compliance
  const analyzeCompliance = async () => {
    try {
      const code = `
import json, pyodide
from dicompare.compliance import (
  check_session_compliance_with_json_reference,
  check_session_compliance_with_python_module
)

if isinstance(session_map, str):
  session_map = json.loads(session_map)
elif isinstance(session_map, pyodide.ffi.JsProxy):
  session_map = session_map.to_py()

if is_json:
  compliance = check_session_compliance_with_json_reference(
    in_session=in_session,
    ref_session=ref_session,
    session_map=session_map
  )
else:
  compliance = check_session_compliance_with_python_module(
    in_session=in_session,
    ref_models=ref_models,
    session_map=session_map
  )
json.dumps(compliance)
      `.trim();

      const pyResult = await runPythonCode(code);
      setComplianceReport(pyResult);

      const results: any[] = JSON.parse(pyResult);
      const cmap: Record<string, FieldCompliance> = {};
      const overall: Record<string, { status: 'ok' | 'error'; message: string }> = {};

      results.forEach(item => {
        const refA = item['reference acquisition'];
        if (refA) {
          if (!overall[refA]) overall[refA] = { status: 'ok', message: 'Passed.' };
          if (!item.passed) {
            overall[refA] = { status: 'error', message: item.message || '' };
          }
        }
        if (item.series) {
          cmap['reference series:' + item.series] = {
            status: item.passed ? 'ok' : 'error',
            message: item.message,
            matched: item['input series'] || null
          };
        } else if (item.field) {
          cmap[item.field] = {
            status: item.passed ? 'ok' : 'error',
            message: item.message
          };
        }
      });

      setComplianceMap(cmap);
      setOverallCompliance(overall);
    } catch (e) {
      console.error('Compliance error:', e);
    }
  };

  // trigger compliance whenever pairs change
  useEffect(() => {
    if (pairs.length) analyzeCompliance();
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
              onDragOver={e => e.preventDefault()}
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
                    <Text mt={4} fontSize="sm" color="gray.600">
                      Loaded: {referenceFile.name}
                    </Text>
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
              onDragEnter={e => { e.preventDefault(); setIsDICOMDragActive(true); }}
              onDragOver={e => e.preventDefault()}
              onDragLeave={e => { e.preventDefault(); setIsDICOMDragActive(false); }}
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
                    ref={input => input?.setAttribute('webkitdirectory', 'true')}
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

        <Box>
          <VStack spacing={2} align="stretch">
            {pairs.map((pair, idx) => (
              <Flex key={idx} gap={2}>
                <Droppable droppableId={`pair-ref-${idx}`} type="ref">
                  {provided => (
                    <Box ref={provided.innerRef} {...provided.droppableProps} flex="1" minH="50px">
                      {pair.ref
                        ? renderCard(pair.ref, "ref", idx)
                        : <Text textAlign="center" color="gray.500" fontSize="sm">No Reference</Text>
                      }
                      {provided.placeholder}
                    </Box>
                  )}
                </Droppable>

                <Droppable droppableId={`pair-inp-${idx}`} type="inp">
                  {provided => (
                    <Box ref={provided.innerRef} {...provided.droppableProps} flex="1" minH="50px">
                      {pair.inp
                        ? renderCard(pair.inp, "inp", idx)
                        : <Box minH="50px" display="flex" alignItems="center" justifyContent="center">
                            <Text textAlign="center" color="gray.500" fontSize="sm">No Input</Text>
                          </Box>
                      }
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
