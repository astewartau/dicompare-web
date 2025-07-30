// Load Pyodide from CDN instead of bundling

export interface PyodideInstance {
  runPython: (code: string) => any;
  globals: {
    get: (name: string) => any;
    set: (name: string, value: any) => void;
  };
  loadPackage: (packages: string | string[]) => Promise<void>;
}

class PyodideManager {
  private pyodide: PyodideInstance | null = null;
  private isLoading = false;
  private loadPromise: Promise<PyodideInstance> | null = null;

  async initialize(): Promise<PyodideInstance> {
    if (this.pyodide) {
      return this.pyodide;
    }

    if (this.isLoading && this.loadPromise) {
      return this.loadPromise;
    }

    this.isLoading = true;
    this.loadPromise = this.loadPyodide();
    
    try {
      this.pyodide = await this.loadPromise;
      return this.pyodide;
    } finally {
      this.isLoading = false;
    }
  }

  private async loadPyodide(): Promise<PyodideInstance> {
    console.log('🐍 Initializing Pyodide...');
    const startTime = Date.now();

    // Load Pyodide from CDN
    const pyodide = await window.loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/',
    });

    const loadTime = Date.now() - startTime;
    console.log(`🐍 Pyodide loaded in ${loadTime}ms`);

    // Install and load the mock dicompare package
    await this.setupMockDicompare(pyodide);

    return pyodide;
  }

  private async setupMockDicompare(pyodide: PyodideInstance): Promise<void> {
    console.log('📦 Setting up mock dicompare API...');
    
    // Create the mock dicompare module in Python
    pyodide.runPython(`
import json
from typing import List, Dict, Any
from datetime import datetime, timezone

class DicompareAPI:
    """Mock implementation of the dicompare Python API"""
    
    def __init__(self):
        # Comprehensive DICOM field dictionary with all common fields
        self.field_dict = {
            # Core identification fields
            "0008,0060": {
                "tag": "0008,0060",
                "name": "Modality", 
                "keyword": "Modality",
                "vr": "CS",
                "vm": "1",
                "description": "Type of equipment that originally acquired the data",
                "suggested_data_type": "string",
                "suggested_validation": "exact",
                "common_values": ["MR", "CT", "PT", "US", "CR", "DX"]
            },
            "0008,103E": {
                "tag": "0008,103E",
                "name": "SeriesDescription",
                "keyword": "SeriesDescription",
                "vr": "LO",
                "vm": "1",
                "description": "User provided description of the Series",
                "suggested_data_type": "string",
                "suggested_validation": "exact",
                "common_values": ["T1_MPRAGE_SAG", "BOLD_task_rest", "DTI_30dir_b1000", "T2_FLAIR_AXIAL", "QSM_multi_echo"]
            },
            "0018,0024": {
                "tag": "0018,0024",
                "name": "SequenceName",
                "keyword": "SequenceName",
                "vr": "SH",
                "vm": "1",
                "description": "User or equipment generated sequence name",
                "suggested_data_type": "string",
                "suggested_validation": "exact",
                "common_values": ["tfl3d1", "epfid2d1_64", "ep2d_diff", "tir2d1_16", "gre3d1vfl"]
            },
            
            # Hardware specifications
            "0008,0070": {
                "tag": "0008,0070",
                "name": "Manufacturer",
                "keyword": "Manufacturer", 
                "vr": "LO",
                "vm": "1",
                "description": "Manufacturer of the equipment",
                "suggested_data_type": "string",
                "suggested_validation": "exact",
                "common_values": ["SIEMENS", "GE MEDICAL SYSTEMS", "Philips Medical Systems"]
            },
            "0008,1090": {
                "tag": "0008,1090",
                "name": "ManufacturerModelName",
                "keyword": "ManufacturerModelName",
                "vr": "LO",
                "vm": "1",
                "description": "Manufacturer's model name of the equipment",
                "suggested_data_type": "string",
                "suggested_validation": "exact",
                "common_values": ["Prisma", "Skyra", "Aera", "SIGNA Premier", "Ingenia"]
            },
            "0018,0087": {
                "tag": "0018,0087",
                "name": "MagneticFieldStrength",
                "keyword": "MagneticFieldStrength",
                "vr": "DS",
                "vm": "1",
                "description": "Nominal field strength of MR magnet in Tesla",
                "suggested_data_type": "number",
                "suggested_validation": "exact",
                "common_values": [3.0, 1.5, 7.0]
            },
            "0018,1250": {
                "tag": "0018,1250",
                "name": "ReceiveCoilName",
                "keyword": "ReceiveCoilName",
                "vr": "SH",
                "vm": "1",
                "description": "Receive coil manufacturer's designation",
                "suggested_data_type": "string",
                "suggested_validation": "exact",
                "common_values": ["HeadNeck_64", "Head/Neck 20", "32Ch Head", "HeadMatrix"]
            },
            
            # Critical timing parameters
            "0018,0080": {
                "tag": "0018,0080",
                "name": "RepetitionTime",
                "keyword": "RepetitionTime",
                "vr": "DS",
                "vm": "1", 
                "description": "The period of time in msec between the beginning of a pulse sequence and the beginning of the succeeding pulse sequence",
                "suggested_data_type": "number",
                "suggested_validation": "tolerance",
                "common_values": [800, 2000, 3000, 8400, 9000, 28],
                "validation_hints": {
                    "tolerance_typical": 50,
                    "range_typical": [100, 15000]
                }
            },
            "0018,0081": {
                "tag": "0018,0081",
                "name": "EchoTime",
                "keyword": "EchoTime",
                "vr": "DS",
                "vm": "1",
                "description": "Time in ms between the middle of the excitation pulse and the peak of the echo produced",
                "suggested_data_type": "number",
                "suggested_validation": "tolerance",
                "common_values": [3.25, 7.38, 14.76, 22.14, 29.52, 37.0, 88.0, 125],
                "validation_hints": {
                    "tolerance_typical": 0.1,
                    "range_typical": [1.0, 200.0]
                }
            },
            "0018,0082": {
                "tag": "0018,0082",
                "name": "InversionTime",
                "keyword": "InversionTime",
                "vr": "DS",
                "vm": "1",
                "description": "Time in msec after the middle of inverting RF pulse to middle of excitation pulse to detect the amount of longitudinal magnetization",
                "suggested_data_type": "number",
                "suggested_validation": "tolerance",
                "common_values": [2500, 2000, 1800],
                "validation_hints": {
                    "tolerance_typical": 100,
                    "range_typical": [200, 5000]
                }
            },
            "0018,1314": {
                "tag": "0018,1314",
                "name": "FlipAngle",
                "keyword": "FlipAngle",
                "vr": "DS",
                "vm": "1",
                "description": "Steady state angle in degrees to which the magnetic vector is flipped",
                "suggested_data_type": "number",
                "suggested_validation": "tolerance",
                "common_values": [9, 15, 52, 90, 120, 180],
                "validation_hints": {
                    "tolerance_typical": 1,
                    "range_typical": [1, 180]
                }
            },
            
            # Spatial parameters
            "0018,0050": {
                "tag": "0018,0050",
                "name": "SliceThickness",
                "keyword": "SliceThickness",
                "vr": "DS",
                "vm": "1",
                "description": "Nominal slice thickness in mm",
                "suggested_data_type": "number",
                "suggested_validation": "tolerance",
                "common_values": [1.0, 2.0, 3.0, 5.0],
                "validation_hints": {
                    "tolerance_typical": 0.1,
                    "range_typical": [0.5, 10.0]
                }
            },
            "0028,0030": {
                "tag": "0028,0030",
                "name": "PixelSpacing",
                "keyword": "PixelSpacing",
                "vr": "DS",
                "vm": "2",
                "description": "Physical distance in the patient between the center of each pixel",
                "suggested_data_type": "list_number",
                "suggested_validation": "tolerance",
                "common_values": [[1.0, 1.0], [0.5, 0.5], [1.25, 1.25], [2.0, 2.0]]
            },
            "0018,5100": {
                "tag": "0018,5100",
                "name": "PatientPosition",
                "keyword": "PatientPosition",
                "vr": "CS",
                "vm": "1",
                "description": "Patient position descriptor relative to the equipment",
                "suggested_data_type": "string",
                "suggested_validation": "exact",
                "common_values": ["HFS", "HFP", "HFDR", "HFDL"]
            },
            "0020,0032": {
                "tag": "0020,0032",
                "name": "ImagePositionPatient",
                "keyword": "ImagePositionPatient",
                "vr": "DS",
                "vm": "3",
                "description": "The x, y, and z coordinates of the upper left hand corner of the image",
                "suggested_data_type": "list_number",
                "suggested_validation": "tolerance",
                "common_values": [[0, -106.7, -35.2], [0, 0, 0], [-120, -120, 75]]
            },
            
            # Image characteristics
            "0008,0008": {
                "tag": "0008,0008",
                "name": "ImageType",
                "keyword": "ImageType",
                "vr": "CS",
                "vm": "2-n",
                "description": "Image identification characteristics",
                "suggested_data_type": "list_string",
                "suggested_validation": "exact",
                "common_values": [
                    ["ORIGINAL", "PRIMARY", "M", "ND"],
                    ["ORIGINAL", "PRIMARY", "DIFFUSION", "NONE"],
                    ["ORIGINAL", "PRIMARY", "DIFFUSION", "ADC"],
                    ["DERIVED", "SECONDARY"]
                ]
            },
            "0020,0011": {
                "tag": "0020,0011",
                "name": "SeriesNumber",
                "keyword": "SeriesNumber",
                "vr": "IS",
                "vm": "1",
                "description": "A number that identifies this Series",
                "suggested_data_type": "number",
                "suggested_validation": "exact",
                "common_values": [1, 2, 3, 4, 5, 6, 10, 15]
            },
            
            # Advanced/specialized parameters
            "0019,1028": {
                "tag": "0019,1028", 
                "name": "MultibandFactor",
                "keyword": "MultibandFactor",
                "vr": "IS",
                "vm": "1",
                "description": "Multiband acceleration factor",
                "suggested_data_type": "number",
                "suggested_validation": "exact",
                "common_values": [1, 2, 4, 6, 8]
            },
            "0051,1011": {
                "tag": "0051,1011",
                "name": "ParallelReductionFactorInPlane", 
                "keyword": "ParallelReductionFactorInPlane",
                "vr": "DS",
                "vm": "1",
                "description": "Parallel imaging reduction factor in the image plane",
                "suggested_data_type": "number",
                "suggested_validation": "exact",
                "common_values": [1, 2, 3, 4]
            },
            "0018,0095": {
                "tag": "0018,0095",
                "name": "PixelBandwidth",
                "keyword": "PixelBandwidth",
                "vr": "DS",
                "vm": "1",
                "description": "Reciprocal of the total sampling period, in hertz per pixel",
                "suggested_data_type": "number",
                "suggested_validation": "tolerance",
                "common_values": [240, 488, 651, 2170]
            },
            "0018,0022": {
                "tag": "0018,0022",
                "name": "ScanOptions",
                "keyword": "ScanOptions",
                "vr": "CS",
                "vm": "1-n",
                "description": "Parameters of scanning sequence",
                "suggested_data_type": "string",
                "suggested_validation": "exact",
                "common_values": ["PFP\\\\SP", "SP", "FS", "SS"]
            },
            "0018,0023": {
                "tag": "0018,0023",
                "name": "MRAcquisitionType",
                "keyword": "MRAcquisitionType",
                "vr": "CS",
                "vm": "1",
                "description": "Identification of data encoding scheme",
                "suggested_data_type": "string",
                "suggested_validation": "exact",
                "common_values": ["2D", "3D"]
            },
            
            # DTI/DWI specific
            "0018,9087": {
                "tag": "0018,9087",
                "name": "DiffusionBValue",
                "keyword": "DiffusionBValue",
                "vr": "FD",
                "vm": "1",
                "description": "Diffusion b-value for diffusion weighted images",
                "suggested_data_type": "number",
                "suggested_validation": "exact",
                "common_values": [0, 1000, 2000, 3000]
            },
            "0018,9089": {
                "tag": "0018,9089",
                "name": "DiffusionGradientDirectionSequence",
                "keyword": "DiffusionGradientDirectionSequence",
                "vr": "SQ",
                "vm": "1",
                "description": "Sequence that describes the diffusion gradient direction",
                "suggested_data_type": "json",
                "suggested_validation": "exact",
                "common_values": [{}]
            }
        }
    
    def analyze_dicom_files(self, file_paths: List[str]) -> Dict:
        """Mock file analysis - returns comprehensive realistic acquisition data"""
        # Return all 5 acquisitions from the original mock data
        return {
            "acquisitions": [
                # T1 MPRAGE - single series acquisition
                {
                    "id": "acq_001",
                    "protocol_name": "T1_MPRAGE_SAG",
                    "series_description": "T1 MPRAGE Sagittal",
                    "total_files": 192,
                    "acquisition_fields": [
                        {"tag": "0008,0060", "name": "Modality", "value": "MR", "vr": "CS", "level": "acquisition", "data_type": "string", "consistency": "constant"},
                        {"tag": "0008,0070", "name": "Manufacturer", "value": "SIEMENS", "vr": "LO", "level": "acquisition", "data_type": "string", "consistency": "constant"},
                        {"tag": "0008,103E", "name": "SeriesDescription", "value": "T1_MPRAGE_SAG", "vr": "LO", "level": "acquisition", "data_type": "string", "consistency": "constant"},
                        {"tag": "0018,0024", "name": "SequenceName", "value": "tfl3d1", "vr": "SH", "level": "acquisition", "data_type": "string", "consistency": "constant"},
                        {"tag": "0018,0087", "name": "MagneticFieldStrength", "value": 3, "vr": "DS", "level": "acquisition", "data_type": "number", "consistency": "constant"},
                        {"tag": "0018,0080", "name": "RepetitionTime", "value": 2000, "vr": "DS", "level": "acquisition", "data_type": "number", "consistency": "constant"},
                        {"tag": "0018,0081", "name": "EchoTime", "value": 3.25, "vr": "DS", "level": "acquisition", "data_type": "number", "consistency": "constant"},
                        {"tag": "0018,1314", "name": "FlipAngle", "value": 9, "vr": "DS", "level": "acquisition", "data_type": "number", "consistency": "constant"},
                        {"tag": "0018,0050", "name": "SliceThickness", "value": 1, "vr": "DS", "level": "acquisition", "data_type": "number", "consistency": "constant"},
                        {"tag": "0018,5100", "name": "PatientPosition", "value": "HFS", "vr": "CS", "level": "acquisition", "data_type": "string", "consistency": "constant"},
                        {"tag": "0008,0008", "name": "ImageType", "value": ["ORIGINAL", "PRIMARY", "M", "ND"], "vr": "CS", "level": "acquisition", "data_type": "list_string", "consistency": "constant"}
                    ],
                    "series_fields": [],
                    "series": [],
                    "metadata": {
                        "manufacturer": "SIEMENS",
                        "magnetic_field_strength": "3.0T",
                        "patient_position": "HFS",
                        "sequence_name": "tfl3d1",
                        "series_count": 1,
                        "notes": "Standard structural T1-weighted acquisition"
                    }
                },
                # BOLD fMRI - single series acquisition
                {
                    "id": "acq_002",
                    "protocol_name": "BOLD_task_rest",
                    "series_description": "BOLD resting state fMRI",
                    "total_files": 240,
                    "acquisition_fields": [
                        {"tag": "0008,0060", "name": "Modality", "value": "MR", "vr": "CS", "level": "acquisition", "data_type": "string", "consistency": "constant"},
                        {"tag": "0008,0070", "name": "Manufacturer", "value": "SIEMENS", "vr": "LO", "level": "acquisition", "data_type": "string", "consistency": "constant"},
                        {"tag": "0008,103E", "name": "SeriesDescription", "value": "BOLD_task_rest", "vr": "LO", "level": "acquisition", "data_type": "string", "consistency": "constant"},
                        {"tag": "0018,0024", "name": "SequenceName", "value": "epfid2d1_64", "vr": "SH", "level": "acquisition", "data_type": "string", "consistency": "constant"},
                        {"tag": "0018,0087", "name": "MagneticFieldStrength", "value": 3, "vr": "DS", "level": "acquisition", "data_type": "number", "consistency": "constant"},
                        {"tag": "0018,0080", "name": "RepetitionTime", "value": 800, "vr": "DS", "level": "acquisition", "data_type": "number", "consistency": "constant"},
                        {"tag": "0018,0081", "name": "EchoTime", "value": 37, "vr": "DS", "level": "acquisition", "data_type": "number", "consistency": "constant"},
                        {"tag": "0018,1314", "name": "FlipAngle", "value": 52, "vr": "DS", "level": "acquisition", "data_type": "number", "consistency": "constant"},
                        {"tag": "0019,1028", "name": "MultibandFactor", "value": 8, "vr": "IS", "level": "acquisition", "data_type": "number", "consistency": "constant"},
                        {"tag": "0008,0008", "name": "ImageType", "value": ["ORIGINAL", "PRIMARY", "M", "ND"], "vr": "CS", "level": "acquisition", "data_type": "list_string", "consistency": "constant"}
                    ],
                    "series_fields": [],
                    "series": [],
                    "metadata": {
                        "manufacturer": "SIEMENS",
                        "magnetic_field_strength": "3.0T",
                        "patient_position": "HFS",
                        "sequence_name": "epfid2d1_64",
                        "multiband_factor": "8",
                        "series_count": 1,
                        "notes": "High temporal resolution functional MRI with multiband acceleration"
                    }
                },
                # DTI - multi-series acquisition (b0 + diffusion)
                {
                    "id": "acq_003",
                    "protocol_name": "DTI_30dir_b1000",
                    "series_description": "Diffusion Tensor Imaging 30 directions",
                    "total_files": 93,
                    "acquisition_fields": [
                        {"tag": "0008,0060", "name": "Modality", "value": "MR", "vr": "CS", "level": "acquisition", "data_type": "string", "consistency": "constant"},
                        {"tag": "0008,0070", "name": "Manufacturer", "value": "SIEMENS", "vr": "LO", "level": "acquisition", "data_type": "string", "consistency": "constant"},
                        {"tag": "0008,103E", "name": "SeriesDescription", "value": "DTI_30dir_b1000", "vr": "LO", "level": "acquisition", "data_type": "string", "consistency": "constant"},
                        {"tag": "0018,0024", "name": "SequenceName", "value": "ep2d_diff", "vr": "SH", "level": "acquisition", "data_type": "string", "consistency": "constant"},
                        {"tag": "0018,0087", "name": "MagneticFieldStrength", "value": 3, "vr": "DS", "level": "acquisition", "data_type": "number", "consistency": "constant"},
                        {"tag": "0018,0080", "name": "RepetitionTime", "value": 8400, "vr": "DS", "level": "acquisition", "data_type": "number", "consistency": "constant"},
                        {"tag": "0018,0081", "name": "EchoTime", "value": 88, "vr": "DS", "level": "acquisition", "data_type": "number", "consistency": "constant"},
                        {"tag": "0018,0050", "name": "SliceThickness", "value": 2, "vr": "DS", "level": "acquisition", "data_type": "number", "consistency": "constant"}
                    ],
                    "series_fields": [
                        {"tag": "0018,9087", "name": "DiffusionBValue", "values": [0, 1000], "vr": "FD", "level": "series", "data_type": "number", "consistency": "varying"},
                        {"tag": "0008,0008", "name": "ImageType", "values": [["ORIGINAL", "PRIMARY", "DIFFUSION", "NONE"], ["ORIGINAL", "PRIMARY", "DIFFUSION", "ADC"]], "vr": "CS", "level": "series", "data_type": "list_string", "consistency": "varying"}
                    ],
                    "series": [
                        {
                            "name": "b0 Reference",
                            "instance_count": 3,
                            "field_values": {
                                "0018,9087": 0,
                                "0008,0008": ["ORIGINAL", "PRIMARY", "DIFFUSION", "NONE"],
                                "0020,0011": 1
                            }
                        },
                        {
                            "name": "DTI b1000",
                            "instance_count": 90,
                            "field_values": {
                                "0018,9087": 1000,
                                "0008,0008": ["ORIGINAL", "PRIMARY", "DIFFUSION", "ADC"],
                                "0020,0011": 2
                            }
                        }
                    ],
                    "metadata": {
                        "manufacturer": "SIEMENS",
                        "magnetic_field_strength": "3.0T",
                        "patient_position": "HFS",
                        "sequence_name": "ep2d_diff",
                        "series_count": 2,
                        "notes": "30-direction DTI with b-value 1000 s/mm²"
                    }
                },
                # T2 FLAIR - single series acquisition
                {
                    "id": "acq_004",
                    "protocol_name": "T2_FLAIR_AXIAL",
                    "series_description": "T2 FLAIR Axial",
                    "total_files": 28,
                    "acquisition_fields": [
                        {"tag": "0008,0060", "name": "Modality", "value": "MR", "vr": "CS", "level": "acquisition", "data_type": "string", "consistency": "constant"},
                        {"tag": "0008,0070", "name": "Manufacturer", "value": "SIEMENS", "vr": "LO", "level": "acquisition", "data_type": "string", "consistency": "constant"},
                        {"tag": "0008,103E", "name": "SeriesDescription", "value": "T2_FLAIR_AXIAL", "vr": "LO", "level": "acquisition", "data_type": "string", "consistency": "constant"},
                        {"tag": "0018,0024", "name": "SequenceName", "value": "tir2d1_16", "vr": "SH", "level": "acquisition", "data_type": "string", "consistency": "constant"},
                        {"tag": "0018,0087", "name": "MagneticFieldStrength", "value": 3, "vr": "DS", "level": "acquisition", "data_type": "number", "consistency": "constant"},
                        {"tag": "0018,0080", "name": "RepetitionTime", "value": 9000, "vr": "DS", "level": "acquisition", "data_type": "number", "consistency": "constant"},
                        {"tag": "0018,0081", "name": "EchoTime", "value": 125, "vr": "DS", "level": "acquisition", "data_type": "number", "consistency": "constant"},
                        {"tag": "0018,0082", "name": "InversionTime", "value": 2500, "vr": "DS", "level": "acquisition", "data_type": "number", "consistency": "constant"},
                        {"tag": "0018,1314", "name": "FlipAngle", "value": 120, "vr": "DS", "level": "acquisition", "data_type": "number", "consistency": "constant"},
                        {"tag": "0018,0050", "name": "SliceThickness", "value": 5, "vr": "DS", "level": "acquisition", "data_type": "number", "consistency": "constant"},
                        {"tag": "0008,0008", "name": "ImageType", "value": ["ORIGINAL", "PRIMARY", "M", "ND"], "vr": "CS", "level": "acquisition", "data_type": "list_string", "consistency": "constant"}
                    ],
                    "series_fields": [],
                    "series": [],
                    "metadata": {
                        "manufacturer": "SIEMENS",
                        "magnetic_field_strength": "3.0T",
                        "patient_position": "HFS",
                        "sequence_name": "tir2d1_16",
                        "series_count": 1,
                        "notes": "Fluid-attenuated inversion recovery for lesion detection"
                    }
                },
                # QSM Multi-echo - multi-series acquisition
                {
                    "id": "acq_005",
                    "protocol_name": "QSM_multi_echo",
                    "series_description": "Quantitative Susceptibility Mapping",
                    "total_files": 96,
                    "acquisition_fields": [
                        {"tag": "0008,0060", "name": "Modality", "value": "MR", "vr": "CS", "level": "acquisition", "data_type": "string", "consistency": "constant"},
                        {"tag": "0008,0070", "name": "Manufacturer", "value": "SIEMENS", "vr": "LO", "level": "acquisition", "data_type": "string", "consistency": "constant"},
                        {"tag": "0008,103E", "name": "SeriesDescription", "value": "QSM_multi_echo", "vr": "LO", "level": "acquisition", "data_type": "string", "consistency": "constant"},
                        {"tag": "0018,0024", "name": "SequenceName", "value": "gre3d1vfl", "vr": "SH", "level": "acquisition", "data_type": "string", "consistency": "constant"},
                        {"tag": "0018,0087", "name": "MagneticFieldStrength", "value": 3, "vr": "DS", "level": "acquisition", "data_type": "number", "consistency": "constant"},
                        {"tag": "0018,0080", "name": "RepetitionTime", "value": 28, "vr": "DS", "level": "acquisition", "data_type": "number", "consistency": "constant"},
                        {"tag": "0018,1314", "name": "FlipAngle", "value": 15, "vr": "DS", "level": "acquisition", "data_type": "number", "consistency": "constant"},
                        {"tag": "0018,0050", "name": "SliceThickness", "value": 2, "vr": "DS", "level": "acquisition", "data_type": "number", "consistency": "constant"}
                    ],
                    "series_fields": [
                        {"tag": "0018,0081", "name": "EchoTime", "values": [7.38, 14.76, 22.14, 29.52], "vr": "DS", "level": "series", "data_type": "number", "consistency": "varying"},
                        {"tag": "0008,0008", "name": "ImageType", "values": [["ORIGINAL", "PRIMARY", "M", "ND"]], "vr": "CS", "level": "series", "data_type": "list_string", "consistency": "constant"}
                    ],
                    "series": [
                        {
                            "name": "Echo 1",
                            "instance_count": 24,
                            "field_values": {
                                "0018,0081": 7.38,
                                "0008,0008": ["ORIGINAL", "PRIMARY", "M", "ND"],
                                "0020,0011": 1
                            }
                        },
                        {
                            "name": "Echo 2",
                            "instance_count": 24,
                            "field_values": {
                                "0018,0081": 14.76,
                                "0008,0008": ["ORIGINAL", "PRIMARY", "M", "ND"],
                                "0020,0011": 2
                            }
                        },
                        {
                            "name": "Echo 3",
                            "instance_count": 24,
                            "field_values": {
                                "0018,0081": 22.14,
                                "0008,0008": ["ORIGINAL", "PRIMARY", "M", "ND"],
                                "0020,0011": 3
                            }
                        },
                        {
                            "name": "Echo 4",
                            "instance_count": 24,
                            "field_values": {
                                "0018,0081": 29.52,
                                "0008,0008": ["ORIGINAL", "PRIMARY", "M", "ND"],
                                "0020,0011": 4
                            }
                        }
                    ],
                    "metadata": {
                        "manufacturer": "SIEMENS",
                        "magnetic_field_strength": "3.0T",
                        "patient_position": "HFS",
                        "sequence_name": "gre3d1vfl",
                        "series_count": 4,
                        "echo_times": ["7.38", "14.76", "22.14", "29.52"],
                        "notes": "Multi-echo gradient echo for quantitative susceptibility mapping"
                    }
                }
            ],
            "summary": {
                "total_files": 649,  # Sum of all acquisitions
                "total_acquisitions": 5,
                "common_fields": ["0008,0060", "0008,0070", "0018,0087"],
                "suggested_validation_fields": ["0008,0060", "0008,0070", "0018,0080", "0018,0081", "0018,1314", "0018,0050"]
            }
        }
    
    def get_field_info(self, tag: str) -> Dict:
        """Get field information from mock dictionary"""
        return self.field_dict.get(tag, {
            "tag": tag,
            "name": f"Unknown_{tag.replace(',', '_')}",
            "keyword": f"Unknown_{tag.replace(',', '_')}",
            "vr": "UN",
            "vm": "1",
            "description": f"Unknown field {tag}",
            "suggested_data_type": "string",
            "suggested_validation": "exact",
            "common_values": []
        })
    
    def search_fields(self, query: str, limit: int = 20) -> List[Dict]:
        """Search fields by name or tag"""
        query_lower = query.lower()
        results = []
        
        for tag, info in self.field_dict.items():
            if (query_lower in info["name"].lower() or 
                query_lower in tag.lower() or
                query_lower in info["keyword"].lower()):
                results.append(info)
                if len(results) >= limit:
                    break
        
        return results
    
    def generate_validation_template(self, acquisitions: List[Dict], metadata: Dict) -> Dict:
        """Generate validation template from configured acquisitions"""
        return {
            "template": {
                "version": "1.0",
                "name": metadata.get("name", "Generated Template"),
                "description": metadata.get("description", "Auto-generated validation template"),
                "created": datetime.now(timezone.utc).isoformat(),
                "acquisitions": acquisitions,
                "global_constraints": metadata.get("global_constraints", {})
            },
            "statistics": {
                "total_acquisitions": len(acquisitions),
                "total_validation_fields": sum(len(acq.get("acquisition_fields", [])) + len(acq.get("series_fields", [])) for acq in acquisitions),
                "estimated_validation_time": f"{len(acquisitions) * 1.2:.1f}s per study"
            }
        }
    
    def parse_schema(self, schema_content: str, format: str = 'json') -> Dict:
        """Parse uploaded schema file and extract detailed validation rules"""
        try:
            if format == 'json':
                schema_data = json.loads(schema_content)
            elif format == 'python':
                # Simple Python schema parsing - execute safe subset
                local_vars = {}
                exec(schema_content, {"__builtins__": {}}, local_vars)
                schema_data = local_vars.get('schema', {})
            else:
                raise ValueError(f"Unsupported schema format: {format}")
            
            # Extract validation rules from schema
            validation_rules = []
            schema_fields = []
            
            if 'acquisitions' in schema_data:
                for acq in schema_data['acquisitions']:
                    for field in acq.get('acquisition_fields', []):
                        rule = self._extract_validation_rule(field)
                        if rule:
                            validation_rules.append(rule)
                        schema_fields.append(self._extract_schema_field(field))
                    
                    for field in acq.get('series_fields', []):
                        rule = self._extract_validation_rule(field)
                        if rule:
                            validation_rules.append(rule)
                        schema_fields.append(self._extract_schema_field(field))
            
            return {
                "parsed_schema": {
                    "title": schema_data.get("title", schema_data.get("name", "Unknown Schema")),
                    "version": schema_data.get("version", "1.0.0"),
                    "description": schema_data.get("description", ""),
                    "acquisitions": schema_data.get("acquisitions", []),
                    "validation_rules": validation_rules,
                    "fields": schema_fields,
                    "metadata": {
                        "total_acquisitions": len(schema_data.get("acquisitions", [])),
                        "total_rules": len(validation_rules),
                        "total_fields": len(schema_fields)
                    }
                }
            }
        except Exception as e:
            return {
                "error": f"Schema parsing failed: {str(e)}",
                "parsed_schema": None
            }
    
    def _extract_validation_rule(self, field: Dict) -> Dict:
        """Extract validation rule from field definition"""
        field_info = self.get_field_info(field.get("tag", ""))
        validation_type = field_info.get("suggested_validation", "exact")
        
        rule = {
            "fieldPath": field.get("tag", ""),
            "type": validation_type,
            "message": f"Validation for {field.get('name', 'field')}"
        }
        
        if "value" in field:
            rule["value"] = field["value"]
        elif "values" in field:
            rule["value"] = field["values"]
        
        if validation_type == "tolerance" and "validation_hints" in field_info:
            hints = field_info["validation_hints"]
            rule["tolerance"] = hints.get("tolerance_typical", 1.0)
        elif validation_type == "range" and "validation_hints" in field_info:
            hints = field_info["validation_hints"]
            rule["min"] = hints.get("range_typical", [0, 100])[0]
            rule["max"] = hints.get("range_typical", [0, 100])[1]
        
        return rule
    
    def _extract_schema_field(self, field: Dict) -> Dict:
        """Extract schema field information"""
        field_info = self.get_field_info(field.get("tag", ""))
        
        return {
            "path": field.get("tag", ""),
            "tag": field.get("tag", ""),
            "name": field.get("name", field_info.get("name", "Unknown")),
            "required": field.get("required", True),
            "dataType": field_info.get("suggested_data_type", "string"),
            "validation": [self._extract_validation_rule(field)]
        }
    
    def validate_compliance(self, dicom_data: Dict, schema_content: str, format: str = 'json') -> Dict:
        """Perform real compliance checking using schema rules vs DICOM data"""
        try:
            # Parse the schema first
            parsed = self.parse_schema(schema_content, format)
            if "error" in parsed:
                return {"error": parsed["error"]}
            
            schema = parsed["parsed_schema"]
            field_results = []
            passed = 0
            failed = 0
            warnings = 0
            
            # Get acquisitions from DICOM data
            acquisitions = dicom_data.get("acquisitions", [])
            
            # Validate each rule against DICOM data
            for rule in schema["validation_rules"]:
                result = self._validate_field_rule(rule, acquisitions)
                field_results.append(result)
                
                if result["status"] == "pass":
                    passed += 1
                elif result["status"] == "fail":
                    failed += 1
                else:
                    warnings += 1
            
            overall_status = "pass" if failed == 0 else ("warning" if failed == 0 and warnings > 0 else "fail")
            
            return {
                "compliance_report": {
                    "schemaId": "uploaded_schema",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "overallStatus": overall_status,
                    "fieldResults": field_results,
                    "summary": {
                        "total": len(field_results),
                        "passed": passed,
                        "failed": failed,
                        "warnings": warnings
                    }
                }
            }
        except Exception as e:
            return {"error": f"Compliance validation failed: {str(e)}"}
    
    def _validate_field_rule(self, rule: Dict, acquisitions: List[Dict]) -> Dict:
        """Validate a single field rule against DICOM acquisitions"""
        field_path = rule["fieldPath"]
        expected_value = rule.get("value")
        validation_type = rule.get("type", "exact")
        
        # Find field value in acquisitions
        actual_value = None
        found_field = False
        
        for acq in acquisitions:
            # Check acquisition fields
            for field in acq.get("acquisition_fields", []):
                if field.get("tag") == field_path:
                    actual_value = field.get("value")
                    found_field = True
                    break
            
            # Check series fields
            if not found_field:
                for field in acq.get("series_fields", []):
                    if field.get("tag") == field_path:
                        actual_value = field.get("values", [])
                        found_field = True
                        break
        
        if not found_field:
            return {
                "fieldPath": field_path,
                "fieldName": rule.get("message", f"Field {field_path}"),
                "status": "fail",
                "message": f"Required field {field_path} not found in DICOM data",
                "rule": rule
            }
        
        # Validate based on rule type
        if validation_type == "exact":
            matches = actual_value == expected_value
            status = "pass" if matches else "fail"
            message = f"Expected {expected_value}, got {actual_value}" if not matches else "Value matches expected"
        
        elif validation_type == "tolerance":
            tolerance = rule.get("tolerance", 1.0)
            if isinstance(actual_value, (int, float)) and isinstance(expected_value, (int, float)):
                diff = abs(actual_value - expected_value)
                matches = diff <= tolerance
                status = "pass" if matches else "fail"
                message = f"Value {actual_value} within tolerance ±{tolerance} of {expected_value}" if matches else f"Value {actual_value} outside tolerance ±{tolerance} of {expected_value}"
            else:
                status = "fail"
                message = f"Cannot apply tolerance validation to non-numeric values"
        
        elif validation_type == "range":
            min_val = rule.get("min", 0)
            max_val = rule.get("max", 100)
            if isinstance(actual_value, (int, float)):
                matches = min_val <= actual_value <= max_val
                status = "pass" if matches else "fail"
                message = f"Value {actual_value} within range [{min_val}, {max_val}]" if matches else f"Value {actual_value} outside range [{min_val}, {max_val}]"
            else:
                status = "fail"
                message = f"Cannot apply range validation to non-numeric value"
        
        elif validation_type == "contains":
            if isinstance(expected_value, list) and actual_value in expected_value:
                status = "pass"
                message = f"Value {actual_value} found in allowed values"
            else:
                status = "fail"
                message = f"Value {actual_value} not in allowed values {expected_value}"
        
        else:
            status = "warning"
            message = f"Unknown validation type: {validation_type}"
        
        return {
            "fieldPath": field_path,
            "fieldName": rule.get("message", f"Field {field_path}"),
            "status": status,
            "expectedValue": expected_value,
            "actualValue": actual_value,
            "message": message,
            "rule": rule
        }
    
    def get_example_schemas(self) -> List[Dict]:
        """Return pre-loaded example schemas for demo purposes"""
        return [
            {
                "id": "t1_mprage_schema",
                "name": "T1 MPRAGE Validation Schema",
                "description": "Standard structural T1-weighted MPRAGE validation template",
                "category": "Structural MRI",
                "content": json.dumps({
                    "title": "T1 MPRAGE Validation Schema",
                    "version": "1.0.0",
                    "description": "Validation schema for T1-weighted MPRAGE acquisitions",
                    "acquisitions": [{
                        "id": "t1_mprage",
                        "protocol_name": "T1_MPRAGE",
                        "acquisition_fields": [
                            {"tag": "0008,0060", "name": "Modality", "value": "MR", "required": True},
                            {"tag": "0018,0024", "name": "SequenceName", "value": "tfl3d1", "required": True},
                            {"tag": "0018,0080", "name": "RepetitionTime", "value": 2000, "tolerance": 100, "required": True},
                            {"tag": "0018,0081", "name": "EchoTime", "value": 3.25, "tolerance": 0.5, "required": True},
                            {"tag": "0018,1314", "name": "FlipAngle", "value": 9, "tolerance": 1, "required": True}
                        ]
                    }]
                }),
                "format": "json"
            },
            {
                "id": "bold_fmri_schema",
                "name": "BOLD fMRI Validation Schema",
                "description": "Validation schema for BOLD functional MRI acquisitions",
                "category": "Functional MRI",
                "content": json.dumps({
                    "title": "BOLD fMRI Validation Schema",
                    "version": "1.0.0", 
                    "description": "Validation schema for BOLD fMRI acquisitions with multiband",
                    "acquisitions": [{
                        "id": "bold_fmri",
                        "protocol_name": "BOLD_fMRI",
                        "acquisition_fields": [
                            {"tag": "0008,0060", "name": "Modality", "value": "MR", "required": True},
                            {"tag": "0018,0024", "name": "SequenceName", "value": "epfid2d1_64", "required": True},
                            {"tag": "0018,0080", "name": "RepetitionTime", "value": 800, "tolerance": 50, "required": True},
                            {"tag": "0018,0081", "name": "EchoTime", "value": 37, "tolerance": 2, "required": True},
                            {"tag": "0019,1028", "name": "MultibandFactor", "value": 8, "required": True}
                        ]
                    }]
                }),
                "format": "json"
            },
            {
                "id": "dti_schema",
                "name": "DTI Validation Schema",
                "description": "Validation schema for Diffusion Tensor Imaging",
                "category": "Diffusion MRI",
                "content": json.dumps({
                    "title": "DTI Validation Schema",
                    "version": "1.0.0",
                    "description": "Validation schema for 30-direction DTI acquisitions",
                    "acquisitions": [{
                        "id": "dti_30dir",
                        "protocol_name": "DTI_30dir",
                        "acquisition_fields": [
                            {"tag": "0008,0060", "name": "Modality", "value": "MR", "required": True},
                            {"tag": "0018,0024", "name": "SequenceName", "value": "ep2d_diff", "required": True},
                            {"tag": "0018,0080", "name": "RepetitionTime", "value": 8400, "tolerance": 200, "required": True}
                        ],
                        "series_fields": [
                            {"tag": "0018,9087", "name": "DiffusionBValue", "values": [0, 1000], "required": True}
                        ]
                    }]
                }),
                "format": "json"
            }
        ]
    
    def get_example_dicom_data(self) -> Dict:
        """Return example DICOM data (same as analyze_dicom_files for consistency)"""
        return self.analyze_dicom_files([])
    
    def get_schema_fields(self, schema_id: str) -> List[Dict]:
        """Get field requirements for a specific schema"""
        schemas = self.get_example_schemas()
        
        for schema in schemas:
            if schema["id"] == schema_id:
                content = json.loads(schema["content"])
                acquisition_fields = []
                
                for acq in content.get("acquisitions", []):
                    for field in acq.get("acquisition_fields", []):
                        # Determine validation rule based on field properties
                        validation_rule = {"type": "exact"}
                        if "tolerance" in field:
                            validation_rule = {
                                "type": "tolerance", 
                                "value": field["value"],
                                "tolerance": field["tolerance"]
                            }
                        elif "min" in field or "max" in field:
                            validation_rule = {
                                "type": "range",
                                "min": field.get("min", 0),
                                "max": field.get("max", 100)
                            }
                        
                        field_info = {
                            "tag": field["tag"],
                            "name": field["name"],
                            "value": field["value"],
                            "vr": self._get_vr_for_tag(field["tag"]),
                            "level": "acquisition",
                            "data_type": self._infer_data_type(field["value"]),
                            "consistency": "consistent",
                            "validation_rule": validation_rule
                        }
                        acquisition_fields.append(field_info)
                
                return acquisition_fields
        
        # Return empty list if schema not found
        return []
    
    def _get_vr_for_tag(self, tag: str) -> str:
        """Get VR (Value Representation) for a DICOM tag"""
        vr_map = {
            "0008,0060": "CS",  # Modality
            "0008,0070": "LO",  # Manufacturer  
            "0008,103E": "LO",  # SeriesDescription
            "0018,0024": "SH",  # SequenceName
            "0018,0080": "DS",  # RepetitionTime
            "0018,0081": "DS",  # EchoTime
            "0018,1314": "DS",  # FlipAngle
            "0018,0087": "DS",  # MagneticFieldStrength
            "0018,0050": "DS",  # SliceThickness
            "0018,5100": "CS",  # PatientPosition
            "0008,0008": "CS",  # ImageType
            "0019,1028": "IS",  # MultibandFactor (private)
            "0018,9087": "FD"   # DiffusionBValue
        }
        return vr_map.get(tag, "UN")
    
    def _infer_data_type(self, value) -> str:
        """Infer data type from value"""
        if isinstance(value, str):
            return "string"
        elif isinstance(value, (int, float)):
            return "number"
        elif isinstance(value, list):
            if len(value) > 0:
                if isinstance(value[0], str):
                    return "list_string"
                else:
                    return "list_number"
            return "list_string"
        else:
            return "string"

# Create global instance
dicompare = DicompareAPI()
    `);

    console.log('✅ Mock dicompare API ready');
  }

  isInitialized(): boolean {
    return this.pyodide !== null;
  }

  async runPython(code: string): Promise<any> {
    const pyodide = await this.initialize();
    return pyodide.runPython(code);
  }

  async runPythonAsync(code: string): Promise<any> {
    const pyodide = await this.initialize();
    return await pyodide.runPython(code);
  }
}

// Create singleton instance
export const pyodideManager = new PyodideManager();
