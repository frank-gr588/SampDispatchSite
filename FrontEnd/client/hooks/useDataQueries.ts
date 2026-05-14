import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet } from '@/lib/utils';
import type { UnitDto, SituationDto, PlayerPointDto, TacticalChannelDto } from '@shared/api';
import { useRefreshOnSignalR } from './useSignalR';

// ── Query keys ──
export const qk = {
  players: ['players'] as const,
  units: ['units'] as const,
  situations: ['situations'] as const,
  channels: ['channels'] as const,
};

// ── Players ──
export function usePlayers() {
  return useQuery({
    queryKey: qk.players,
    queryFn: () => apiGet<PlayerPointDto[]>('/api/players'),
    refetchInterval: 2000,         // fallback polling on loss of SignalR
    refetchOnWindowFocus: true,
    staleTime: 500,
  });
}

// ── Units ──
export function useUnits() {
  return useQuery({
    queryKey: qk.units,
    queryFn: () => apiGet<UnitDto[]>('/api/units'),
    refetchInterval: 2000,
    refetchOnWindowFocus: true,
    staleTime: 500,
  });
}

// ── Situations ──
export function useSituations() {
  return useQuery({
    queryKey: qk.situations,
    queryFn: () => apiGet<SituationDto[]>('/api/situations/all'),
    refetchInterval: 2000,
    refetchOnWindowFocus: true,
    staleTime: 500,
  });
}

// ── Tactical Channels ──
export function useTacticalChannels() {
  return useQuery({
    queryKey: qk.channels,
    queryFn: () => apiGet<TacticalChannelDto[]>('/api/channels/all'),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    staleTime: 1000,
  });
}

/**
 * Invalidate all queries when SignalR events fire.
 * Call this once in your root layout.
 */
export function useDataSync() {
  const qc = useQueryClient();
  useRefreshOnSignalR((...keys: string[]) => {
    keys.forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  });
}
