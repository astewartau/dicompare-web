import React from "react";
import VerticalStepper from "../../components/Stepper";
import Introduction from "./Introduction";
import UploadFiles from "./UploadFiles";
import UploadConfiguration from "./UploadConfiguration";
import ComplianceResults from "./ComplianceResults";
import NavigationBar from "../../components/NavigationBar";
import { Box } from "@chakra-ui/react";

const CheckCompliance = () => {
  const steps = [
    { title: "Introduction", component: <Introduction onNext={() => {}} /> },
    { title: "Upload Files", component: <UploadFiles onNext={() => {}} /> },
    {
      title: "Upload or Select Configuration",
      component: <UploadConfiguration onNext={() => {}} />
    },
    { title: "Compliance Results", component: <ComplianceResults onNext={() => {}} /> },
  ];

  return (
    <>
      {/* Navigation Bar */}
      <Box position="sticky" top="0" zIndex="100">
        <NavigationBar />
      </Box>
      <VerticalStepper steps={steps} />
    </>
  );
};

export default CheckCompliance;
