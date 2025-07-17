// index.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useDisclosure } from '@chakra-ui/react';
import { usePyodide } from '../../components/PyodideContext';

import SchemaUploader from './SchemaUploader';
import DicomUploader from './DicomUploader';
import PairingArea from './PairingArea';
import DicomViewer from './DicomViewer';
import {
    loadSchema,
    analyzeDicomFiles,
    processExistingSession,
    analyzeCompliance,
    removeSchema,
    removeDicomSeries,
    reprocessSpecificAcquisition,
    loadExampleDicoms,
} from './pyodideService';
import { Acquisition, Pair, FieldCompliance, SchemaFile, FinalizeMappingProps } from './types';

const FinalizeMapping: React.FC<FinalizeMappingProps> = ({ onValidationChange, onReportReady }) => {
    // Schema state
    const [, setReferenceFiles] = useState<SchemaFile[]>([]);
    const [schemaLoading, setSchemaLoading] = useState(false);
    const [referenceOptions, setReferenceOptions] = useState<Acquisition[]>([]);
    const [referenceFields, setReferenceFields] = useState<string[]>([]);

    // DICOM state
    const [inputDICOMFiles, setInputDICOMFiles] = useState<File[]>([]);
    const [isDICOMUploading, setIsDICOMUploading] = useState(false);
    const [dicomProgress, setDICOMProgress] = useState<number>(0);
    const [inputOptions, setInputOptions] = useState<Acquisition[]>([]);

    // Pairing state
    const [pairs, setPairs] = useState<Pair[]>([]);
    const [expandedReferences, setExpandedReferences] = useState<Record<string, boolean>>({});
    const [expandedInputs, setExpandedInputs] = useState<Record<string, boolean>>({});

    // Compliance state
    const [complianceMap, setComplianceMap] = useState<Record<string, FieldCompliance>>({});
    const [overallCompliance, setOverallCompliance] = useState<
        Record<string, { status: 'ok' | 'error'; message: string }>
    >({});

    // Schema library state
    const [schemaLibrary, setSchemaLibrary] = useState<SchemaFile[]>(() => {
        // Try to load from localStorage
        const savedLibrary = localStorage.getItem('schemaLibrary');
        return savedLibrary ? JSON.parse(savedLibrary) : [];
    });

    // Current index for schema selection
    const [currentPairIndex, setCurrentPairIndex] = useState<number | null>(null);

    // Modal control
    const { isOpen, onOpen, onClose } = useDisclosure();

    // DICOM viewer state
    const [dicomViewerOpen, setDicomViewerOpen] = useState(false);
    const [selectedAcquisitionForViewing, setSelectedAcquisitionForViewing] = useState<string>('');

    const pyodide = usePyodide();

    // Refs to track previous values
    const prevCompliancePairsRef = useRef<string>('');
    const onReportReadyRef = useRef(onReportReady);
    const complianceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Update ref when onReportReady changes
    useEffect(() => {
        onReportReadyRef.current = onReportReady;
    }, [onReportReady]);

    // Save schema library to localStorage when it changes
    useEffect(() => {
        localStorage.setItem('schemaLibrary', JSON.stringify(schemaLibrary));
    }, [schemaLibrary]);

    // Progress callback
    const updateProgress = useCallback((p: number) => {
        setDICOMProgress(p);
    }, []);

    // Validation effect
    useEffect(() => {
        const valid = referenceOptions.length > 0 && inputOptions.length > 0;
        onValidationChange(valid);
    }, [referenceOptions, inputOptions, onValidationChange]);

    const generateUniqueId = () => {
        return `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    };

    // Schema loading handler
    const handleSchemaLoad = async (file: SchemaFile, acquisitionName?: string) => {
        setSchemaLoading(true);
        try {
            // Generate a unique ID for this schema instance
            const instanceId = generateUniqueId();

            // Add to reference files
            setReferenceFiles((prev) => [...prev, file]);

            const result = await loadSchema(pyodide, file, acquisitionName, instanceId);
            const { acquisitions, reference_fields: rf, instance_id } = result;

            // Convert acquisitions to array and append to existing options
            const newAcquisitions = Object.entries(acquisitions).map(([name, details]) => ({
                id: instance_id, // Use the instance ID from the result
                name,
                details: {
                    ...(details as any),
                    // Store reference fields for Python schemas to use in field extraction
                    referenceFields: rf,
                },
                source: file.name,
            }));

            // If we're adding to a specific pair index
            if (currentPairIndex !== null) {
                // Add the selected acquisition to the current pair
                // Since we filtered by acquisitionName in loadSchema, newAcquisitions should contain only the selected one
                if (newAcquisitions.length > 0) {
                    setPairs((prev) => {
                        const updated = [...prev];
                        if (updated[currentPairIndex]) {
                            updated[currentPairIndex].ref = newAcquisitions[0];
                        }
                        return updated;
                    });
                }
            }

            // Add the new acquisitions to the reference options
            setReferenceOptions((prev) => [...prev, ...newAcquisitions]);

            // Merge reference fields
            setReferenceFields((prev) => {
                const merged = new Set([...prev, ...(rf || [])]);
                return Array.from(merged);
            });
        } catch (err) {
            console.error('Error loading schema:', err);
        } finally {
            setSchemaLoading(false);
            setCurrentPairIndex(null);
            onClose();
        }
    };

    // DICOM loading handler
    const handleDicomLoad = async (files: File[]) => {
        setIsDICOMUploading(true);
        try {
            // Append new files to existing ones
            const newFiles = [...inputDICOMFiles, ...files];
            setInputDICOMFiles(newFiles);

            const result = await analyzeDicomFiles(pyodide, files, referenceFields, updateProgress);

            // Convert to array and append to existing options
            const newAcquisitions = Object.entries(result).map(([name, details]) => ({
                name,
                details,
                // Use first file name as source identifier
                source: files[0]?.name || 'unknown',
            }));

            setInputOptions((prev) => [...prev, ...newAcquisitions]);

            // Create initial pairs with just input options
            setPairs(newAcquisitions.map((inp) => ({ inp, ref: null })));
        } catch (err) {
            console.error('Error analyzing DICOM files:', err);
        } finally {
            setIsDICOMUploading(false);
        }
    };

    // Process existing session when schema changes
    useEffect(() => {
        if (referenceFields.length > 0 && inputDICOMFiles.length > 0) {
            const process = async () => {
                try {
                    const result = await processExistingSession(pyodide, referenceFields);
                    // We don't replace here, as we're just reprocessing with updated fields
                    setInputOptions(
                        Object.entries(result).map(([name, details]) => ({
                            name,
                            details,
                            source: inputDICOMFiles[0]?.name || 'unknown',
                        }))
                    );
                } catch (err) {
                    console.error('Error processing existing session:', err);
                }
            };
            process();
        }
    }, [referenceFields, inputDICOMFiles.length, pyodide]);

    // Create a stable string representation of pairs to avoid infinite loops
    const pairsString = JSON.stringify(
        pairs.map((pair) => ({
            refName: pair.ref?.name,
            refId: pair.ref?.id,
            refType: pair.ref?.details?.rules ? 'Python' : 'JSON',
            inpName: pair.inp?.name,
        }))
    );

    // Re-process input acquisitions when pairs change to show only schema-relevant fields
    useEffect(() => {
        if (inputDICOMFiles.length === 0) return;

        const updateInputFields = async () => {
            try {
                // Group pairs by input acquisition and get all reference fields for each
                const inputToRefFields: Record<string, string[]> = {};

                pairs.forEach((pair) => {
                    if (pair.inp && pair.ref) {
                        const inputName = pair.inp.name;

                        // Extract reference fields from the paired reference schema
                        let refFields: string[] = [];

                        // For Python schemas, use the stored referenceFields
                        if (pair.ref.details.referenceFields) {
                            refFields = [...pair.ref.details.referenceFields];
                        }
                        // For JSON schemas, extract from fields and series
                        else {
                            if (pair.ref.details.fields) {
                                refFields = pair.ref.details.fields.map((f: any) => f.field);
                            }
                            if (pair.ref.details.series) {
                                pair.ref.details.series.forEach((series: any) => {
                                    if (series.fields) {
                                        series.fields.forEach((f: any) => {
                                            if (!refFields.includes(f.field)) {
                                                refFields.push(f.field);
                                            }
                                        });
                                    }
                                });
                            }
                        }

                        inputToRefFields[inputName] = refFields;
                    }
                });

                // Check if we actually need to reprocess (to avoid unnecessary calls)
                const needsReprocessing = inputOptions.some((inputOption) => {
                    const specificFields = inputToRefFields[inputOption.name];
                    if (!specificFields || specificFields.length === 0) return false;

                    // Check if the fields have changed from what we currently have
                    const currentFields = inputOption.details?.referenceFields || [];
                    return JSON.stringify(currentFields.sort()) !== JSON.stringify(specificFields.sort());
                });

                if (!needsReprocessing) return;

                // Re-process each input acquisition with its specific reference fields
                const updatedInputOptions = await Promise.all(
                    inputOptions.map(async (inputOption) => {
                        const specificFields = inputToRefFields[inputOption.name];
                        if (specificFields && specificFields.length > 0) {
                            // Re-process this acquisition with specific fields
                            const result = await reprocessSpecificAcquisition(
                                pyodide,
                                inputOption.name,
                                specificFields
                            );
                            if (result[inputOption.name]) {
                                return {
                                    ...inputOption,
                                    details: {
                                        ...result[inputOption.name],
                                        referenceFields: specificFields, // Track what fields we used
                                    },
                                };
                            }
                        }
                        return inputOption;
                    })
                );

                setInputOptions(updatedInputOptions);

                // Update pairs to reference the updated input acquisitions
                setPairs((prev) => {
                    return prev.map((pair) => {
                        if (pair.inp) {
                            const updatedAcq = updatedInputOptions.find((acq) => acq.name === pair.inp!.name);
                            if (updatedAcq) {
                                return { ...pair, inp: updatedAcq };
                            }
                        }
                        return pair;
                    });
                });
            } catch (err) {
                console.error('Error updating input fields:', err);
            }
        };

        // Only update if we have paired acquisitions
        const hasPairs = pairs.some((p) => p.ref && p.inp);
        if (hasPairs) {
            updateInputFields();
        }
    }, [pairsString, pyodide, inputDICOMFiles.length]); // Use pairsString instead of pairs to prevent infinite loop

    // Analyze compliance when pairs change
    useEffect(() => {
        // Clear any existing timeout
        if (complianceTimeoutRef.current) {
            clearTimeout(complianceTimeoutRef.current);
            complianceTimeoutRef.current = null;
        }

        // Only run if pairs have changed and we have valid pairs
        const hasValidPairs = pairs.some((p) => p.ref && p.inp);

        console.log('Compliance analysis check:', {
            pairsChanged: pairsString !== prevCompliancePairsRef.current,
            hasValidPairs,
            pairsCount: pairs.length,
            validPairsCount: pairs.filter(p => p.ref && p.inp).length,
            pyodideReady: pyodide.pyodideReady,
            currentPairsString: pairsString,
            previousPairsString: prevCompliancePairsRef.current
        });

        if (pairsString !== prevCompliancePairsRef.current && hasValidPairs) {
            prevCompliancePairsRef.current = pairsString;

            complianceTimeoutRef.current = setTimeout(async () => {
                try {
                    console.log('=== COMPLIANCE ANALYSIS TRIGGERED ===');
                    console.log('Pairs:', pairs.map(p => ({
                        ref: p.ref ? {id: p.ref.id, name: p.ref.name, type: p.ref.details?.rules ? 'Python' : 'JSON'} : null,
                        inp: p.inp?.name
                    })));
                    console.log('Pyodide ready:', pyodide.pyodideReady);
                    
                    const results = await analyzeCompliance(pyodide, pairs);
                    console.log('=== COMPLIANCE RESULTS RECEIVED ===');
                    console.log('Results count:', results.length);
                    if (results.length > 0) {
                        console.log('First result:', results[0]);
                        console.log('Result types:', results.map((r: any) => ({
                            schemaId: r['schema id'], 
                            hasRuleName: !!r.rule_name, 
                            hasField: !!r.field,
                            passed: r.passed
                        })));
                    }

                    // Use the ref to ensure we have the latest callback
                    onReportReadyRef.current(results);


                    // Process compliance results
                    const cmap: Record<string, FieldCompliance> = {};
                    const overall: Record<string, { status: 'ok' | 'error'; message: string }> = {};

                    results.forEach((item: any) => {
                        const schemaA = item['schema acquisition'];
                        const schemaId = item['schema id'];

                        console.log('Processing compliance result:', {
                            schemaA,
                            schemaId,
                            field: item.field || item.rule_name,
                            series: item.series,
                            uniqueKey: schemaId
                                ? `${item.field || item.rule_name}#${schemaId}`
                                : item.field || item.rule_name,
                        });

                        // Create a unique key using the ID if available
                        const schemaKey = schemaId ? `${schemaA}#${schemaId}` : schemaA;

                        if (schemaA) {
                            overall[schemaKey] ||= { status: 'ok', message: 'Passed.' };
                            if (!item.passed) overall[schemaKey] = { status: 'error', message: item.message || '' };
                        }

                        // Skip adding series results to the regular compliance map - they'll be handled separately
                        if (!item.series) {
                            // For Python schemas, use rule_name; for JSON schemas, use field
                            const key = item.rule_name || item.field;
                            // Include the schema ID in the key to make it unique per instance
                            const uniqueKey = schemaId ? `${key}#${schemaId}` : key;

                            console.log('FinalizeMapping: Adding compliance result to map:', {
                                key,
                                uniqueKey,
                                schemaId,
                                passed: item.passed,
                                message: item.message,
                                rule_name: item.rule_name,
                                field: item.field
                            });

                            cmap[uniqueKey] = {
                                status: item.passed ? 'ok' : 'error',
                                message: item.message || (item.passed ? 'OK' : `Failed: ${item.expected}`),
                            };
                        }
                    });

                    // Add series-specific entries
                    const seriesMap: Record<string, FieldCompliance> = {};
                    let foundSeriesResults = false;
                    results.forEach((item: any) => {
                        if (item.series) {
                            foundSeriesResults = true;
                            const schemaA = item['schema acquisition'];
                            const schemaId = item['schema id'];
                            // Include the schema ID in the key to make it unique per instance
                            const seriesKey = schemaId
                                ? `${schemaA}#${schemaId}|${item.series}|${item.field}`
                                : `${schemaA}|${item.series}|${item.field}`;
                            
                            console.log('FinalizeMapping: Creating series compliance key:', {
                                seriesKey,
                                schemaA,
                                schemaId,
                                series: item.series,
                                field: item.field,
                                passed: item.passed,
                                message: item.message
                            });

                            seriesMap[seriesKey] = {
                                status: item.passed ? 'ok' : 'error',
                                message: item.message,
                            };
                        }
                    });
                    
                    console.log('FinalizeMapping: Found series results?', foundSeriesResults);
                    console.log('FinalizeMapping: Total compliance results:', results.length);
                    console.log('FinalizeMapping: Series map keys:', Object.keys(seriesMap));

                    setComplianceMap({ ...cmap, ...seriesMap });
                    setOverallCompliance(overall);
                } catch (err) {
                    console.error('Compliance analysis error:', err);
                }
            }, 300);
        }

        return () => {
            if (complianceTimeoutRef.current) {
                clearTimeout(complianceTimeoutRef.current);
            }
        };
    }, [pairsString, pyodide]);

    // Toggle expansion handlers
    const toggleReferenceExpansion = (name: string) => {
        setExpandedReferences((prev) => ({ ...prev, [name]: !prev[name] }));
    };

    const toggleInputExpansion = (name: string) => {
        setExpandedInputs((prev) => ({ ...prev, [name]: !prev[name] }));
    };

    // Delete handlers
    const handleDeleteReference = async (id: string) => {
        // Find the acquisition to delete
        const acqToDelete = referenceOptions.find((acq) => acq.id === id);
        if (!acqToDelete) return;

        try {
            // Remove from Python - pass the ID
            await removeSchema(pyodide, acqToDelete.name, acqToDelete.source, id);

            // Remove from state - only remove the specific instance with this ID
            setReferenceOptions((prev) => prev.filter((acq) => acq.id !== id));

            // Clear compliance results for this schema ID
            setComplianceMap((prev) => {
                const newMap: Record<string, FieldCompliance> = {};
                Object.entries(prev).forEach(([key, value]) => {
                    // Keep results that don't belong to the deleted schema
                    if (!key.includes(`#${id}`)) {
                        newMap[key] = value;
                    }
                });
                console.log(`Cleared compliance results for schema ${id}. Remaining keys:`, Object.keys(newMap));
                return newMap;
            });

            // Clear overall compliance for this schema
            setOverallCompliance((prev) => {
                const newOverall = { ...prev };
                Object.keys(newOverall).forEach(key => {
                    if (key.includes(`#${id}`)) {
                        delete newOverall[key];
                    }
                });
                return newOverall;
            });

            // Force re-analysis of compliance after schema deletion to clear any stale state
            console.log(`Schema ${id} deleted. Remaining schemas:`, referenceOptions.filter(acq => acq.id !== id).map(acq => acq.id));

            // Update pairs
            setPairs((prev) => {
                return prev.map((pair) => {
                    if (pair.ref?.id === id) {
                        return { ...pair, ref: null };
                    }
                    return pair;
                });
            });
        } catch (err) {
            console.error('Error deleting reference:', err);
        }
    };

    const handleDeleteInput = async (name: string) => {
        // Find the acquisition to delete
        const acqToDelete = inputOptions.find((acq) => acq.name === name);
        if (!acqToDelete) return;

        try {
            // Remove from Python
            await removeDicomSeries(pyodide, name);

            // Remove from state
            setInputOptions((prev) => prev.filter((acq) => acq.name !== name));

            // Update pairs
            setPairs((prev) => prev.filter((pair) => pair.inp?.name !== name));
        } catch (err) {
            console.error('Error deleting input:', err);
        }
    };

    // Add schema to library
    const handleAddToLibrary = (schema: SchemaFile) => {
        setSchemaLibrary((prev) => {
            // Check if schema with same name already exists
            const existingIndex = prev.findIndex((s) => s.name === schema.name);
            if (existingIndex >= 0) {
                // Replace existing schema
                const updated = [...prev];
                updated[existingIndex] = schema;
                return updated;
            }
            // Add new schema
            return [...prev, schema];
        });
    };

    // Remove schema from library
    const handleRemoveFromLibrary = (schemaName: string) => {
        setSchemaLibrary((prev) => prev.filter((s) => s.name !== schemaName));
    };

    // Handle adding schema to a specific pair
    const handleAddSchema = (index: number) => {
        setCurrentPairIndex(index);
        onOpen();
    };

    // Handle selecting a schema from the library
    const handleSelectSchema = (schema: SchemaFile, acquisitionName?: string) => {
        handleSchemaLoad(schema, acquisitionName);
    };

    // Handle DICOM visualization
    const handleVisualizeDicom = (acquisitionName: string) => {
        setSelectedAcquisitionForViewing(acquisitionName);
        setDicomViewerOpen(true);
    };

    // Handle loading example DICOMs
    const handleLoadExampleDicoms = async () => {
        setIsDICOMUploading(true);
        try {
            // Fetch the example DICOMs JSON file
            const response = await fetch('/example-dicoms.json');
            if (!response.ok) {
                throw new Error('Failed to fetch example DICOMs');
            }

            const exampleAcquisitions = await response.json();

            // Load the example acquisitions into pyodide
            const result = await loadExampleDicoms(pyodide, exampleAcquisitions);

            // Convert to array format expected by the UI
            const newAcquisitions = Object.entries(result).map(([name, details]) => ({
                name,
                details,
                source: 'Example DICOMs',
            }));

            // Clear any existing input options and files
            setInputDICOMFiles([]);
            setInputOptions(newAcquisitions);

            // Create initial pairs with just input options
            setPairs(newAcquisitions.map((inp) => ({ inp, ref: null })));
        } catch (err) {
            console.error('Error loading example DICOMs:', err);
        } finally {
            setIsDICOMUploading(false);
        }
    };

    return (
        <Box p={4}>
            <Text mb={4} color="gray.700">
                Load DICOM files first, then select a schema template for each series to verify compliance.
            </Text>

            <Box mb={8}>
                <DicomUploader
                    onDicomLoad={handleDicomLoad}
                    onExampleLoad={handleLoadExampleDicoms}
                    isLoading={isDICOMUploading}
                    progress={dicomProgress}
                    fileCount={inputDICOMFiles.length}
                />
            </Box>

            <PairingArea
                pairs={pairs}
                expandedReferences={expandedReferences}
                expandedInputs={expandedInputs}
                complianceMap={complianceMap}
                overallCompliance={overallCompliance}
                onToggleReference={toggleReferenceExpansion}
                onToggleInput={toggleInputExpansion}
                onDeleteReference={handleDeleteReference}
                onDeleteInput={handleDeleteInput}
                onAddSchema={handleAddSchema}
                onVisualizeDicom={handleVisualizeDicom}
            />

            {/* Schema Library Modal */}
            <SchemaUploader
                isOpen={isOpen}
                onClose={onClose}
                onSchemaLoad={handleSelectSchema}
                isLoading={schemaLoading}
                schemaLibrary={schemaLibrary}
                onAddToLibrary={handleAddToLibrary}
                onRemoveFromLibrary={handleRemoveFromLibrary}
            />

            {/* DICOM Viewer Modal */}
            <DicomViewer
                isOpen={dicomViewerOpen}
                onClose={() => setDicomViewerOpen(false)}
                acquisitionName={selectedAcquisitionForViewing}
            />
        </Box>
    );
};

export default FinalizeMapping;
