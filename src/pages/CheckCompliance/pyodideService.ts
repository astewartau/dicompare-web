// pyodideService.ts
import { usePyodide } from '../../components/PyodideContext';
import { Pair } from './types';

export const loadSchema = async (
  pyodide: ReturnType<typeof usePyodide>,
  schemaFile: { name: string; content: string },
  acquisitionName?: string,
  instanceId?: string // Add instanceId parameter
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
  await setPythonGlobal('instance_id', instanceId); // Pass the instance ID
  await setPythonGlobal('specific_acquisition', acquisitionName || null); // Pass the specific acquisition name

  // Python code to load schema
  const code = `
import sys, json
sys.path.append('.')

# Use instance-specific global variables
instance_key = f"ref_session_{instance_id}"
instance_fields_key = f"reference_fields_{instance_id}"
instance_models_key = f"ref_models_{instance_id}"

# Initialize global dictionaries if they don't exist
if 'schema_instances' not in globals():
    global schema_instances
    schema_instances = {}

# Store the instance ID for later reference
schema_instances[instance_id] = {
    'file_name': ref_config_name,
    'is_json': is_json,
    'is_py': is_py
}

from dicompare.io import load_json_session, load_python_session

reference_fields = []
ref_session = None
ref_models = None

if is_json:
    print(f"Loading JSON file: {ref_config_name} (instance {instance_id})")
    reference_fields, ref_session = load_json_session(json_ref=ref_config_name)
    # Store in globals with instance-specific keys
    globals()[instance_fields_key] = reference_fields
    globals()[instance_key] = ref_session

elif is_py:
    print(f"Loading Python module: {ref_config_name} (instance {instance_id})")
    ref_models = load_python_session(module_path=ref_config_name)
    # union all model.reference_fields
    reference_fields = sorted({ f
        for model in ref_models.values()
        for f in model.reference_fields
    })
    # Store in globals with instance-specific keys
    globals()[instance_fields_key] = reference_fields
    globals()[instance_models_key] = ref_models
    
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

# Filter acquisitions if specific_acquisition is provided
if specific_acquisition:
    filtered_acquisitions = {
        specific_acquisition: ref_session["acquisitions"][specific_acquisition]
    } if specific_acquisition in ref_session["acquisitions"] else {}
else:
    filtered_acquisitions = ref_session["acquisitions"]

json.dumps({
  "acquisitions": filtered_acquisitions,
  "reference_fields": reference_fields,
  "instance_id": instance_id
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
    // Read the full file for pixel data access
    const buf = await file.arrayBuffer();
    dicomFiles[file.webkitRelativePath || file.name] = new Uint8Array(buf);
  }

  // Define the default fields for DICOM acquisitions (same as EditTemplate.tsx)
  const defaultDicomFields = [
    // Core Identifiers
    "SeriesDescription",
    "SequenceName",
    "SequenceVariant",
    "ScanningSequence",
    "ImageType",

    "Manufacturer",
    "ManufacturerModelName",
    "SoftwareVersion",
  
    // Geometry
    "MRAcquisitionType",
    "SliceThickness",
    "PixelSpacing",
    "Rows",
    "Columns",
    "Slices",
    "AcquisitionMatrix",
    "ReconstructionDiameter",
  
    // Timing / Contrast
    "RepetitionTime",
    "EchoTime",
    "InversionTime",
    "FlipAngle",
    "EchoTrainLength",
    "GradientEchoTrainLength",
    "NumberOfTemporalPositions",
    "TemporalResolution",
    "SliceTiming",
  
    // Diffusion-specific
    "DiffusionBValue",
    "DiffusionGradientDirectionSequence",
  
    // Parallel Imaging / Multiband
    "ParallelAcquisitionTechnique",
    "ParallelReductionFactorInPlane",
    "PartialFourier",
    "SliceAccelerationFactor",
  
    // Bandwidth / Readout
    "PixelBandwidth",
    "BandwidthPerPixelPhaseEncode",
  
    // Phase encoding
    "InPlanePhaseEncodingDirection",
    "PhaseEncodingDirectionPositive",
    "NumberOfPhaseEncodingSteps",
  
    // Scanner hardware
    "MagneticFieldStrength",
    "ImagingFrequency",
    "ImagedNucleus",
    "TransmitCoilName",
    "ReceiveCoilName",
    "SAR",
    "NumberOfAverages",
    "CoilType",
  
    // Coverage / FOV %
    "PercentSampling",
    "PercentPhaseFieldOfView",
  
    // Scan options
    "ScanOptions",
    "AngioFlag",
  
    // Triggering / gating (mostly fMRI / cardiac)
    "TriggerTime",
    "TriggerSourceOrType",
    "BeatRejectionFlag",
    "LowRRValue",
    "HighRRValue",
  
    // Advanced / niche
    "SpoilingRFPhaseAngle",
    "PerfusionTechnique",
    "SpectrallySelectedExcitation",
    "SaturationRecovery",
    "SpectrallySelectedSuppression",
    "TimeOfFlightContrast",
    "SteadyStatePulseSequence",
    "PartialFourierDirection",
  ];

  await setPythonGlobal('dicom_files', dicomFiles);
  await setPythonGlobal('update_progress', updateProgress);
  await setPythonGlobal('reference_fields', referenceFields.length ? referenceFields : defaultDicomFields);

  const code = `
import sys, json, asyncio
import pyodide
# Force reload the io module to pick up our changes
import dicompare.io
import importlib
importlib.reload(dicompare.io)

from dicompare.cli.gen_session import create_json_reference
from dicompare import async_load_dicom_session, assign_acquisition_and_run_numbers

if isinstance(reference_fields, pyodide.ffi.JsProxy):
    reference_fields = reference_fields.to_py()

global in_session
try:
  dicom_bytes = dicom_files.to_py() if isinstance(dicom_files, pyodide.ffi.JsProxy) else dicom_files
  print(f"Loading {len(dicom_bytes)} DICOM files...")
  in_session = await async_load_dicom_session(dicom_bytes=dicom_files.to_py(), progress_function=update_progress)
except Exception as e:
  import traceback
  traceback.print_exc()
  print(f"Failed to load DICOM files: {e}")
  raise RuntimeError(f"Failed to load DICOM files: {e}")

# Filter reference_fields to only include fields that exist in the session
available_fields = [f for f in reference_fields if f in in_session.columns]
if not available_fields:
    # If no fields from reference_fields are available, fall back to basic fields
    basic_fields = ['ProtocolName', 'SeriesDescription', 'Manufacturer']
    available_fields = [f for f in basic_fields if f in in_session.columns]
    if not available_fields:
        raise ValueError("No suitable reference fields found in the input session")

print(f"Using available fields: {available_fields}")
reference_fields = available_fields
print(f"DEBUG: Final reference_fields that will be used: {reference_fields}")

# check if '(0051,100F)' field is in in_session
if '(0051,100F)' in in_session.columns:
    print("Found (0051,100F) field in input session")
else:
    print("Did not find (0051,100F) field in input session")

print("Assigning acquisition numbers...")
print(f"DEBUG: Before assign_acquisition_and_run_numbers:")
print(f"  - Session shape: {in_session.shape}")
print(f"  - ProtocolName values: {in_session['ProtocolName'].unique() if 'ProtocolName' in in_session.columns else 'N/A'}")
print(f"  - SeriesDescription values: {in_session['SeriesDescription'].unique() if 'SeriesDescription' in in_session.columns else 'N/A'}")
print(f"  - ImageType values: {in_session['ImageType'].unique() if 'ImageType' in in_session.columns else 'N/A'}")
print(f"  - EchoTime values: {sorted(in_session['EchoTime'].unique()) if 'EchoTime' in in_session.columns else 'N/A'}")
print(f"  - SeriesInstanceUID values: {len(in_session['SeriesInstanceUID'].unique()) if 'SeriesInstanceUID' in in_session.columns else 'N/A'} unique")

try:
  in_session = assign_acquisition_and_run_numbers(in_session)
except Exception as e:
  import traceback
  traceback.print_exc()
  print(f"Failed to assign acquisition numbers: {e}")
  raise RuntimeError(f"Failed to assign acquisition numbers: {e}")

print(f"DEBUG: After assign_acquisition_and_run_numbers:")
print(f"  - Session shape: {in_session.shape}")
print(f"  - Column names: {list(in_session.columns)}")
if 'SettingsNumber' in in_session.columns:
  print(f"  - SettingsNumber values: {in_session['SettingsNumber'].unique()}")
  print(f"  - SettingsNumber per ProtocolName:")
  for pname, group in in_session.groupby('ProtocolName'):
    settings_vals = group['SettingsNumber'].unique()
    print(f"    {pname}: {settings_vals}")
    if len(settings_vals) > 1:
      print(f"      DEBUG: Found multiple settings for {pname}, checking what differs...")
      # Show what fields differ between settings
      for field in reference_fields:
        if field in group.columns:
          unique_by_setting = {}
          for setting_num in settings_vals:
            setting_group = group[group['SettingsNumber'] == setting_num]
            unique_vals = setting_group[field].dropna().unique()
            unique_by_setting[setting_num] = unique_vals
          print(f"        {field}: {unique_by_setting}")
else:
  print("  - SettingsNumber column not found!")
  print(f"  - Available columns: {[col for col in in_session.columns if 'setting' in col.lower() or 'acquisition' in col.lower()]}")

print("Sorting acquisitions...")
in_session.sort_values(by=['Acquisition'] + reference_fields, inplace=True)

# print unique Acquisition values
print(f"Unique Acquisition values: {in_session['Acquisition'].unique()}")

# print number of rows per acquisition
print(f"Number of rows per acquisition: {in_session['Acquisition'].value_counts()}")

def clean_for_json(obj):
    """Recursively clean an object to make it JSON serializable"""
    import numpy as np
    import pandas as pd
    
    if isinstance(obj, dict):
        return {k: clean_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_for_json(item) for item in obj]
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif pd.isna(obj) or obj is None:
        return None
    elif isinstance(obj, (np.integer, np.floating)):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return obj.item()
    elif isinstance(obj, float):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return obj
    else:
        return obj

print("Creating JSON reference...")
print(f"DEBUG: Before create_json_reference - CoilType in columns: {'CoilType' in in_session.columns}")
if 'CoilType' in in_session.columns:
  print(f"DEBUG: CoilType values: {in_session['CoilType'].unique()}")
print(f"DEBUG: reference_fields passed to create_json_reference: {reference_fields}")
try:
  input_acquisitions = create_json_reference(in_session, reference_fields)
  # Clean the data before JSON serialization
  clean_acquisitions = clean_for_json(input_acquisitions['acquisitions'])
except Exception as e:
  import traceback
  traceback.print_exc()
  print(f"Failed to create JSON reference: {e}")
  raise RuntimeError(f"Failed to create JSON reference: {e}")

json.dumps(clean_acquisitions)
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

def clean_for_json(obj):
    """Recursively clean an object to make it JSON serializable"""
    import numpy as np
    import pandas as pd
    
    if isinstance(obj, dict):
        return {k: clean_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_for_json(item) for item in obj]
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif pd.isna(obj) or obj is None:
        return None
    elif isinstance(obj, (np.integer, np.floating)):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return obj.item()
    elif isinstance(obj, float):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return obj
    else:
        return obj

# reuse the already-loaded in_session global
in_session = assign_acquisition_and_run_numbers(in_session)
in_session.sort_values(by=['Acquisition'] + reference_fields, inplace=True)

acqs = create_json_reference(in_session, reference_fields)['acquisitions']
clean_acqs = clean_for_json(acqs)
json.dumps(clean_acqs)
  `.trim();

  const out = await runPythonCode(code);
  return JSON.parse(out);
};

export const analyzeCompliance = async (
  pyodide: ReturnType<typeof usePyodide>,
  pairs: Pair[]
) => {
  const { runPythonCode, setPythonGlobal } = pyodide;
  
  // Group pairs by schema instance ID
  const pairsByInstance: Record<string, Pair[]> = {};
  
  pairs.forEach(p => {
    if (p.ref && p.inp) {
      const instanceId = p.ref.id;
      if (instanceId && !pairsByInstance[instanceId]) {
        pairsByInstance[instanceId] = [];
      }
      if (instanceId) {
        pairsByInstance[instanceId].push(p);
      }
    }
  });
  
  // Create maps for each instance
  const instanceMaps: Record<string, { json: Record<string, string>, py: Record<string, string> }> = {};
  
  Object.entries(pairsByInstance).forEach(([instanceId, instancePairs]) => {
    const jsonMap: Record<string, string> = {};
    const pyMap: Record<string, string> = {};
    
    instancePairs.forEach(p => {
      if (p.ref && p.inp) {
        // Use the instance ID in the key
        const refKey = `${p.ref.name}#${instanceId}`;
        
        // Determine if this is a Python or JSON schema by checking for rules
        if (p.ref.details.rules) {
          pyMap[refKey] = p.inp.name;
        } else {
          jsonMap[refKey] = p.inp.name;
        }
      }
    });
    
    instanceMaps[instanceId] = { json: jsonMap, py: pyMap };
  });
  
  await setPythonGlobal('instance_maps', instanceMaps);

  const code = `
import json, pyodide
from dicompare.compliance import (
  check_session_compliance_with_json_reference,
  check_session_compliance_with_python_module
)

# Convert JS maps to Python
instance_maps = instance_maps.to_py() if isinstance(instance_maps, pyodide.ffi.JsProxy) else instance_maps

all_results = []

# Check if we have the necessary globals and input session
if 'in_session' not in globals() or in_session is None:
  print("No input session available")
else:
  # Process each instance separately
  for instance_id, maps in instance_maps.items():
    json_map = maps['json']
    py_map = maps['py']
    
    # Process the maps to handle IDs
    def process_map(session_map):
        processed_map = {}
        for ref_key, inp_name in session_map.items():
            # Extract the acquisition name from the key (remove the instance ID)
            if '#' in ref_key:
                ref_name = ref_key.split('#')[0]
                processed_map[ref_name] = inp_name
            else:
                processed_map[ref_key] = inp_name
        return processed_map

    json_map_processed = process_map(json_map)
    py_map_processed = process_map(py_map)
    
    # Check if we have schema instances dictionary
    if 'schema_instances' not in globals():
      print("No schema instances available")
      continue
      
    # Get instance-specific session and model keys
    instance_session_key = f"ref_session_{instance_id}"
    instance_models_key = f"ref_models_{instance_id}"
    
    # Process JSON schema compliance
    if instance_session_key in globals() and json_map:
      instance_ref_session = globals()[instance_session_key]
      print(f"Checking compliance with JSON reference for instance {instance_id}")
      try:
        json_results = check_session_compliance_with_json_reference(
          in_session=in_session,
          ref_session=instance_ref_session,
          session_map=json_map_processed
        )
        
        # Add instance ID to the results
        for result in json_results:
          ref_acq = result.get('reference acquisition')
          if ref_acq:
            result['reference id'] = instance_id
        
        all_results.extend(json_results)
      except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error in JSON compliance check for instance {instance_id}: {e}")
    
    # Process Python module compliance
    if instance_models_key in globals() and py_map:
      instance_ref_models = globals()[instance_models_key]
      print(f"Checking compliance with Python module for instance {instance_id}")
      try:
        py_results = check_session_compliance_with_python_module(
          in_session=in_session,
          ref_models=instance_ref_models,
          session_map=py_map_processed
        )
        
        # Add instance ID to the results
        for result in py_results:
          ref_acq = result.get('reference acquisition')
          if ref_acq:
            result['reference id'] = instance_id
        
        all_results.extend(py_results)
      except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error in Python module compliance check for instance {instance_id}: {e}")

json.dumps(all_results)
`;

  const raw = await runPythonCode(code);
  return JSON.parse(raw);
};

export const removeSchema = async (
  pyodide: ReturnType<typeof usePyodide>,
  acquisitionName: string,
  fileName: string,
  instanceId: string
) => {
  const { runPythonCode, setPythonGlobal } = pyodide;

  await setPythonGlobal('acq_to_remove', acquisitionName);
  await setPythonGlobal('file_name', fileName);
  await setPythonGlobal('instance_id', instanceId);

  const code = `
import json

# Get instance-specific session and model keys
instance_session_key = f"ref_session_{instance_id}"
instance_models_key = f"ref_models_{instance_id}"
instance_fields_key = f"reference_fields_{instance_id}"

# Clean up instance-specific globals
if instance_session_key in globals():
    del globals()[instance_session_key]
    print(f"Removed {instance_session_key} from globals")
    
if instance_models_key in globals():
    del globals()[instance_models_key]
    print(f"Removed {instance_models_key} from globals")
    
if instance_fields_key in globals():
    del globals()[instance_fields_key]
    print(f"Removed {instance_fields_key} from globals")

# Remove from schema instances tracker
if 'schema_instances' in globals() and instance_id in schema_instances:
    del schema_instances[instance_id]
    print(f"Removed instance {instance_id} from schema_instances")

json.dumps({"success": True})
  `;

  return await runPythonCode(code);
};


export const reprocessSpecificAcquisition = async (
  pyodide: ReturnType<typeof usePyodide>,
  acquisitionName: string,
  specificFields: string[]
) => {
  const { runPythonCode, setPythonGlobal } = pyodide;

  await setPythonGlobal('specific_acq_name', acquisitionName);
  await setPythonGlobal('specific_fields', specificFields);

  const code = `
import json
from dicompare.cli.gen_session import create_json_reference

def clean_for_json(obj):
    """Recursively clean an object to make it JSON serializable"""
    import numpy as np
    import pandas as pd
    
    if isinstance(obj, dict):
        return {k: clean_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_for_json(item) for item in obj]
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif pd.isna(obj) or obj is None:
        return None
    elif isinstance(obj, (np.integer, np.floating)):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return obj.item()
    elif isinstance(obj, float):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return obj
    else:
        return obj

# convert the JS proxy to a Python list
if isinstance(specific_fields, pyodide.ffi.JsProxy):
    specific_fields = specific_fields.to_py()

# Filter the session to only the specific acquisition
if 'in_session' in globals() and in_session is not None:
    acq_session = in_session[in_session['Acquisition'] == specific_acq_name].copy()
    
    if not acq_session.empty:
        # Filter fields to only include those that exist in the session
        available_fields = [f for f in specific_fields if f in acq_session.columns]
        if not available_fields:
            # If no fields from specific_fields are available, fall back to basic fields
            basic_fields = ['ProtocolName', 'SeriesDescription', 'Manufacturer']
            available_fields = [f for f in basic_fields if f in acq_session.columns]
        
        if available_fields:
            acq_reference = create_json_reference(acq_session, available_fields)
            if specific_acq_name in acq_reference['acquisitions']:
                clean_details = clean_for_json(acq_reference['acquisitions'][specific_acq_name])
                result = {specific_acq_name: clean_details}
            else:
                result = {}
        else:
            result = {}
    else:
        result = {}
else:
    result = {}

json.dumps(result)
  `.trim();

  const out = await runPythonCode(code);
  return JSON.parse(out);
};

export const removeDicomSeries = async (
  pyodide: ReturnType<typeof usePyodide>,
  acquisitionName: string
) => {
  const { runPythonCode, setPythonGlobal } = pyodide;

  await setPythonGlobal('acq_to_remove', acquisitionName);

  const code = `
import json

# Remove the acquisition from the input session
if 'in_session' in globals() and in_session is not None:
    # Filter out rows with this acquisition
    in_session = in_session[in_session['Acquisition'] != acq_to_remove]
    print(f"Removed {acq_to_remove} from input session")
    
    # Regenerate the input options
    from dicompare.cli.gen_session import create_json_reference
    if 'reference_fields' in globals() and reference_fields:
        input_acquisitions = create_json_reference(in_session, reference_fields)
        remaining = list(input_acquisitions['acquisitions'].keys())
    else:
        remaining = []
else:
    remaining = []

json.dumps(remaining)
  `.trim();

  return await runPythonCode(code);
};

export const loadExampleDicoms = async (
  pyodide: ReturnType<typeof usePyodide>,
  acquisitions: Record<string, any>
) => {
  const { runPythonCode, setPythonGlobal } = pyodide;
  
  await setPythonGlobal('example_acquisitions', acquisitions);

  const code = `
import json
import pandas as pd
import pyodide

# Convert JS proxy to Python
example_acquisitions = example_acquisitions.to_py() if isinstance(example_acquisitions, pyodide.ffi.JsProxy) else example_acquisitions

# Create a mock session DataFrame that would normally come from DICOM files
# We need to create rows that represent the structure that assign_acquisition_and_run_numbers expects
rows = []

for acq_name, acq_data in example_acquisitions.items():
    # Extract fields from the acquisition data
    fields = {}
    
    # Get field values from the fields list
    if 'fields' in acq_data:
        for field_info in acq_data['fields']:
            field_name = field_info['field']
            field_value = field_info.get('value')
            if field_value is not None:
                # Convert lists to tuples for hashability in pandas
                if isinstance(field_value, list):
                    field_value = tuple(field_value)
                fields[field_name] = field_value
    
    # Also get field values from series if available
    if 'series' in acq_data:
        for series in acq_data['series']:
            series_fields = dict(fields)  # Copy base fields
            
            # Update with series-specific fields
            if 'fields' in series:
                for field_info in series['fields']:
                    field_name = field_info['field']
                    field_value = field_info.get('value')
                    if field_value is not None:
                        # Convert lists to tuples for hashability in pandas
                        if isinstance(field_value, list):
                            field_value = tuple(field_value)
                        series_fields[field_name] = field_value
            
            # Add required fields for the session
            series_fields['Acquisition'] = acq_name
            series_fields['SeriesInstanceUID'] = series.get('name', f"{acq_name}_series")
            
            # Create a row for this series
            rows.append(series_fields)
    
    # If no series, create at least one row for the acquisition
    if 'series' not in acq_data or not acq_data['series']:
        fields['Acquisition'] = acq_name
        fields['SeriesInstanceUID'] = f"{acq_name}_series"
        rows.append(fields)

# Create the DataFrame
global in_session
in_session = pd.DataFrame(rows)

# Fill in any missing standard columns that might be expected
standard_columns = ['ProtocolName', 'SeriesDescription', 'Manufacturer']
for col in standard_columns:
    if col not in in_session.columns:
        in_session[col] = ''

# The acquisitions are already labeled, so we don't need to call assign_acquisition_and_run_numbers again
print(f"Loaded {len(in_session)} example DICOM entries")
print(f"Acquisitions: {in_session['Acquisition'].unique()}")

# Return the acquisitions in the same format as analyzeDicomFiles would
json.dumps(example_acquisitions)
  `.trim();

  const out = await runPythonCode(code);
  return JSON.parse(out);
};
