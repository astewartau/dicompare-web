import React, { useRef } from 'react';
import { X, Printer, Download } from 'lucide-react';
import { Acquisition } from '../../types';
import { ComplianceFieldResult } from '../../types/schema';
import { SchemaBinding } from '../../hooks/useSchemaService';
import ComplianceReport from './ComplianceReport';

interface ComplianceReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  acquisitions: Acquisition[];
  schemaPairings: Map<string, SchemaBinding>;
  complianceResults: Map<string, ComplianceFieldResult[]>;
  getSchemaContent: (id: string) => Promise<string | null>;
  getSchemaAcquisition: (binding: SchemaBinding) => Promise<Acquisition | null>;
}

const ComplianceReportModal: React.FC<ComplianceReportModalProps> = ({
  isOpen,
  onClose,
  acquisitions,
  schemaPairings,
  complianceResults,
  getSchemaContent,
  getSchemaAcquisition
}) => {
  const reportRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const handlePrint = () => {
    if (reportRef.current) {
      // Create a new window for printing
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        const reportContent = reportRef.current.innerHTML;

        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>DICOM Compliance Report</title>
              <meta charset="utf-8">
              <style>
                * {
                  margin: 0;
                  padding: 0;
                  box-sizing: border-box;
                }

                body {
                  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  line-height: 1.6;
                  color: #374151;
                  max-width: 8.5in;
                  margin: 0 auto;
                  padding: 0.5in;
                  background: white;
                }

                .text-3xl { font-size: 1.875rem; font-weight: bold; }
                .text-2xl { font-size: 1.5rem; font-weight: bold; }
                .text-xl { font-size: 1.25rem; font-weight: 600; }
                .text-lg { font-size: 1.125rem; font-weight: 600; }
                .text-sm { font-size: 0.875rem; }
                .text-xs { font-size: 0.75rem; }

                .font-bold { font-weight: bold; }
                .font-semibold { font-weight: 600; }

                .text-gray-900 { color: #111827; }
                .text-gray-700 { color: #374151; }
                .text-gray-600 { color: #4B5563; }
                .text-gray-500 { color: #6B7280; }
                .text-green-900 { color: #14532D; }
                .text-green-700 { color: #15803D; }
                .text-green-800 { color: #166534; }
                .text-red-900 { color: #7F1D1D; }
                .text-red-700 { color: #B91C1C; }
                .text-yellow-900 { color: #78350F; }
                .text-yellow-700 { color: #A16207; }

                .bg-green-50 { background-color: #F0FDF4; }
                .bg-red-50 { background-color: #FEF2F2; }
                .bg-yellow-50 { background-color: #FEFCE8; }
                .bg-gray-100 { background-color: #F3F4F6; }
                .bg-gray-50 { background-color: #F9FAFB; }

                .border { border: 1px solid #D1D5DB; }
                .border-gray-200 { border-color: #E5E7EB; }
                .border-green-200 { border-color: #BBF7D0; }
                .border-red-200 { border-color: #FECACA; }
                .border-yellow-200 { border-color: #FEF3C7; }
                .border-b { border-bottom: 1px solid #E5E7EB; }
                .border-b-2 { border-bottom: 2px solid #E5E7EB; }

                .rounded { border-radius: 0.25rem; }
                .rounded-lg { border-radius: 0.5rem; }

                .p-3 { padding: 0.75rem; }
                .p-4 { padding: 1rem; }
                .p-6 { padding: 1.5rem; }
                .pb-6 { padding-bottom: 1.5rem; }
                .pt-6 { padding-top: 1.5rem; }
                .mb-1 { margin-bottom: 0.25rem; }
                .mb-2 { margin-bottom: 0.5rem; }
                .mb-4 { margin-bottom: 1rem; }
                .mb-6 { margin-bottom: 1.5rem; }
                .mb-8 { margin-bottom: 2rem; }
                .mt-1 { margin-top: 0.25rem; }
                .mt-8 { margin-top: 2rem; }
                .mr-1 { margin-right: 0.25rem; }
                .mr-2 { margin-right: 0.5rem; }
                .ml-2 { margin-left: 0.5rem; }

                .flex { display: flex; }
                .items-center { align-items: center; }
                .items-start { align-items: flex-start; }
                .justify-between { justify-content: space-between; }
                .justify-center { justify-content: center; }
                .space-x-2 > * + * { margin-left: 0.5rem; }
                .space-x-6 > * + * { margin-left: 1.5rem; }
                .space-y-2 > * + * { margin-top: 0.5rem; }
                .space-y-4 > * + * { margin-top: 1rem; }
                .space-y-8 > * + * { margin-top: 2rem; }

                .grid { display: grid; }
                .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                .grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
                .gap-3 { gap: 0.75rem; }
                .gap-4 { gap: 1rem; }

                .text-center { text-align: center; }
                .text-right { text-align: right; }

                .break-inside-avoid { page-break-inside: avoid; }
                .flex-1 { flex: 1 1 0%; }
                .flex-shrink-0 { flex-shrink: 0; }

                svg {
                  width: 1em;
                  height: 1em;
                  display: inline-block;
                  vertical-align: middle;
                }

                @media print {
                  body { print-color-adjust: exact; }
                  .break-inside-avoid { page-break-inside: avoid; }
                }

                @page {
                  margin: 0.5in;
                  size: letter;
                }
              </style>
            </head>
            <body>
              ${reportContent}
            </body>
          </html>
        `);

        printWindow.document.close();
        printWindow.focus();

        // Wait for content to load then print
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 250);
      }
    }
  };

  const handleDownloadHTML = () => {
    if (reportRef.current) {
      const reportContent = reportRef.current.innerHTML;
      const fullHTML = `
<!DOCTYPE html>
<html>
  <head>
    <title>DICOM Compliance Report</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body class="bg-gray-50 p-8">
    ${reportContent}
  </body>
</html>`;

      const blob = new Blob([fullHTML], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `dicom-compliance-report-${new Date().toISOString().split('T')[0]}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Compliance Report</h2>
          <div className="flex items-center space-x-3">
            <button
              onClick={handlePrint}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Printer className="h-4 w-4" />
              <span>Print</span>
            </button>
            <button
              onClick={handleDownloadHTML}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="h-4 w-4" />
              <span>Download HTML</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-auto p-6 bg-gray-50">
          <div ref={reportRef} className="max-w-4xl mx-auto">
            <ComplianceReport
              acquisitions={acquisitions}
              schemaPairings={schemaPairings}
              complianceResults={complianceResults}
              getSchemaContent={getSchemaContent}
              getSchemaAcquisition={getSchemaAcquisition}
              className="print:shadow-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComplianceReportModal;