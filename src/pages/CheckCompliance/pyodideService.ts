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
    await setPythonGlobal('instance_id', instanceId);
    await setPythonGlobal('specific_acquisition', acquisitionName || null);

    // Simplified Python code using ComplianceSession
    const code = `
import sys, json
sys.path.append('.')
from dicompare.io import load_json_schema, load_python_schema
from dicompare.serialization import make_json_serializable

try:
    print(f"Loading schema: {ref_config_name} (instance {instance_id})")
    
    reference_fields = []
    schema_dict = None
    
    if is_json:
        print(f"Loading JSON schema: {ref_config_name}")
        reference_fields, schema_dict = load_json_schema(json_schema_path=ref_config_name)
        
    elif is_py:
        print(f"Loading Python schema: {ref_config_name}")
        ref_models = load_python_schema(module_path=ref_config_name)
        
        # Extract reference fields from all models
        reference_fields = sorted({
            f for model in ref_models.values()
            for f in model.reference_fields
        })
        
        # Store the original Python models and mark as Python schema
        schema_dict = {
            "type": "python",
            "python_models": ref_models,  # Store the actual Python model classes
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
                    # Note: Python schemas don't have explicit field/series constraints like JSON schemas
                    # They use validation rules instead, so we don't include fields/series arrays
                }
                for acq_name in ref_models.keys()
            }
        }
        
        print(f"Python schema conversion result:")
        for acq_name, acq_data in schema_dict["acquisitions"].items():
            rules_count = len(acq_data['rules'])
            print(f"  Acquisition '{acq_name}': {rules_count} validation rules")
            if rules_count == 0:
                print(f"    WARNING: No validation rules found for acquisition '{acq_name}'")
    else:
        raise RuntimeError(f"Unsupported schema type: {ref_config_name}")
    
    # Add schema to ComplianceSession
    schema_id = instance_id if instance_id else ref_config_name
    global_compliance_session.add_schema(schema_id, schema_dict)
    
    print(f"Added schema '{schema_id}' to ComplianceSession")
    print(f"Available schemas: {global_compliance_session.get_schema_names()}")
    
    # Filter acquisitions if specific_acquisition is provided
    if specific_acquisition:
        schema_acquisitions = global_compliance_session.get_schema_acquisitions(schema_id)
        if specific_acquisition in schema_acquisitions:
            filtered_acquisitions = {
                specific_acquisition: schema_dict["acquisitions"][specific_acquisition]
            }
        else:
            print(f"Warning: Acquisition '{specific_acquisition}' not found in schema")
            filtered_acquisitions = {}
    else:
        filtered_acquisitions = schema_dict["acquisitions"]
    
    result = {
        "acquisitions": filtered_acquisitions,
        "reference_fields": reference_fields,
        "instance_id": schema_id
    }
    
    # Make sure result is JSON serializable
    result = make_json_serializable(result)

except Exception as e:
    import traceback
    traceback.print_exc()
    print(f"Error loading schema: {e}")
    raise RuntimeError(f"Failed to load schema: {e}")

json.dumps(result)
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
        'SeriesDescription',
        'SequenceName',
        'SequenceVariant',
        'ScanningSequence',
        'ImageType',

        'Manufacturer',
        'ManufacturerModelName',
        'SoftwareVersion',

        // Geometry
        'MRAcquisitionType',
        'SliceThickness',
        'PixelSpacing',
        'Rows',
        'Columns',
        'Slices',
        'AcquisitionMatrix',
        'ReconstructionDiameter',

        // Timing / Contrast
        'RepetitionTime',
        'EchoTime',
        'InversionTime',
        'FlipAngle',
        'EchoTrainLength',
        'GradientEchoTrainLength',
        'NumberOfTemporalPositions',
        'TemporalResolution',
        'SliceTiming',

        // Diffusion-specific
        'DiffusionBValue',
        'DiffusionGradientDirectionSequence',

        // Parallel Imaging / Multiband
        'ParallelAcquisitionTechnique',
        'ParallelReductionFactorInPlane',
        'PartialFourier',
        'SliceAccelerationFactor',

        // Bandwidth / Readout
        'PixelBandwidth',
        'BandwidthPerPixelPhaseEncode',

        // Phase encoding
        'InPlanePhaseEncodingDirection',
        'PhaseEncodingDirectionPositive',
        'NumberOfPhaseEncodingSteps',

        // Scanner hardware
        'MagneticFieldStrength',
        'ImagingFrequency',
        'ImagedNucleus',
        'TransmitCoilName',
        'ReceiveCoilName',
        'SAR',
        'NumberOfAverages',
        'CoilType',

        // Coverage / FOV %
        'PercentSampling',
        'PercentPhaseFieldOfView',

        // Scan options
        'ScanOptions',
        'AngioFlag',

        // Triggering / gating (mostly fMRI / cardiac)
        'TriggerTime',
        'TriggerSourceOrType',
        'BeatRejectionFlag',
        'LowRRValue',
        'HighRRValue',

        // Advanced / niche
        'SpoilingRFPhaseAngle',
        'PerfusionTechnique',
        'SpectrallySelectedExcitation',
        'SaturationRecovery',
        'SpectrallySelectedSuppression',
        'TimeOfFlightContrast',
        'SteadyStatePulseSequence',
        'PartialFourierDirection',
    ];

    await setPythonGlobal('dicom_files', dicomFiles);
    await setPythonGlobal('update_progress', updateProgress);
    await setPythonGlobal('reference_fields', referenceFields.length ? referenceFields : defaultDicomFields);

    const code = `
import sys, json, asyncio
import pandas as pd
import pyodide
from dicompare import async_load_dicom_session, assign_acquisition_and_run_numbers
from dicompare.serialization import make_json_serializable

if isinstance(reference_fields, pyodide.ffi.JsProxy):
    reference_fields = reference_fields.to_py()

try:
    # Convert dicom_files to Python if needed
    dicom_bytes = dicom_files.to_py() if isinstance(dicom_files, pyodide.ffi.JsProxy) else dicom_files
    print(f"Loading {len(dicom_bytes)} DICOM files using ComplianceSession...")
    
    # Load the session using async_load_dicom_session (for compatibility)
    session_df = await async_load_dicom_session(dicom_bytes=dicom_bytes, progress_function=update_progress)
    
    print(f"Before assign_acquisition_and_run_numbers: {len(session_df)} files")
    print(f"Unique SeriesDescription values: {session_df['SeriesDescription'].unique() if 'SeriesDescription' in session_df.columns else 'N/A'}")
    print(f"Unique ProtocolName values: {session_df['ProtocolName'].unique() if 'ProtocolName' in session_df.columns else 'N/A'}")
    
    # Assign acquisition numbers
    session_df = assign_acquisition_and_run_numbers(session_df)
    
    print(f"After assign_acquisition_and_run_numbers: Acquisition values = {session_df['Acquisition'].unique()}")
    
    # Check for and fix any nan acquisitions
    nan_mask = session_df['Acquisition'].isna() | (session_df['Acquisition'].astype(str) == 'nan')
    if nan_mask.any():
        print(f"WARNING: Found {nan_mask.sum()} files with NaN acquisition names")
        # Try to fix by using SeriesDescription or ProtocolName
        if 'SeriesDescription' in session_df.columns:
            session_df.loc[nan_mask, 'Acquisition'] = session_df.loc[nan_mask, 'SeriesDescription']
        elif 'ProtocolName' in session_df.columns:
            session_df.loc[nan_mask, 'Acquisition'] = session_df.loc[nan_mask, 'ProtocolName']
        else:
            session_df.loc[nan_mask, 'Acquisition'] = 'unknown_acquisition'
        print(f"Fixed acquisition names: {session_df['Acquisition'].unique()}")
    
    # Load into ComplianceSession with metadata
    metadata = {
        'source': 'dicom_upload',
        'file_count': len(dicom_bytes),
        'timestamp': str(pd.Timestamp.now())
    }
    
    global_compliance_session.load_dicom_session(session_df, metadata)
    
    print(f"Loaded session with {len(session_df)} files, {session_df['Acquisition'].nunique()} acquisitions")
    print(f"Acquisitions: {list(session_df['Acquisition'].unique())}")
    
    # Get session summary for the UI
    session_summary = global_compliance_session.get_session_summary()
    
    # Extract acquisitions data for UI compatibility
    acquisitions = {}
    for acq_name in session_df['Acquisition'].unique():
        # Skip nan/None acquisitions
        if pd.isna(acq_name) or acq_name is None or str(acq_name).lower() == 'nan':
            print(f"Warning: Skipping invalid acquisition name: {acq_name}")
            continue
            
        # Get subset for this acquisition
        acq_data = session_df[session_df['Acquisition'] == acq_name]
        
        # Create fields and series structure (simplified)
        fields = []
        for field in reference_fields:
            if field in acq_data.columns:
                unique_vals = acq_data[field].dropna().unique()
                if len(unique_vals) > 0:
                    fields.append({
                        'field': field,
                        'value': unique_vals[0] if len(unique_vals) == 1 else list(unique_vals)
                    })
        
        # Create series data using dicompare's field variability approach
        series_data = []
        print(f"Creating series data for acquisition '{acq_name}' using field variability analysis")
        
        # First, detect which fields vary within this acquisition
        varying_fields = []
        constant_fields = []
        
        for field in reference_fields:
            if field in acq_data.columns:
                unique_vals = acq_data[field].dropna().unique()
                if len(unique_vals) > 1:
                    varying_fields.append(field)
                elif len(unique_vals) == 1:
                    constant_fields.append(field)
        
        print(f"  Found {len(varying_fields)} varying fields: {varying_fields}")
        print(f"  Found {len(constant_fields)} constant fields: {constant_fields}")
        
        # If we have varying fields, group by them to create series
        if varying_fields:
            # Group by combinations of varying field values
            series_groups = acq_data.groupby(varying_fields, dropna=False)
            
            for i, (series_key, series_group) in enumerate(series_groups, start=1):
                # Create series fields from the varying field values
                series_fields = []
                
                # Handle both single and multiple varying fields
                if len(varying_fields) == 1:
                    field_values = [series_key]
                else:
                    field_values = series_key
                
                for j, field in enumerate(varying_fields):
                    field_value = field_values[j] if len(varying_fields) > 1 else field_values[0]
                    series_fields.append({
                        'field': field,
                        'value': field_value
                    })
                
                series_name = f"Series {i}"
                
                print(f"  {series_name}: {len(series_group)} files, fields: {[(f['field'], f['value']) for f in series_fields]}")
                
                series_data.append({
                    'name': series_name,
                    'fields': series_fields
                })
            
            print(f"Created {len(series_data)} series based on varying fields for acquisition '{acq_name}'")
        else:
            print(f"No varying fields found for acquisition '{acq_name}' - all fields are constant")
        
        acquisitions[acq_name] = {
            'fields': fields,
            'series': series_data,
            'file_count': len(acq_data)
        }
    
    # Return JSON-serializable data
    result = make_json_serializable(acquisitions)

except Exception as e:
    import traceback
    traceback.print_exc()
    print(f"Error in analyzeDicomFiles: {e}")
    raise RuntimeError(f"Failed to load DICOM files: {e}")

json.dumps(result)
  `.trim();

    const out = await runPythonCode(code);
    return JSON.parse(out);
};

export const processExistingSession = async (pyodide: ReturnType<typeof usePyodide>, referenceFields: string[]) => {
    const { runPythonCode, setPythonGlobal } = pyodide;

    await setPythonGlobal('reference_fields', referenceFields);

    const code = `
import json
from dicompare.generate_schema import create_json_schema
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

# Get session from ComplianceSession
if global_compliance_session.has_session():
    session_df = global_compliance_session.session_df.copy()
    
    # Re-run acquisition assignment if needed
    if 'Acquisition' not in session_df.columns:
        session_df = assign_acquisition_and_run_numbers(session_df)
    
    # Sort by acquisition and reference fields
    sort_fields = ['Acquisition'] + [f for f in reference_fields if f in session_df.columns]
    session_df.sort_values(by=sort_fields, inplace=True)
    
    # Create schema from the session
    acqs = create_json_schema(session_df, reference_fields)['acquisitions']
    clean_acqs = clean_for_json(acqs)
    result = clean_acqs
else:
    print("No session loaded in ComplianceSession")
    result = {}

json.dumps(result)
  `.trim();

    const out = await runPythonCode(code);
    return JSON.parse(out);
};

export const analyzeCompliance = async (pyodide: ReturnType<typeof usePyodide>, pairs: Pair[]) => {
    const { runPythonCode, setPythonGlobal } = pyodide;

    // Group pairs by schema instance ID and create user mappings
    const schemaUserMappings: Record<string, Record<string, string>> = {};

    pairs.forEach((p) => {
        if (p.ref && p.inp) {
            const schemaId = p.ref.id;
            if (schemaId) {
                if (!schemaUserMappings[schemaId]) {
                    schemaUserMappings[schemaId] = {};
                }
                // Map schema acquisition name to input acquisition name
                schemaUserMappings[schemaId][p.ref.name] = p.inp.name;
            }
        }
    });

    await setPythonGlobal('schema_user_mappings', schemaUserMappings);

    const code = `
import json, pyodide
from dicompare.serialization import make_json_serializable

# Convert JS mappings to Python
schema_user_mappings = schema_user_mappings.to_py() if isinstance(schema_user_mappings, pyodide.ffi.JsProxy) else schema_user_mappings

all_results = []

try:
    print(f"Analyzing compliance for {len(schema_user_mappings)} schemas")
    
    if not global_compliance_session.has_session():
        print("Error: No session loaded in ComplianceSession")
        raise RuntimeError("No session loaded")
    
    # Process each schema mapping
    for schema_id, user_mapping in schema_user_mappings.items():
        print(f"Checking compliance for schema '{schema_id}' with mapping: {user_mapping}")
        
        try:
            # Check if schema exists
            if not global_compliance_session.has_schema(schema_id):
                print(f"Warning: Schema '{schema_id}' not found in ComplianceSession")
                continue
            
            # Validate mapping first
            validation_result = global_compliance_session.validate_user_mapping(schema_id, user_mapping)
            if not validation_result['valid']:
                print(f"Warning: Invalid mapping for schema '{schema_id}': {validation_result['errors']}")
                # Create error results for invalid mappings
                for error in validation_result['errors']:
                    all_results.append({
                        'schema acquisition': 'unknown',
                        'input acquisition': 'unknown', 
                        'field': 'mapping_validation',
                        'expected': 'valid mapping',
                        'actual': 'invalid mapping',
                        'passed': False,
                        'message': error,
                        'schema id': schema_id
                    })
                continue
            
            # Debug: Check what schema structure we have
            schema_acquisitions = global_compliance_session.get_schema_acquisitions(schema_id)
            schema_data = global_compliance_session.schemas[schema_id]
            print(f"Schema acquisitions: {list(schema_acquisitions)}")
            
            # Check if this is a Python schema
            is_python_schema = schema_data.get('type') == 'python'
            
            print(f"Schema type: {schema_data.get('type', 'json')}")
            print(f"Is Python schema: {is_python_schema}")
            
            for acq_name in schema_acquisitions:
                acq_data = schema_data['acquisitions'].get(acq_name, {})
                print(f"  Acquisition '{acq_name}':")
                print(f"    Fields: {len(acq_data.get('fields', []))}")
                print(f"    Series: {len(acq_data.get('series', []))}")
                print(f"    Rules: {len(acq_data.get('rules', []))}")
                
                if is_python_schema:
                    print(f"    Python schema with {len(acq_data['rules'])} validation rules")
                    for rule in acq_data['rules']:
                        rule_name = rule.get('rule_name') or rule.get('name', 'unnamed')
                        print(f"      Rule: {rule_name}")
            
            # Debug: Check what session data we have  
            session_df = global_compliance_session.session_df
            acq_data = session_df[session_df['Acquisition'].isin(user_mapping.values())]
            print(f"Session data for compliance check:")
            print(f"  Total rows: {len(acq_data)}")
            print(f"  Columns: {list(acq_data.columns)}")
            if 'ImageType' in acq_data.columns:
                print(f"  ImageType values: {acq_data['ImageType'].unique()}")
            if 'SeriesNumber' in acq_data.columns:
                print(f"  SeriesNumber values: {acq_data['SeriesNumber'].unique()}")
            
            # Handle Python schemas differently
            if is_python_schema:
                print("Using Python schema validation...")
                try:
                    # Import the Python compliance function
                    from dicompare.compliance import check_session_compliance_with_python_module
                    
                    # Get the Python models from the schema
                    python_models = schema_data.get('python_models', {})
                    
                    if not python_models:
                        print("ERROR: No Python models found in schema data")
                        raise ValueError("Python schema missing python_models")
                    
                    print(f"Found Python models: {list(python_models.keys())}")
                    
                    # Get the session data
                    session_df = global_compliance_session.session_df
                    
                    # Run Python compliance validation
                    compliance_summary = check_session_compliance_with_python_module(
                        in_session=session_df,
                        schema_models=python_models,
                        session_map=user_mapping,
                        raise_errors=False
                    )
                    
                    print(f"Python compliance check returned {len(compliance_summary)} results")
                    
                    # For Python schemas, convert results directly to the flat format expected by React
                    print(f"Converting {len(compliance_summary)} Python validation results to React format")
                    
                    # Skip the nested acquisition_details structure and convert directly to flat results
                    for result in compliance_summary:
                        schema_acq_name = result.get('schema acquisition', 'unknown')
                        input_acq_name = result.get('input acquisition', 'unknown')
                        
                        # Convert Python result directly to React format
                        result_item = {
                            'schema acquisition': schema_acq_name,
                            'input acquisition': input_acq_name,
                            'field': result.get('field', ''),
                            'rule_name': result.get('rule_name', 'unknown'),
                            'expected': result.get('expected', ''),
                            'actual': result.get('value', ''),
                            'passed': result.get('passed', False),
                            'message': result.get('message', ''),
                            'schema id': schema_id
                        }
                        
                        all_results.append(result_item)
                        print(f"Added Python result: rule='{result_item['rule_name']}', passed={result_item['passed']}")
                    
                    print(f"Python validation results converted: {len(all_results)} total results")
                    
                    # Skip the rest of the processing for Python schemas since we've added results directly
                    continue
                    
                    print(f"Python validation completed: {compliance_results['summary']['passed_rules']}/{compliance_results['summary']['total_rules']} passed ({compliance_results['summary']['compliance_rate']:.1f}%)")
                    
                except Exception as py_error:
                    import traceback
                    traceback.print_exc()
                    print(f"Error in Python schema validation: {py_error}")
                    # Fall back to regular compliance check
                    compliance_results = global_compliance_session.check_compliance(schema_id, user_mapping)
            else:
                print("Using JSON schema validation...")
                # Run compliance check using ComplianceSession for JSON schemas
                compliance_results = global_compliance_session.check_compliance(schema_id, user_mapping)
            
            print(f"Compliance check completed for schema '{schema_id}'")
            print(f"Compliance results type: {type(compliance_results)}")
            print(f"Compliance results keys: {list(compliance_results.keys()) if isinstance(compliance_results, dict) else 'Not a dict'}")
            
            # Check if we have the expected structure
            if not isinstance(compliance_results, dict):
                print(f"ERROR: Expected dict but got {type(compliance_results)}")
                raise TypeError(f"ComplianceSession.check_compliance returned {type(compliance_results)} instead of dict")
            
            if 'acquisition_details' not in compliance_results:
                print(f"ERROR: No 'acquisition_details' in compliance_results. Keys: {list(compliance_results.keys())}")
                raise KeyError("Missing 'acquisition_details' in compliance results")
            
            acquisition_details = compliance_results.get('acquisition_details', {})
            print(f"Acquisition details type: {type(acquisition_details)}")
            
            if isinstance(acquisition_details, dict):
                print(f"Acquisition details keys: {list(acquisition_details.keys())}")
                
                # Print summary info if available
                if 'summary' in compliance_results:
                    summary = compliance_results['summary']
                    print(f"Overall compliance rate: {summary.get('compliance_rate', 'unknown'):.1f}%")
                
                # Debug: print first acquisition details
                for acq_name, acq_details in acquisition_details.items():
                    print(f"Acquisition '{acq_name}' has {len(acq_details.get('detailed_results', []))} field results")
                    if acq_details.get('detailed_results'):
                        first_result = acq_details['detailed_results'][0]
                        print(f"  First result: field='{first_result.get('field')}', compliant={first_result.get('compliant')}")
                    break
            else:
                print(f"ERROR: acquisition_details is {type(acquisition_details)} instead of dict")
                raise TypeError(f"acquisition_details is {type(acquisition_details)} instead of dict")
            
            # Convert ComplianceSession results to the format expected by the UI
            # The UI expects a flat list of individual field results
            # Results are now keyed by schema acquisition name (after our fix)
            for schema_acq_name, acq_details in acquisition_details.items():
                # Get the input acquisition name
                input_acq_name = acq_details.get('input_acquisition', schema_acq_name)
                
                for field_result in acq_details.get('detailed_results', []):
                    result_item = {
                        'schema acquisition': schema_acq_name,
                        'input acquisition': input_acq_name,
                        'field': field_result.get('field', ''),
                        'rule_name': field_result.get('rule_name', ''),
                        'expected': field_result.get('expected', ''),
                        'actual': field_result.get('actual', ''),
                        'passed': field_result.get('passed', field_result.get('compliant', False)),
                        'message': field_result.get('message', ''),
                        'schema id': schema_id
                    }
                    
                    # Add series information if present and not None
                    if 'series' in field_result and field_result['series'] is not None:
                        result_item['series'] = field_result['series']
                        print(f"    Found series result: series='{field_result['series']}', field='{result_item['field']}'")
                    
                    all_results.append(result_item)
                    
                    # Debug print for first few results
                    if len(all_results) <= 3:
                        print(f"Result item: schema_acq='{schema_acq_name}', field='{result_item['field']}', passed={result_item['passed']}, ref_id='{schema_id}'")
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"Error checking compliance for schema '{schema_id}': {e}")
            # Add error result
            all_results.append({
                'schema acquisition': 'error',
                'input acquisition': 'error',
                'field': 'compliance_check',
                'expected': 'successful check',
                'actual': 'error occurred',
                'passed': False,
                'message': f"Error: {str(e)}",
                'schema id': schema_id
            })
    
    print(f"Compliance analysis completed. Total results: {len(all_results)}")
    
    # Make results JSON serializable
    serializable_results = make_json_serializable(all_results)

except Exception as e:
    import traceback
    traceback.print_exc()
    print(f"Fatal error in analyzeCompliance: {e}")
    serializable_results = [{
        'schema acquisition': 'fatal_error',
        'input acquisition': 'fatal_error',
        'field': 'system',
        'expected': 'successful analysis',
        'actual': 'fatal error',
        'passed': False,
        'message': f"Fatal error: {str(e)}",
        'schema id': 'system'
    }]

json.dumps(serializable_results)
`;

    const raw = await runPythonCode(code);
    return JSON.parse(raw);
};

export const removeSchema = async (
    pyodide: ReturnType<typeof usePyodide>,
    _acquisitionName: string,
    _fileName: string,
    instanceId: string
) => {
    const { runPythonCode, setPythonGlobal } = pyodide;

    await setPythonGlobal('schema_id', instanceId);

    const code = `
import json

try:
    print(f"Removing schema '{schema_id}' from ComplianceSession")
    
    if global_compliance_session.has_schema(schema_id):
        global_compliance_session.remove_schema(schema_id)
        print(f"Successfully removed schema '{schema_id}'")
        print(f"Remaining schemas: {global_compliance_session.get_schema_names()}")
        result = {"success": True, "message": f"Schema '{schema_id}' removed"}
    else:
        print(f"Warning: Schema '{schema_id}' not found")
        result = {"success": False, "message": f"Schema '{schema_id}' not found"}

except Exception as e:
    import traceback
    traceback.print_exc()
    print(f"Error removing schema '{schema_id}': {e}")
    result = {"success": False, "message": f"Error: {str(e)}"}

json.dumps(result)
  `;

    const raw = await runPythonCode(code);
    return JSON.parse(raw);
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
from dicompare.generate_schema import create_json_schema

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

# Get session from ComplianceSession
if global_compliance_session.has_session():
    session_df = global_compliance_session.session_df
    acq_session = session_df[session_df['Acquisition'] == specific_acq_name].copy()
    
    if not acq_session.empty:
        # Filter fields to only include those that exist in the session
        available_fields = [f for f in specific_fields if f in acq_session.columns]
        if not available_fields:
            # If no fields from specific_fields are available, fall back to basic fields
            basic_fields = ['ProtocolName', 'SeriesDescription', 'Manufacturer']
            available_fields = [f for f in basic_fields if f in acq_session.columns]
        
        if available_fields:
            acq_reference = create_json_schema(acq_session, available_fields)
            if specific_acq_name in acq_reference['acquisitions']:
                clean_details = clean_for_json(acq_reference['acquisitions'][specific_acq_name])
                result = {specific_acq_name: clean_details}
            else:
                result = {}
        else:
            result = {}
    else:
        print(f"No data found for acquisition: {specific_acq_name}")
        result = {}
else:
    print("No session loaded in ComplianceSession")
    result = {}

json.dumps(result)
  `.trim();

    const out = await runPythonCode(code);
    return JSON.parse(out);
};

export const removeDicomSeries = async (pyodide: ReturnType<typeof usePyodide>, acquisitionName: string) => {
    const { runPythonCode, setPythonGlobal } = pyodide;

    await setPythonGlobal('acq_to_remove', acquisitionName);

    const code = `
import json
import pandas as pd

# Remove the acquisition from the ComplianceSession
if global_compliance_session.has_session():
    session_df = global_compliance_session.session_df
    
    # Filter out rows with this acquisition
    updated_session = session_df[session_df['Acquisition'] != acq_to_remove]
    
    if len(updated_session) < len(session_df):
        print(f"Removing {acq_to_remove} from session ({len(session_df) - len(updated_session)} files)")
        
        # Reload the session without the removed acquisition
        metadata = global_compliance_session.session_metadata.copy()
        metadata['modified'] = str(pd.Timestamp.now())
        metadata['removed_acquisition'] = acq_to_remove
        
        global_compliance_session.load_dicom_session(updated_session, metadata)
        print(f"Session reloaded without {acq_to_remove}")
        
        # Get remaining acquisitions
        remaining = list(updated_session['Acquisition'].unique())
    else:
        print(f"Acquisition {acq_to_remove} not found in session")
        remaining = list(session_df['Acquisition'].unique())
else:
    print("No session loaded in ComplianceSession")
    remaining = []

json.dumps(remaining)
  `.trim();

    return await runPythonCode(code);
};

export const loadExampleDicoms = async (pyodide: ReturnType<typeof usePyodide>, acquisitions: Record<string, any>) => {
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
session_df = pd.DataFrame(rows)

# Fill in any missing standard columns that might be expected
standard_columns = ['ProtocolName', 'SeriesDescription', 'Manufacturer']
for col in standard_columns:
    if col not in session_df.columns:
        session_df[col] = ''

# The acquisitions are already labeled, so we don't need to call assign_acquisition_and_run_numbers again
print(f"Loaded {len(session_df)} example DICOM entries")
print(f"Acquisitions: {session_df['Acquisition'].unique()}")

# Load into ComplianceSession
metadata = {
    'source': 'example_dicoms',
    'file_count': len(session_df),
    'timestamp': str(pd.Timestamp.now())
}

global_compliance_session.load_dicom_session(session_df, metadata)
print(f"Loaded example DICOMs into ComplianceSession")

# Return the acquisitions in the same format as analyzeDicomFiles would
json.dumps(example_acquisitions)
  `.trim();

    const out = await runPythonCode(code);
    return JSON.parse(out);
};

// New functions using ComplianceSession capabilities

export const validateUserMapping = async (
    pyodide: ReturnType<typeof usePyodide>,
    schemaId: string,
    userMapping: Record<string, string>
) => {
    const { runPythonCode, setPythonGlobal } = pyodide;

    await setPythonGlobal('schema_id', schemaId);
    await setPythonGlobal('user_mapping', userMapping);

    const code = `
import json, pyodide
from dicompare.serialization import make_json_serializable

# Convert JS mapping to Python
user_mapping = user_mapping.to_py() if isinstance(user_mapping, pyodide.ffi.JsProxy) else user_mapping

try:
    print(f"Validating user mapping for schema '{schema_id}'")
    
    if not global_compliance_session.has_session():
        raise RuntimeError("No session loaded")
    
    if not global_compliance_session.has_schema(schema_id):
        raise ValueError(f"Schema '{schema_id}' not found")
    
    # Validate the mapping
    validation_result = global_compliance_session.validate_user_mapping(schema_id, user_mapping)
    
    print(f"Validation result: {validation_result['valid']}")
    if not validation_result['valid']:
        print(f"Errors: {validation_result['errors']}")
    if validation_result['warnings']:
        print(f"Warnings: {validation_result['warnings']}")
    
    # Make JSON serializable
    result = make_json_serializable(validation_result)

except Exception as e:
    import traceback
    traceback.print_exc()
    print(f"Error validating mapping: {e}")
    result = {
        "valid": False,
        "errors": [f"Validation error: {str(e)}"],
        "warnings": [],
        "mapping_coverage": {},
        "unmapped_schema_acquisitions": [],
        "unmapped_session_acquisitions": []
    }

json.dumps(result)
  `.trim();

    const out = await runPythonCode(code);
    return JSON.parse(out);
};

export const suggestAutomaticMapping = async (pyodide: ReturnType<typeof usePyodide>, schemaId: string) => {
    const { runPythonCode, setPythonGlobal } = pyodide;

    await setPythonGlobal('schema_id', schemaId);

    const code = `
import json
from dicompare.serialization import make_json_serializable

try:
    print(f"Generating automatic mapping suggestions for schema '{schema_id}'")
    
    if not global_compliance_session.has_session():
        raise RuntimeError("No session loaded")
    
    if not global_compliance_session.has_schema(schema_id):
        raise ValueError(f"Schema '{schema_id}' not found")
    
    # Get automatic mapping suggestions
    suggestions = global_compliance_session.suggest_automatic_mapping(schema_id)
    
    print(f"Generated {len(suggestions)} mapping suggestions:")
    for schema_acq, session_acq in suggestions.items():
        print(f"  {schema_acq} -> {session_acq}")
    
    # Make JSON serializable
    result = make_json_serializable(suggestions)

except Exception as e:
    import traceback
    traceback.print_exc()
    print(f"Error generating mapping suggestions: {e}")
    result = {}

json.dumps(result)
  `.trim();

    const out = await runPythonCode(code);
    return JSON.parse(out);
};

export const getSessionSummary = async (pyodide: ReturnType<typeof usePyodide>) => {
    const { runPythonCode } = pyodide;

    const code = `
import json
from dicompare.serialization import make_json_serializable

try:
    print("Getting session summary from ComplianceSession")
    
    # Get comprehensive session summary
    summary = global_compliance_session.get_session_summary()
    
    print(f"Session status: {summary.get('status', 'unknown')}")
    if summary.get('status') == 'loaded':
        session_info = summary.get('session', {})
        schemas_info = summary.get('schemas', {})
        print(f"Session has {len(schemas_info)} schemas")
        print(f"Available schemas: {list(schemas_info.keys())}")
    
    # Make JSON serializable
    result = make_json_serializable(summary)

except Exception as e:
    import traceback
    traceback.print_exc()
    print(f"Error getting session summary: {e}")
    result = {
        "status": "error",
        "error": str(e)
    }

json.dumps(result)
  `.trim();

    const out = await runPythonCode(code);
    return JSON.parse(out);
};
