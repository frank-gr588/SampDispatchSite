/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

/**
 * Example response type for /api/demo
 */
export interface DemoResponse {
  message: string;
}

// Player status enum
export enum PlayerStatus {
  OutOfDuty = 0,
  OnDuty = 1,
  OnDutyLeadUnit = 2,
  OnDutyOutOfUnit = 3
}

// Player role enum
export enum PlayerRole {
  Officer = 0,
  Supervisor = 1,
  SuperSupervisor = 2
}

// Player rank enum
export enum PlayerRank {
  ChiefOfPolice = 0,
  AssistantChiefOfPolice = 1,
  DeputyChiefOfPolice = 2,
  PoliceCommander = 3,
  PoliceCaptain = 4,
  PoliceLieutenant = 5,
  PoliceSergeant = 6,
  PoliceInspector = 7,
  PoliceOfficer = 8
}

// Shared types between frontend and backend
export interface PlayerPointDto {
  nick: string;
  x: number;
  y: number;
  status: PlayerStatus;
  role: PlayerRole;
  rank: PlayerRank;
  unitId?: string | null;
  lastUpdate?: string;
  lastActivityTime?: string;
  isAFK?: boolean;
}

export interface SituationDto {
  id: string;
  type: string;
  metadata: Record<string, string>;
  units: string[];
  greenUnitId?: string | null;  // Green Unit (Инициатор)
  redUnitId?: string | null;    // Red Unit (Командир)
  createdAt: string;
  isActive: boolean;
}

export interface UnitDto {
  id: string;
  marking: string;
  playerNicks: string[];
  playerCount: number;
  status: string;
  situationId?: string | null;
  isLeadUnit: boolean;
  tacticalChannelId?: string | null;
  createdAt: string;
}

export interface TacticalChannelDto {
  id: string;
  name: string;
  isBusy: boolean;
  situationId?: string | null;
  notes?: string;
}

// API request types
export interface CreatePlayerRequest {
  nick: string;
  x?: number;
  y?: number;
  role?: PlayerRole;
  status?: PlayerStatus;
}

export interface UpdatePlayerStatusRequest {
  status: PlayerStatus;
}

export interface UpdatePlayerRoleRequest {
  role: PlayerRole;
}

export interface CreateUnitRequest {
  marking: string;
  playerNicks: string[];
  isLeadUnit: boolean;
}

export interface AddPlayerToUnitRequest {
  playerNick: string;
}

export interface RemovePlayerFromUnitRequest {
  playerNick: string;
}

export interface UpdateUnitRequest {
  marking?: string;
}

export interface CreateSituationRequest {
  type: string;
  metadata?: Record<string, string>;
}

// Helper functions for status display
export function getPlayerStatusText(status: PlayerStatus): string {
  switch (status) {
    case PlayerStatus.OutOfDuty:
      return "Вне службы";
    case PlayerStatus.OnDuty:
      return "На службе";
    case PlayerStatus.OnDutyLeadUnit:
      return "На службе (Ведущий)";
    case PlayerStatus.OnDutyOutOfUnit:
      return "На службе (Вне юнита)";
    default:
      return "Неизвестно";
  }
}

export function getPlayerRoleText(role: PlayerRole): string {
  switch (role) {
    case PlayerRole.Officer:
      return "Офицер";
    case PlayerRole.Supervisor:
      return "Супервайзер";
    case PlayerRole.SuperSupervisor:
      return "Суперсупервайзер";
    default:
      return "Неизвестно";
  }
}

export function getPlayerStatusColor(status: PlayerStatus): string {
  switch (status) {
    case PlayerStatus.OutOfDuty:
      return "bg-gray-500/15 text-gray-300 border-gray-500/50";
    case PlayerStatus.OnDuty:
      return "bg-emerald-500/12 text-emerald-200 border-emerald-400/40";
    case PlayerStatus.OnDutyLeadUnit:
      return "bg-yellow-400/15 text-yellow-200 border-yellow-400/40";
    case PlayerStatus.OnDutyOutOfUnit:
      return "bg-amber-400/12 text-amber-100 border-amber-400/30";
    default:
      return "bg-muted/30 text-muted-foreground border-border/50";
  }
}

export function getPlayerRoleColor(role: PlayerRole): string {
  switch (role) {
    case PlayerRole.Officer:
      return "bg-blue-500/15 text-blue-200 border-blue-500/50";
    case PlayerRole.Supervisor:
      return "bg-purple-500/15 text-purple-200 border-purple-500/50";
    case PlayerRole.SuperSupervisor:
      return "bg-red-500/15 text-red-200 border-red-500/50";
    default:
      return "bg-muted/30 text-muted-foreground border-border/50";
  }
}

export function getPlayerRankText(rank: PlayerRank): string {
  switch (rank) {
    case PlayerRank.ChiefOfPolice:
      return "Chief of Police";
    case PlayerRank.AssistantChiefOfPolice:
      return "Assistant Chief";
    case PlayerRank.DeputyChiefOfPolice:
      return "Deputy Chief";
    case PlayerRank.PoliceCommander:
      return "Commander";
    case PlayerRank.PoliceCaptain:
      return "Captain";
    case PlayerRank.PoliceLieutenant:
      return "Lieutenant";
    case PlayerRank.PoliceSergeant:
      return "Sergeant";
    case PlayerRank.PoliceInspector:
      return "Inspector";
    case PlayerRank.PoliceOfficer:
      return "Officer";
    default:
      return "Unknown";
  }
}

export function getPlayerRankColor(rank: PlayerRank): string {
  switch (rank) {
    case PlayerRank.ChiefOfPolice:
      return "bg-red-600/20 text-red-100 border-red-600/60";
    case PlayerRank.AssistantChiefOfPolice:
    case PlayerRank.DeputyChiefOfPolice:
      return "bg-red-500/15 text-red-200 border-red-500/50";
    case PlayerRank.PoliceCommander:
    case PlayerRank.PoliceCaptain:
      return "bg-orange-500/15 text-orange-200 border-orange-500/50";
    case PlayerRank.PoliceLieutenant:
    case PlayerRank.PoliceSergeant:
      return "bg-amber-500/15 text-amber-200 border-amber-500/50";
    case PlayerRank.PoliceInspector:
      return "bg-blue-500/15 text-blue-200 border-blue-500/50";
    case PlayerRank.PoliceOfficer:
      return "bg-slate-500/15 text-slate-200 border-slate-500/50";
    default:
      return "bg-muted/30 text-muted-foreground border-border/50";
  }
}

