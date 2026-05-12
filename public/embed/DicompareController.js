/**
 * DicompareController - Manages DICOM validation via dicompare/Pyodide.
 *
 * Provided by dicompare-web for embedding in third-party tools.
 * See: https://github.com/astewartau/dicompare-web
 *
 * Usage:
 *   import { DicompareController } from 'https://dicompare.neurodesk.org/embed/DicompareController.js';
 *
 *   const controller = new DicompareController({
 *     schemaUrl: 'https://dicompare.neurodesk.org/schemas/QSM_Consensus_Guidelines_v1.0.json',
 *     updateOutput: (msg) => console.log(msg)
 *   });
 *
 *   // Retain DICOM files from a file input
 *   await controller.retainDicomFiles(fileInput.files);
 *
 *   // Run validation with progress
 *   const results = await controller.runValidation((p) => {
 *     console.log(`${p.percentage}% - ${p.currentOperation}`);
 *   });
 */

const DEFAULT_WORKER_URL = 'https://dicompare.neurodesk.org/embed/dicompare-worker.js';

export class DicompareController {
  /**
   * @param {Object} options
   * @param {string} options.schemaUrl - URL or path to the dicompare schema JSON
   * @param {string} [options.workerUrl] - URL to dicompare-worker.js (default: dicompare CDN)
   * @param {function} [options.updateOutput] - Callback for status messages
   */
  constructor(options = {}) {
    if (!options.schemaUrl) {
      throw new Error('DicompareController requires a schemaUrl option');
    }

    this.schemaUrl = options.schemaUrl;
    this.workerUrl = options.workerUrl || DEFAULT_WORKER_URL;
    this.updateOutput = options.updateOutput || console.log;

    this.worker = null;
    this.initialized = false;
    this.initializationPromise = null;
    this.pendingRequests = new Map();
    this.requestId = 0;

    // Retained DICOM files for validation
    this.dicomFiles = []; // Array of { name: string, data: ArrayBuffer }

    // Cached results
    this.acquisitions = null;
    this.complianceResults = null;

    // Bundled schema content (loaded on first use)
    this.schemaContent = null;
  }

  /**
   * Store original DICOM files for later validation.
   * Called from DicomController before conversion.
   * @param {File[]} files - Original File objects from file input
   */
  async retainDicomFiles(files) {
    this.dicomFiles = [];
    this.acquisitions = null;
    this.complianceResults = null;

    for (const file of files) {
      const buffer = await file.arrayBuffer();
      this.dicomFiles.push({
        name: file.webkitRelativePath || file._webkitRelativePath || file.name,
        data: buffer
      });
    }
    this.updateOutput(`Retained ${this.dicomFiles.length} DICOM files for validation.`);
  }

  /**
   * Check if DICOM files are available for validation.
   */
  hasFiles() {
    return this.dicomFiles.length > 0;
  }

  // --- Worker management ---

  async _createWorker() {
    if (this.worker) return;

    // Fetch the worker script and create a blob URL to avoid cross-origin restrictions
    const response = await fetch(this.workerUrl);
    if (!response.ok) {
      throw new Error(`Failed to load dicompare worker from ${this.workerUrl}`);
    }
    const scriptText = await response.text();
    const blob = new Blob([scriptText], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);

    this.worker = new Worker(blobUrl);
    this._workerBlobUrl = blobUrl;
    this.worker.onmessage = this._handleMessage.bind(this);
    this.worker.onerror = (err) => {
      console.error('[DicompareController] Worker error:', err);
    };
  }

  _handleMessage(event) {
    const response = event.data;
    const { id, type } = response;
    const pending = this.pendingRequests.get(id);
    if (!pending) return;

    if (type === 'progress' && pending.onProgress) {
      pending.onProgress(response.payload);
      return;
    }
    if (type === 'success') {
      pending.resolve(response.payload);
      this.pendingRequests.delete(id);
    }
    if (type === 'error') {
      pending.reject(new Error(response.error.message));
      this.pendingRequests.delete(id);
    }
  }

  _sendRequest(request, onProgress) {
    const id = `req_${++this.requestId}_${Date.now()}`;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject, onProgress });
      this.worker.postMessage({ ...request, id });
    });
  }

  /**
   * Initialize the Pyodide worker (lazy, only on first call).
   */
  async ensureInitialized(onProgress) {
    if (this.initialized) return;
    await this._createWorker();
    if (!this.initializationPromise) {
      this.initializationPromise = this._sendRequest(
        { type: 'initialize' },
        onProgress
      ).catch((err) => {
        // Reset so user can retry
        this.initializationPromise = null;
        throw err;
      });
    }
    await this.initializationPromise;
    this.initialized = true;
  }

  /**
   * Check if validation results are already cached.
   */
  hasCachedResults() {
    return this.complianceResults !== null && this.acquisitions !== null;
  }

  /**
   * Get cached results without re-running validation.
   * @returns {{ acquisitions, complianceResults, schema } | null}
   */
  getCachedResults() {
    if (!this.hasCachedResults()) return null;
    return {
      acquisitions: this.acquisitions,
      complianceResults: this.complianceResults,
      schema: this.schemaContent ? JSON.parse(this.schemaContent) : null
    };
  }

  // --- Schema loading ---

  async _loadSchema() {
    if (this.schemaContent) return this.schemaContent;
    const response = await fetch(this.schemaUrl);
    if (!response.ok) throw new Error(`Failed to load schema from ${this.schemaUrl}`);
    this.schemaContent = await response.text();
    return this.schemaContent;
  }

  // --- Main validation flow ---

  /**
   * Run the full validation pipeline:
   * 1. Initialize Pyodide (if needed)
   * 2. Analyze DICOM files -> acquisitions
   * 3. Validate each acquisition against schema
   * @param {function} onProgress - Progress callback({ percentage, currentOperation })
   * @returns {Promise<{ acquisitions, complianceResults, schema }>}
   */
  async runValidation(onProgress) {
    if (this.dicomFiles.length === 0) {
      throw new Error('No DICOM files available for validation');
    }

    // Phase 1: Initialize Pyodide (0-30%)
    this.updateOutput('Initializing Python runtime for DICOM validation...');
    await this.ensureInitialized((p) => {
      onProgress?.({
        percentage: Math.round(p.percentage * 0.3),
        currentOperation: p.currentOperation
      });
    });

    // Phase 2: Analyze files (30-70%)
    this.updateOutput(`Analyzing ${this.dicomFiles.length} DICOM files...`);
    const fileNames = this.dicomFiles.map(f => f.name);
    const fileContents = this.dicomFiles.map(f => f.data.slice(0)); // Copy for transfer

    const analysisResult = await this._sendRequest(
      { type: 'analyzeFiles', payload: { fileNames, fileContents } },
      (p) => {
        onProgress?.({
          percentage: 30 + Math.round(p.percentage * 0.4),
          currentOperation: p.currentOperation || 'Analyzing DICOM files...'
        });
      }
    );

    // Extract acquisitions from result
    const acquisitions = analysisResult.acquisitions || analysisResult;
    const acquisitionList = typeof acquisitions === 'object' && !Array.isArray(acquisitions)
      ? Object.entries(acquisitions).map(([name, data]) => ({ ...data, protocolName: name }))
      : Array.isArray(acquisitions) ? acquisitions : [];

    this.acquisitions = acquisitionList;

    // Phase 3: Validate against schema (70-100%)
    const schemaContent = await this._loadSchema();
    const schema = JSON.parse(schemaContent);
    const schemaName = schema.name || 'protocol schema';

    this.updateOutput(`Validating against ${schemaName}...`);
    onProgress?.({ percentage: 70, currentOperation: `Validating against ${schemaName}...` });

    this.complianceResults = [];

    for (let i = 0; i < this.acquisitions.length; i++) {
      const acq = this.acquisitions[i];
      onProgress?.({
        percentage: 70 + Math.round(((i + 1) / this.acquisitions.length) * 30),
        currentOperation: `Validating ${acq.protocolName || `acquisition ${i + 1}`}...`
      });

      try {
        const results = await this._sendRequest({
          type: 'validateAcquisition',
          payload: {
            acquisition: acq,
            schemaContent,
            acquisitionIndex: 0
          }
        });
        this.complianceResults.push({
          acquisitionName: acq.protocolName || `Acquisition ${i + 1}`,
          results: Array.isArray(results) ? results : []
        });
      } catch (err) {
        console.error(`Validation error for ${acq.protocolName}:`, err);
        this.complianceResults.push({
          acquisitionName: acq.protocolName || `Acquisition ${i + 1}`,
          results: [],
          error: err.message
        });
      }
    }

    onProgress?.({ percentage: 100, currentOperation: 'Complete' });
    this.updateOutput('dicompare validation complete.');

    return {
      acquisitions: this.acquisitions,
      complianceResults: this.complianceResults,
      schema
    };
  }

  /**
   * Clear retained files and cached results.
   */
  clearFiles() {
    this.dicomFiles = [];
    this.acquisitions = null;
    this.complianceResults = null;
  }

  /**
   * Terminate the worker and clean up.
   */
  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.initialized = false;
      this.initializationPromise = null;
      this.pendingRequests.clear();
    }
    if (this._workerBlobUrl) {
      URL.revokeObjectURL(this._workerBlobUrl);
      this._workerBlobUrl = null;
    }
  }
}
