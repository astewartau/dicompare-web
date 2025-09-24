import React, { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render: (item: T, index: number, isHovered: boolean) => ReactNode;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

interface FieldTableBaseProps<T> {
  items: T[];
  columns: Column<T>[];
  onItemClick?: (item: T, index: number) => void;
  isEditMode?: boolean;
  emptyMessage?: string;
  className?: string;
  hoveredIndex?: number;
  onHover?: (index: number | null) => void;
}

export function FieldTableBase<T>({
  items,
  columns,
  onItemClick,
  isEditMode = false,
  emptyMessage = 'No items to display',
  className = '',
  hoveredIndex,
  onHover
}: FieldTableBaseProps<T>) {
  if (items.length === 0) {
    return (
      <div className="border border-gray-200 rounded-md p-8 text-center">
        <p className="text-gray-500 text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={`border border-gray-200 rounded-md overflow-hidden ${className}`}>
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={`px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider ${
                  column.align === 'right' ? 'text-right' :
                  column.align === 'center' ? 'text-center' : 'text-left'
                }`}
                style={column.width ? { width: column.width } : undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {items.map((item, index) => {
            const isHovered = hoveredIndex === index;
            return (
              <tr
                key={index}
                className={`transition-colors ${
                  onItemClick ? 'cursor-pointer hover:bg-gray-50' : ''
                } ${isHovered ? 'bg-gray-50' : ''}`}
                onClick={() => onItemClick?.(item, index)}
                onMouseEnter={() => onHover?.(index)}
                onMouseLeave={() => onHover?.(null)}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-3 py-2 text-sm ${
                      column.align === 'right' ? 'text-right' :
                      column.align === 'center' ? 'text-center' : 'text-left'
                    }`}
                  >
                    {column.render(item, index, isHovered)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
