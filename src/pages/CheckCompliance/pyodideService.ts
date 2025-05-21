// pyodideService.ts
import { usePyodide } from '../../components/PyodideContext';

export const loadSchema = async (
  pyodide: ReturnType<typeof usePyodide>,
  schemaFile: { name: string; content: string }
) => {
  const { runPythonCode, setPythonGlobal, writePythonFile } = pyodide;
  
  // Write the file into Pyodide FS
  await writePythonFile(schemaFile.name, schemaFile.content);

  // Set flags for snippet
  const isJson = schemaFile.name.endsWith('.json');
  const isPy = schemaFile.name.endsWith('.py');
  await setPythonGlobal('ref_config_name', schemaFile.name);
  await setPythonGlobal('is_json', isJson);
  await setPythonGlobal('is_py', isPy);

  // Python code to load schema
  const code = `
import sys, json
sys.path.append('.')
global ref_session, reference_fields, ref_models
ref_session = None
reference_fields = []

from dicompare.io import load_json_session, load_python_session

if is_json:
    print(f"Loading JSON file: {ref_config_name}")
    reference_fields, ref_session = load_json_session(json_ref=ref_config_name)

elif is_py:
    print(f"Loading Python module: {ref_config_name}")
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
            {"rule_name": func._rule_name, "message": func._rule_message}
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
    print(f"Unsupported schema: {ref_config_name}")
    raise RuntimeError(f"Unsupported schema: {ref_config_name}")

json.dumps({
  "acquisitions": ref_session["acquisitions"],
  "reference_fields": reference_fields
})
  `.trim();

  const out = await runPythonCode(code);
  return JSON.parse(out);
};

export const analyzeDicomFiles = async (
  pyodide: ReturnType<typeof usePyodide>,
  files: File[],
  referenceFields: string[],
  updateProgress: (p: number) => void
) => {
  const { runPythonCode, setPythonGlobal } = pyodide;
  
  const dicomFiles: Record<string, Uint8Array> = {};
  for (const file of files) {
    const buf = await file.slice(0, 8192).arrayBuffer();
    dicomFiles[file.webkitRelativePath || file.name] = new Uint8Array(buf);
  }
  
  await setPythonGlobal('dicom_files', dicomFiles);
  await setPythonGlobal('update_progress', updateProgress);
  await setPythonGlobal('reference_fields', referenceFields.length ? referenceFields : ['ProtocolName']);

  const code = `
import sys, json, asyncio
import pyodide
from dicompare.cli.gen_session import create_json_reference
from dicompare import async_load_dicom_session, assign_acquisition_and_run_numbers

if isinstance(reference_fields, pyodide.ffi.JsProxy):
    reference_fields = reference_fields.to_py()

global in_session
print("Loading DICOM files...")
try:
  in_session = await async_load_dicom_session(dicom_bytes=dicom_files.to_py(), progress_function=update_progress)
except Exception as e:
  import traceback
  traceback.print_exc()
  print(f"Failed to load DICOM files: {e}")
  raise RuntimeError(f"Failed to load DICOM files: {e}")

missing = [f for f in reference_fields if f not in in_session.columns]
if missing:
    raise ValueError(f"Input session is missing required reference fields: {missing}")

print("Assigning acquisition numbers...")
try:
  in_session = assign_acquisition_and_run_numbers(in_session)
except Exception as e:
  import traceback
  traceback.print_exc()
  print(f"Failed to assign acquisition numbers: {e}")
  raise RuntimeError(f"Failed to assign acquisition numbers: {e}")

print("Sorting acquisitions...")
in_session.sort_values(by=['Acquisition'] + reference_fields, inplace=True)

print("Creating JSON reference...")
try:
  input_acquisitions = create_json_reference(in_session, reference_fields)
except Exception as e:
  import traceback
  traceback.print_exc()
  print(f"Failed to create JSON reference: {e}")
  raise RuntimeError(f"Failed to create JSON reference: {e}")

json.dumps(input_acquisitions['acquisitions'])
  `.trim();

  const out = await runPythonCode(code);
  return JSON.parse(out);
};

export const processExistingSession = async (
  pyodide: ReturnType<typeof usePyodide>,
  referenceFields: string[]
) => {
  const { runPythonCode, setPythonGlobal } = pyodide;
  
  await setPythonGlobal('reference_fields', referenceFields);

  const code = `
import json
from dicompare.cli.gen_session import create_json_reference
from dicompare import assign_acquisition_and_run_numbers

# convert the JS proxy to a Python list
if isinstance(reference_fields, pyodide.ffi.JsProxy):
    reference_fields = reference_fields.to_py()

# reuse the already-loaded in_session global
in_session = assign_acquisition_and_run_numbers(in_session)
in_session.sort_values(by=['Acquisition'] + reference_fields, inplace=True)

acqs = create_json_reference(in_session, reference_fields)['acquisitions']
json.dumps(acqs)
  `.trim();

  const out = await runPythonCode(code);
  return JSON.parse(out);
};

export const analyzeCompliance = async (
  pyodide: ReturnType<typeof usePyodide>,
  pairs: Pair[]
) => {
  const { runPythonCode, setPythonGlobal } = pyodide;
  
  const map: Record<string, string> = {};
  pairs.forEach(p => {
    if (p.ref && p.inp) map[p.ref.name] = p.inp.name;
  });
  
  await setPythonGlobal('session_map', JSON.stringify(map));

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

# check globals for is_json
if 'is_json' not in globals():
  global is_json
  is_json = False

if 'is_py' not in globals():
  global is_py
  is_py = False

if 'in_session' not in globals():
  global in_session
  in_session = None

if in_session is not None and (is_json or is_py):
  if is_json:
    print("Checking compliance with JSON reference...")
    summary = check_session_compliance_with_json_reference(
      in_session=in_session,
      ref_session=ref_session,
      session_map=sm
    )
  elif is_py:
    print("Checking compliance with Python module...")
    summary = check_session_compliance_with_python_module(
      in_session=in_session,
      ref_models=ref_models,
      session_map=sm
    )
else:
  summary = []

json.dumps(summary)
  `.trim();

  const raw = await runPythonCode(code);
  return JSON.parse(raw);
};
