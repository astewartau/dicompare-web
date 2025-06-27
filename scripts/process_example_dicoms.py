#!/usr/bin/env python3
"""
Process example DICOM files to create a pre-processed JSON file that can be loaded
instead of the actual DICOM files.
"""

import json
import sys
from pathlib import Path
import numpy as np
import pandas as pd

# Add the parent directory to the path so we can import dicompare
sys.path.insert(0, str(Path(__file__).parent.parent))

from dicompare import load_dicom_session, assign_acquisition_and_run_numbers
from dicompare.cli.gen_session import create_json_reference

# Default fields from DicomUploader.tsx
DEFAULT_DICOM_FIELDS = [
    # Core Identifiers
    "SeriesDescription",
    "SequenceName",
    "SequenceVariant",
    "ScanningSequence",
    "ImageType",
    
    "Manufacturer",
    "ManufacturerModelName",
    "SoftwareVersion",
  
    # Geometry
    "MRAcquisitionType",
    "SliceThickness",
    "PixelSpacing",
    "Rows",
    "Columns",
    "Slices",
    "AcquisitionMatrix",
    "ReconstructionDiameter",
  
    # Timing / Contrast
    "RepetitionTime",
    "EchoTime",
    "InversionTime",
    "FlipAngle",
    "EchoTrainLength",
    "GradientEchoTrainLength",
    "NumberOfTemporalPositions",
    "TemporalResolution",
    "SliceTiming",
  
    # Diffusion-specific
    "DiffusionBValue",
    "DiffusionGradientDirectionSequence",
  
    # Parallel Imaging / Multiband
    "ParallelAcquisitionTechnique",
    "ParallelReductionFactorInPlane",
    "PartialFourier",
    "SliceAccelerationFactor",
  
    # Bandwidth / Readout
    "PixelBandwidth",
    "BandwidthPerPixelPhaseEncode",
  
    # Phase encoding
    "InPlanePhaseEncodingDirection",
    "PhaseEncodingDirectionPositive",
    "NumberOfPhaseEncodingSteps",
  
    # Scanner hardware
    "MagneticFieldStrength",
    "ImagingFrequency",
    "ImagedNucleus",
    "TransmitCoilName",
    "ReceiveCoilName",
    "SAR",
    "NumberOfAverages",
    "CoilType",
  
    # Coverage / FOV %
    "PercentSampling",
    "PercentPhaseFieldOfView",
  
    # Scan options
    "ScanOptions",
    "AngioFlag",
  
    # Triggering / gating (mostly fMRI / cardiac)
    "TriggerTime",
    "TriggerSourceOrType",
    "BeatRejectionFlag",
    "LowRRValue",
    "HighRRValue",
  
    # Advanced / niche
    "SpoilingRFPhaseAngle",
    "PerfusionTechnique",
    "SpectrallySelectedExcitation",
    "SaturationRecovery",
    "SpectrallySelectedSuppression",
    "TimeOfFlightContrast",
    "SteadyStatePulseSequence",
    "PartialFourierDirection",
]

def clean_for_json(obj):
    """Recursively clean an object to make it JSON serializable"""
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

def process_dicom_directory(dicom_path: Path, reference_fields: list):
    """Process a directory of DICOM files and return the acquisition data"""
    print(f"Loading DICOM files from {dicom_path}...")
    
    # Load the DICOM session
    session = load_dicom_session(str(dicom_path))
    
    print(f"Loaded {len(session)} DICOM files")
    print(f"Columns: {list(session.columns)[:10]}...")  # Show first 10 columns
    
    # Filter reference_fields to only include fields that exist in the session
    available_fields = [f for f in reference_fields if f in session.columns]
    if not available_fields:
        # If no fields from reference_fields are available, fall back to basic fields
        basic_fields = ['ProtocolName', 'SeriesDescription', 'Manufacturer']
        available_fields = [f for f in basic_fields if f in session.columns]
        if not available_fields:
            raise ValueError("No suitable reference fields found in the session")
    
    print(f"Using {len(available_fields)} available fields")
    
    # Assign acquisition and run numbers
    print("Assigning acquisition numbers...")
    session = assign_acquisition_and_run_numbers(session)
    
    # Sort acquisitions
    session.sort_values(by=['Acquisition'] + available_fields, inplace=True)
    
    print(f"Found {len(session['Acquisition'].unique())} unique acquisitions")
    
    # Create JSON reference
    print("Creating JSON reference...")
    acquisitions = create_json_reference(session, available_fields)
    
    # Clean the data for JSON serialization
    clean_acquisitions = clean_for_json(acquisitions['acquisitions'])
    
    return clean_acquisitions

def main():
    # Paths to the example DICOM directories
    t1_path = Path("/home/ashley/downloads/Medical_Data/ukbiobank-reference-data/20216-eg_brain_t1-structural-brain-images-20216")
    t2_path = Path("/home/ashley/downloads/Medical_Data/ukbiobank-reference-data/20220-eg_brain_t2flair-structural-brain-images-20220")
    
    # Output path
    output_path = Path(__file__).parent.parent / "public" / "example-dicoms.json"
    
    # Process both directories
    all_acquisitions = {}
    
    if t1_path.exists():
        print("\nProcessing T1 DICOMs...")
        t1_acquisitions = process_dicom_directory(t1_path, DEFAULT_DICOM_FIELDS)
        all_acquisitions.update(t1_acquisitions)
    
    if t2_path.exists():
        print("\nProcessing T2 FLAIR DICOMs...")
        t2_acquisitions = process_dicom_directory(t2_path, DEFAULT_DICOM_FIELDS)
        all_acquisitions.update(t2_acquisitions)
    
    # Save to JSON
    print(f"\nSaving to {output_path}...")
    output_path.parent.mkdir(exist_ok=True)
    
    with open(output_path, 'w') as f:
        json.dump(all_acquisitions, f, indent=2)
    
    # Print summary
    print(f"\nSuccessfully processed {len(all_acquisitions)} acquisitions")
    for acq_name, acq_data in all_acquisitions.items():
        series_count = len(acq_data.get('series', []))
        field_count = len(acq_data.get('fields', []))
        print(f"  - {acq_name}: {series_count} series, {field_count} fields")

if __name__ == "__main__":
    main()