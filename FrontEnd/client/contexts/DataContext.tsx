import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { UnitDto, SituationDto, PlayerPointDto, TacticalChannelDto } from '@shared/api';

interface DataContextType {
  // Units
  units: UnitDto[];
  setUnits: React.Dispatch<React.SetStateAction<UnitDto[]>>;
  refreshUnits: () => Promise<void>;
  
  // Situations
  situations: SituationDto[];
  setSituations: React.Dispatch<React.SetStateAction<SituationDto[]>>;
  refreshSituations: () => Promise<void>;
  
  // Players
  players: PlayerPointDto[];
  setPlayers: React.Dispatch<React.SetStateAction<PlayerPointDto[]>>;
  refreshPlayers: () => Promise<void>;
  
  // Tactical Channels
  tacticalChannels: TacticalChannelDto[];
  setTacticalChannels: React.Dispatch<React.SetStateAction<TacticalChannelDto[]>>;
  refreshTacticalChannels: () => Promise<void>;
  
  // Global refresh
  refreshAll: () => Promise<void>;
  isLoading: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [units, setUnits] = useState<UnitDto[]>([]);
  const [situations, setSituations] = useState<SituationDto[]>([]);
  const [players, setPlayers] = useState<PlayerPointDto[]>([]);
  const [tacticalChannels, setTacticalChannels] = useState<TacticalChannelDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshUnits = useCallback(async () => {
    try {
      console.log('[DataContext] Fetching units...');
      const response = await fetch('/api/units');
      if (response.ok) {
        const data = await response.json();
        console.log('[DataContext] Units loaded:', data.length);
        setUnits(Array.isArray(data) ? data : []);
      } else {
        console.error('[DataContext] Units fetch failed:', response.status);
      }
    } catch (error) {
      console.error('[DataContext] Failed to fetch units:', error);
    }
  }, []);

  const refreshSituations = useCallback(async () => {
    try {
      console.log('[DataContext] Fetching situations...');
      const response = await fetch('/api/situations/all');
      if (response.ok) {
        const data = await response.json();
        console.log('[DataContext] Situations loaded:', data.length);
        setSituations(Array.isArray(data) ? data : []);
      } else {
        console.error('[DataContext] Situations fetch failed:', response.status);
      }
    } catch (error) {
      console.error('[DataContext] Failed to fetch situations:', error);
    }
  }, []);

  const refreshPlayers = useCallback(async () => {
    try {
      console.log('[DataContext] Fetching players...');
      const response = await fetch('/api/players');
      if (response.ok) {
        const data = await response.json();
        console.log('[DataContext] Players loaded:', data.length);
        setPlayers(Array.isArray(data) ? data : []);
      } else {
        console.error('[DataContext] Players fetch failed:', response.status);
      }
    } catch (error) {
      console.error('[DataContext] Failed to fetch players:', error);
    }
  }, []);

  const refreshTacticalChannels = useCallback(async () => {
    try {
      console.log('[DataContext] Fetching channels...');
      const response = await fetch('/api/channels/all');
      if (response.ok) {
        const data = await response.json();
        console.log('[DataContext] Channels loaded:', data.length);
        setTacticalChannels(Array.isArray(data) ? data : []);
      } else {
        console.error('[DataContext] Channels fetch failed:', response.status);
      }
    } catch (error) {
      console.error('[DataContext] Failed to fetch tactical channels:', error);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    console.log('[DataContext] RefreshAll started');
    setIsLoading(true);
    try {
      await Promise.all([
        refreshUnits(),
        refreshSituations(),
        refreshPlayers(),
        refreshTacticalChannels(),
      ]);
      console.log('[DataContext] RefreshAll completed');
    } catch (error) {
      console.error('[DataContext] RefreshAll error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [refreshUnits, refreshSituations, refreshPlayers, refreshTacticalChannels]);

  // Initial load - only once on mount
  useEffect(() => {
    console.log('[DataContext] Initial load...');
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - load only once on mount

  const value: DataContextType = {
    units,
    setUnits,
    refreshUnits,
    situations,
    setSituations,
    refreshSituations,
    players,
    setPlayers,
    refreshPlayers,
    tacticalChannels,
    setTacticalChannels,
    refreshTacticalChannels,
    refreshAll,
    isLoading,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within DataProvider');
  }
  return context;
}
