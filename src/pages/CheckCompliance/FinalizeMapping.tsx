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
  const [referenceFields, setReferenceFields] = useState<string[]>([]);

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

  // --- Schema Upload handlers ---
  const handleSchemaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    const content = await file.text();
    setReferenceFile({ name: file.name, content });
  };
  const handleSchemaDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsSchemaDragActive(true); };
  const handleSchemaDragLeave = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsSchemaDragActive(false); };
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

  // --- Load Schema (JSON or Python) ---
  useEffect(() => {
    if (!referenceFile) return;
    const loadSchema = async () => {
      setSchemaLoading(true);
      try {
        // write the file into Pyodide FS
        await writePythonFile(referenceFile.name, referenceFile.content);

        // flags for snippet
        const isJson = referenceFile.name.endsWith('.json');
        const isPy = referenceFile.name.endsWith('.py');
        await setPythonGlobal('ref_config_name', referenceFile.name);
        await setPythonGlobal('is_json', isJson);
        await setPythonGlobal('is_py', isPy);

        // snippet: load_json_session sets reference_fields; Python path builds union
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
    # union all model.reference_fields
    reference_fields = sorted({ f
        for model in ref_models.values()
        for f in model.reference_fields
    })
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
    raise RuntimeError(f"Unsupported schema: {ref_config_name}")

json.dumps({
  "acquisitions": ref_session["acquisitions"],
  "reference_fields": reference_fields
})
        `.trim();

        const out = await runPythonCode(code);
        const parsed = JSON.parse(out);
        // set both the acquisitions list and the Python global
        const { acquisitions, reference_fields: rf } = parsed;
        // expose to next steps
        setReferenceOptions(Object.entries(acquisitions).map(([name, details]) => ({ name, details })));
        setReferenceFields(rf);
        // also re‐set in Pyodide so that analyzeDICOM sees it
        await setPythonGlobal('reference_fields', rf);
      } catch (err) {
        console.error('Error loading schema:', err);
      } finally {
        setSchemaLoading(false);
      }
    };
    loadSchema();
  }, [referenceFile, runPythonCode, setPythonGlobal, writePythonFile]);

  // --- DICOM Handler / analysis ---
  const analyzeDICOMFiles = async (files: File[]) => {
    setIsDICOMUploading(true);
    try {
      const dicomFiles: Record<string, Uint8Array> = {};
      for (const file of files) {
        const buf = await file.arrayBuffer();
        dicomFiles[file.webkitRelativePath || file.name] = new Uint8Array(buf);
      }
      await setPythonGlobal('dicom_files', dicomFiles);
      await setPythonGlobal('update_progress', updateProgress);
      // ensure Python sees our chosen reference_fields
      await setPythonGlobal('reference_fields', referenceFields.length ? referenceFields : ['ProtocolName']);

      const code = `
import sys, json, asyncio
import pyodide
from dicompare.cli.gen_session import create_json_reference
from dicompare import async_load_dicom_session, assign_acquisition_and_run_numbers

if isinstance(reference_fields, pyodide.ffi.JsProxy):
    reference_fields = reference_fields.to_py()

global in_session
in_session = await async_load_dicom_session(dicom_bytes=dicom_files.to_py(), progress_function=update_progress)
missing = [f for f in reference_fields if f not in in_session.columns]
if missing:
    raise ValueError(f"Input session is missing required reference fields: {missing}")

in_session = assign_acquisition_and_run_numbers(in_session)
in_session.sort_values(by=['Acquisition'] + reference_fields, inplace=True)

input_acquisitions = create_json_reference(in_session, reference_fields)
json.dumps(input_acquisitions['acquisitions'])
      `.trim();

      const out = await runPythonCode(code);
      const parsed = JSON.parse(out);
      setInputOptions(Object.entries(parsed).map(([name, details]) => ({ name, details })));
    } catch (error) {
      console.error('Error loading input acquisitions:', error);
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

  // --- Pairing & compliance (unchanged) ---
  useEffect(() => {
    const n = Math.max(referenceOptions.length, inputOptions.length);
    setPairs(Array.from({ length: n }, (_, i) => ({
      ref: referenceOptions[i] || null,
      inp: inputOptions[i] || null
    })));
  }, [referenceOptions, inputOptions]);

  useEffect(() => {
    const map: Record<string, string> = {};
    pairs.forEach(p => {
      if (p.ref && p.inp) map[p.ref.name] = p.inp.name;
    });
    setPythonGlobal('session_map', JSON.stringify(map)).catch(console.error);
  }, [pairs, setPythonGlobal]);

  // --- Compliance analysis (attach rule_name for .py) ---
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
  # attach rule_name so React can key by it
  for rec in summary:
    ref_acq = rec.get("reference acquisition")
    for funcs in ref_models[ref_acq]._field_validators.values():
      for func in funcs:
        if ", ".join(func._field_names) == rec.get("field"):
          rec["rule_name"] = func._rule_name
          break

json.dumps(summary)
      `.trim();

      const raw = await runPythonCode(code);
      setComplianceReport(raw);
      const results: any[] = JSON.parse(raw);

      // build base field map
      const cmap: Record<string, FieldCompliance> = {};
      const overall: Record<string, { status: 'ok' | 'error'; message: string }> = {};
      results.forEach(item => {
        const refA = item['reference acquisition'];
        if (refA) {
          overall[refA] ||= { status: 'ok', message: 'Passed.' };
          if (!item.passed) overall[refA] = { status: 'error', message: item.message || '' };
        }
        const key = item.rule_name || item.field;
        cmap[key] = { status: item.passed ? 'ok' : 'error', message: item.message };
      });

      // add series‑specific entries under a unique key
      const seriesMap: Record<string, FieldCompliance> = {};
      results.forEach(item => {
        if (item.series) {
          const seriesKey = `${item['reference acquisition']}|${item.series}|${item.field}`;
          seriesMap[seriesKey] = {
            status: item.passed ? 'ok' : 'error',
            message: item.message
          };
        }
      });

      setComplianceMap({ ...cmap, ...seriesMap });
      setOverallCompliance(overall);
    } catch (err) {
      console.error('Compliance error:', err);
    }
  };

  useEffect(() => {
    if (pairs.length) analyzeCompliance();
  }, [pairs]);

  // --- Renderers ---
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
    const expanded = (type === 'ref'
      ? expandedReferences[acq.name]
      : expandedInputs[acq.name]) || false;
    const toggle = () => {
      if (type === 'ref') {
        setExpandedReferences(prev => ({ ...prev, [acq.name]: !prev[acq.name] }));
      } else {
        setExpandedInputs(prev => ({ ...prev, [acq.name]: !prev[acq.name] }));
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
                  ? renderRulesTable(acq.details.rules)
                  : (
                    <>
                      {acq.details.fields && renderFieldsTable(acq.details.fields, type)}
                      {acq.details.series && renderSeriesTable(acq.details.series, type, acq.name)}
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
  // --- 8. Render Series Table with Compliance Icons ---
  const renderSeriesTable = (
    seriesArr: Array<{
      name: string;
      fields: Array<{ field: string; value?: any; tolerance?: number; contains?: any }>;
    }>,
    cardType: 'ref' | 'inp',
    acqName: string
  ) => {
    if (!seriesArr.length) return null;

    // gather all field names
    const allFieldNames = Array.from(
      seriesArr.reduce((set, s) => {
        s.fields.forEach(f => set.add(f.field));
        return set;
      }, new Set<string>())
    );

    return (
      <Box>
        <Box as="table" width="100%" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ padding: '4px' }}>Series</th>
              {allFieldNames.map(fn => (
                <th key={fn} style={{ padding: '4px' }}>{fn}</th>
              ))}
              {cardType === 'ref' && (
                <th style={{ padding: '4px', textAlign: 'center' }}>Compliance</th>
              )}
            </tr>
          </thead>
          <tbody>
            {seriesArr.map((s, idx) => {
              const composite = s.fields.map(f => f.field).join(', ');
              const seriesKey = `${acqName}|${s.name}|${composite}`;
              const comp = complianceMap[seriesKey];

              return (
                <tr key={idx}>
                  <td style={{ padding: '4px' }}>{s.name}</td>
                  {allFieldNames.map(fn => {
                    const fld = s.fields.find(f => f.field === fn);
                    const val = fld?.value ?? fld?.contains ?? '';
                    const tol = fld?.tolerance != null ? ` (tol: ${fld.tolerance})` : '';
                    return (
                      <td key={fn} style={{ padding: '4px', textAlign: 'right' }}>
                        {String(val) + tol}
                      </td>
                    );
                  })}
                  {cardType === 'ref' && (
                    <td style={{ padding: '4px', textAlign: 'center' }}>
                      {comp ? (
                        comp.status === 'ok' ? (
                          <Tooltip label="OK">
                            <CheckCircleIcon color="green.500" />
                          </Tooltip>
                        ) : (
                          <Tooltip label={comp.message}>
                            <WarningIcon color="red.500" />
                          </Tooltip>
                        )
                      ) : null}
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
    const [_, srcType, srcIdx] = source.droppableId.split('-');
    const [__, dstType, dstIdx] = destination.droppableId.split('-');
    const si = +srcIdx, di = +dstIdx;
    setPairs(prev => {
      const next = [...prev];
      if (srcType === 'ref' && dstType === 'ref') {
        [next[si].ref, next[di].ref] = [next[di].ref, next[si].ref];
      } else if (srcType === 'inp' && dstType === 'inp') {
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
