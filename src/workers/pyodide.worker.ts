/**
 * Pyodide Web Worker
 * Runs all Python/dicompare processing in a background thread
 * to keep the main UI responsive.
 */

/// <reference lib="webworker" />

import type { WorkerRequest, WorkerResponse, ProgressPayload } from './workerTypes';

// Pyodide interface
interface PyodideInstance {
  runPython: (code: string) => any;
  runPythonAsync: (code: string) => Promise<any>;
  globals: {
    get: (name: string) => any;
    set: (name: string, value: any) => void;
  };
  loadPackage: (packages: string | string[]) => Promise<void>;
}

declare function loadPyodide(options: { indexURL: string }): Promise<PyodideInstance>;

let pyodide: PyodideInstance | null = null;

// Validation cache to avoid re-running validation for the same inputs
const validationCache = new Map<string, any>();

// Simple hash function for cache keys
function hashValidationInput(acquisition: any, schemaContent: string, acquisitionIndex?: number): string {
  const input = JSON.stringify({ acquisition, schemaContent, acquisitionIndex });
  // Simple hash - sum of char codes with position weighting
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(16);
}

// Helper to send responses
function sendResponse(response: WorkerResponse): void {
  self.postMessage(response);
}

function sendSuccess(id: string, payload: any): void {
  sendResponse({ id, type: 'success', payload });
}

function sendError(id: string, error: Error): void {
  sendResponse({ id, type: 'error', error: { message: error.message, stack: error.stack } });
}

function sendProgress(id: string, progress: ProgressPayload): void {
  sendResponse({ id, type: 'progress', payload: progress });
}

// ============================================================================
// Initialization
// ============================================================================

async function initializePyodide(requestId?: string): Promise<{ pyodideVersion: string; dicompareVersion: string }> {
  console.log('[Worker] Initializing Pyodide...');
  const startTime = Date.now();

  // Helper to send init progress
  const reportProgress = (message: string, percentage: number) => {
    if (requestId) {
      sendProgress(requestId, {
        percentage,
        currentOperation: message,
        totalFiles: 0,
        totalProcessed: 0
      });
    }
  };

  // Load Pyodide from CDN
  reportProgress('Loading Python runtime...', 10);
  importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.0/full/pyodide.js');

  pyodide = await loadPyodide({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/',
  });

  const loadTime = Date.now() - startTime;
  console.log(`[Worker] Pyodide loaded in ${loadTime}ms`);

  // Install core packages
  reportProgress('Installing core packages...', 40);
  await pyodide.loadPackage(['micropip', 'sqlite3']);

  // Detect environment - in worker, check if we're on localhost
  const isDevelopment = self.location.hostname === 'localhost' ||
                        self.location.hostname === '127.0.0.1';

  const packageSource = isDevelopment
    ? 'http://localhost:8000/dist/dicompare-0.1.43-py3-none-any.whl'
    : 'dicompare==0.1.43';

  console.log(`[Worker] Installing dicompare from ${isDevelopment ? 'local' : 'PyPI'}...`);

  reportProgress('Loading DICOM analysis tools...', 60);
  await pyodide.runPythonAsync(`
import micropip
await micropip.install('${packageSource}')

import dicompare
import dicompare.interface
import dicompare.validation
import dicompare.schema
import dicompare.io
import json
from typing import List, Dict, Any

print("[Worker] dicompare modules imported successfully")
  `);

  reportProgress('Finalizing...', 90);

  // Get versions
  const versionResult = await pyodide.runPython(`
import json
import sys
import dicompare
json.dumps({
    'pyodide': '.'.join(map(str, sys.version_info[:3])),
    'dicompare': getattr(dicompare, '__version__', '0.1.43')
})
  `);

  const versions = JSON.parse(versionResult);
  console.log(`[Worker] Ready - Python ${versions.pyodide}, dicompare ${versions.dicompare}`);

  reportProgress('Ready', 100);
  return { pyodideVersion: versions.pyodide, dicompareVersion: versions.dicompare };
}

// ============================================================================
// Message Handlers
// ============================================================================

async function handleAnalyzeFiles(
  id: string,
  payload: { fileNames: string[]; fileContents: ArrayBuffer[] }
): Promise<void> {
  if (!pyodide) throw new Error('Pyodide not initialized');

  const { fileNames, fileContents } = payload;
  console.log(`[Worker] Analyzing ${fileNames.length} files...`);

  // Set up progress callback that posts messages back to main thread
  pyodide.globals.set('progress_callback', (progress: any) => {
    const p = progress.toJs ? progress.toJs() : progress;
    sendProgress(id, {
      percentage: p.percentage || 0,
      currentOperation: p.currentOperation || 'Processing...',
      totalFiles: p.totalFiles || fileNames.length,
      totalProcessed: p.totalProcessed || 0
    });
  });

  // Convert ArrayBuffers to Uint8Arrays for Pyodide
  const contents = fileContents.map(buf => new Uint8Array(buf));

  pyodide.globals.set('dicom_file_names', fileNames);
  pyodide.globals.set('dicom_file_contents', contents);

  const result = await pyodide.runPythonAsync(`
import json
from dicompare.interface import analyze_dicom_files_for_ui

names = list(dicom_file_names)
total_files = len(names)
print(f"[Worker] Processing {total_files} files...")

dicom_bytes = {}
for i, name in enumerate(names):
    content = dicom_file_contents[i]
    if hasattr(content, 'getBuffer'):
        buf = content.getBuffer()
        dicom_bytes[name] = bytes(buf.data)
        buf.release()
    elif hasattr(content, 'to_py'):
        dicom_bytes[name] = bytes(content.to_py())
    else:
        dicom_bytes[name] = bytes(content)

print(f"[Worker] Converted {len(dicom_bytes)} files, analyzing...")
acquisitions = await analyze_dicom_files_for_ui(dicom_bytes, progress_callback)
json.dumps(acquisitions, default=str)
  `);

  sendSuccess(id, JSON.parse(result as string));
}

async function handleValidateAcquisition(
  id: string,
  payload: { acquisition: any; schemaContent: string; acquisitionIndex?: number }
): Promise<void> {
  if (!pyodide) throw new Error('Pyodide not initialized');

  const { acquisition, schemaContent, acquisitionIndex } = payload;

  // Check cache first
  const cacheKey = hashValidationInput(acquisition, schemaContent, acquisitionIndex);
  const cachedResult = validationCache.get(cacheKey);
  if (cachedResult) {
    console.log('[Worker] Returning cached validation result');
    sendSuccess(id, cachedResult);
    return;
  }

  pyodide.globals.set('acquisition_data', acquisition);
  pyodide.globals.set('schema_content', schemaContent);
  pyodide.globals.set('schema_acquisition_index', acquisitionIndex ?? null);

  const result = await pyodide.runPython(`
import json
from dicompare.interface import validate_acquisition_direct

acq_data = acquisition_data if not hasattr(acquisition_data, 'to_py') else acquisition_data.to_py()
schema_str = schema_content if not hasattr(schema_content, 'to_py') else schema_content.to_py()
acq_index = schema_acquisition_index if not hasattr(schema_acquisition_index, 'to_py') else schema_acquisition_index.to_py()

results = validate_acquisition_direct(acq_data, schema_str, acq_index)
json.dumps(results, default=str)
  `);

  const parsedResult = JSON.parse(result as string);

  // Debug: Log validation results to help identify wrong actualValue issues
  console.log('[Worker] Validation results:', JSON.stringify(parsedResult, null, 2));

  // Log any suspicious actualValue values (like simple numbers that might be counts/indices)
  const suspiciousResults = parsedResult.filter((r: any) =>
    r.actualValue !== undefined &&
    typeof r.actualValue === 'number' &&
    r.actualValue >= 0 && r.actualValue <= 10
  );
  if (suspiciousResults.length > 0) {
    console.warn('[Worker] Suspicious actualValue results (might be counts/indices instead of values):', suspiciousResults);
  }

  // Store in cache
  validationCache.set(cacheKey, parsedResult);
  console.log('[Worker] Cached validation result');

  sendSuccess(id, parsedResult);
}

async function handleLoadProtocolFile(
  id: string,
  payload: { fileContent: ArrayBuffer; fileName: string; fileType: string }
): Promise<void> {
  if (!pyodide) throw new Error('Pyodide not initialized');

  const { fileContent, fileName, fileType } = payload;
  console.log(`[Worker] Loading ${fileType} protocol: ${fileName}`);

  // Convert ArrayBuffer to base64
  const uint8Array = new Uint8Array(fileContent);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  const base64Content = btoa(binary);

  pyodide.globals.set('_protocol_base64', base64Content);
  pyodide.globals.set('_protocol_filename', fileName);
  pyodide.globals.set('_protocol_type', fileType);

  const result = await pyodide.runPython(`
import json
import base64
from dicompare.interface import load_protocol_for_ui

file_bytes = base64.b64decode(_protocol_base64)
file_name = _protocol_filename
file_type = _protocol_type

acquisitions = load_protocol_for_ui(file_bytes, file_name, file_type)
json.dumps(acquisitions, default=str)
  `);

  sendSuccess(id, JSON.parse(result as string));
}

async function handleSearchFields(
  id: string,
  payload: { query: string; limit: number }
): Promise<void> {
  if (!pyodide) throw new Error('Pyodide not initialized');

  const { query, limit } = payload;

  pyodide.globals.set('_search_query', query);
  pyodide.globals.set('_search_limit', limit);

  const result = await pyodide.runPython(`
import json
from dicompare.interface import search_dicom_dictionary

results = search_dicom_dictionary(_search_query, _search_limit)
json.dumps(results, default=str)
  `);

  sendSuccess(id, JSON.parse(result as string));
}

async function handleGetFieldInfo(
  id: string,
  payload: { fieldOrTag: string }
): Promise<void> {
  if (!pyodide) throw new Error('Pyodide not initialized');

  pyodide.globals.set('_field_or_tag', payload.fieldOrTag);

  const result = await pyodide.runPython(`
import json
from dicompare import get_tag_info

info = get_tag_info(_field_or_tag)
json.dumps(info, default=str)
  `);

  sendSuccess(id, JSON.parse(result as string));
}

async function handleGenerateSchema(
  id: string,
  payload: { acquisitions: any[]; metadata: any }
): Promise<void> {
  if (!pyodide) throw new Error('Pyodide not initialized');

  const { acquisitions, metadata } = payload;

  pyodide.globals.set('_ui_acquisitions', acquisitions);
  pyodide.globals.set('_schema_metadata', metadata);

  const result = await pyodide.runPython(`
import json
from dicompare.interface import build_schema_from_ui_acquisitions

acqs = _ui_acquisitions.to_py() if hasattr(_ui_acquisitions, 'to_py') else _ui_acquisitions
meta = _schema_metadata.to_py() if hasattr(_schema_metadata, 'to_py') else _schema_metadata

schema = build_schema_from_ui_acquisitions(acqs, meta)
json.dumps(schema, default=str)
  `);

  sendSuccess(id, JSON.parse(result as string));
}

async function handleGenerateTestDicoms(
  id: string,
  payload: { acquisition: any; testData: any[]; fields: any[] }
): Promise<void> {
  if (!pyodide) throw new Error('Pyodide not initialized');

  const { acquisition, testData, fields } = payload;

  pyodide.globals.set('test_data_rows', testData);
  pyodide.globals.set('schema_fields', fields);
  pyodide.globals.set('acquisition_info', {
    protocolName: acquisition.protocolName,
    seriesDescription: acquisition.seriesDescription || 'Generated Test Data'
  });

  await pyodide.runPythonAsync(`
from dicompare.io import generate_test_dicoms_from_schema

test_rows = test_data_rows.to_py() if hasattr(test_data_rows, 'to_py') else test_data_rows
field_info = schema_fields.to_py() if hasattr(schema_fields, 'to_py') else schema_fields
acq_info = acquisition_info.to_py() if hasattr(acquisition_info, 'to_py') else acquisition_info

zip_bytes = generate_test_dicoms_from_schema(
    test_data=test_rows,
    field_definitions=field_info,
    acquisition_info=acq_info
)

globals()['dicom_zip_bytes'] = list(zip_bytes)
  `);

  const zipBytesResult = await pyodide.runPython(`dicom_zip_bytes`);

  let zipBytes: Uint8Array;
  if (Array.isArray(zipBytesResult)) {
    zipBytes = new Uint8Array(zipBytesResult);
  } else if (zipBytesResult && (zipBytesResult as any).toJs) {
    const jsArray = (zipBytesResult as any).toJs();
    zipBytes = new Uint8Array(jsArray);
  } else {
    throw new Error('Unexpected format for ZIP bytes');
  }

  // Send the raw bytes - main thread will convert to Blob
  sendSuccess(id, { zipBytes: Array.from(zipBytes) });
}

async function handleCategorizeFields(
  id: string,
  payload: { fields: any[]; testData: any[] }
): Promise<void> {
  if (!pyodide) throw new Error('Pyodide not initialized');

  const { fields, testData } = payload;

  pyodide.globals.set('field_definitions', fields);
  pyodide.globals.set('test_data_rows', testData);

  try {
    const result = await pyodide.runPythonAsync(`
import json
from dicompare.io import categorize_fields, get_unhandled_field_warnings

field_defs = field_definitions.to_py() if hasattr(field_definitions, 'to_py') else field_definitions
test_rows = test_data_rows.to_py() if hasattr(test_data_rows, 'to_py') else test_data_rows

categorized = categorize_fields(field_defs)
warnings = get_unhandled_field_warnings(field_defs, test_rows)

json.dumps({
    'standardFields': len(categorized['standard']),
    'handledFields': len(categorized['handled']),
    'unhandledFields': len(categorized['unhandled']),
    'unhandledFieldWarnings': warnings
})
    `);

    sendSuccess(id, JSON.parse(result as string));
  } catch {
    sendSuccess(id, {
      standardFields: 0,
      handledFields: 0,
      unhandledFields: 0,
      unhandledFieldWarnings: []
    });
  }
}

async function handleClearCache(id: string): Promise<void> {
  if (!pyodide) throw new Error('Pyodide not initialized');

  // Clear validation cache
  validationCache.clear();
  console.log('[Worker] Validation cache cleared');

  await pyodide.runPython(`
from dicompare.interface.web_utils import _cache_session
_cache_session(None, {}, {})
print("[Worker] Session cache cleared")
  `);

  sendSuccess(id, { cleared: true });
}

async function handleRunPython(
  id: string,
  payload: { code: string }
): Promise<void> {
  if (!pyodide) throw new Error('Pyodide not initialized');

  const { code } = payload;
  const result = await pyodide.runPython(code);
  sendSuccess(id, result);
}

// ============================================================================
// Message Router
// ============================================================================

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const { id, type } = request;

  try {
    switch (type) {
      case 'initialize': {
        const versions = await initializePyodide(id);
        sendResponse({ type: 'ready', payload: versions });
        sendSuccess(id, versions);
        break;
      }
      case 'analyzeFiles':
        await handleAnalyzeFiles(id, request.payload);
        break;
      case 'validateAcquisition':
        await handleValidateAcquisition(id, request.payload);
        break;
      case 'loadProtocolFile':
        await handleLoadProtocolFile(id, request.payload);
        break;
      case 'searchFields':
        await handleSearchFields(id, request.payload);
        break;
      case 'getFieldInfo':
        await handleGetFieldInfo(id, request.payload);
        break;
      case 'generateSchema':
        await handleGenerateSchema(id, request.payload);
        break;
      case 'generateTestDicoms':
        await handleGenerateTestDicoms(id, request.payload);
        break;
      case 'categorizeFields':
        await handleCategorizeFields(id, request.payload);
        break;
      case 'clearCache':
        await handleClearCache(id);
        break;
      case 'runPython':
        await handleRunPython(id, request.payload);
        break;
      default:
        sendError(id, new Error(`Unknown message type: ${(request as any).type}`));
    }
  } catch (error) {
    sendError(id, error instanceof Error ? error : new Error(String(error)));
  }
};

// Signal that the worker script has loaded
console.log('[Worker] Script loaded, waiting for initialize message...');
