import React, { createContext, useContext, ReactNode } from 'react';
import { DicomField } from '../types';

interface AcquisitionContextType {
  acquisitionId: string;
  isEditMode: boolean;
  onFieldUpdate: (fieldTag: string, updates: Partial<DicomField>) => void;
  onFieldDelete: (fieldTag: string) => void;
  onFieldConvert: (fieldTag: string, toLevel: 'acquisition' | 'series') => void;
  onSeriesUpdate: (seriesIndex: number, fieldTag: string, value: any) => void;
  onSeriesAdd: () => void;
  onSeriesDelete: (seriesIndex: number) => void;
  onSeriesNameUpdate: (seriesIndex: number, name: string) => void;
}

const AcquisitionContext = createContext<AcquisitionContextType | null>(null);

interface AcquisitionProviderProps {
  children: ReactNode;
  acquisitionId: string;
  isEditMode: boolean;
  onFieldUpdate: (fieldTag: string, updates: Partial<DicomField>) => void;
  onFieldDelete: (fieldTag: string) => void;
  onFieldConvert: (fieldTag: string, toLevel: 'acquisition' | 'series') => void;
  onSeriesUpdate: (seriesIndex: number, fieldTag: string, value: any) => void;
  onSeriesAdd: () => void;
  onSeriesDelete: (seriesIndex: number) => void;
  onSeriesNameUpdate: (seriesIndex: number, name: string) => void;
}

export const AcquisitionProvider: React.FC<AcquisitionProviderProps> = ({
  children,
  acquisitionId,
  isEditMode,
  onFieldUpdate,
  onFieldDelete,
  onFieldConvert,
  onSeriesUpdate,
  onSeriesAdd,
  onSeriesDelete,
  onSeriesNameUpdate
}) => {
  const contextValue: AcquisitionContextType = {
    acquisitionId,
    isEditMode,
    onFieldUpdate,
    onFieldDelete,
    onFieldConvert,
    onSeriesUpdate,
    onSeriesAdd,
    onSeriesDelete,
    onSeriesNameUpdate
  };

  return (
    <AcquisitionContext.Provider value={contextValue}>
      {children}
    </AcquisitionContext.Provider>
  );
};

export const useAcquisitionContext = (): AcquisitionContextType => {
  const context = useContext(AcquisitionContext);
  if (!context) {
    throw new Error('useAcquisitionContext must be used within an AcquisitionProvider');
  }
  return context;
};
