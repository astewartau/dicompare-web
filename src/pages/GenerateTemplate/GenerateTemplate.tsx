import React, { useState, useRef } from 'react';
import VerticalStepper from '../../components/Stepper';
import Introduction from './Introduction';
import NavigationBar from '../../components/NavigationBar';
import { Box } from '@chakra-ui/react';
import EditTemplate from './EditTemplate';
import Review from './Review';

interface GenerateTemplateProps {
    runPythonCode: (code: string) => Promise<string>;
    pyodide: any;
}

const GenerateTemplate: React.FC<GenerateTemplateProps> = ({ runPythonCode, pyodide }) => {
    const [nextEnabled, setNextEnabled] = useState(false);
    const [templateJson, setTemplateJson] = useState<any>(null);
    const actionOnNext = useRef<(() => void) | null>(null);

    const steps = [
        { title: 'Build template', component: <EditTemplate pyodide={pyodide} setNextEnabled={setNextEnabled} setTemplateJson={setTemplateJson} actionOnNext={actionOnNext} /> },
        { title: 'Enter metadata', component: <Introduction setNextEnabled={setNextEnabled} /> },
        { title: 'Review', component: <Review templateJson={templateJson} /> },
    ];

    return (
        <>
            <Box position="sticky" top="0" zIndex="100">
                <NavigationBar />
            </Box>
            <VerticalStepper
                steps={steps}
                setNextEnabled={setNextEnabled}
                nextEnabled={nextEnabled}
                actionOnNext={actionOnNext}
            />
        </>
    );
};

export default GenerateTemplate;
