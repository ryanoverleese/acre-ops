'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface SeasonContextType {
  currentSeason: string;
  setCurrentSeason: (season: string) => void;
  availableSeasons: string[];
  addSeason: (season: string) => void;
}

const SeasonContext = createContext<SeasonContextType | undefined>(undefined);

const SEASON_STORAGE_KEY = 'acre-ops-current-season';
const CUSTOM_SEASONS_KEY = 'acre-ops-custom-seasons';

interface SeasonProviderProps {
  children: React.ReactNode;
  initialSeasons?: string[];
}

export function SeasonProvider({ children, initialSeasons = [] }: SeasonProviderProps) {
  // Default to current year
  const defaultSeason = String(new Date().getFullYear());

  const [currentSeason, setCurrentSeasonState] = useState<string>(defaultSeason);
  const [customSeasons, setCustomSeasons] = useState<string[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(SEASON_STORAGE_KEY);
      if (stored) {
        setCurrentSeasonState(stored);
      }
      const storedCustom = localStorage.getItem(CUSTOM_SEASONS_KEY);
      if (storedCustom) {
        setCustomSeasons(JSON.parse(storedCustom));
      }
    } catch (e) {
      console.error('Failed to load season from storage:', e);
    }
    setIsHydrated(true);
  }, []);

  // Save to sessionStorage when season changes
  const setCurrentSeason = useCallback((season: string) => {
    setCurrentSeasonState(season);
    try {
      sessionStorage.setItem(SEASON_STORAGE_KEY, season);
    } catch (e) {
      console.error('Failed to save season to storage:', e);
    }
  }, []);

  // Add a custom season
  const addSeason = useCallback((season: string) => {
    if (!customSeasons.includes(season)) {
      const newCustom = [...customSeasons, season];
      setCustomSeasons(newCustom);
      try {
        localStorage.setItem(CUSTOM_SEASONS_KEY, JSON.stringify(newCustom));
      } catch (e) {
        console.error('Failed to save custom seasons:', e);
      }
    }
  }, [customSeasons]);

  // Combine initial seasons with custom seasons and sort descending
  const availableSeasons = React.useMemo(() => {
    const combined = new Set([...initialSeasons, ...customSeasons]);
    return Array.from(combined).sort((a, b) => b.localeCompare(a));
  }, [initialSeasons, customSeasons]);

  // Don't render children until hydrated to avoid hydration mismatch
  if (!isHydrated) {
    return null;
  }

  return (
    <SeasonContext.Provider value={{ currentSeason, setCurrentSeason, availableSeasons, addSeason }}>
      {children}
    </SeasonContext.Provider>
  );
}

export function useSeason() {
  const context = useContext(SeasonContext);
  if (context === undefined) {
    throw new Error('useSeason must be used within a SeasonProvider');
  }
  return context;
}

/**
 * Hook for pages that need to sync their local season state with global context.
 * Use this in pages that already have their own season state.
 */
export function useSeasonSync(localSeason: string, setLocalSeason: (s: string) => void) {
  const { currentSeason, setCurrentSeason } = useSeason();

  // Sync local to global on mount
  useEffect(() => {
    if (localSeason !== currentSeason) {
      setLocalSeason(currentSeason);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update global when local changes
  const handleSeasonChange = useCallback((newSeason: string) => {
    setLocalSeason(newSeason);
    setCurrentSeason(newSeason);
  }, [setLocalSeason, setCurrentSeason]);

  return { handleSeasonChange };
}
