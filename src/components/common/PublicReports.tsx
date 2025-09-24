import React, { useState } from 'react';
import { Search, Filter, Download, Calendar, Building, Tag } from 'lucide-react';
import { PublicReport } from '../../types';
import { mockPublicReports } from '../../data/mockData';

const PublicReports: React.FC = () => {
  const [reports] = useState<PublicReport[]>(mockPublicReports);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedInstitution, setSelectedInstitution] = useState<string>('all');

  const filteredReports = reports.filter(report => {
    const matchesSearch = report.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         report.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         report.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesType = selectedType === 'all' || report.reportType === selectedType;
    const matchesInstitution = selectedInstitution === 'all' || report.institution === selectedInstitution;
    
    return matchesSearch && matchesType && matchesInstitution;
  });

  const institutions = Array.from(new Set(reports.map(r => r.institution)));
  const reportTypes = Array.from(new Set(reports.map(r => r.reportType)));

  const getReportTypeColor = (type: string) => {
    return type === 'compliance' 
      ? 'bg-blue-100 text-blue-800' 
      : 'bg-green-100 text-green-800';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-semibold text-gray-900 flex items-center">
          <Search className="h-6 w-6 mr-2 text-medical-600" />
          Public Data Reports
        </h3>
        <span className="text-sm text-gray-500">
          {filteredReports.length} of {reports.length} reports
        </span>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="grid md:grid-cols-3 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search reports, institutions, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-medical-500 focus:border-medical-500"
            />
          </div>

          {/* Report Type Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-medical-500 focus:border-medical-500 appearance-none bg-white"
            >
              <option value="all">All Types</option>
              {reportTypes.map(type => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Institution Filter */}
          <div className="relative">
            <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <select
              value={selectedInstitution}
              onChange={(e) => setSelectedInstitution(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-medical-500 focus:border-medical-500 appearance-none bg-white"
            >
              <option value="all">All Institutions</option>
              {institutions.map(institution => (
                <option key={institution} value={institution}>
                  {institution}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Reports Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredReports.map((report) => (
          <div
            key={report.id}
            className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow border border-gray-200 overflow-hidden"
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900 mb-1 line-clamp-2">
                    {report.title}
                  </h4>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ml-2 ${getReportTypeColor(report.reportType)}`}>
                  {report.reportType}
                </span>
              </div>

              {/* Institution */}
              <div className="flex items-center text-sm text-gray-600 mb-3">
                <Building className="h-4 w-4 mr-1" />
                {report.institution}
              </div>

              {/* Description */}
              <p className="text-sm text-gray-600 mb-4 line-clamp-3">
                {report.description}
              </p>

              {/* Tags */}
              <div className="flex flex-wrap gap-1 mb-4">
                {report.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700"
                  >
                    <Tag className="h-3 w-3 mr-1" />
                    {tag}
                  </span>
                ))}
                {report.tags.length > 3 && (
                  <span className="text-xs text-gray-500">
                    +{report.tags.length - 3} more
                  </span>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between">
                <div className="flex items-center text-xs text-gray-500">
                  <Calendar className="h-3 w-3 mr-1" />
                  {new Date(report.dateCreated).toLocaleDateString()}
                </div>
                
                <button
                  className="flex items-center px-3 py-1 text-sm text-medical-600 hover:bg-medical-50 rounded-lg transition-colors"
                  onClick={() => console.log('Download report:', report.id)}
                >
                  <Download className="h-4 w-4 mr-1" />
                  View
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* No Results */}
      {filteredReports.length === 0 && (
        <div className="text-center py-12">
          <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No reports found</h3>
          <p className="text-gray-600">
            Try adjusting your search terms or filters to find what you're looking for.
          </p>
        </div>
      )}
    </div>
  );
};

export default PublicReports;