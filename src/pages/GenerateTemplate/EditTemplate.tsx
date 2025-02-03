import React, { useEffect, useState } from 'react';
import { Box, Heading, Text, VStack } from '@chakra-ui/react';

import CollapsibleCard from '../../components/CollapisbleCard';

const EditTemplate = () => {
    const [validFields, setValidFields] = useState([]);
    const mockProtocols = [
        {
            ProtocolName: 'gre_qsm_5echoes_Iso1mm',
            dicomData: [
                { key: 'PatientID', value: 'MASOP_MA001-0002_BL' },
                { key: 'RepetitionTime', value: 29 },
            ],
            series: [
                {
                    name: '1',
                    fields: [
                        { field: 'EchoTime', value: 5.84 },
                        { field: 'ImageType', contains: 'M' },
                    ],
                },
                {
                    name: '2',
                    fields: [
                        { field: 'EchoTime', value: 5.84 },
                        { field: 'ImageType', contains: 'P' },
                    ],
                },
                {
                    name: '3',
                    fields: [
                        { field: 'EchoTime', min: 10.63, max: 11 },
                        {
                            field: 'ImageType',
                            value: ['ORIGINAL', 'PRIMARY', 'M', 'ND', 'NORM'],
                        },
                    ],
                },
                {
                    name: '4',
                    fields: [
                        { field: 'EchoTime', value: 10.63 },
                        {
                            field: 'ImageType',
                            value: ['ORIGINAL', 'PRIMARY', 'P', 'ND'],
                        },
                    ],
                },
                {
                    name: '5',
                    fields: [
                        { field: 'EchoTime', value: 15.42, tolerance: 1 },
                        {
                            field: 'ImageType',
                            value: ['ORIGINAL', 'PRIMARY', 'M', 'ND', 'NORM'],
                        },
                    ],
                },
            ],
        },
        {
            ProtocolName: 't1_mprage_sag_p2',
            dicomData: [
                { key: 'PatientID', value: 'T1_MPRAGE_001' },
                { key: 'Modality', value: 'MRI' },
            ],
            series: [],
        },
        {
            ProtocolName: 'T1w_MPRAGE',
            dicomData: [
                { key: 'Series Description', value: 'T1-weighted anatomical' },
                { key: 'Modality', value: 'MRI' },
                { key: 'Patient ID', value: '67890' },
                { key: 'Study Date', value: '2023-02-15' },
                { key: 'Institution Name', value: 'NeuroScan Institute' },
            ],
            series: [
                {
                    name: '1',
                    fields: [
                        { field: 'EchoTime', value: 4.3 },
                        { field: 'ImageType', contains: 'T1' },
                    ],
                },
            ],
        },
        {
            ProtocolName: 'fMRI_Task',
            dicomData: [
                { key: 'Series Description', value: 'Functional task imaging' },
                { key: 'Modality', value: 'fMRI' },
                { key: 'Patient ID', value: '54321' },
                { key: 'Study Date', value: '2023-03-10' },
                { key: 'Institution Name', value: 'Brain Research Lab' },
            ],
            series: [
                {
                    name: '1',
                    fields: [
                        { field: 'EchoTime', value: 35 },
                        { field: 'ImageType', contains: 'TASK' },
                    ],
                },
                {
                    name: '2',
                    fields: [
                        { field: 'EchoTime', value: 40 },
                        { field: 'ImageType', contains: 'REST' },
                    ],
                },
            ],
        },
        {
            ProtocolName: 'DTI_64Directions',
            dicomData: [
                {
                    key: 'Series Description',
                    value: 'Diffusion Tensor Imaging - 64 directions',
                },
                { key: 'Modality', value: 'DTI' },
                { key: 'Patient ID', value: '11223' },
                { key: 'Study Date', value: '2023-04-05' },
                { key: 'Institution Name', value: 'Advanced Imaging Center' },
            ],
            series: [
                {
                    name: '1',
                    fields: [
                        { field: 'Directionality', value: '64' },
                        { field: 'ImageType', value: ['ORIGINAL', 'PRIMARY', 'DTI'] },
                    ],
                },
            ],
        },
        {
            ProtocolName: 'T2w_FLAIR',
            dicomData: [
                {
                    key: 'Series Description',
                    value: 'T2-weighted Fluid-Attenuated Inversion Recovery',
                },
                { key: 'Modality', value: 'MRI' },
                { key: 'Patient ID', value: '33445' },
                { key: 'Study Date', value: '2023-05-20' },
                { key: 'Institution Name', value: 'Imaging Diagnostics Facility' },
            ],
            series: [],
        },
        {
            ProtocolName: 'ASL_Perfusion',
            dicomData: [
                {
                    key: 'Series Description',
                    value: 'Arterial Spin Labeling Perfusion Imaging',
                },
                { key: 'Modality', value: 'MRI' },
                { key: 'Patient ID', value: '77889' },
                { key: 'Study Date', value: '2023-06-12' },
                { key: 'Institution Name', value: 'Perfusion Imaging Lab' },
            ],
            series: [
                {
                    name: '1',
                    fields: [
                        { field: 'Labeling Efficiency', value: 85 },
                        { field: 'ImageType', value: ['PERFUSION', 'LABEL'] },
                    ],
                },
            ],
        },
        {
            ProtocolName: 'MRA_CircleOfWillis',
            dicomData: [
                {
                    key: 'Series Description',
                    value: 'Magnetic Resonance Angiography - Circle of Willis',
                },
                { key: 'Modality', value: 'MRA' },
                { key: 'Patient ID', value: '99112' },
                { key: 'Study Date', value: '2023-07-08' },
                { key: 'Institution Name', value: 'Vascular Imaging Center' },
            ],
            series: [
                {
                    name: '1',
                    fields: [
                        { field: 'Contrast Agent', value: 'Gadolinium' },
                        { field: 'ImageType', value: ['MRA', 'CONTRAST'] },
                    ],
                },
            ],
        },
        {
            ProtocolName: 'Cardiac_Cine',
            dicomData: [
                { key: 'Series Description', value: 'Cardiac Cine Imaging' },
                { key: 'Modality', value: 'MRI' },
                { key: 'Patient ID', value: '66778' },
                { key: 'Study Date', value: '2023-08-18' },
                { key: 'Institution Name', value: 'Cardiac Imaging Lab' },
            ],
            series: [
                {
                    name: '1',
                    fields: [
                        { field: 'Heart Rate', value: 72 },
                        { field: 'ImageType', value: ['CARDIAC', 'CINE'] },
                    ],
                },
            ],
        },
    ];

    useEffect(() => {
        const fetchFields = async () => {
            try {
                const response = await fetch(
                    'https://raw.githubusercontent.com/astewartau/dicompare/v0.1.12/valid_fields.json'
                );
                const fields = await response.json();
                setValidFields(fields);
            } catch (error) {
                console.error('Failed to fetch valid fields', error);
            }
        };

        fetchFields();
    }, []);

    return (
        <Box p={8}>
            {/* Heading */}
            <Heading as="h1" size="2xl" color="teal.600" mb={6}>
                Generate Template
            </Heading>

            {/* Description */}
            <Text fontSize="xl" mb={8} color="gray.700">
                Modify the protocols and their associated DICOM data in the template.
            </Text>

            {/* Collapsible Cards */}
            <VStack spacing={6} minWidth="100vh">
                {mockProtocols.map((protocol, index) => (
                    <CollapsibleCard key={index} protocol={protocol} validFields={validFields} />
                ))}
            </VStack>
        </Box>
    );
};

export default EditTemplate;
