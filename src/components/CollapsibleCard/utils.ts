// components/CollapsibleCard/utils.ts

import { VariableRow } from './types';

export const computeConstantFields = (data: any[], selectedFields: string[]) => {
    const constantFields: Record<string, any> = {};
    const variableFields: string[] = [];
    if (data.length > 0) {
        selectedFields.forEach((field) => {
            const allSame = data.every((row) => row[field] === data[0][field]);
            if (allSame) {
                constantFields[field] = data[0][field];
            } else {
                variableFields.push(field);
            }
        });
    }
    return { constantFields, variableFields };
};

export const deduplicateRows = (rows: VariableRow[]): VariableRow[] => {
    const seen = new Set<string>();
    const deduped = rows.filter((row) => {
        const { Series, ...rest } = row;
        const sorted = Object.keys(rest)
            .sort()
            .reduce(
                (acc, key) => {
                    acc[key] = rest[key];
                    return acc;
                },
                {} as Record<string, any>
            );
        const key = JSON.stringify(sorted);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    return deduped.map((row, index) => ({
        ...row,
        Series: { ...row.Series, value: String(index + 1) },
    }));
};

export const getRowUniqueKey = (row: VariableRow): string => {
    const keys = Object.keys(row)
        .filter((key) => key !== 'Series')
        .sort();
    return keys
        .map((key) => {
            const { constraintType, value, minValue, maxValue, tolerance } = row[key];
            return `${key}:${constraintType}:${value}:${minValue || ''}:${maxValue || ''}:${tolerance || ''}`;
        })
        .join('|');
};
