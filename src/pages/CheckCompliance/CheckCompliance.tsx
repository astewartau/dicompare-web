// CompliancePage.tsx (formerly CheckCompliance.tsx)
import React, { useState } from 'react'
import { Box, HStack, Button, Flex } from '@chakra-ui/react'
import NavigationBar from '../../components/NavigationBar'
import FinalizeMapping from './FinalizeMapping'

const CheckCompliance: React.FC = () => {
  const [canSubmit, setCanSubmit] = useState(false)
  const [report, setReport] = useState<any>(null)

  // FinalizeMapping will call this to tell us when it's valid
  const handleValidationChange = (valid: boolean) => {
    setCanSubmit(valid)
  }

  // FinalizeMapping will call this to hand us the parsed JSON
  const handleReportReady = (parsedReport: any) => {
    setReport(parsedReport)
  }

  const handleSubmit = () => {
    if (!report) return
    // create a blob URL and trigger download
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'compliance_report.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <Flex direction="column" height="100vh">
      {/* Top nav */}
      <Box position="sticky" top="0" zIndex="100">
        <NavigationBar />
      </Box>

      {/* Main content */}
      <Box flex="1" overflowY="auto">
        <FinalizeMapping
          onValidationChange={handleValidationChange}
          onReportReady={handleReportReady}
        />
      </Box>

      {/* Bottom bar */}
      <HStack p={4} bg="white" boxShadow="md" justifyContent="flex-end">
        <Button
          colorScheme="teal"
          isDisabled={!canSubmit || !report}
          onClick={handleSubmit}
        >
          Download Report
        </Button>
      </HStack>
    </Flex>
  )
}

export default CheckCompliance
