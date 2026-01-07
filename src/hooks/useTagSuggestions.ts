import { useMemo, useCallback } from 'react';
import { useSchemaService, UnifiedSchema } from './useSchemaService';

/**
 * Hook to aggregate all unique tags from library and uploaded schemas
 * for use in tag autocomplete functionality.
 */
export const useTagSuggestions = () => {
  const {
    getAllUnifiedSchemas
  } = useSchemaService();

  // Get all schemas (library + uploaded)
  const allSchemas = useMemo(() => {
    try {
      return getAllUnifiedSchemas();
    } catch {
      return [];
    }
  }, [getAllUnifiedSchemas]);

  // Extract all unique tags from schemas and their acquisitions
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();

    allSchemas.forEach((schema: UnifiedSchema) => {
      // Add schema-level tags
      if (schema.tags) {
        schema.tags.forEach(tag => tagSet.add(tag));
      }

      // Add acquisition-level tags
      if (schema.acquisitions) {
        schema.acquisitions.forEach(acq => {
          if (acq.tags) {
            acq.tags.forEach(tag => tagSet.add(tag));
          }
        });
      }
    });

    return Array.from(tagSet).sort();
  }, [allSchemas]);

  // Filter suggestions based on input
  const filterSuggestions = useCallback((input: string): string[] => {
    if (!input) return allTags.slice(0, 10);
    const lower = input.toLowerCase();
    return allTags.filter(tag => tag.toLowerCase().includes(lower));
  }, [allTags]);

  // Get schemas that have a specific tag (at schema or acquisition level)
  const getSchemasByTag = useCallback((tag: string): UnifiedSchema[] => {
    return allSchemas.filter(schema => {
      // Check schema-level tags
      if (schema.tags?.includes(tag)) return true;

      // Check acquisition-level tags
      return schema.acquisitions?.some(acq => acq.tags?.includes(tag)) || false;
    });
  }, [allSchemas]);

  // Get all unique tags grouped by count
  const getTagsWithCounts = useCallback((): { tag: string; count: number }[] => {
    const tagCounts = new Map<string, number>();

    allSchemas.forEach((schema: UnifiedSchema) => {
      const schemaTags = new Set<string>();

      // Collect schema-level tags
      if (schema.tags) {
        schema.tags.forEach(tag => schemaTags.add(tag));
      }

      // Collect acquisition-level tags
      if (schema.acquisitions) {
        schema.acquisitions.forEach(acq => {
          if (acq.tags) {
            acq.tags.forEach(tag => schemaTags.add(tag));
          }
        });
      }

      // Increment count for each unique tag in this schema
      schemaTags.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });

    return Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [allSchemas]);

  // Get uncategorized schemas (no tags at schema or acquisition level)
  const getUncategorizedSchemas = useCallback((): UnifiedSchema[] => {
    return allSchemas.filter(schema => {
      const hasSchemaTags = schema.tags && schema.tags.length > 0;
      const hasAcquisitionTags = schema.acquisitions?.some(
        acq => acq.tags && acq.tags.length > 0
      );
      return !hasSchemaTags && !hasAcquisitionTags;
    });
  }, [allSchemas]);

  return {
    allTags,
    filterSuggestions,
    getSchemasByTag,
    getTagsWithCounts,
    getUncategorizedSchemas
  };
};
