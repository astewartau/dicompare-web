import React from 'react';
import { ComplianceStatus } from '../../types';
import { CheckCircle, XCircle, AlertTriangle, HelpCircle } from 'lucide-react';

interface ComplianceStatusBadgeProps {
  status: ComplianceStatus;
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

const STATUS_CONFIG = {
  OK: {
    color: 'bg-green-100 text-green-800 border-green-200',
    icon: CheckCircle,
    iconColor: 'text-green-600',
    label: 'OK'
  },
  ERROR: {
    color: 'bg-red-100 text-red-800 border-red-200',
    icon: XCircle,
    iconColor: 'text-red-600',
    label: 'ERROR'
  },
  WARNING: {
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    icon: AlertTriangle,
    iconColor: 'text-yellow-600',
    label: 'WARNING'
  },
  NA: {  
    color: 'bg-gray-100 text-gray-800 border-gray-200',
    icon: HelpCircle,
    iconColor: 'text-gray-600',
    label: 'N/A'
  }
};

const SIZE_CONFIG = {
  sm: {
    badge: 'px-2 py-1 text-xs',
    icon: 'h-3 w-3'
  },
  md: {
    badge: 'px-3 py-1 text-sm',
    icon: 'h-4 w-4'
  },
  lg: {
    badge: 'px-4 py-2 text-base',
    icon: 'h-5 w-5'
  }
};

const ComplianceStatusBadge: React.FC<ComplianceStatusBadgeProps> = ({
  status,
  message,
  size = 'md',
  showIcon = true,
  className = ''
}) => {
  const config = STATUS_CONFIG[status];
  const sizeConfig = SIZE_CONFIG[size];
  const Icon = config.icon;

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${config.color} ${sizeConfig.badge} ${className}`}>
      {showIcon && (
        <Icon className={`${config.iconColor} ${sizeConfig.icon}`} />
      )}
      <span>{config.label}</span>
      {message && (
        <span className="ml-1 opacity-75">
          - {message}
        </span>
      )}
    </div>
  );
};

// Utility component for displaying compliance status with detailed information
interface ComplianceStatusDetailProps {
  status: ComplianceStatus;
  title: string;
  description?: string;
  expected?: any;
  actual?: any;
  className?: string;
}

export const ComplianceStatusDetail: React.FC<ComplianceStatusDetailProps> = ({
  status,
  title,
  description,
  expected,
  actual,
  className = ''
}) => {
  const config = STATUS_CONFIG[status];
  
  return (
    <div className={`p-4 rounded-lg border ${config.color.replace('text-', 'text-opacity-90 text-')} ${className}`}>
      <div className="flex items-start justify-between mb-2">
        <h4 className="font-medium">{title}</h4>
        <ComplianceStatusBadge status={status} size="sm" />
      </div>
      
      {description && (
        <p className="text-sm opacity-80 mb-3">{description}</p>
      )}
      
      {(expected !== undefined || actual !== undefined) && (
        <div className="grid grid-cols-2 gap-4 text-sm">
          {expected !== undefined && (
            <div>
              <span className="font-medium opacity-70">Expected:</span>
              <div className="mt-1 font-mono bg-black bg-opacity-5 rounded px-2 py-1">
                {typeof expected === 'object' ? JSON.stringify(expected, null, 2) : String(expected)}
              </div>
            </div>
          )}
          
          {actual !== undefined && (
            <div>
              <span className="font-medium opacity-70">Actual:</span>
              <div className="mt-1 font-mono bg-black bg-opacity-5 rounded px-2 py-1">
                {typeof actual === 'object' ? JSON.stringify(actual, null, 2) : String(actual)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ComplianceStatusBadge;