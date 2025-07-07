import React, { createContext, useState, useContext, ReactNode, useRef } from 'react';
import {
    AlertDialog,
    AlertDialogOverlay,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogCloseButton,
    AlertDialogBody,
    AlertDialogFooter,
    Button,
    useDisclosure,
} from '@chakra-ui/react';

export interface AlertButton {
    option: string;
    callback?: () => void;
}

interface AlertContextProps {
    displayAlert: (message: string, title?: string, options?: AlertButton[]) => void;
}

const AlertContext = createContext<AlertContextProps | undefined>(undefined);

export const AlertProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { isOpen, onOpen, onClose } = useDisclosure();
    const [alertMessage, setAlertMessage] = useState('');
    const [alertTitle, setAlertTitle] = useState('Alert');
    const [alertOptions, setAlertOptions] = useState<AlertButton[]>([]);
    const cancelRef = useRef<HTMLButtonElement | null>(null);

    const displayAlert = (message: string, title?: string, options?: AlertButton[]) => {
        setAlertMessage(message);
        setAlertTitle(title || 'Alert');
        setAlertOptions(options || []);
        onOpen();
    };

    const handleButtonClick = (callback?: () => void) => {
        onClose();
        if (callback) {
            callback();
        }
    };

    return (
        <AlertContext.Provider value={{ displayAlert }}>
            {children}
            <AlertDialog
                isOpen={isOpen}
                leastDestructiveRef={cancelRef}
                onClose={onClose}
                isCentered
                motionPreset="slideInBottom"
            >
                <AlertDialogOverlay>
                    <AlertDialogContent>
                        <AlertDialogHeader>{alertTitle}</AlertDialogHeader>
                        <AlertDialogCloseButton />
                        <AlertDialogBody>{alertMessage}</AlertDialogBody>
                        <AlertDialogFooter>
                            {alertOptions.map((btn, index) => (
                                <Button
                                    key={index}
                                    onClick={() => handleButtonClick(btn.callback)}
                                    ml={index > 0 ? 3 : 0}
                                    ref={index === 0 ? cancelRef : undefined}
                                >
                                    {btn.option}
                                </Button>
                            ))}
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialogOverlay>
            </AlertDialog>
        </AlertContext.Provider>
    );
};

export const useAlert = () => {
    const context = useContext(AlertContext);
    if (context === undefined) {
        throw new Error('useAlert must be used within an AlertProvider');
    }
    return context;
};
