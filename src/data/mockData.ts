// Import for the combined export at the bottom
import { mockAcquisitions } from './mockAcquisitions';
import { mockTemplates } from './mockTemplates';
import { mockComplianceReports, mockPublicReports } from './mockReports';
import { commonAcquisitionFields } from './mockFields';

// Re-export all mock data from the modular structure
export { mockAcquisitions } from './mockAcquisitions';
export { mockTemplates } from './mockTemplates';
export { mockComplianceReports, mockPublicReports } from './mockReports';
export { commonAcquisitionFields, commonSeriesFields, t1MprageFields, boldFmriFields, dtiFields } from './mockFields';

// Legacy support - keep for backward compatibility but prefer importing from specific modules

// Backward compatibility exports using the new modular data
export const mockComplianceReport = mockComplianceReports[0];

// Export all mock data - combined object for legacy support
export const mockData = {
  acquisitions: mockAcquisitions,
  templates: mockTemplates,
  complianceReport: mockComplianceReport,
  complianceReports: mockComplianceReports,
  publicReports: mockPublicReports,
  dicomFields: commonAcquisitionFields // Use the enhanced fields structure
};