import { useEffect, useMemo, useState, useCallback } from "react";
import { apiGet, emitAppEvent, onAppEvent } from "@/lib/utils";
import type { PlayerPointDto, UnitDto, SituationDto, TacticalChannelDto } from "@shared/api";
import { useData } from "@/contexts/DataContext";
import {
  PlayersTable,
  type PlayerRecord,
} from "@/components/dashboard/PlayersTable";
import {
  SituationsPanel,
  type SituationRecord,
} from "@/components/dashboard/SituationsPanel";
import { OperationsMap } from "@/components/dashboard/OperationsMap";
import { AssignmentBoard } from "@/components/dashboard/AssignmentBoard";
import { ManagementDashboard } from "@/components/dashboard/ManagementDashboard";
import { UnitsManagement } from "@/components/dashboard/UnitsManagement";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  Coffee,
  Radio,
  ShieldCheck,
  Settings,
  Users,
  MapPin,
} from "lucide-react";
import { AuthPrototype } from "@/components/auth/AuthPrototype";

const initialPlayers: PlayerPointDto[] = [ ];

const initialSituations: SituationRecord[] = [];

// Адаптер для конвертации PlayerPointDto в PlayerRecord для старых компонентов
const adaptPlayerForUI = (player: PlayerPointDto, index: number): PlayerRecord => ({
  id: index + 1,
  nickname: player.nick,
  callSign: player.nick,
  status: player.status?.toString() || "OnDuty",
  comment: "",
  channel: "TAC 1",
  lastUpdate: new Date(player.lastUpdate || Date.now()).toLocaleTimeString('ru-RU'),
  priority: "Routine" as const,
  location: { x: player.x || 0, y: player.y || 0 },
  worldX: player.x,
  worldY: player.y,
  isAFK: player.isAFK || false,
} as any);

// Адаптер для конвертации SituationDto в SituationRecord
const generateSituationId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
};

const sanitizeBackendSituation = (situation: SituationDto): SituationDto => {
  const metadata = situation?.metadata && typeof situation.metadata === "object"
    ? { ...situation.metadata }
    : {};

  return {
    ...situation,
    id: situation?.id ? String(situation.id) : generateSituationId(),
    type: typeof situation?.type === "string" ? situation.type : "unknown",
    metadata,
    units: Array.isArray(situation?.units) ? [...situation.units] : [],
    greenUnitId: situation?.greenUnitId ?? null,
    redUnitId: situation?.redUnitId ?? null,
    createdAt: situation?.createdAt ?? new Date().toISOString(),
    isActive: Boolean(situation?.isActive),
  };
};

const adaptSituationForUI = (situation: SituationDto, index: number, units: UnitDto[]): SituationRecord => {
  const metadata = situation.metadata ?? {};
  // Определяем приоритет на основе типа ситуации
  const getPriority = (type: string): "Critical" | "High" | "Moderate" | "Low" => {
    const safeType = type ?? "";
    switch (safeType.toLowerCase()) {
      case "panic":
        return "Critical";
      case "pursuit":
      case "code6":
        return "High";
      case "911":
        return "Moderate";
      default:
        return "Low";
    }
  };

  // Получаем название типа ситуации
  const getTitle = (type: string, metadata: Record<string, string>): string => {
    const safeType = type ?? "unknown";
    switch (safeType.toLowerCase()) {
      case "pursuit":
        return "Погоня";
      case "trafficstop":
        return "Трафик-стоп";
      case "code6":
        return "Code 6";
      case "911":
        return "911";
      default:
        return safeType;
    }
  };

  // Считаем количество назначенных юнитов (сравниваем как строки — поддержка GUID и локальных id)
  const assignedUnits = units.filter(u => String(u.situationId) === String(situation.id));
  const leadUnit = assignedUnits.find(u => u.isLeadUnit);

  // Получаем Green Unit и Red Unit из новой структуры
  const greenUnit = situation.greenUnitId ? units.find(u => u.id === situation.greenUnitId) : null;
  const redUnit = situation.redUnitId ? units.find(u => u.id === situation.redUnitId) : null;

  // Приоритет из metadata, если есть, иначе по типу
  const priority = (metadata.priority as "Critical" | "High" | "Moderate" | "Low") || getPriority(situation.type);
  
  // Название из metadata, если есть, иначе по типу
  const title = metadata.title || getTitle(situation.type, metadata);

  const metadataStatus = typeof metadata.status === "string" ? metadata.status : undefined;
  const normalizedStatus = (() => {
    if (!situation.isActive) return "Monitoring";
    if (metadataStatus && ["Active", "Stabilizing", "Escalated"].includes(metadataStatus)) {
      return metadataStatus;
    }
    return "Active";
  })();

  return {
    id: index + 1,
    code: (situation.type ?? "unknown").toUpperCase(),
    title,
    status: normalizedStatus,
    location: metadata.location || "Неизвестно",
    leadUnit: leadUnit?.marking || "Не назначен",
    greenUnitId: greenUnit?.marking || undefined,
    redUnitId: redUnit?.marking || undefined,
    units: assignedUnits.map(u => u.marking),
    unitsAssigned: assignedUnits.length,
    channel: metadata.channel || "Нет канала",
    priority,
    updated: new Date(situation.createdAt).toLocaleString('ru-RU'),
    notes: metadata.notes || undefined,
  };
};

function buildInitialAssignments(units: UnitDto[]): Record<string, string | null> {
  const assignments: Record<string, string | null> = {};
  units.forEach((unit) => {
    assignments[unit.id] = null;
  });
  return assignments;
}

export default function Index() {
  // Используем DataContext вместо локального state
  const { 
    players, 
    units, 
    situations: backendSituations, 
    tacticalChannels,
    refreshUnits,
    refreshSituations,
    refreshPlayers,
    refreshTacticalChannels 
  } = useData();
  
  const [situations, setSituations] = useState(initialSituations); // Локальные демо-ситуации (если нужны)
  const [assignments, setAssignments] = useState<Record<string, string | null>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentTime, setCurrentTime] = useState(new Date());

  const normalizedSearch = searchTerm.trim().toLowerCase();

  // Адаптированные данные для старых компонентов
  const adaptedPlayers = useMemo(() => 
    players.map(adaptPlayerForUI), 
    [players]
  );

  // Адаптированные ситуации из backend + демо
  const adaptedSituations = useMemo(() => {
    const backendAdapted = backendSituations.map((s, i) => adaptSituationForUI(s, i, units));
    // Объединяем с демо-ситуациями (если есть)
    return [...backendAdapted, ...situations.map((s, i) => ({...s, id: backendAdapted.length + i + 1}))];
  }, [backendSituations, situations, units]);

  // map backend GUID -> UI id (string)
  const guidToUi = useMemo(() => {
    const m: Record<string,string> = {};
    backendSituations.forEach((s, idx) => { m[String(s.id)] = String(idx + 1); });
    return m;
  }, [backendSituations]);

  const effectiveAssignments = useMemo(() => {
    const merged: Record<string, string | null> = { ...assignments };
    units.forEach(unit => {
      if (merged[unit.id] != null) return;
      const sit = unit.situationId;
      if (!sit) return;
      if (typeof sit === 'string' && guidToUi[sit]) {
        merged[unit.id] = guidToUi[sit];
      } else if (!isNaN(Number(sit))) {
        merged[unit.id] = String(sit);
      }
    });
    return merged;
  }, [assignments, units, guidToUi]);

  // Адаптированная фильтрация для старых компонентов
  const statuses = useMemo(
    () =>
      Array.from(new Set(adaptedPlayers.map((player) => player.status))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [adaptedPlayers],
  );

  const filteredPlayers = useMemo(() => {
    return adaptedPlayers.filter((player) => {
      const matchesStatus = statusFilter === "all" || player.status === statusFilter;
      if (!normalizedSearch) {
        return matchesStatus;
      }
      const haystack = `${player.nickname} ${player.callSign} ${player.comment}`.toLowerCase();
      const matchesSearch = haystack.includes(normalizedSearch);
      return matchesStatus && matchesSearch;
    });
  }, [normalizedSearch, adaptedPlayers, statusFilter]);

  const activeUnits = units.filter(
    (unit) => unit.status !== "Code 7" && unit.status !== "Unassigned",
  ).length;
  const criticalSituations = adaptedSituations.filter((situation) => situation.priority === "Critical").length;
  const codeSeven = units.filter((unit) => unit.status === "Code 7").length;

  const handleAssignmentChange = async (unitId: string, situationId: string | null) => {
    // Обновляем локальный state сразу для быстрого UI
    const oldAssignment = assignments[unitId];
    setAssignments((current) => ({
      ...current,
      [unitId]: situationId,
    }));

    try {
      // Находим юнит
      const unit = units.find(u => u.id === unitId);
      if (!unit) {
        throw new Error("Unit not found");
      }

      // If assigning to a situation, update backend status to Code 2
      if (situationId) {
        try {
          await fetch(`/api/units/${unitId}/status`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", "X-API-Key": "changeme-key" },
            body: JSON.stringify({ status: "Code 2" })
          });
          // Refresh units from backend to get updated state
          await refreshUnits();
        } catch (e) {
          console.warn("Failed to update unit status on backend:", e);
        }
      }

      // Если была старая ситуация - убираем юнит с неё
      if (oldAssignment && oldAssignment !== situationId) {
        const oldSitIndex = parseInt(oldAssignment) - 1;
        // backend situation
        if (oldSitIndex >= 0 && oldSitIndex < backendSituations.length) {
          const oldSit = backendSituations[oldSitIndex];
          await fetch(`/api/situations/${oldSit.id}/units/remove`, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "X-API-Key": "changeme-key"
            },
            body: JSON.stringify({ unitId: unit.id })
          });
          // Refresh units from backend
          await refreshUnits();
        } else {
          // old assignment was a local/demo situation — clear local situations state
          const localIndex = oldSitIndex - backendSituations.length;
          if (localIndex >= 0 && localIndex < situations.length) {
            setSituations(current => current.map((s, i) => i === localIndex ? { ...s, unitsAssigned: Math.max(0, (s.unitsAssigned || 0) - 1) } : s));
            await refreshUnits();
          }
        }
      }

      // (refresh helper is declared at component scope)

      // Если новая ситуация - добавляем юнит на неё
      if (situationId) {
        const sitIndex = parseInt(situationId) - 1;
        if (sitIndex >= 0 && sitIndex < backendSituations.length) {
          // backend situation
          const situation = backendSituations[sitIndex];
          const response = await fetch(`/api/situations/${situation.id}/units/add`, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "X-API-Key": "changeme-key"
            },
            body: JSON.stringify({ 
              unitId: unit.id,
              asLeadUnit: unit.isLeadUnit 
            })
          });

          if (!response.ok) {
            throw new Error(`Failed to assign unit: ${response.status}`);
          }
          // Refresh data from backend
          await refreshUnits();
          await refreshSituations();
        } else {
          // local/demo situation
          const localIndex = sitIndex - backendSituations.length;
          if (localIndex >= 0 && localIndex < situations.length) {
            setSituations(current => current.map((s, i) => i === localIndex ? { ...s, unitsAssigned: (s.unitsAssigned || 0) + 1 } : s));
            // Refresh data from backend
            await refreshUnits();
          }
        }
      }
      
      emitAppEvent('units:updated');
      emitAppEvent('situations:updated');
      // Данные обновятся автоматически через useEffect
      console.log("Assignment changed:", unitId, "->", situationId);
      
    } catch (error) {
      console.error("Error changing assignment:", error);
      // Откатываем изменение в UI
      setAssignments((current) => ({
        ...current,
        [unitId]: oldAssignment,
      }));
      alert(`Ошибка назначения: ${error.message}`);
    }
  };

  // Listen for management panel events and refresh data from Context
  useEffect(() => {
    const unsubUnits = onAppEvent('units:updated', async () => { 
      await refreshUnits();
      await refreshSituations();
    });
    const unsubSits = onAppEvent('situations:updated', async () => { 
      await refreshSituations();
    });
    const unsubPlayers = onAppEvent('players:updated', async () => { 
      await refreshPlayers();
    });
    return () => { unsubUnits(); unsubSits(); unsubPlayers(); };
  }, [refreshUnits, refreshSituations, refreshPlayers]);

  const handleSituationStatusChange = async (situationId: number, status: string) => {
    // Находим соответствующую backend ситуацию
    const backendSitIndex = situationId - 1;
    if (backendSitIndex >= 0 && backendSitIndex < backendSituations.length) {
      const backendSit = backendSituations[backendSitIndex];
      
      try {
        const updateMetadata = async (nextStatus: string) => {
          const metadataSource = backendSit?.metadata && typeof backendSit.metadata === "object"
            ? backendSit.metadata
            : {};
          const metadata = { ...metadataSource } as Record<string, string>;
          metadata.status = nextStatus;
          const metadataResponse = await fetch(`/api/situations/${backendSit.id}/metadata`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": "changeme-key"
            },
            body: JSON.stringify({ metadata })
          });
          if (!metadataResponse.ok) {
            throw new Error(`Metadata update failed: ${metadataResponse.status}`);
          }
        };

        if (status === "Monitoring") {
          if (backendSit.isActive) {
            const closeResponse = await fetch(`/api/situations/${backendSit.id}/close`, {
              method: "POST",
              headers: { "X-API-Key": "changeme-key" }
            });
            if (!closeResponse.ok) {
              throw new Error(`Close situation failed: ${closeResponse.status}`);
            }
          }
          await updateMetadata("Monitoring");
        } else {
          if (!backendSit.isActive) {
            const openResponse = await fetch(`/api/situations/${backendSit.id}/open`, {
              method: "POST",
              headers: { "X-API-Key": "changeme-key" }
            });
            if (!openResponse.ok) {
              throw new Error(`Open situation failed: ${openResponse.status}`);
            }
          }
          await updateMetadata(status);
        }

        console.log("Situation status changed:", backendSit.id, status);
      } catch (error) {
        console.error("Error changing situation status:", error);
        alert(`Ошибка изменения статуса: ${error.message}`);
      }
    } else {
      // Локальная демо-ситуация
      setSituations((current) =>
        current.map((situation) =>
          situation.id === situationId
            ? {
                ...situation,
                status,
                updated: "Synced just now",
              }
            : situation,
        ),
      );
    }
  };

  const handleEditSituation = async (situationId: number, updates: Partial<SituationRecord>) => {
    // Находим соответствующую backend ситуацию
    const backendSitIndex = situationId - 1;
    if (backendSitIndex >= 0 && backendSitIndex < backendSituations.length) {
      const backendSit = backendSituations[backendSitIndex];
      if (!backendSit?.id) {
        alert("У ситуации отсутствует идентификатор, обновление невозможно.");
        return;
      }
      
      try {
        // Формируем обновленные metadata
        const metadataSource = backendSit?.metadata && typeof backendSit.metadata === "object"
          ? backendSit.metadata
          : {};
        const metadata: Record<string, string> = { ...metadataSource };
        const normalize = (value: string | undefined) => (value ?? "").trim();
        
        if (updates.location !== undefined) {
          const next = normalize(updates.location);
          if (next) metadata.location = next;
          else delete metadata.location;
        }
        if (updates.channel !== undefined) {
          const next = normalize(updates.channel);
          if (!next || next.toLowerCase() === "нет канала") delete metadata.channel;
          else metadata.channel = next;
        }
        if (updates.priority !== undefined) {
          const next = normalize(updates.priority);
          if (next) metadata.priority = next;
        }
        if (updates.title !== undefined) {
          const next = normalize(updates.title);
          if (next) metadata.title = next;
        }
        
        const response = await fetch(`/api/situations/${backendSit.id}/metadata`, {
          method: "PUT",
          headers: { 
            "Content-Type": "application/json",
            "X-API-Key": "changeme-key"
          },
          body: JSON.stringify({ metadata })
        });
        
        if (!response.ok) {
          throw new Error(`Failed to update situation: ${response.status}`);
        }
        
        // Refresh situations from backend
        await refreshSituations();
        console.log("Situation updated:", backendSit.id);
        
      } catch (error) {
        console.error("Error updating situation:", error);
        alert(`Ошибка обновления ситуации: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      // Локальная демо-ситуация
      setSituations((current) =>
        current.map((situation) =>
          situation.id === situationId
            ? {
                ...situation,
                ...updates,
                updated: "Synced just now",
              }
            : situation,
        ),
      );
    }
  };

  const handleDeleteSituation = async (situationId: number) => {
    // Находим соответствующую backend ситуацию
    const backendSitIndex = situationId - 1;
    if (backendSitIndex >= 0 && backendSitIndex < backendSituations.length) {
      const backendSit = backendSituations[backendSitIndex];
      
      if (!confirm(`Удалить ситуацию "${backendSit.type}"?`)) return;
      
      try {
        const response = await fetch(`/api/situations/${backendSit.id}`, {
          method: "DELETE",
          headers: { "X-API-Key": "changeme-key" }
        });
        
        if (response.ok || response.status === 204) {
          // Обновление произойдет автоматически через useEffect
          console.log("Situation deleted:", backendSit.id);
        } else {
          alert(`Ошибка удаления ситуации: ${response.status}`);
        }
      } catch (error) {
        console.error("Error deleting situation:", error);
        alert(`Ошибка удаления ситуации: ${error.message}`);
      }
    } else {
      // Локальная демо-ситуация
      setSituations((current) => current.filter((situation) => situation.id !== situationId));
      setAssignments((current) => {
        const next = { ...current };
        Object.entries(next).forEach(([unitId, assigned]) => {
          if (assigned === String(situationId)) {
            next[unitId] = null;
          }
        });
        return next;
      });
    }
  };

  // Real-time clock update
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Refresh units and players when a player is deleted elsewhere in the UI
  useEffect(() => {
    const handler = async (e: Event) => {
      try {
        console.log('player:deleted event received, refreshing units and players');
        await Promise.all([refreshUnits(), refreshPlayers()]);
      } catch (err) {
        console.warn('Error refreshing after player deletion:', err);
      }
    };

    window.addEventListener('player:deleted', handler as EventListener);
    return () => window.removeEventListener('player:deleted', handler as EventListener);
  }, [refreshUnits, refreshPlayers]);

  // Sync player coordinates from backend in real-time
  // DataContext уже загружает данные, здесь только периодическое обновление
  useEffect(() => {
    const id = setInterval(() => {
      refreshPlayers();
    }, 5000);
    return () => clearInterval(id);
  }, [refreshPlayers]);

  // Build assignments from units loaded by DataContext
  useEffect(() => {
    // Build assignments but try to map GUIDs to UI ids using currently-loaded backendSituations
    const guidToUiId: Record<string, string> = {};
    backendSituations.forEach((s, idx) => { guidToUiId[String(s.id)] = String(idx + 1); });
    const newAssignments: Record<string, string | null> = {};
    units.forEach(unit => {
      const sit = unit.situationId;
      if (!sit) {
        newAssignments[unit.id] = null;
      } else if (typeof sit === 'string' && guidToUiId[sit]) {
        newAssignments[unit.id] = guidToUiId[sit];
      } else if (!isNaN(Number(sit))) {
        newAssignments[unit.id] = String(sit);
      } else {
        newAssignments[unit.id] = null;
      }
    });
    setAssignments(newAssignments);
  }, [units, backendSituations]);

  // Периодическое обновление ситуаций (DataContext уже загружает при монтировании)
  useEffect(() => {
    const interval = setInterval(() => {
      refreshSituations();
    }, 5000);
    return () => clearInterval(interval);
  }, [refreshSituations]);

  // Периодическое обновление каналов (DataContext уже загружает при монтировании)
  useEffect(() => {
    const interval = setInterval(() => {
      refreshTacticalChannels();
    }, 10000);
    
    // Слушаем события обновления каналов
    const handleChannelsUpdate = () => {
      refreshTacticalChannels();
    };
    
    window.addEventListener('channels:updated', handleChannelsUpdate);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('channels:updated', handleChannelsUpdate);
    };
  }, [refreshTacticalChannels]);

  // Синхронизация assignments с backend ситуациями
  useEffect(() => {
    if (backendSituations.length === 0) return;
    
    // Конвертируем Guid ситуаций в UI id
    setAssignments(current => {
      const updated = { ...current };
      Object.keys(updated).forEach(unitId => {
        const situationGuid = updated[unitId];
        if (situationGuid && situationGuid.length > 10) { // Это Guid, а не число
          // Найти индекс ситуации
          const sitIndex = backendSituations.findIndex(s => s.id === situationGuid);
          if (sitIndex >= 0) {
            updated[unitId] = String(sitIndex + 1); // UI id = index + 1
          }
        }
      });
      return updated;
    });
  }, [backendSituations]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="relative isolate mx-auto flex w-full max-w-[1400px] flex-col gap-8 px-6 py-10 lg:px-10">
        <div className="absolute inset-0 -z-10 bg-radial-fade opacity-80" />
        
        {/* Header Section */}
        <section className="relative overflow-hidden rounded-[28px] border border-border/40 bg-card/80 shadow-panel backdrop-blur">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(34,216,255,0.25),transparent_55%),radial-gradient(circle_at_100%_100%,rgba(112,71,255,0.25),transparent_60%)] opacity-80" />
          <div className="relative flex flex-col gap-8 px-6 py-8 md:px-10 md:py-10">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="max-w-2xl space-y-4">
                <Badge
                  variant="outline"
                  className="border-primary/30 bg-primary/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-primary"
                >
                  Диспетчерская Сан-Андреас
                </Badge>
                <h1 className="text-3xl font-semibold leading-tight text-foreground md:text-4xl">
                  Командный центр реагирования для операций Grand Theft Auto: San Andreas
                </h1>
                <p className="text-base text-muted-foreground md:text-lg">
                  Отслеживайте каждый юнит, объединяйте картографические данные с тактическим статусом и координируйте поддержку на высокой скорости.
                </p>
              </div>
              <div className="flex flex-col items-end gap-3 text-right">
                <span className="text-xs uppercase tracking-[0.32em] text-muted-foreground">
                  Смена диспетчера
                </span>
                <span className="text-3xl font-semibold text-foreground">
                  {currentTime.toLocaleTimeString('ru-RU', { hour12: false })}
                </span>
                <span className="text-xs uppercase tracking-[0.32em] text-muted-foreground">
                  Время сервера
                </span>
              </div>
            </div>
            
            {/* Основные метрики */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                icon={<ShieldCheck className="h-5 w-5" />}
                label="Активные юниты"
                value={activeUnits}
                description={`${units.length} всего на смене`}
                accent="from-primary/25"
              />
              <SummaryCard
                icon={<AlertTriangle className="h-5 w-5" />}
                label="Критические ситуации"
                value={criticalSituations}
                description="Требуют немедленного внимания"
                accent="from-rose-400/30"
              />
              <SummaryCard
                icon={<Radio className="h-5 w-5" />}
                label="Активные ситуации"
                value={adaptedSituations.filter(s => s.status === "Active").length}
                description={`Всего: ${adaptedSituations.length}`}
                accent="from-emerald-400/25"
              />
              <SummaryCard
                icon={<Coffee className="h-5 w-5" />}
                label="Код 7"
                value={codeSeven}
                description="Юниты на обязательном перерыве"
                accent="from-amber-400/25"
              />
            </div>

            {/* Статус тактических каналов */}
            <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-3">
              {tacticalChannels.sort((a, b) => a.name.localeCompare(b.name)).map((channel) => (
                <SummaryCard
                  key={channel.id}
                  icon={<Radio className="h-5 w-5" />}
                  label={channel.name}
                  value={channel.isBusy ? "Занят" : "Свободен"}
                  description={channel.situationId ? `Ситуация: ${String(channel.situationId).substring(0, 8)}...` : "Доступен для назначения"}
                  accent={channel.isBusy ? "from-red-400/25" : "from-green-400/25"}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Main Tabs Section */}
        <Tabs defaultValue="situations" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="auth" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Авторизация
            </TabsTrigger>
            <TabsTrigger value="situations" className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Ситуации
            </TabsTrigger>
            <TabsTrigger value="management" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Управление
            </TabsTrigger>
          </TabsList>

          <TabsContent value="auth" className="space-y-6">
            <AuthPrototype />
          </TabsContent>

          <TabsContent value="situations" className="space-y-6">
            <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div>
                <OperationsMap
                  players={adaptedPlayers}
                  units={units}
                  assignments={assignments}
                  situations={situations}
                />
              </div>
              <div className="flex flex-col gap-6">
                <SituationsPanel
                  situations={adaptedSituations}
                  onStatusChange={handleSituationStatusChange}
                  onDeleteSituation={handleDeleteSituation}
                  onEditSituation={handleEditSituation}
                />
              </div>
            </section>

            <section>
              <AssignmentBoard
                units={units}
                situations={adaptedSituations}
                assignments={effectiveAssignments}
                onAssignmentChange={handleAssignmentChange}
              />
            </section>

            <section className="grid gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <UnitsManagement 
                assignments={assignments}
                setAssignments={setAssignments}
              />
              <SituationsPanel
                situations={adaptedSituations}
                onStatusChange={handleSituationStatusChange}
                onDeleteSituation={handleDeleteSituation}
                onEditSituation={handleEditSituation}
              />
            </section>
          </TabsContent>
          
          <TabsContent value="management">
          <ManagementDashboard
            situations={situations}
            setSituations={setSituations}
            assignments={assignments}
            setAssignments={setAssignments}
          />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  description: string;
  accent: string;
}

function SummaryCard({ icon, label, value, description, accent }: SummaryCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/40 bg-secondary/25 px-5 py-5 text-foreground transition duration-200 hover:border-primary/35 hover:shadow-glow">
      <div className={`absolute inset-0 bg-gradient-to-br ${accent} to-transparent opacity-60 transition group-hover:opacity-80`} />
      <div className="relative flex flex-col gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/40 bg-background/70 text-primary">
          {icon}
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
            {label}
          </p>
          <p className="text-3xl font-semibold">{value}</p>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
