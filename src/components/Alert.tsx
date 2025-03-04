import React, { createContext, useState, useContext, ReactNode, useRef } from "react";
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
} from "@chakra-ui/react";

interface AlertOptions {
  confirmText?: string;
  onConfirm?: () => void;
}

interface AlertContextProps {
  displayAlert: (message: string, title?: string, options?: AlertOptions) => void;
}

const AlertContext = createContext<AlertContextProps | undefined>(undefined);

export const AlertProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [alertMessage, setAlertMessage] = useState("");
  const [alertTitle, setAlertTitle] = useState("Alert");
  const [confirmText, setConfirmText] = useState("Ok");
  const [onConfirmCallback, setOnConfirmCallback] = useState<(() => void) | undefined>(undefined);

  const cancelRef = useRef<HTMLButtonElement | null>(null);

  const displayAlert = (message: string, title?: string, options?: AlertOptions) => {
    setAlertMessage(message);
    setAlertTitle(title || "Alert");
    setConfirmText(options?.confirmText || "Ok");
    setOnConfirmCallback(() => options?.onConfirm);
    onOpen();
  };

  const handleConfirm = () => {
    onClose();
    if (onConfirmCallback) {
      onConfirmCallback();
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
              <Button colorScheme="red" ml={3} ref={cancelRef} onClick={handleConfirm}>
                {confirmText}
              </Button>
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
    throw new Error("useAlert must be used within an AlertProvider");
  }
  return context;
};
