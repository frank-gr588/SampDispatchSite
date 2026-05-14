import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { UnitDto, SituationDto, PlayerPointDto, TacticalChannelDto } from '@shared/api';
import { apiGet } from '@/lib/utils';

interface DataContextType {
  // Units
  units: UnitDto[];
  setUnits: React.Dispatch<React.SetStateAction<UnitDto[]>>;
  refreshUnits: (immediate?: boolean) => Promise<void>;
  
  // Situations
  situations: SituationDto[];
  setSituations: React.Dispatch<React.SetStateAction<SituationDto[]>>;
  refreshSituations: (immediate?: boolean) => Promise<void>;
  
  // Players
  players: PlayerPointDto[];
  setPlayers: React.Dispatch<React.SetStateAction<PlayerPointDto[]>>;
  refreshPlayers: (immediate?: boolean) => Promise<void>;
  
  // Tactical Channels
  tacticalChannels: TacticalChannelDto[];
  setTacticalChannels: React.Dispatch<React.SetStateAction<TacticalChannelDto[]>>;
  refreshTacticalChannels: (immediate?: boolean) => Promise<void>;
  
  // Global refresh
  refreshAll: () => Promise<void>;
  isLoading: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);
const PLAYERS_POLL_MS = 1000;
const UNITS_POLL_MS = 1000;
const SITUATIONS_POLL_MS = 1000;
const CHANNELS_POLL_MS = 2000;

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [units, setUnits] = useState<UnitDto[]>([]);
  const [situations, setSituations] = useState<SituationDto[]>([]);
  const [players, setPlayers] = useState<PlayerPointDto[]>([]);
  const [tacticalChannels, setTacticalChannels] = useState<TacticalChannelDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Дебаунс для предотвращения частых запросов
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});
  
  // Флаги для предотвращения одновременных запросов
  const fetchingFlags = useRef<Record<string, boolean>>({});

  const refreshUnits = useCallback(async (immediate = false) => {
    if (!immediate) {
      // Дебаунс: если уже есть запланированный запрос, отменяем его
      if (debounceTimers.current.units) {
        clearTimeout(debounceTimers.current.units);
      }
      // Планируем новый запрос через 300ms
      debounceTimers.current.units = setTimeout(() => refreshUnits(true), 300);
      return;
    }
    
    // Предотвращаем одновременные запросы
    if (fetchingFlags.current.units) {
      return;
    }
    
    fetchingFlags.current.units = true;
    try {
      const data = await apiGet<UnitDto[]>('/api/units');
      setUnits(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('[DataContext] Failed to fetch units:', error);
    } finally {
      fetchingFlags.current.units = false;
    }
  }, []);

  const refreshSituations = useCallback(async (immediate = false) => {
    if (!immediate) {
      if (debounceTimers.current.situations) {
        clearTimeout(debounceTimers.current.situations);
      }
      debounceTimers.current.situations = setTimeout(() => refreshSituations(true), 300);
      return;
    }
    
    if (fetchingFlags.current.situations) {
      return;
    }
    
    fetchingFlags.current.situations = true;
    try {
      const data = await apiGet<SituationDto[]>('/api/situations/all');
      setSituations(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('[DataContext] Failed to fetch situations:', error);
    } finally {
      fetchingFlags.current.situations = false;
    }
  }, []);

  const refreshPlayers = useCallback(async (immediate = false) => {
    if (!immediate) {
      if (debounceTimers.current.players) {
        clearTimeout(debounceTimers.current.players);
      }
      debounceTimers.current.players = setTimeout(() => refreshPlayers(true), 300);
      return;
    }
    
    if (fetchingFlags.current.players) {
      return;
    }
    
    fetchingFlags.current.players = true;
    try {
      const data = await apiGet<PlayerPointDto[]>('/api/players');
      setPlayers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('[DataContext] Failed to fetch players:', error);
    } finally {
      fetchingFlags.current.players = false;
    }
  }, []);

  const refreshTacticalChannels = useCallback(async (immediate = false) => {
    if (!immediate) {
      if (debounceTimers.current.channels) {
        clearTimeout(debounceTimers.current.channels);
      }
      debounceTimers.current.channels = setTimeout(() => refreshTacticalChannels(true), 300);
      return;
    }
    
    if (fetchingFlags.current.channels) {
      return;
    }
    
    fetchingFlags.current.channels = true;
    try {
      const data = await apiGet<TacticalChannelDto[]>('/api/channels/all');
      setTacticalChannels(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('[DataContext] Failed to fetch channels:', error);
    } finally {
      fetchingFlags.current.channels = false;
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    try {
      // Всегда immediate для refreshAll
      await Promise.all([
        refreshUnits(true),
        refreshSituations(true),
        refreshPlayers(true),
        refreshTacticalChannels(true),
      ]);
    } catch (error) {
      console.error('[DataContext] RefreshAll error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [refreshUnits, refreshSituations, refreshPlayers, refreshTacticalChannels]);

  // Initial load + background polling
  useEffect(() => {
    refreshAll();
    const unitsInterval = window.setInterval(() => refreshUnits(true), UNITS_POLL_MS);
    const situationsInterval = window.setInterval(() => refreshSituations(true), SITUATIONS_POLL_MS);
    const playersInterval = window.setInterval(() => refreshPlayers(true), PLAYERS_POLL_MS);
    const channelsInterval = window.setInterval(() => refreshTacticalChannels(true), CHANNELS_POLL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshAll();
      }
    };

    const handleWindowFocus = () => {
      refreshAll();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      window.clearInterval(unitsInterval);
      window.clearInterval(situationsInterval);
      window.clearInterval(playersInterval);
      window.clearInterval(channelsInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [refreshAll, refreshPlayers, refreshSituations, refreshTacticalChannels, refreshUnits]);
  
  // Очистка таймеров при размонтировании
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(timer => clearTimeout(timer));
    };
  }, []);

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
