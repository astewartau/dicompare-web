/**
 * DicompareWorkerAPI - Main thread wrapper for Web Worker communication
 * Provides the same interface as DicompareAPI but runs processing in background thread
 */

import type { WorkerRequest, WorkerResponse, PendingRequest, ProgressPayload } from '../workers/workerTypes';
import { SchemaTemplate } from '../types/schema';
import { Acquisition as UIAcquisition } from '../types';
import { FileObject } from '../utils/fileUploadUtils';

// Re-export types from DicompareAPI for compatibility
export type {
  AnalysisResult,
  Acquisition,
  FieldInfo,
  SeriesInfo,
  ValidationResult,
  FieldDictionary,
  ValidationTemplate
} from './DicompareAPI';

class DicompareWorkerAPI {
  private worker: Worker | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private requestId = 0;
  private initializationPromise: Promise<void> | null = null;
  private initialized = false;

  constructor() {
    this.createWorker();
  }

  private createWorker(): void {
    // Create worker using Vite's worker import syntax
    this.worker = new Worker(
      new URL('../workers/pyodide.worker.ts', import.meta.url),
      { type: 'classic' } // Use classic for importScripts support
    );

    this.worker.onmessage = this.handleMessage.bind(this);
    this.worker.onerror = (error) => {
      console.error('[DicompareWorkerAPI] Worker error:', error);
    };
  }

  private handleMessage(event: MessageEvent<WorkerResponse>): void {
    const response = event.data;

    // Handle ready message (no id)
    if (response.type === 'ready') {
      console.log('[DicompareWorkerAPI] Worker ready:', response.payload);
      this.initialized = true;
      return;
    }

    // Handle messages with id
    const { id, type } = response as { id: string; type: string };
    const pending = this.pendingRequests.get(id);

    if (!pending) {
      console.warn('[DicompareWorkerAPI] No pending request for id:', id);
      return;
    }

    if (type === 'progress' && pending.onProgress) {
      pending.onProgress((response as any).payload);
      return; // Don't resolve yet, wait for success/error
    }

    if (type === 'success') {
      pending.resolve((response as any).payload);
      this.pendingRequests.delete(id);
    }

    if (type === 'error') {
      const error = (response as any).error;
      pending.reject(new Error(error.message));
      this.pendingRequests.delete(id);
    }
  }

  private sendRequest<T>(
    request: Omit<WorkerRequest, 'id'>,
    onProgress?: (progress: ProgressPayload) => void,
    transferables?: Transferable[]
  ): Promise<T> {
    const id = `req_${++this.requestId}_${Date.now()}`;

    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject, onProgress });

      const fullRequest = { ...request, id } as WorkerRequest;

      if (transferables && transferables.length > 0) {
        this.worker!.postMessage(fullRequest, transferables);
      } else {
        this.worker!.postMessage(fullRequest);
      }
    });
  }

  // ==========================================================================
  // Public API (mirrors DicompareAPI interface)
  // ==========================================================================

  /**
   * Ensure Pyodide and dicompare are initialized
   */
  async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!this.initializationPromise) {
      this.initializationPromise = this.sendRequest<void>({ type: 'initialize' });
    }

    await this.initializationPromise;
    this.initialized = true;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Clear cached session data
   */
  async clearSessionCache(): Promise<void> {
    await this.ensureInitialized();
    await this.sendRequest({ type: 'clearCache' });
  }

  // ==========================================================================
  // DICOM Analysis
  // ==========================================================================

  /**
   * Analyze DICOM files and return UI-ready acquisition format.
   */
  async analyzeFilesForUI(
    files: FileObject[],
    onProgress?: (progress: { currentFile: number; totalFiles: number; currentOperation: string; percentage: number }) => void
  ): Promise<UIAcquisition[]> {
    await this.ensureInitialized();

    console.log(`[DicompareWorkerAPI] Analyzing ${files.length} files...`);

    const fileNames = files.map(f => f.name);
    // Create transferable copies of the ArrayBuffers
    const fileContents = files.map(f => f.content.buffer.slice(0));

    const progressHandler = onProgress
      ? (p: ProgressPayload) => {
          onProgress({
            currentFile: p.totalProcessed || 0,
            totalFiles: p.totalFiles || files.length,
            currentOperation: p.currentOperation || 'Processing...',
            percentage: p.percentage || 0
          });
        }
      : undefined;

    return this.sendRequest<UIAcquisition[]>(
      { type: 'analyzeFiles', payload: { fileNames, fileContents } },
      progressHandler,
      fileContents // Transfer ownership for zero-copy
    );
  }

  // ==========================================================================
  // Validation
  // ==========================================================================

  /**
   * Validate an acquisition against a schema.
   */
  async validateAcquisitionAgainstSchema(
    acquisition: UIAcquisition,
    schemaId: string,
    getSchemaContent?: (id: string) => Promise<string | null>,
    acquisitionIndex?: string
  ): Promise<any[]> {
    await this.ensureInitialized();

    // Fetch schema content on main thread (has fetch access)
    let schemaContent: string;
    if (getSchemaContent) {
      const content = await getSchemaContent(schemaId);
      if (!content) {
        throw new Error(`Schema content not found for ${schemaId}`);
      }
      schemaContent = content;
    } else {
      const response = await fetch(`/schemas/${schemaId}.json`);
      if (!response.ok) {
        throw new Error(`Failed to fetch schema ${schemaId}: ${response.statusText}`);
      }
      schemaContent = await response.text();
    }

    // Convert acquisition to format Python expects
    const acquisitionData = this.acquisitionToPythonDict(acquisition);

    return this.sendRequest({
      type: 'validateAcquisition',
      payload: {
        acquisition: acquisitionData,
        schemaContent,
        acquisitionIndex: acquisitionIndex ? parseInt(acquisitionIndex) : undefined
      }
    });
  }

  /**
   * Validate an acquisition against another acquisition (data-as-schema mode).
   */
  async validateAcquisitionAgainstAcquisition(
    dataAcquisition: UIAcquisition,
    schemaAcquisition: UIAcquisition
  ): Promise<any[]> {
    await this.ensureInitialized();

    // Convert the schema acquisition to schema JSON format
    const schemaContent = this.acquisitionToSchemaJson(schemaAcquisition);
    const acquisitionData = this.acquisitionToPythonDict(dataAcquisition);

    return this.sendRequest({
      type: 'validateAcquisition',
      payload: {
        acquisition: acquisitionData,
        schemaContent,
        acquisitionIndex: 0
      }
    });
  }

  private acquisitionToPythonDict(acquisition: UIAcquisition): Record<string, any> {
    return {
      protocolName: acquisition.protocolName,
      sliceCount: acquisition.sliceCount || 0,
      acquisitionFields: acquisition.acquisitionFields?.map(f => ({
        tag: f.tag,
        keyword: f.keyword,
        name: f.name,
        value: f.value
      })) || [],
      series: acquisition.series?.map(s => ({
        name: s.name,
        fields: s.fields?.map(f => ({
          tag: f.tag,
          keyword: f.keyword,
          name: f.name,
          value: f.value
        })) || []
      })) || []
    };
  }

  private acquisitionToSchemaJson(acquisition: UIAcquisition): string {
    const schema: any = {
      name: acquisition.protocolName || 'Generated Schema',
      description: acquisition.seriesDescription || '',
      acquisitions: {}
    };

    const acqEntry: any = {
      fields: [],
      series: []
    };

    if (acquisition.acquisitionFields) {
      for (const field of acquisition.acquisitionFields) {
        acqEntry.fields.push(this.fieldToSchemaField(field));
      }
    }

    if (acquisition.series) {
      for (const series of acquisition.series) {
        const seriesEntry: any = {
          name: series.name,
          fields: []
        };
        if (series.fields) {
          for (const field of series.fields) {
            seriesEntry.fields.push(this.fieldToSchemaField(field));
          }
        }
        acqEntry.series.push(seriesEntry);
      }
    }

    if (acquisition.validationFunctions && acquisition.validationFunctions.length > 0) {
      acqEntry.rules = acquisition.validationFunctions.map(func => ({
        id: func.name.toLowerCase().replace(/\s+/g, '_'),
        name: func.customName || func.name,
        description: func.description || '',
        implementation: func.implementation || '',
        fields: func.fields || []
      }));
    }

    const acqName = acquisition.protocolName || 'Acquisition';
    schema.acquisitions[acqName] = acqEntry;

    return JSON.stringify(schema);
  }

  private fieldToSchemaField(field: any): any {
    const schemaField: any = {
      field: field.name || field.keyword || field.tag
    };

    if (field.tag) {
      schemaField.tag = field.tag;
    }

    if (field.value !== undefined && field.value !== null && field.value !== '') {
      schemaField.value = field.value;
    }

    if (field.validationRule) {
      if (field.validationRule.type === 'tolerance' && field.validationRule.tolerance !== undefined) {
        schemaField.tolerance = field.validationRule.tolerance;
      }
      if (field.validationRule.type === 'contains' && field.validationRule.contains) {
        schemaField.contains = field.validationRule.contains;
      }
      if (field.validationRule.type === 'contains_any' && field.validationRule.contains_any) {
        schemaField.contains_any = field.validationRule.contains_any;
      }
      if (field.validationRule.type === 'contains_all' && field.validationRule.contains_all) {
        schemaField.contains_all = field.validationRule.contains_all;
      }
    }

    return schemaField;
  }

  // ==========================================================================
  // Protocol File Loading
  // ==========================================================================

  async loadProFile(fileContent: Uint8Array, fileName: string): Promise<UIAcquisition> {
    const acquisitions = await this._loadProtocolFile(fileContent, fileName, 'pro');
    return acquisitions[0];
  }

  async loadExarFile(fileContent: Uint8Array, fileName: string): Promise<UIAcquisition[]> {
    return this._loadProtocolFile(fileContent, fileName, 'exar1');
  }

  async loadExamCardFile(fileContent: Uint8Array, fileName: string): Promise<UIAcquisition[]> {
    return this._loadProtocolFile(fileContent, fileName, 'examcard');
  }

  async loadLxProtocolFile(fileContent: Uint8Array, fileName: string): Promise<UIAcquisition[]> {
    return this._loadProtocolFile(fileContent, fileName, 'lxprotocol');
  }

  private async _loadProtocolFile(
    fileContent: Uint8Array,
    fileName: string,
    fileType: string
  ): Promise<UIAcquisition[]> {
    await this.ensureInitialized();

    console.log(`[DicompareWorkerAPI] Loading ${fileType} protocol: ${fileName}`);

    // Create transferable copy
    const buffer = fileContent.buffer.slice(0);

    return this.sendRequest<UIAcquisition[]>(
      { type: 'loadProtocolFile', payload: { fileContent: buffer, fileName, fileType } },
      undefined,
      [buffer]
    );
  }

  // ==========================================================================
  // Field Search & Info
  // ==========================================================================

  async searchFields(query: string, limit: number = 20): Promise<any[]> {
    await this.ensureInitialized();
    return this.sendRequest({ type: 'searchFields', payload: { query, limit } });
  }

  async getFieldInfo(fieldOrTag: string): Promise<{ tag: string | null; name: string; type: string; fieldType: string } | null> {
    await this.ensureInitialized();
    return this.sendRequest({ type: 'getFieldInfo', payload: { fieldOrTag } });
  }

  async getDicomTag(keyword: string): Promise<{ tag: string; name: string; vr: string; keyword: string } | null> {
    const info = await this.getFieldInfo(keyword);
    if (info && info.tag) {
      return {
        tag: info.tag,
        name: info.name,
        vr: 'LO',
        keyword: keyword
      };
    }
    return null;
  }

  // ==========================================================================
  // Schema Generation & Parsing
  // ==========================================================================

  async generateSchemaJS(
    acquisitions: UIAcquisition[],
    metadata: { name: string; description?: string; version?: string; authors?: string[]; tags?: string[] }
  ): Promise<any> {
    await this.ensureInitialized();
    return this.sendRequest({ type: 'generateSchema', payload: { acquisitions, metadata } });
  }

  /**
   * Get example schemas - runs on main thread (just fetch, no Python needed)
   */
  async getExampleSchemas(): Promise<SchemaTemplate[]> {
    try {
      const response = await fetch('/schemas/index.json');
      if (!response.ok) {
        console.warn('Could not fetch schema index');
        return [];
      }

      const paths: string[] = await response.json();

      const schemas = await Promise.all(
        paths.map(async (path) => {
          try {
            const id = path.replace('/schemas/', '').replace('.json', '');

            const schemaResponse = await fetch(path);
            if (!schemaResponse.ok) {
              console.warn(`Could not fetch schema at ${path}: ${schemaResponse.status}`);
              return null;
            }

            const schemaText = await schemaResponse.text();
            const schemaData = JSON.parse(schemaText);

            const allTags: string[] = [];
            if (schemaData.acquisitions) {
              for (const acq of Object.values(schemaData.acquisitions) as any[]) {
                if (acq.tags && Array.isArray(acq.tags)) {
                  allTags.push(...acq.tags);
                }
              }
            }
            const uniqueTags = [...new Set(allTags)];

            return {
              id,
              name: schemaData.name || id,
              description: schemaData.description || '',
              category: 'Library',
              content: schemaText,
              format: 'json' as const,
              tags: uniqueTags,
              version: schemaData.version,
              authors: schemaData.authors
            };
          } catch (error) {
            console.warn(`Failed to load schema from ${path}:`, error);
            return null;
          }
        })
      );

      return schemas.filter((s): s is NonNullable<typeof s> => s !== null);
    } catch (error) {
      console.warn('Failed to fetch example schemas:', error);
      return [];
    }
  }

  /**
   * Get schema fields - runs on main thread (pure JS parsing)
   */
  async getSchemaFields(schemaId: string, schemaContent?: string): Promise<{ acquisitionName: string; fields: any[] }[]> {
    let content: string;

    if (schemaContent) {
      content = schemaContent;
    } else {
      const response = await fetch(`/schemas/${schemaId}.json`);
      if (!response.ok) {
        throw new Error(`Failed to fetch schema ${schemaId}`);
      }
      content = await response.text();
    }

    const schema = JSON.parse(content);
    const result: { acquisitionName: string; fields: any[] }[] = [];

    const acquisitions = schema.acquisitions || {};
    for (const [acqName, acqData] of Object.entries(acquisitions)) {
      const acq = acqData as any;
      const fields: any[] = [];

      if (acq.fields && Array.isArray(acq.fields)) {
        for (const field of acq.fields) {
          fields.push({
            name: field.field,
            tag: field.tag,
            value: field.value,
            level: 'acquisition',
            fieldType: field.fieldType || 'standard'
          });
        }
      }

      if (acq.series && Array.isArray(acq.series)) {
        for (const series of acq.series) {
          if (series.fields && Array.isArray(series.fields)) {
            for (const field of series.fields) {
              fields.push({
                name: field.field,
                tag: field.tag,
                value: field.value,
                level: 'series',
                seriesName: series.name,
                fieldType: field.fieldType || 'standard'
              });
            }
          }
        }
      }

      result.push({ acquisitionName: acqName, fields });
    }

    return result;
  }

  // ==========================================================================
  // Test DICOM Generation
  // ==========================================================================

  async generateTestDicomsFromSchema(
    acquisition: UIAcquisition,
    testData: Array<Record<string, any>>,
    fields: Array<{ name: string; tag: string; level: string; dataType?: string; vr?: string }>
  ): Promise<Blob> {
    await this.ensureInitialized();

    const result = await this.sendRequest<{ zipBytes: number[] }>({
      type: 'generateTestDicoms',
      payload: { acquisition, testData, fields }
    });

    const zipBytes = new Uint8Array(result.zipBytes);
    return new Blob([zipBytes], { type: 'application/zip' });
  }

  async categorizeFields(
    fields: Array<{ name: string; tag: string; level?: string; dataType?: string; vr?: string }>,
    testData: Array<Record<string, any>>
  ): Promise<{
    standardFields: number;
    handledFields: number;
    unhandledFields: number;
    unhandledFieldWarnings: string[];
  }> {
    await this.ensureInitialized();
    return this.sendRequest({ type: 'categorizeFields', payload: { fields, testData } });
  }

  // ==========================================================================
  // Worker lifecycle
  // ==========================================================================

  /**
   * Terminate the worker (cleanup)
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.initialized = false;
      this.initializationPromise = null;
      this.pendingRequests.clear();
    }
  }
}

// Create and export singleton instance
export const dicompareWorkerAPI = new DicompareWorkerAPI();
