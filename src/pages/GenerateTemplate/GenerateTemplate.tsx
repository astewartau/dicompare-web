import React, { useState } from 'react';
import VerticalStepper from '../../components/Stepper';
import Introduction from './Introduction';
import NavigationBar from '../../components/NavigationBar';
import { Box } from '@chakra-ui/react';
import DicomAnalysis from './DicomAnalysis';
import EditTemplate from './EditTemplate';
import Review from './Review';

interface GenerateTemplateProps {
    runPythonCode: (code: string) => Promise<string>;
    pyodide: any;
}

const GenerateTemplate: React.FC<GenerateTemplateProps> = ({ runPythonCode, pyodide }) => {
    const [nextEnabled, setNextEnabled] = useState(false);

    const steps = [
        { title: 'Introduction', component: <Introduction setNextEnabled={setNextEnabled} /> },
        { title: 'DICOM Analysis', component: <DicomAnalysis pyodide={pyodide} setNextEnabled={setNextEnabled} /> },
        { title: 'Edit Template', component: <EditTemplate pyodide={pyodide} setNextEnabled={setNextEnabled} /> },
        { title: 'Review', component: <Review /> },
    ];

    return (
        <>
            {/* Navigation Bar */}
            <Box position="sticky" top="0" zIndex="100">
                <NavigationBar />
            </Box>
            <VerticalStepper steps={steps} setNextEnabled={setNextEnabled} nextEnabled={nextEnabled} />
        </>
    );
};

export default GenerateTemplate;
