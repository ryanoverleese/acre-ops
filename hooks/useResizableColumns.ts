'use client';

import { useState, useRef, useEffect } from 'react';

const DEFAULT_MIN_WIDTH = 60;

interface UseResizableColumnsOptions<K extends string> {
  defaultWidths: Record<K, number>;
  storageKey: string;
  minWidth?: number;
}

interface UseResizableColumnsReturn<K extends string> {
  columnWidths: Record<K, number>;
  resizingColumn: K | null;
  handleResizeStart: (columnKey: K, e: React.MouseEvent) => void;
  handleResetColumnWidth: (columnKey: K) => void;
}

export function useResizableColumns<K extends string>({
  defaultWidths,
  storageKey,
  minWidth = DEFAULT_MIN_WIDTH,
}: UseResizableColumnsOptions<K>): UseResizableColumnsReturn<K> {
  const [columnWidths, setColumnWidths] = useState<Record<K, number>>(defaultWidths);
  const [resizingColumn, setResizingColumn] = useState<K | null>(null);
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);

  // Load saved widths from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, number>;
        setColumnWidths((prev) => ({ ...prev, ...parsed }));
      }
    } catch (e) {
      console.error('Failed to load column widths:', e);
    }
  }, [storageKey]);

  // Save widths to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(columnWidths));
    } catch (e) {
      console.error('Failed to save column widths:', e);
    }
  }, [columnWidths, storageKey]);

  // Handle mouse move and mouse up during resize
  useEffect(() => {
    if (!resizingColumn) return;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - resizeStartX.current;
      const newWidth = Math.max(minWidth, resizeStartWidth.current + diff);
      setColumnWidths((prev) => ({ ...prev, [resizingColumn]: newWidth }));
    };

    const handleMouseUp = () => {
      setResizingColumn(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumn, minWidth]);

  const handleResizeStart = (columnKey: K, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(columnKey);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = columnWidths[columnKey];
  };

  const handleResetColumnWidth = (columnKey: K) => {
    setColumnWidths((prev) => ({ ...prev, [columnKey]: defaultWidths[columnKey] }));
  };

  return { columnWidths, resizingColumn, handleResizeStart, handleResetColumnWidth };
}
