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
    setIsNextEnabled(referenceOptions.length > 0 && inputOptions.length > 0);
  }, [referenceOptions, inputOptions, setIsNextEnabled, isActive]);

  const updateProgress = useCallback((p: number) => {
    setDICOMProgress(p);
  }, []);

  // --- Schema Upload Handlers ---
  const handleSchemaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    const content = await file.text();
    setReferenceFile({ name: file.name, content });
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
    if (item.kind !== 'file') return;
    const file = item.getAsFile();
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const txt = ev.target?.result;
      if (typeof txt === 'string') setReferenceFile({ name: file.name, content: txt });
    };
    reader.readAsText(file);
  };

  // --- Load Schema Acquisitions (JSON or .py) ---
  useEffect(() => {
    if (!referenceFile) return;

    const loadSchema = async () => {
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
    # build a simple rules-only view
    ref_session = {
      "acquisitions": {
        acq_name: {
          "rules": [
            {"name": func._rule_name, "message": func._rule_message}
            for funcs in ref_models[acq_name]._field_validators.values()
            for func in funcs
          ] + [
            {"name": mv.__name__, "message": mv._rule_message}
            for mv in getattr(ref_models[acq_name], "_model_validators", [])
          ]
        }
        for acq_name in ref_models.keys()
      }
    }

else:
    raise RuntimeError(f"Unsupported schema: {referenceFile.name}")

json.dumps(ref_session["acquisitions"])
        `.trim();

        const result = await runPythonCode(code);
        const parsed = JSON.parse(result);
        const refs = Object.entries(parsed).map(([name, details]) => ({ name, details }));
        setReferenceOptions(refs);
      } catch (err) {
        console.error('Error loading schema:', err);
      } finally {
        setSchemaLoading(false);
      }
    };

    loadSchema();
  }, [referenceFile, runPythonCode, setPythonGlobal, writePythonFile]);

  // --- Input DICOM Handlers & Analysis (unchanged) ---
  const analyzeDICOMFiles = async (files: File[]) => {
    setIsDICOMUploading(true);
    try {
      const dicomBytes: Record<string, Uint8Array> = {};
      for (const file of files) {
        const buf = await file.arrayBuffer();
        dicomBytes[file.webkitRelativePath || file.name] = new Uint8Array(buf);
      }
      await setPythonGlobal('dicom_files', dicomBytes);
      await setPythonGlobal('update_progress', updateProgress);

      const code = `
import sys, json, asyncio
from dicompare.cli.gen_session import create_json_reference
from dicompare import async_load_dicom_session, assign_acquisition_and_run_numbers

acquisition_fields = ["ProtocolName"]
in_session = await async_load_dicom_session(dicom_bytes=dicom_files.to_py(), progress_function=update_progress)
in_session = assign_acquisition_and_run_numbers(in_session)
in_session.sort_values(by=["Acquisition"] + acquisition_fields, inplace=True)

missing = [f for f in acquisition_fields if f not in in_session.columns]
if missing:
    raise ValueError(f"Missing ref fields: {missing}")

input_acq = create_json_reference(in_session, acquisition_fields)
json.dumps(input_acq["acquisitions"])
      `.trim();

      const res = await runPythonCode(code);
      const parsed = JSON.parse(res);
      setInputOptions(Object.entries(parsed).map(([name, details]) => ({ name, details })));
    } catch (err) {
      console.error('Error loading DICOM session:', err);
    } finally {
      setIsDICOMUploading(false);
    }
  };

  const handleInputDICOMUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    setInputDICOMFiles(files);
    await analyzeDICOMFiles(files);
  };

  const handleInputDICOMDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDICOMDragActive(true);
    const items = e.dataTransfer.items;
    const files: File[] = [];
    const traverse = (entry: any, path = ''): Promise<void> =>
      new Promise(resolve => {
        if (entry.isFile) {
          entry.file((f: File) => {
            const newFile = f.webkitRelativePath
              ? f
              : new File([f], f.name, { type: f.type, lastModified: f.lastModified });
            Object.defineProperty(newFile, 'webkitRelativePath', {
              value: path + f.name,
              writable: false
            });
            files.push(newFile);
            resolve();
          });
        } else if (entry.isDirectory) {
          const reader = entry.createReader();
          reader.readEntries(entries =>
            Promise.all(entries.map(en => traverse(en, path + entry.name + '/'))).then(resolve)
          );
        }
      });

    await Promise.all(
      Array.from({ length: items.length }, (_, i) => {
        const entry = items[i].webkitGetAsEntry();
        return entry ? traverse(entry) : Promise.resolve();
      })
    );

    setIsDICOMDragActive(false);
    if (files.length) {
      setInputDICOMFiles(files);
      await analyzeDICOMFiles(files);
    }
  };

  // --- Pairing logic ---
  useEffect(() => {
    const count = Math.max(referenceOptions.length, inputOptions.length);
    setPairs(Array.from({ length: count }, (_, i) => ({
      ref: referenceOptions[i] || null,
      inp: inputOptions[i] || null
    })));
  }, [referenceOptions, inputOptions]);

  // --- Sync session_map to Python ---
  useEffect(() => {
    const mapping: Record<string, string> = {};
    pairs.forEach(p => {
      if (p.ref && p.inp) mapping[p.ref.name] = p.inp.name;
    });
    setPythonGlobal('session_map', JSON.stringify(mapping)).catch(console.error);
  }, [pairs, setPythonGlobal]);

  // --- Compliance analysis ---
  const analyzeCompliance = async () => {
    try {
      const code = `
import json, pyodide
from dicompare.compliance import (
  check_session_compliance_with_json_reference,
  check_session_compliance_with_python_module
)

sm = session_map
if isinstance(sm, str):
  sm = json.loads(sm)
elif isinstance(sm, pyodide.ffi.JsProxy):
  sm = sm.to_py()

if is_json:
  summary = check_session_compliance_with_json_reference(
    in_session=in_session,
    ref_session=ref_session,
    session_map=sm
  )
else:
  summary = check_session_compliance_with_python_module(
    in_session=in_session,
    ref_models=ref_models,
    session_map=sm
  )

json.dumps(summary)
      `.trim();

      const raw = await runPythonCode(code);
      setComplianceReport(raw);
      const results: any[] = JSON.parse(raw);

      const cmap: Record<string, FieldCompliance> = {};
      const overall: Record<string, { status: 'ok' | 'error'; message: string }> = {};

      results.forEach(item => {
        const refA = item['reference acquisition'];
        if (refA) {
          overall[refA] ||= { status: 'ok', message: 'Passed.' };
          if (!item.passed) overall[refA] = { status: 'error', message: item.message || '' };
        }
        if (item.field) {
          cmap[item.field] = {
            status: item.passed ? 'ok' : 'error',
            message: item.message
          };
        }
      });

      setComplianceMap(cmap);
      setOverallCompliance(overall);
    } catch (err) {
      console.error('Compliance error:', err);
    }
  };

  useEffect(() => {
    if (pairs.length) analyzeCompliance();
  }, [pairs]);

  // --- Render helpers ---
  const renderRulesTable = (rules: Array<{ name: string; message: string }>) => (
    <Box width="100%" mb={4}>
      <Text fontWeight="medium" mb={2}>Validation Rules</Text>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ padding: '4px', textAlign: 'left' }}>Rule Name</th>
            <th style={{ padding: '4px', textAlign: 'left' }}>Description</th>
            <th style={{ padding: '4px', textAlign: 'center' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rules.map(({ name, message }) => {
            const comp = complianceMap[name] || { status: 'warning', message: '' };
            const icon = comp.status === 'ok'
              ? <CheckCircleIcon color="green.500" />
              : <WarningIcon color="red.500" />;
            return (
              <tr key={name}>
                <td style={{ padding: '4px' }}>{name}</td>
                <td style={{ padding: '4px' }}>{message}</td>
                <td style={{ padding: '4px', textAlign: 'center' }}>
                  <Tooltip label={comp.message || undefined}>{icon}</Tooltip>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Box>
  );

  const renderCard = (acq: Acquisition, type: 'ref' | 'inp', idx: number) => {
    const expanded = type === 'ref'
      ? expandedReferences[acq.name]
      : expandedInputs[acq.name];
    const toggle = () => {
      if (type === 'ref') {
        setExpandedReferences(prev => ({ ...prev, [acq.name]: !prev[acq.name] }));
      } else {
        setExpandedInputs(prev => ({ ...prev, [acq.name]: !prev[acq.name] }));
      }
    };

    const overallIcon = type === 'ref' && overallCompliance[acq.name]
      ? overallCompliance[acq.name].status === 'ok'
        ? <Tooltip label="Fully compliant"><CheckCircleIcon ml={2} color="green.500"/></Tooltip>
        : <Tooltip label={overallCompliance[acq.name].message}><WarningIcon ml={2} color="red.500"/></Tooltip>
      : null;

    return (
      <Draggable draggableId={`${type}-${acq.name}-${idx}`} index={idx} key={acq.name + idx}>
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
                  ? renderRulesTable(acq.details.rules)
                  : (
                    <>
                      {acq.details.fields && renderFieldsTable(acq.details.fields, type)}
                      {acq.details.series && renderSeriesTable(acq.details.series, type)}
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

  const handleDragEnd = (result: DropResult) => {
    const { source, destination } = result;
    if (!destination) return;
    const s = source.droppableId.split('-'), d = destination.droppableId.split('-');
    const si = +s[2], di = +d[2];
    setPairs(prev => {
      const next = [...prev];
      if (s[1] === 'ref' && d[1] === 'ref') {
        [next[si].ref, next[di].ref] = [next[di].ref, next[si].ref];
      } else if (s[1] === 'inp' && d[1] === 'inp') {
        [next[si].inp, next[di].inp] = [next[di].inp, next[si].inp];
      }
      return next;
    });
  };

  const handleDownloadReport = () => {
    try {
      const obj = JSON.parse(complianceReport);
      const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'compliance_report.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      console.error('Failed to download report');
    }
  };

  // --- JSX ---
  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Box p={4}>
        <Text mb={4} color="gray.700">
          Select a template schema and a DICOM session to verify compliance.
        </Text>

        {complianceReport && (
          <Button mb={4} colorScheme="teal" onClick={handleDownloadReport}>
            Download Compliance Report
          </Button>
        )}

        <Flex gap={8} mb={8}>
          {/* Schema upload */}
          <Box flex="1">
            <Text mb={4} fontWeight="medium" color="teal.600">
              Schema Template
            </Text>
            <Box
              p={4}
              mb={6}
              borderWidth="1px"
              borderRadius="md"
              bg={isSchemaDragActive ? 'gray.200' : 'gray.50'}
              textAlign="center"
              onDragEnter={handleSchemaDragOver}
              onDragOver={e => e.preventDefault()}
              onDragLeave={handleSchemaDragLeave}
              onDrop={handleSchemaDrop}
            >
              {schemaLoading ? (
                <>
                  <Spinner size="lg" color="teal.500" />
                  <Text mt={2}>Loading schema…</Text>
                </>
              ) : (
                <>
                  <Text mb={2}>Drag & drop .json or .py schema here</Text>
                  <input
                    type="file"
                    accept=".json,.py"
                    style={{ display: 'none' }}
                    id="schema-upload"
                    onChange={handleSchemaUpload}
                  />
                  <Button as="label" htmlFor="schema-upload" colorScheme="teal">
                    Upload Schema
                  </Button>
                  {referenceFile && (
                    <Text mt={2} fontSize="sm" color="gray.600">
                      Loaded: {referenceFile.name}
                    </Text>
                  )}
                </>
              )}
            </Box>
          </Box>

          {/* DICOM upload */}
          <Box flex="1">
            <Text mb={4} fontWeight="medium" color="teal.600">
              DICOM Files
            </Text>
            <Box
              p={4}
              mb={6}
              borderWidth="1px"
              borderRadius="md"
              bg={isDICOMDragActive ? 'gray.200' : 'gray.50'}
              textAlign="center"
              onDragEnter={e => { e.preventDefault(); setIsDICOMDragActive(true); }}
              onDragOver={e => e.preventDefault()}
              onDragLeave={e => { e.preventDefault(); setIsDICOMDragActive(false); }}
              onDrop={handleInputDICOMDrop}
            >
              {isDICOMUploading ? (
                <>
                  <Spinner size="lg" color="teal.500" />
                  <Text mt={2}>Processing DICOMs…</Text>
                  <Progress mt={2} size="sm" value={dicomProgress} />
                </>
              ) : (
                <>
                  <Text mb={2}>Drag & drop DICOM folder or files</Text>
                  <input
                    type="file"
                    multiple
                    style={{ display: 'none' }}
                    id="dicom-upload"
                    onChange={handleInputDICOMUpload}
                    ref={el => el?.setAttribute('webkitdirectory', 'true')}
                  />
                  <Button as="label" htmlFor="dicom-upload" colorScheme="teal">
                    Upload DICOMs
                  </Button>
                  {inputDICOMFiles.length > 0 && (
                    <Text mt={2} fontSize="sm" color="gray.600">
                      {inputDICOMFiles.length} files
                    </Text>
                  )}
                </>
              )}
            </Box>
          </Box>
        </Flex>

        {/* Pairing area */}
        <VStack spacing={2} align="stretch">
          {pairs.map((pair, idx) => (
            <Flex key={idx} gap={2}>
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
            </Flex>
          ))}
        </VStack>
      </Box>
    </DragDropContext>
  );
};

export default FinalizeMapping;
