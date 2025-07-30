import { SchemaMetadata } from '../types/schema';

interface StoredSchema {
  metadata: SchemaMetadata;
  content: string;
}

export class SchemaCacheManager {
  private dbName = 'DicompareSchemasDB';
  private version = 1;
  private db: IDBDatabase | null = null;

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains('schemas')) {
          const store = db.createObjectStore('schemas', { keyPath: 'metadata.id' });
          store.createIndex('filename', 'metadata.filename', { unique: false });
          store.createIndex('uploadDate', 'metadata.uploadDate', { unique: false });
        }
      };
    });
  }

  async storeSchema(metadata: SchemaMetadata, content: string): Promise<void> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['schemas'], 'readwrite');
      const store = transaction.objectStore('schemas');
      
      const schema: StoredSchema = { metadata, content };
      const request = store.put(schema);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getSchema(id: string): Promise<StoredSchema | null> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['schemas'], 'readonly');
      const store = transaction.objectStore('schemas');
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async getAllSchemaMetadata(): Promise<SchemaMetadata[]> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['schemas'], 'readonly');
      const store = transaction.objectStore('schemas');
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const schemas = request.result as StoredSchema[];
        resolve(schemas.map(schema => schema.metadata));
      };
    });
  }

  async deleteSchema(id: string): Promise<void> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['schemas'], 'readwrite');
      const store = transaction.objectStore('schemas');
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async updateSchemaMetadata(id: string, updates: Partial<SchemaMetadata>): Promise<void> {
    const schema = await this.getSchema(id);
    if (!schema) throw new Error(`Schema with id ${id} not found`);

    const updatedMetadata = { ...schema.metadata, ...updates };
    await this.storeSchema(updatedMetadata, schema.content);
  }

  async validateSchemaFile(file: File): Promise<{ isValid: boolean; error?: string }> {
    try {
      const content = await this.readFileContent(file);
      
      if (file.name.endsWith('.json')) {
        JSON.parse(content);
        return { isValid: true };
      } else if (file.name.endsWith('.py')) {
        if (content.includes('def ') || content.includes('class ')) {
          return { isValid: true };
        }
        return { isValid: false, error: 'Python file must contain function or class definitions' };
      }
      
      return { isValid: false, error: 'Unsupported file format. Only .json and .py files are supported.' };
    } catch (error) {
      return { isValid: false, error: `Invalid file format: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  }

  async extractMetadataFromFile(file: File): Promise<Partial<SchemaMetadata>> {
    const content = await this.readFileContent(file);
    const baseMetadata: Partial<SchemaMetadata> = {
      filename: file.name,
      fileSize: file.size,
      format: file.name.endsWith('.py') ? 'python' : 'json',
      uploadDate: new Date().toISOString(),
    };

    try {
      if (file.name.endsWith('.json')) {
        const parsed = JSON.parse(content);
        return {
          ...baseMetadata,
          title: parsed.title || parsed.name || file.name,
          version: parsed.version || '1.0.0',
          authors: parsed.authors || [],
          description: parsed.description,
          acquisitionCount: parsed.acquisitions?.length || 0,
        };
      } else {
        const titleMatch = content.match(/title\s*=\s*["']([^"']+)["']/);
        const versionMatch = content.match(/version\s*=\s*["']([^"']+)["']/);
        const authorMatch = content.match(/authors?\s*=\s*\[([^\]]+)\]/);
        
        return {
          ...baseMetadata,
          title: titleMatch?.[1] || file.name,
          version: versionMatch?.[1] || '1.0.0',
          authors: authorMatch ? authorMatch[1].split(',').map(a => a.trim().replace(/["']/g, '')) : [],
          description: content.split('\n').find(line => line.includes('"""') || line.includes("'''"))?.replace(/["""''']/g, '').trim(),
        };
      }
    } catch {
      return baseMetadata;
    }
  }

  private readFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  async clearCache(): Promise<void> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['schemas'], 'readwrite');
      const store = transaction.objectStore('schemas');
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getCacheSize(): Promise<number> {
    const schemas = await this.getAllSchemaMetadata();
    return schemas.reduce((total, schema) => total + schema.fileSize, 0);
  }
}

export const schemaCacheManager = new SchemaCacheManager();