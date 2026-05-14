import { useMemo } from 'react';
import type { UnitDto, SituationDto } from '@shared/api';

export interface Recommendation {
  situationId: string;
  situationType: string;
  situationTitle: string;
  unitId: string;
  unitMarking: string;
  distance: number;
  score: number;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

/**
 * Recommends best unit for each active situation.
 * - Only considers units not on Code 7 and not already assigned to a situation
 * - Uses Euclidean distance between unit position and situation position
 * - Boosts score for lead units (supervisors get priority)
 * - Returns top-3 recommendations per situation, sorted by score descending
 */
export function useRecommendations(
  units: UnitDto[] | undefined,
  situations: SituationDto[] | undefined
): Recommendation[] {
  return useMemo(() => {
    const uList = units ?? [];
    const sList = (situations ?? []).filter(s => s.isActive && s.x != null && s.y != null);

    // Available units: have coords, not Code 7, not already assigned to a situation
    const available = uList.filter(u =>
      u.x != null && u.y != null &&
      u.status !== 'Code 7' &&
      !u.situationId  // not already assigned
    );

    const recs: Recommendation[] = [];

    for (const sit of sList) {
      const scored = available
        .map(u => {
          const d = dist(u.x!, u.y!, sit.x!, sit.y!);
          // Base score from distance (closer = higher). Max world distance ~8500
          let score = Math.max(0, 100 - (d / 85));
          // Lead unit bonus
          if (u.isLeadUnit) score += 15;
          // Penalty if unit already has crew (single-officer units are more flexible)
          // Slight bonus for units with more crew (can handle bigger situations)
          if (u.playerCount >= 2) score += 5;
          // Critical situations get matched to lead units first
          if (sit.metadata?.priority === 'Critical' && u.isLeadUnit) score += 20;

          return { u, d, score };
        })
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3); // top 3

      for (const { u, d, score } of scored) {
        recs.push({
          situationId: sit.id,
          situationType: sit.type,
          situationTitle: sit.metadata?.title || sit.type || 'UNKNOWN',
          unitId: u.id,
          unitMarking: u.marking,
          distance: Math.round(d),
          score: Math.round(score),
        });
      }
    }

    return recs.sort((a, b) => b.score - a.score).slice(0, 8); // max 8 total recs
  }, [units, situations]);
}
