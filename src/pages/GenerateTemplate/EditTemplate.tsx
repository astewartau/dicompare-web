import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, Wrap, WrapItem, Button, Icon, Spinner, Progress, VStack } from '@chakra-ui/react';
import { FiPlus } from 'react-icons/fi';
import CollapsibleCard from '../../components/CollapsibleCard/CollapsibleCard';
import { useAlert } from '../../components/Alert';
import { usePyodide } from '../../components/PyodideContext';

interface EditTemplateProps {
    setAcquisitionsData: (data: Record<string, any>) => void;
    setIsNextEnabled: React.Dispatch<React.SetStateAction<boolean>>;
    isActive?: boolean;
}

const EditTemplate: React.FC<EditTemplateProps> = ({ setAcquisitionsData, setIsNextEnabled, isActive }) => {
    const [acquisitionList, setAcquisitionList] = useState<string[]>([]);
    const [acquisitionsJson, setAcquisitionsJson] = useState<Record<string, any>>({});
    const [newAcqCounter, setNewAcqCounter] = useState<number>(1);
    const [isUploading, setIsUploading] = useState<boolean>(false);
    const [isDragActive, setIsDragActive] = useState(false);
    const [manualValidFields, setManualValidFields] = useState<string[]>([]);
    const [sessionValidFields, setSessionValidFields] = useState<string[]>([]);
    const [cardsEditState, setCardsEditState] = useState<Record<string, boolean>>({});
    const [cardsStageState, setCardsStageState] = useState<Record<string, number>>({});
    const [dicomProgress, setDICOMProgress] = useState<number>(0);

    const { displayAlert } = useAlert();
    const { runPythonCode, setPythonGlobal } = usePyodide();

    // Helper functions
    const inferDataType = (value: any): { dataType: 'string' | 'number' | 'list'; listSubType?: 'string' | 'number' } => {
        if (Array.isArray(value)) {
            // Analyze array contents to determine subtype
            if (value.length === 0) {
                return { dataType: 'list', listSubType: 'string' }; // Default to string for empty arrays
            }
            
            // Check if all elements are numbers
            const allNumbers = value.every(item => typeof item === 'number' || (typeof item === 'string' && !isNaN(parseFloat(item)) && isFinite(parseFloat(item))));
            
            return { 
                dataType: 'list', 
                listSubType: allNumbers ? 'number' : 'string' 
            };
        }
        if (typeof value === 'number') return { dataType: 'number' };
        return { dataType: 'string' };
    };

    const computeConstantFields = (data: any[], selectedFields: string[]) => {
        const constantFields: Record<string, any> = {};
        const variableFields: string[] = [];

        const deepEqual = (a: any, b: any): boolean => {
            if (a === b) return true;
            if (Array.isArray(a) && Array.isArray(b)) {
                if (a.length !== b.length) return false;
                return a.every((val, index) => deepEqual(val, b[index]));
            }
            if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
                const keysA = Object.keys(a);
                const keysB = Object.keys(b);
                if (keysA.length !== keysB.length) return false;
                return keysA.every((key) => deepEqual(a[key], b[key]));
            }
            return false;
        };

        selectedFields.forEach((field) => {
            const values = data.map((row) => row[field]).filter((val) => val !== undefined && val !== null);

            if (values.length === 0) return;

            // Check if all values are the same using deep comparison
            const firstValue = values[0];
            const allSame = values.every((val) => deepEqual(val, firstValue));

            if (allSame) {
                constantFields[field] = firstValue;
            } else {
                variableFields.push(field);
            }
        });

        return { constantFields, variableFields };
    };

    useEffect(() => {
        fetch('https://raw.githubusercontent.com/astewartau/dcm-check/refs/heads/main/valid_fields.json')
            .then((response) => response.json())
            .then((data) => {
                setManualValidFields(data);
            })
            .catch((error) => {
                console.error('Error fetching valid fields:', error);
            });
    }, []);

    useEffect(() => {
        if (!isActive) return;

        if (acquisitionList.length === 0) {
            setIsNextEnabled(false);
            return;
        }

        const hasValidAcquisitions = Object.keys(acquisitionsJson).length > 0;
        const allComplete = acquisitionList.every((acq) => cardsStageState[acq] === 2 && !cardsEditState[acq]);
        setIsNextEnabled(hasValidAcquisitions && allComplete);
    }, [isActive, acquisitionList, cardsStageState, cardsEditState, acquisitionsJson, setIsNextEnabled]);

    useEffect(() => {
        setAcquisitionsData(acquisitionsJson);
    }, [acquisitionsJson, setAcquisitionsData]);

    const updateProgress = useCallback((p: number) => {
        setDICOMProgress(p);
    }, []);

    const processDicomFiles = async (files: File[]): Promise<any[]> => {
        const dicomFiles: Record<string, Uint8Array> = {};
        for (const file of files) {
            const arrayBuf = await file.arrayBuffer();
            const typedArray = new Uint8Array(arrayBuf);
            dicomFiles[file.webkitRelativePath || file.name] = typedArray;
        }

        // Define the default fields for DICOM acquisitions
        // MISSING - ImagesInAcquisition
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
            //"SpacingBetweenSlices",
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
            //"MultibandFactor",

            // Bandwidth / Readout
            'PixelBandwidth',
            'BandwidthPerPixelPhaseEncode',
            //"EffectiveEchoSpacing",

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

        // Use the helper to set a Python global
        setPythonGlobal('dicom_files', dicomFiles);
        await setPythonGlobal('update_progress', updateProgress);
        setPythonGlobal('selected_fields', defaultDicomFields);

        const code = `
import json
import numpy as np
import pandas as pd
from dicompare.io import async_load_dicom_session, assign_acquisition_and_run_numbers

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

global session
try:
    existing_session = session
except NameError:
    session = None
    existing_session = None

new_session = await async_load_dicom_session(dicom_bytes=dicom_files.to_py(), progress_function=update_progress)
new_session = assign_acquisition_and_run_numbers(new_session)

if existing_session is not None:
    for acquisition in new_session['Acquisition'].unique():
        if acquisition in existing_session['Acquisition'].unique():
            print(f"Acquisition {acquisition} already exists in the existing session.")
            continue
        acquisition_data = new_session[new_session['Acquisition'] == acquisition]
        session = pd.concat([existing_session, acquisition_data], ignore_index=True)
else:
    session = new_session

# Process each acquisition with the default fields
acquisition_results = []
unique_acquisitions = session['Acquisition'].unique()
print(f"Found {len(unique_acquisitions)} unique acquisitions: {unique_acquisitions}")

for acquisition in unique_acquisitions:
    # Skip nan acquisitions
    if pd.isna(acquisition):
        print(f"Skipping nan acquisition")
        continue
        
    acquisition_data = session[session['Acquisition'] == acquisition]
    
    # Skip if no data for this acquisition
    if acquisition_data.empty:
        print(f"No data found for acquisition {acquisition}")
        continue
    
    # Get available fields that exist in both selected_fields and the data
    available_fields = [field for field in selected_fields if field in acquisition_data.columns]

    print(f"Available fields for acquisition {acquisition}: {available_fields}")
    
    if available_fields:
        # Get unique combinations for this acquisition
        df = acquisition_data[available_fields].drop_duplicates()
        df = df.sort_values(by=available_fields)
        unique_rows = df.to_dict(orient='records')
        print("UNIQUE ROWS:", unique_rows)
        
        # Add series numbering and clean the data
        for i in range(len(unique_rows)):
            unique_rows[i]['Series'] = i + 1
            unique_rows[i] = clean_for_json(unique_rows[i])
    else:
        unique_rows = []
    
    # Safely get values with fallbacks for empty data
    protocol_name = acquisition_data['ProtocolName'].unique()
    series_description = acquisition_data['SeriesDescription'].unique()
    
    acquisition_results.append({
        'Acquisition': str(acquisition),
        'ProtocolName': str(protocol_name[0]) if len(protocol_name) > 0 else 'Unknown',
        'SeriesDescription': str(series_description) if len(series_description) > 0 else 'Unknown',
        'TotalFiles': f"{len(acquisition_data)} files",
        'ProcessedData': unique_rows,
        'SelectedFields': available_fields
    })

# Clean the entire result before JSON serialization
clean_results = clean_for_json(acquisition_results)
json.dumps(clean_results)
  `;

        const result = await runPythonCode(code);
        const acquisitions = JSON.parse(result);

        try {
            const sessionColumns = await runPythonCode('list(session.columns)');
            const sessionColumnsJs = sessionColumns.toJs ? sessionColumns.toJs() : sessionColumns;
            setSessionValidFields(sessionColumnsJs);
        } catch (err) {
            console.error('Error retrieving session columns:', err);
        }

        return acquisitions;
    };

    const uploadFiles = async (files: File[]) => {
        if (!files.length) return;
        setIsUploading(true);
        try {
            const dicomAcquisitions = await processDicomFiles(files);

            if (dicomAcquisitions.length === 0) {
                displayAlert('No valid acquisitions were found in the uploaded files.', 'Warning', [
                    { option: 'OK', callback: () => {} },
                ]);
                return;
            }

            setAcquisitionList((prev) => {
                const newAcqs = dicomAcquisitions.map((acq: any) => acq.Acquisition);
                return Array.from(new Set([...prev, ...newAcqs]));
            });

            // Process the data for each acquisition and set initial form data
            const acquisitionsData: Record<string, any> = {};
            dicomAcquisitions.forEach((acq: any) => {
                if (acq.ProcessedData && acq.ProcessedData.length > 0) {
                    // Process the data to create constant and variable fields
                    const { constantFields, variableFields } = computeConstantFields(
                        acq.ProcessedData,
                        acq.SelectedFields
                    );

                    const constantFieldsJson = Object.keys(constantFields).map((field) => ({
                        field: field,
                        value: constantFields[field],
                    }));

                    const seriesJson = acq.ProcessedData.map((row: any) => {
                        const seriesName = row.Series;
                        const fields = variableFields.map((field) => ({
                            field: field,
                            value: row[field] ?? '',
                        }));
                        return { name: seriesName, fields };
                    });

                    acquisitionsData[acq.Acquisition] = {
                        fields: constantFieldsJson,
                        series: seriesJson,
                        isDicomGenerated: true, // Flag to indicate this came from DICOM
                    };
                } else {
                    acquisitionsData[acq.Acquisition] = {
                        fields: [],
                        series: [],
                        isDicomGenerated: true,
                    };
                }
            });

            setAcquisitionsData(acquisitionsData);
            setAcquisitionsJson((prev) => ({
                ...prev,
                ...acquisitionsData,
            }));

            // Show success message
            displayAlert(`Successfully uploaded ${dicomAcquisitions.length} acquisition(s).`, 'Success', [
                { option: 'OK', callback: () => {} },
            ]);
        } catch (error) {
            console.error('Error processing DICOM files:', error);
            displayAlert('Error processing DICOM files. Please check the console for details.', 'Error', [
                { option: 'OK', callback: () => {} },
            ]);
        } finally {
            setIsUploading(false);
        }
    };

    const handleGlobalEditChange = useCallback((acq: string, isEditing: boolean) => {
        setCardsEditState((prev) => ({ ...prev, [acq]: isEditing }));
    }, []);

    const handleStageChange = useCallback((acq: string, stage: number) => {
        setCardsStageState((prev) => ({ ...prev, [acq]: stage }));
    }, []);

    const handleSaveAcquisition = (acq: string, jsonData: any) => {
        setAcquisitionsJson((prev) => ({ ...prev, [acq]: jsonData }));
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files) return;
        const files = Array.from(event.target.files);
        uploadFiles(files);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        if (isDragActive) return;
        e.preventDefault();
        setIsDragActive(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        if (!isDragActive) return;
        e.preventDefault();
        setIsDragActive(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragActive(false);
        const dtItems = e.dataTransfer.items;
        const files: File[] = [];

        const traverseFileTree = (item: any, path: string): Promise<void> => {
            return new Promise((resolve) => {
                if (item.isFile) {
                    item.file((file: File) => {
                        let newFile: File;
                        if (!file.webkitRelativePath) {
                            newFile = new File([file], file.name, { type: file.type, lastModified: file.lastModified });
                            Object.defineProperty(newFile, 'webkitRelativePath', {
                                value: path + file.name,
                                writable: false,
                                enumerable: true,
                                configurable: true,
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
                        Promise.all(entries.map((entry: any) => traverseFileTree(entry, path + item.name + '/'))).then(
                            () => resolve()
                        );
                    });
                }
            });
        };

        const promises: Promise<void>[] = [];
        for (let i = 0; i < dtItems.length; i++) {
            const entry = dtItems[i].webkitGetAsEntry();
            if (entry) {
                promises.push(traverseFileTree(entry, ''));
            }
        }

        Promise.all(promises).then(() => {
            if (files.length > 0) {
                const dataTransfer = new DataTransfer();
                files.forEach((file) => dataTransfer.items.add(file));
                const fakeEvent = { target: { files: dataTransfer.files } } as React.ChangeEvent<HTMLInputElement>;
                handleFileUpload(fakeEvent);
            }
        });
    };

    const handleAddAcquisition = () => {
        const newAcqName = `New Acquisition ${newAcqCounter}`;
        setAcquisitionList((prev) => [...prev, newAcqName]);
        setNewAcqCounter((prev) => prev + 1);
    };

    const handleDeleteAcquisition = (acq: string) => {
        displayAlert('Are you sure you want to delete this acquisition?', 'Confirm Delete', [
            {
                option: 'Delete',
                callback: () => {
                    setAcquisitionList((prev) => prev.filter((item) => item !== acq));
                    runPythonCode(`
              if 'session' in globals():
                  if '${acq}' in session['Acquisition'].unique():
                      session = session[session['Acquisition'] != '${acq}']
            `);
                },
            },
            { option: 'Cancel', callback: () => {} },
        ]);
    };

    return (
        <Box width="100%">
            <Text mb={8} color="gray.700">
                Use this tool to build a schema for a DICOM session. The schema can be used to validate future sessions
                for compliance.
                <br />
                Start by uploading DICOMs for a representative session or manually adding acquisitions.
            </Text>
            <Box
                mb={6}
                p={4}
                borderWidth="1px"
                borderRadius="md"
                bg={isDragActive ? 'gray.200' : 'gray.50'}
                textAlign="center"
                onDragEnter={handleDragOver}
                onDragOver={(e) => {
                    e.preventDefault();
                }}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {isUploading ? (
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
                            onChange={handleFileUpload}
                            ref={(input) => input && input.setAttribute('webkitdirectory', 'true')}
                        />
                        <Button as="label" htmlFor="dicom-upload" colorScheme="teal">
                            Upload DICOMs
                        </Button>
                    </>
                )}
            </Box>
            <Wrap spacing="6">
                {/* Render acquisitions via CollapsibleCard */}
                {acquisitionList.map((acq) => (
                    <WrapItem key={acq}>
                        <CollapsibleCard
                            acquisition={acq}
                            onDeleteAcquisition={handleDeleteAcquisition}
                            validFields={acq.startsWith('New Acquisition') ? manualValidFields : sessionValidFields}
                            initialEditMode={acq.startsWith('New Acquisition')}
                            initialStage={acq.startsWith('New Acquisition') ? 2 : 1}
                            hideBackButton={acq.startsWith('New Acquisition')}
                            onSaveAcquisition={handleSaveAcquisition}
                            onGlobalEditChange={handleGlobalEditChange}
                            onStageChange={handleStageChange}
                            isDicomGenerated={acquisitionsJson[acq]?.isDicomGenerated || false}
                            allValidFields={[...new Set([...manualValidFields, ...sessionValidFields])]}
                            initialFormData={
                                acquisitionsJson[acq]
                                    ? {
                                          constant:
                                              acquisitionsJson[acq].fields?.map((field: any) => ({
                                                  id: field.field,
                                                  name: field.field,
                                                  data: {
                                                      constraintType: 'value',
                                                      value: String(field.value),
                                                      ...inferDataType(field.value),
                                                  },
                                              })) || [],
                                          variable:
                                              acquisitionsJson[acq].series?.map((series: any) => {
                                                  const row: any = {
                                                      Series: {
                                                          constraintType: 'value',
                                                          value: String(series.name),
                                                          dataType: 'string',
                                                      },
                                                  };
                                                  series.fields?.forEach((field: any) => {
                                                      row[field.field] = {
                                                          constraintType: 'value',
                                                          value: String(field.value),
                                                          ...inferDataType(field.value),
                                                      };
                                                  });
                                                  return row;
                                              }) || [],
                                      }
                                    : undefined
                            }
                        />
                    </WrapItem>
                ))}
                <WrapItem>
                    <Box
                        borderWidth="1px"
                        borderRadius="md"
                        bg="white"
                        boxShadow="sm"
                        p={4}
                        width="250px"
                        height="150px"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        cursor="pointer"
                        _hover={{ bg: 'gray.100' }}
                        onClick={handleAddAcquisition}
                    >
                        <Button variant="ghost" size="lg">
                            <VStack spacing={2}>
                                <Icon as={FiPlus} boxSize={8} color="teal.500" />
                                <Text size="lg" color="teal.500">
                                    Add manually
                                </Text>
                            </VStack>
                        </Button>
                    </Box>
                </WrapItem>
            </Wrap>
        </Box>
    );
};

export default EditTemplate;
