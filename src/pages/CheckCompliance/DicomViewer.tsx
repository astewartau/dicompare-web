// DicomViewer.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  Text,
  Box,
  Spinner,
  VStack,
  HStack,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  Badge,
  Flex
} from '@chakra-ui/react';
import { usePyodide } from '../../components/PyodideContext';

interface DicomViewerProps {
  isOpen: boolean;
  onClose: () => void;
  acquisitionName: string;
}

const DicomViewer: React.FC<DicomViewerProps> = ({
  isOpen,
  onClose,
  acquisitionName
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [imageData, setImageData] = useState<{
    series: Array<{
      name: string;
      slices: number[][][];
      width: number;
      height: number;
      min: number;
      max: number;
      sliceCount: number;
    }>;
  } | null>(null);
  const [currentSeries, setCurrentSeries] = useState(0);
  const [currentSlice, setCurrentSlice] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const { runPythonCode, setPythonGlobal } = usePyodide();

  // Extract DICOM data when modal opens
  useEffect(() => {
    if (isOpen && acquisitionName) {
      extractDicomData();
    }
  }, [isOpen, acquisitionName]);

  // Render the image when imageData, currentSeries, or currentSlice changes
  useEffect(() => {
    if (imageData && canvasRef.current) {
      renderImage();
    }
  }, [imageData, currentSeries, currentSlice]);

  const extractDicomData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      await setPythonGlobal('target_acquisition', acquisitionName);
      
      const code = `
import numpy as np
import pandas as pd
import json
import pydicom
import re
from io import BytesIO

# Check if we have the original DICOM files stored
if 'dicom_files' not in globals() or not dicom_files:
    raise ValueError("Original DICOM files not available for visualization")

# Get the DICOM data for the target acquisition
if 'in_session' not in globals() or in_session is None:
    raise ValueError("No DICOM session loaded")

# Filter to the target acquisition
acq_data = in_session[in_session['Acquisition'] == target_acquisition]
if acq_data.empty:
    raise ValueError(f"No data found for acquisition: {target_acquisition}")

print(f"Found {len(acq_data)} DICOM files for acquisition {target_acquisition}")

# Get the original DICOM files as a dict (convert from JS if needed)
dicom_bytes = dicom_files.to_py() if hasattr(dicom_files, 'to_py') else dicom_files

# Get unique series based on varying fields (like EchoTime, ImageType, etc.)
series_results = []
varying_fields = []

# Check which fields vary within this acquisition to group into series
for field in ['EchoTime', 'ImageType', 'SeriesInstanceUID']:
    if field in acq_data.columns:
        unique_vals = acq_data[field].dropna().unique()
        if len(unique_vals) > 1:
            varying_fields.append(field)

if varying_fields:
    # Group by the first varying field (usually EchoTime or ImageType)
    primary_field = varying_fields[0]
    unique_series = acq_data.groupby([primary_field])
    print(f"Found {len(unique_series)} unique {primary_field} values: {list(unique_series.groups.keys())}")
else:
    # Single series
    unique_series = [(target_acquisition, acq_data)]
    print(f"Single series acquisition: {target_acquisition}")

# Process each series
for series_key, series_data in unique_series:
    if varying_fields:
        series_name = f"{varying_fields[0]} ({series_key})"
        print(f"Processing series: {series_name} ({len(series_data)} slices)")
    else:
        series_name = target_acquisition
        print(f"Processing acquisition: {series_name} ({len(series_data)} slices)")
    
    # Sort by InstanceNumber for proper slice ordering
    if 'InstanceNumber' in series_data.columns:
        series_data_sorted = series_data.sort_values('InstanceNumber')
    else:
        series_data_sorted = series_data
    
    print(f"  Sorted {len(series_data_sorted)} files by InstanceNumber")
    
    # Get center instance based on sorted order
    center_idx = len(series_data_sorted) // 2
    center_row = series_data_sorted.iloc[center_idx]
    center_dicom_path = center_row.get('DICOM_Path', '')
    
    print(f"  Selected center slice at index {center_idx}, InstanceNumber: {center_row.get('InstanceNumber', 'N/A')}")
    
    if center_dicom_path in dicom_bytes:
        try:
            # Read DICOM with pixel data
            ds = pydicom.dcmread(BytesIO(dicom_bytes[center_dicom_path]), force=True, stop_before_pixels=False)
            
            if hasattr(ds, 'pixel_array'):
                try:
                    pixel_array = ds.pixel_array
                    
                    # Handle different dimensions
                    if len(pixel_array.shape) == 3:
                        # Take middle slice if it's 3D
                        middle_slice = pixel_array.shape[0] // 2
                        pixel_array = pixel_array[middle_slice]
                    elif len(pixel_array.shape) > 3:
                        # Take first of each extra dimension
                        while len(pixel_array.shape) > 2:
                            pixel_array = pixel_array[0]
                    
                    # Ensure it's 2D and convert to float
                    if len(pixel_array.shape) == 2:
                        center_slice = pixel_array.astype(float)
                        print(f"    Successfully extracted center slice from {center_dicom_path}")
                    else:
                        raise ValueError(f"Could not get 2D slice from {center_dicom_path}")
                        
                except Exception as e:
                    print(f"    Error extracting pixel array from {center_dicom_path}: {e}")
                    continue
            else:
                print(f"    No pixel data in {center_dicom_path}")
                continue
                
        except Exception as e:
            print(f"    Error reading DICOM {center_dicom_path}: {e}")
            continue
    else:
        print(f"    Center DICOM path not found in dicom_bytes: {center_dicom_path}")
        continue
    
    # Check if we successfully extracted the center slice
    if 'center_slice' in locals():
        # Calculate statistics from the center slice
        series_min = float(np.min(center_slice))
        series_max = float(np.max(center_slice))
        
        series_results.append({
            "name": series_name,
            "slices": [center_slice.tolist()],  # Just show center slice
            "width": int(center_slice.shape[1]),
            "height": int(center_slice.shape[0]),
            "min": series_min,
            "max": series_max,
            "sliceCount": 1,
            "total_slices": len(series_data_sorted)
        })
        
        print(f"  Successfully extracted center slice for {series_name}")
    else:
        print(f"  No pixel data found for {series_name}")

if not series_results:
    raise ValueError("Could not extract pixel data from any series. Make sure DICOM files contain pixel data.")

# Convert to JSON-serializable format
result = {
    "series": series_results
}

print(f"Final result: {len(series_results)} series extracted")

json.dumps(result)
      `;

      const result = await runPythonCode(code);
      const data = JSON.parse(result);
      
      setImageData(data);
      setCurrentSeries(0);
      setCurrentSlice(0);
      
    } catch (err) {
      console.error('Error extracting DICOM data:', err);
      setError(`Failed to extract DICOM data: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const renderImage = () => {
    if (!imageData || !canvasRef.current || !imageData.series[currentSeries]) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentSeriesData = imageData.series[currentSeries];
    const { slices, width, height, min, max } = currentSeriesData;
    
    // Get the current slice data
    const currentSliceData = slices[currentSlice];
    if (!currentSliceData) return;
    
    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    // Create ImageData
    const imageDataObj = ctx.createImageData(width, height);
    const pixels = imageDataObj.data;

    // Convert DICOM data to grayscale image
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const pixelIdx = idx * 4;
        
        // Normalize the pixel value to 0-255
        const normalizedValue = Math.round(((currentSliceData[y][x] - min) / (max - min)) * 255);
        
        // Set RGB (grayscale)
        pixels[pixelIdx] = normalizedValue;     // R
        pixels[pixelIdx + 1] = normalizedValue; // G
        pixels[pixelIdx + 2] = normalizedValue; // B
        pixels[pixelIdx + 3] = 255;             // A
      }
    }

    // Draw the image
    ctx.putImageData(imageDataObj, 0, 0);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalOverlay />
      <ModalContent maxW="800px">
        <ModalHeader>
          DICOM Viewer - {acquisitionName}
        </ModalHeader>
        <ModalCloseButton />
        
        <ModalBody>
          {isLoading && (
            <VStack spacing={4} py={8}>
              <Spinner size="xl" color="blue.500" />
              <Text>Extracting DICOM data...</Text>
            </VStack>
          )}
          
          {error && (
            <VStack spacing={4} py={8}>
              <Text color="red.500" textAlign="center">
                {error}
              </Text>
              <Text fontSize="sm" color="gray.600" textAlign="center">
                This feature requires DICOM files with pixel data to be loaded.
              </Text>
            </VStack>
          )}
          
          {imageData && !isLoading && (
            <VStack spacing={4}>
              {/* Series selection */}
              {imageData.series.length > 1 && (
                <Box width="100%">
                  <Text fontSize="sm" mb={2} textAlign="center">
                    Series Selection
                  </Text>
                  <HStack spacing={2} justify="center" wrap="wrap">
                    {imageData.series.map((series, idx) => (
                      <Button
                        key={idx}
                        size="sm"
                        colorScheme={currentSeries === idx ? 'blue' : 'gray'}
                        onClick={() => {
                          setCurrentSeries(idx);
                          setCurrentSlice(0); // Reset to first slice when changing series
                        }}
                      >
                        {series.name}
                      </Button>
                    ))}
                  </HStack>
                </Box>
              )}
              
              <Flex justify="space-between" width="100%" align="center">
                <Badge colorScheme="blue">
                  {imageData.series[currentSeries]?.width} × {imageData.series[currentSeries]?.height}
                </Badge>
                <Badge colorScheme="green">
                  Slice {currentSlice + 1} of {imageData.series[currentSeries]?.sliceCount || 1}
                </Badge>
                <Badge colorScheme="purple">
                  Range: {Math.round(imageData.series[currentSeries]?.min || 0)} - {Math.round(imageData.series[currentSeries]?.max || 0)}
                </Badge>
              </Flex>
              
              <Box 
                border="1px solid" 
                borderColor="gray.300" 
                borderRadius="md"
                p={2}
                bg="black"
                display="flex"
                justifyContent="center"
                alignItems="center"
              >
                <canvas 
                  ref={canvasRef}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '400px',
                    imageRendering: 'pixelated'
                  }}
                />
              </Box>
              
              {(imageData.series[currentSeries]?.sliceCount || 1) > 1 && (
                <Box width="100%">
                  <Text fontSize="sm" mb={2} textAlign="center">
                    Slice Navigator
                  </Text>
                  <Slider
                    value={currentSlice}
                    min={0}
                    max={(imageData.series[currentSeries]?.sliceCount || 1) - 1}
                    step={1}
                    onChange={setCurrentSlice}
                  >
                    <SliderTrack>
                      <SliderFilledTrack />
                    </SliderTrack>
                    <SliderThumb />
                  </Slider>
                </Box>
              )}
            </VStack>
          )}
        </ModalBody>

        <ModalFooter>
          <Button onClick={onClose}>
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default DicomViewer;