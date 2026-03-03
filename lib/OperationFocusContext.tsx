'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface FocusedOperation {
  id: number;
  name: string;
}

interface OperationFocusContextType {
  focusedOperation: FocusedOperation | null;
  setFocusedOperation: (op: FocusedOperation) => void;
  clearFocusedOperation: () => void;
}

const OperationFocusContext = createContext<OperationFocusContextType | undefined>(undefined);

const FOCUS_STORAGE_KEY = 'acre-ops-focused-operation';

export function OperationFocusProvider({ children }: { children: React.ReactNode }) {
  const [focusedOperation, setFocusedOperationState] = useState<FocusedOperation | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(FOCUS_STORAGE_KEY);
      if (stored) {
        setFocusedOperationState(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load focused operation from storage:', e);
    }
    setIsHydrated(true);
  }, []);

  const setFocusedOperation = useCallback((op: FocusedOperation) => {
    setFocusedOperationState(op);
    try {
      sessionStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(op));
    } catch (e) {
      console.error('Failed to save focused operation to storage:', e);
    }
  }, []);

  const clearFocusedOperation = useCallback(() => {
    setFocusedOperationState(null);
    try {
      sessionStorage.removeItem(FOCUS_STORAGE_KEY);
    } catch (e) {
      console.error('Failed to clear focused operation from storage:', e);
    }
  }, []);

  if (!isHydrated) {
    return null;
  }

  return (
    <OperationFocusContext.Provider value={{ focusedOperation, setFocusedOperation, clearFocusedOperation }}>
      {children}
    </OperationFocusContext.Provider>
  );
}

export function useOperationFocus() {
  const context = useContext(OperationFocusContext);
  if (context === undefined) {
    throw new Error('useOperationFocus must be used within an OperationFocusProvider');
  }
  return context;
}
