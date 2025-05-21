// index.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, Flex } from '@chakra-ui/react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { usePyodide } from '../../components/PyodideContext';

import SchemaUploader from './SchemaUploader';
import DicomUploader from './DicomUploader';
import PairingArea from './PairingArea';
import { 
  loadSchema, 
  analyzeDicomFiles, 
  processExistingSession, 
  analyzeCompliance 
} from './pyodideService';
import { Acquisition, Pair, FieldCompliance, SchemaFile, FinalizeMappingProps } from './types';

const FinalizeMapping: React.FC<FinalizeMappingProps> = ({ 
  onValidationChange, 
  onReportReady 
}) => {
  // Schema state
  const [referenceFile, setReferenceFile] = useState<SchemaFile | null>(null);
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
  const [overallCompliance, setOverallCompliance] = useState<Record<string, { status: 'ok' | 'error'; message: string }>>({});

  const pyodide = usePyodide();
  
  // Refs to track previous values
  const prevPairsRef = useRef<string>('');
  const onReportReadyRef = useRef(onReportReady);
  const complianceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update ref when onReportReady changes
  useEffect(() => {
    onReportReadyRef.current = onReportReady;
  }, [onReportReady]);

  // Progress callback
  const updateProgress = useCallback((p: number) => {
    setDICOMProgress(p);
  }, []);

  // Validation effect
  useEffect(() => {
    const valid = referenceOptions.length > 0 && inputOptions.length > 0;
    onValidationChange(valid);
  }, [referenceOptions, inputOptions, onValidationChange]);

  // Schema loading handler
  const handleSchemaLoad = async (file: SchemaFile) => {
    setReferenceFile(file);
    setSchemaLoading(true);
    try {
      const result = await loadSchema(pyodide, file);
      const { acquisitions, reference_fields: rf } = result;
      setReferenceOptions(Object.entries(acquisitions).map(([name, details]) => ({ name, details })));
      setReferenceFields(rf);
    } catch (err) {
      console.error('Error loading schema:', err);
    } finally {
      setSchemaLoading(false);
    }
  };

  // DICOM loading handler
  const handleDicomLoad = async (files: File[]) => {
    setInputDICOMFiles(files);
    setIsDICOMUploading(true);
    try {
      const result = await analyzeDicomFiles(pyodide, files, referenceFields, updateProgress);
      setInputOptions(Object.entries(result).map(([name, details]) => ({ name, details })));
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
          setInputOptions(Object.entries(result).map(([name, details]) => ({ name, details })));
        } catch (err) {
          console.error('Error processing existing session:', err);
        }
      };
      process();
    }
  }, [referenceFields, inputDICOMFiles.length, pyodide]);

  // Update pairs when options change
  useEffect(() => {
    const n = Math.max(referenceOptions.length, inputOptions.length);
    setPairs(Array.from({ length: n }, (_, i) => ({
      ref: referenceOptions[i] || null,
      inp: inputOptions[i] || null
    })));
  }, [referenceOptions, inputOptions]);

  // Analyze compliance when pairs change
  useEffect(() => {
    // Clear any existing timeout
    if (complianceTimeoutRef.current) {
      clearTimeout(complianceTimeoutRef.current);
      complianceTimeoutRef.current = null;
    }
    
    // Create a string representation of the pairs for comparison
    const pairsString = JSON.stringify(
      pairs.map(p => ({
        ref: p.ref?.name,
        inp: p.inp?.name
      }))
    );

    
    // Only run if pairs have changed and we have valid pairs
    const hasValidPairs = pairs.some(p => p.ref && p.inp);

    if ((pairsString !== prevPairsRef.current) && hasValidPairs) {
      prevPairsRef.current = pairsString;
      
      complianceTimeoutRef.current = setTimeout(async () => {
        try {
          const results = await analyzeCompliance(pyodide, pairs);
          
          // Use the ref to ensure we have the latest callback
          onReportReadyRef.current(results);
  
          // Process compliance results
          const cmap: Record<string, FieldCompliance> = {};
          const overall: Record<string, { status: 'ok' | 'error'; message: string }> = {};
          
          results.forEach(item => {
            const refA = item['reference acquisition'];
            if (refA) {
              overall[refA] ||= { status: 'ok', message: 'Passed.' };
              if (!item.passed) overall[refA] = { status: 'error', message: item.message || '' };
            }
            const key = item.rule_name || item.field;
            cmap[key] = {
              status: item.passed ? 'ok' : 'error',
              message: item.message && item.message !== "None" ? item.message : (item.passed ? "OK" : `Failed: ${item.expected}`)
            };
          });
  
          // Add series-specific entries
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
          console.error('Compliance analysis error:', err);
        }
      }, 300);
    }
    
    return () => {
      if (complianceTimeoutRef.current) {
        clearTimeout(complianceTimeoutRef.current);
      }
    };
  }, [pairs, pyodide]);

  // Handle drag end
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

  // Toggle expansion handlers
  const toggleReferenceExpansion = (name: string) => {
    setExpandedReferences(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const toggleInputExpansion = (name: string) => {
    setExpandedInputs(prev => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Box p={4}>
        <Text mb={4} color="gray.700">
          Select a template schema and a DICOM session to verify compliance.
        </Text>

        <Flex gap={8} mb={8}>
          <Box flex="1">
            <DicomUploader
              onDicomLoad={handleDicomLoad}
              isLoading={isDICOMUploading}
              progress={dicomProgress}
              fileCount={inputDICOMFiles.length}
            />
          </Box>
          <Box flex="1">
            <SchemaUploader
              onSchemaLoad={handleSchemaLoad}
              isLoading={schemaLoading}
              loadedFile={referenceFile}
            />
          </Box>
        </Flex>

        <PairingArea
          pairs={pairs}
          expandedReferences={expandedReferences}
          expandedInputs={expandedInputs}
          complianceMap={complianceMap}
          overallCompliance={overallCompliance}
          onToggleReference={toggleReferenceExpansion}
          onToggleInput={toggleInputExpansion}
        />
      </Box>
    </DragDropContext>
  );
};

export default FinalizeMapping;
