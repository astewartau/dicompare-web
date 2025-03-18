import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, Wrap, WrapItem, Button, Icon, Spinner, Progress, VStack } from '@chakra-ui/react';
import { FiPlus } from 'react-icons/fi';
import CollapsibleCard from '../../components/CollapsibleCard/CollapsibleCard';
import { useAlert } from '../../components/Alert';
import { usePyodide } from '../../components/PyodideContext';

interface EditTemplateProps {
  setAcquisitionsData: (data: Record<string, any>) => void;
  setIsNextDisabled: React.Dispatch<React.SetStateAction<boolean>>;
}

const EditTemplate: React.FC<EditTemplateProps> = ({ setAcquisitionsData, setIsNextDisabled }) => {
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

  useEffect(() => {
    fetch("https://raw.githubusercontent.com/astewartau/dcm-check/refs/heads/main/valid_fields.json")
      .then(response => response.json())
      .then(data => {
        setManualValidFields(data);
      })
      .catch(error => {
        console.error("Error fetching valid fields:", error);
      });
  }, []);

  useEffect(() => {
    if (acquisitionList.length === 0) {
      setIsNextDisabled(true);
      return;
    }
    const allComplete = acquisitionList.every(acq => cardsStageState[acq] === 2 && !cardsEditState[acq]);
    setIsNextDisabled(!allComplete);
  }, [acquisitionList, cardsStageState, cardsEditState, setIsNextDisabled]);

  useEffect(() => {
    setAcquisitionsData(acquisitionsJson);
  }, [acquisitionsJson, setAcquisitionsData]);

  const updateProgress = useCallback((p: number) => {
    setDICOMProgress(p);
  }, []);

  const processDicomFiles = async (files: File[]): Promise<any[]> => {
    const dicomFiles: Record<string, Uint8Array> = {};
    for (const file of files) {
      const arrayBuf = await file.slice(0, 8192).arrayBuffer();
      const typedArray = new Uint8Array(arrayBuf);
      dicomFiles[file.webkitRelativePath || file.name] = typedArray;
    }

    // Use the helper to set a Python global
    setPythonGlobal("dicom_files", dicomFiles);
    await setPythonGlobal("update_progress", updateProgress);

    const code = `
import json
from dicompare.io import async_load_dicom_session, assign_acquisition_and_run_numbers
import pandas as pd

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

acquisition_list = [
    {
        'Acquisition': str(acquisition),
        'ProtocolName': str(acquisition_data['ProtocolName'].unique()[0]),
        'SeriesDescription': str(acquisition_data['SeriesDescription'].unique()),
        'TotalFiles': f"{len(acquisition_data)} files"
    }
    for acquisition in session['Acquisition'].unique()
    for acquisition_data in [session[session['Acquisition'] == acquisition]]
]
json.dumps(acquisition_list)
    `;
    const result = await runPythonCode(code);
    const acquisitions = JSON.parse(result);

    try {
      const sessionColumns = await runPythonCode("list(session.columns)");
      const sessionColumnsJs = sessionColumns.toJs ? sessionColumns.toJs() : sessionColumns;
      setSessionValidFields(sessionColumnsJs);
    } catch (err) {
      console.error("Error retrieving session columns:", err);
    }

    return acquisitions;
  };

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;
    setIsUploading(true);
    try {
      const dicomAcquisitions = await processDicomFiles(files);
      setAcquisitionList(prev => {
        const newAcqs = dicomAcquisitions.map((acq: any) => acq.Acquisition);
        return Array.from(new Set([...prev, ...newAcqs]));
      });
      const acquisitionsData: Record<string, any> = {};
      dicomAcquisitions.forEach((acq: any) => {
        acquisitionsData[acq.Acquisition] = { fields: [], series: [] };
      });
      setAcquisitionsData(acquisitionsData);
    } catch (error) {
      console.error('Error processing DICOM files:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleGlobalEditChange = useCallback((acq: string, isEditing: boolean) => {
    setCardsEditState(prev => ({ ...prev, [acq]: isEditing }));
  }, []);

  const handleStageChange = useCallback((acq: string, stage: number) => {
    setCardsStageState(prev => ({ ...prev, [acq]: stage }));
  }, []);

  const handleSaveAcquisition = (acq: string, jsonData: any) => {
    setAcquisitionsJson(prev => ({ ...prev, [acq]: jsonData }));
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
            Promise.all(
              entries.map((entry: any) => traverseFileTree(entry, path + item.name + "/"))
            ).then(() => resolve());
          });
        }
      });
    };

    const promises: Promise<void>[] = [];
    for (let i = 0; i < dtItems.length; i++) {
      const entry = dtItems[i].webkitGetAsEntry();
      if (entry) {
        promises.push(traverseFileTree(entry, ""));
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
    setAcquisitionList(prev => [...prev, newAcqName]);
    setNewAcqCounter(prev => prev + 1);
  };

  const handleDeleteAcquisition = (acq: string) => {
    displayAlert(
      "Are you sure you want to delete this acquisition?",
      "Confirm Delete",
      [
        {
          option: "Delete", callback: () => {
            setAcquisitionList(prev => prev.filter(item => item !== acq));
            runPythonCode(`
              if 'session' in globals():
                  if '${acq}' in session['Acquisition'].unique():
                      session = session[session['Acquisition'] != '${acq}']
            `);
          },
        },
        { option: "Cancel", callback: () => { } }
      ]
    );
  };

  return (
    <Box width="100%">
      <Text mb={8} color="gray.700">
        Use this tool to build a schema for a DICOM session. The schema can be used to validate future sessions for compliance.<br />
        Start by uploading DICOMs for a representative session or manually adding acquisitions.
      </Text>
      <Box
        mb={6}
        p={4}
        borderWidth="1px"
        borderRadius="md"
        bg={isDragActive ? "gray.200" : "gray.50"}
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
              validFields={acq.startsWith("New Acquisition") ? manualValidFields : sessionValidFields}
              initialEditMode={acq.startsWith("New Acquisition")}
              initialStage={acq.startsWith("New Acquisition") ? 2 : 1}
              hideBackButton={acq.startsWith("New Acquisition")}
              onSaveAcquisition={handleSaveAcquisition}
              onGlobalEditChange={handleGlobalEditChange}
              onStageChange={handleStageChange}
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
                <Text size="lg" color="teal.500">Add manually</Text>
              </VStack>
            </Button>
          </Box>
        </WrapItem>
      </Wrap>
    </Box>
  );
};

export default EditTemplate;
