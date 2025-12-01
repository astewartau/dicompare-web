import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, HelpCircle, Calendar, User, FileText } from 'lucide-react';
import { Acquisition } from '../../types';
import { ComplianceFieldResult } from '../../types/schema';
import { SchemaBinding } from '../../hooks/useSchemaService';
import CombinedComplianceView from './CombinedComplianceView';

interface ComplianceReportProps {
  acquisitions: Acquisition[];
  schemaPairings: Map<string, SchemaBinding>;
  complianceResults: Map<string, ComplianceFieldResult[]>;
  className?: string;
  getSchemaContent: (id: string) => Promise<string | null>;
  getSchemaAcquisition: (binding: SchemaBinding) => Promise<Acquisition | null>;
}

const ComplianceReport: React.FC<ComplianceReportProps> = ({
  acquisitions,
  schemaPairings,
  complianceResults,
  className = '',
  getSchemaContent,
  getSchemaAcquisition
}) => {
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const getStatusIcon = (status: ComplianceFieldResult['status'], size = 'h-4 w-4') => {
    const iconProps = { className: size };

    switch (status) {
      case 'pass':
        return <CheckCircle {...iconProps} className={`${size} text-green-600`} />;
      case 'fail':
        return <XCircle {...iconProps} className={`${size} text-red-600`} />;
      case 'warning':
        return <AlertTriangle {...iconProps} className={`${size} text-yellow-600`} />;
      case 'na':
        return <HelpCircle {...iconProps} className={`${size} text-gray-500`} />;
      case 'unknown':
        return <HelpCircle {...iconProps} className={`${size} text-gray-400`} />;
    }
  };

  return (
    <div className={`bg-white ${className}`}>
      {/* Report Header */}
      <div className="border-b-2 border-gray-200 pb-6 mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">DICOM Compliance Report</h1>
        <div className="flex items-center space-x-6 text-sm text-gray-600">
          <div className="flex items-center space-x-2">
            <Calendar className="h-4 w-4" />
            <span>Generated: {currentDate}</span>
          </div>
          <div className="flex items-center space-x-2">
            <FileText className="h-4 w-4" />
            <span>{acquisitions.length} acquisition{acquisitions.length !== 1 ? 's' : ''} analyzed</span>
          </div>
        </div>
      </div>

      {/* Acquisition Details */}
      <div className="space-y-8">
        {acquisitions.map((acquisition) => {
          const pairing = schemaPairings.get(acquisition.id);
          const results = complianceResults.get(acquisition.id) || [];

          if (!pairing) return null;

          const statusCounts = {
            pass: results.filter(r => r.status === 'pass').length,
            fail: results.filter(r => r.status === 'fail').length,
            warning: results.filter(r => r.status === 'warning').length,
            na: results.filter(r => r.status === 'na').length,
            unknown: results.filter(r => r.status === 'unknown').length
          };

          return (
            <div key={acquisition.id} className="border border-gray-200 rounded-lg p-6 break-inside-avoid">
              {/* Acquisition Header */}
              <div className="mb-4 pb-3 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900 mb-1">
                  Schema: {pairing.schema.name} v{pairing.schema.version}: {acquisition.seriesDescription}
                </h2>
                <p className="text-sm text-gray-600">Protocol: {acquisition.protocolName}</p>
              </div>

              {/* Acquisition Statistics */}
              <div className="grid grid-cols-4 gap-3 mb-6">
                <div className="text-center">
                  <div className="text-sm font-semibold text-green-900">{statusCounts.pass}</div>
                  <div className="text-xs text-green-700">Passed</div>
                </div>

                <div className="text-center">
                  <div className="text-sm font-semibold text-red-900">{statusCounts.fail}</div>
                  <div className="text-xs text-red-700">Failed</div>
                </div>

                <div className="text-center">
                  <div className="text-sm font-semibold text-yellow-900">{statusCounts.warning}</div>
                  <div className="text-xs text-yellow-700">Warnings</div>
                </div>

                <div className="text-center">
                  <div className="text-sm font-semibold text-gray-700">{statusCounts.na}</div>
                  <div className="text-xs text-gray-600">N/A</div>
                </div>
              </div>

              {/* Use CombinedComplianceView with printMode */}
              <CombinedComplianceView
                acquisition={acquisition}
                pairing={pairing}
                getSchemaContent={getSchemaContent}
                getSchemaAcquisition={getSchemaAcquisition}
                printMode={true}
              />
            </div>
          );
        })}
      </div>

      {/* Report Footer */}
      <div className="mt-8 pt-6 border-t border-gray-200 text-center text-xs text-gray-500">
        <p>This report was generated by DICOM Compare on {currentDate}</p>
        <p className="mt-1">For questions or support, please contact your system administrator</p>
      </div>
    </div>
  );
};

export default ComplianceReport;
