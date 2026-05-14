import { API_BASE, cn, apiPost, apiPut } from "@/lib/utils";
import * as React from "react";
import { Compass, MapPin, Grid3x3, Plus, Minus, RotateCcw, Maximize2, Minimize2, X, Radio, Users, AlertTriangle, CheckCircle, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useData } from "@/contexts/DataContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PlayerRecord } from "./PlayersTable";
import type { SituationRecord } from "./SituationsPanel";
import type { UnitDto } from "@shared/api";

const saMap = '../../../sa_map.png';

interface OperationsMapProps {
  players: PlayerRecord[];
  units: UnitDto[];
  assignments?: Record<string, string | null>;
  situations?: SituationRecord[];
}

const STATUS_MARKER_COLORS: Record<string, string> = {
  Pursuit: "bg-rose-400 text-rose-100",
  "Code 7": "bg-amber-300 text-amber-900",
  "Traffic Stop": "bg-amber-500 text-amber-50",
  Staged: "bg-sky-400 text-sky-950",
  "On Patrol": "bg-emerald-400 text-emerald-950",
  Unassigned: "bg-slate-400 text-slate-950",
  Recon: "bg-indigo-400 text-indigo-950",
  Support: "bg-cyan-400 text-cyan-950",
  911: "bg-rose-600 text-white",
};

// Human-friendly labels for legend entries (keys match STATUS_MARKER_COLORS)
const STATUS_LABELS: Record<string, string> = {
  Pursuit: 'Погоня',
  'Code 7': 'Code 7',
  'Traffic Stop': 'Остановка транспорта',
  Staged: 'Стадия ожидания',
  'On Patrol': 'Патруль',
  Unassigned: 'Не назначено',
  Recon: 'Разведка',
  Support: 'Поддержка',
  911: 'Вызов 911',
};

const HEAT_RING_STYLES: Record<string, string> = {
  Pursuit: "bg-rose-400/35",
  "Code 7": "bg-amber-400/35",
  "Traffic Stop": "bg-amber-300/25",
  Staged: "bg-sky-400/28",
  "On Patrol": "bg-emerald-400/28",
  Unassigned: "bg-muted/30",
  Recon: "bg-indigo-400/28",
  Support: "bg-cyan-400/28",
  911: "bg-rose-500/28",
};
// Границы мира SA-MP: углы карты соответствуют координатам примерно +/-3000
const WORLD_MIN_X = -3000;
const WORLD_MAX_X = 3000;
const WORLD_MIN_Y = -3000;
const WORLD_MAX_Y = 3000;

// Map image calibration (if map doesn't cover full image)
// Adjust these if the map appears shifted
const MAP_PADDING_LEFT = 0;   // pixels or percentage of padding on left
const MAP_PADDING_TOP = 0;    // pixels or percentage of padding on top
const MAP_PADDING_RIGHT = 0;  // pixels or percentage of padding on right
const MAP_PADDING_BOTTOM = 0; // pixels or percentage of padding on bottom

const UNIT_STATUSES = [
  { label: 'Code 0', value: 'Code 0', color: 'bg-red-600 text-white', hot: true },
  { label: 'Code 1', value: 'Code 1', color: 'bg-orange-500 text-white', hot: true },
  { label: 'Code 2', value: 'Code 2', color: 'bg-yellow-500 text-black', hot: false },
  { label: 'Code 3', value: 'Code 3', color: 'bg-blue-500 text-white', hot: false },
  { label: 'Code 4', value: 'Code 4', color: 'bg-emerald-500 text-white', hot: false },
  { label: 'Code 6', value: 'Code 6', color: 'bg-violet-500 text-white', hot: false },
  { label: 'Code 7', value: 'Code 7', color: 'bg-gray-400 text-black', hot: false },
];

const UNIT_MARKER_COLORS_BY_CODE: Record<string, string> = {
  '0': 'bg-red-600 text-white border-red-700',
  '1': 'bg-orange-600 text-white border-orange-700',
  '2': 'bg-yellow-500 text-black border-yellow-700',
  '3': 'bg-blue-500 text-white border-blue-700',
  '4': 'bg-emerald-500 text-white border-emerald-700',
  '6': 'bg-violet-500 text-white border-violet-700',
  '7': 'bg-slate-400 text-black border-slate-600',
};

const PRIORITY_LABELS: Record<string, string> = {
  Low: 'Низкий',
  Moderate: 'Средний',
  High: 'Высокий',
  Critical: 'Критический',
};

const SITUATION_STATUS_LABELS: Record<string, string> = {
  Active: 'Активна',
  Stabilizing: 'Стабилизация',
  Escalated: 'Эскалация',
  Monitoring: 'Мониторинг',
  Closed: 'Закрыта',
  Resolved: 'Решена',
};

export function OperationsMap({ players, units, assignments, situations }: OperationsMapProps) {
  const { refreshSituations, refreshUnits } = useData();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = React.useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [mapAspect, setMapAspect] = React.useState<number>(1);
  const [showDebugGrid, setShowDebugGrid] = React.useState(false);
  const [showCalibration, setShowCalibration] = React.useState(false);
  // Состояние для создания новой ситуации с ручной меткой
  const [isCreatingMarker, setIsCreatingMarker] = React.useState(false);
  const [newMarkerType, setNewMarkerType] = React.useState('Patrol');
  const [newMarkerNotes, setNewMarkerNotes] = React.useState('');
  const [pendingMarkerCoords, setPendingMarkerCoords] = React.useState<{ x: number; y: number } | null>(null);

  // Fullscreen
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  // Selected unit (911 Operator-style panel)
  const [selectedUnit, setSelectedUnit] = React.useState<UnitDto | null>(null);
  const [unitActionLoading, setUnitActionLoading] = React.useState(false);
  const [selectedSituation, setSelectedSituation] = React.useState<SituationRecord | null>(null);
  const [situationActionLoading, setSituationActionLoading] = React.useState(false);
  const [isRelocatingSituation, setIsRelocatingSituation] = React.useState(false);
  const [situationForm, setSituationForm] = React.useState({
    title: '',
    location: '',
    notes: '',
    priority: 'Low',
    status: 'Active',
  });

  const resolveBackendSituationId = React.useCallback((s: SituationRecord) => String(s.backendId ?? s.id), []);

  const openSituationPanel = React.useCallback((s: SituationRecord) => {
    setSelectedUnit(null);
    setSelectedSituation(s);
    setSituationForm({
      title: s.title ?? '',
      location: s.location ?? '',
      notes: s.notes ?? '',
      priority: s.priority ?? 'Low',
      status: s.status ?? 'Active',
    });
  }, []);

  React.useEffect(() => {
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        setMapAspect(image.naturalWidth / image.naturalHeight);
      }
    };
    image.src = saMap;
  }, []);

  // Close fullscreen on Escape
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isRelocatingSituation) {
          setIsRelocatingSituation(false);
          return;
        }
        if (selectedSituation) { setSelectedSituation(null); return; }
        if (selectedUnit) { setSelectedUnit(null); return; }
        if (isFullscreen) setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFullscreen, selectedUnit, selectedSituation, isRelocatingSituation]);

  const changeUnitStatus = async (unit: UnitDto, status: string) => {
    setUnitActionLoading(true);
    try {
      await apiPut(`/api/units/${unit.id}/status`, { status });
      await refreshUnits(true);
    } catch (e) {
      console.error('changeUnitStatus', e);
    } finally {
      setUnitActionLoading(false);
    }
  };

  const assignUnitToSituation = async (unit: UnitDto, situationId: string) => {
    setUnitActionLoading(true);
    try {
      await apiPost(`/api/situations/${situationId}/units/add`, { UnitId: unit.id, AsLeadUnit: unit.isLeadUnit });
      await refreshUnits(true);
      await refreshSituations(true);
    } catch (e) {
      console.error('assignUnitToSituation', e);
    } finally {
      setUnitActionLoading(false);
    }
  };

  const detachUnitFromSituation = async (unit: UnitDto) => {
    setUnitActionLoading(true);
    try {
      await apiPut(`/api/units/${unit.id}/situation`, { situationId: null });
      await refreshUnits(true);
      await refreshSituations(true);
    } catch (e) {
      console.error('detachUnitFromSituation', e);
    } finally {
      setUnitActionLoading(false);
    }
  };

  const saveSituationMetadata = async (s: SituationRecord) => {
    const situationId = resolveBackendSituationId(s);
    setSituationActionLoading(true);
    try {
      await apiPut(`/api/situations/${situationId}/metadata`, {
        metadata: {
          title: situationForm.title,
          location: situationForm.location,
          notes: situationForm.notes,
          priority: situationForm.priority,
          status: situationForm.status,
        }
      });
      await refreshSituations(true);
    } catch (e) {
      console.error('saveSituationMetadata', e);
    } finally {
      setSituationActionLoading(false);
    }
  };

  const setSituationStatus = async (s: SituationRecord, status: string) => {
    const situationId = resolveBackendSituationId(s);
    setSituationActionLoading(true);
    try {
      if (status === 'Monitoring') {
        await apiPost(`/api/situations/${situationId}/close`, { nick: 'system' });
      } else {
        await apiPost(`/api/situations/${situationId}/open`, {});
        await apiPut(`/api/situations/${situationId}/metadata`, { metadata: { status } });
      }
      setSituationForm(prev => ({ ...prev, status }));
      await refreshSituations(true);
      await refreshUnits(true);
    } catch (e) {
      console.error('setSituationStatus', e);
    } finally {
      setSituationActionLoading(false);
    }
  };

  const relocateSituation = async (s: SituationRecord, x: number, y: number) => {
    const situationId = resolveBackendSituationId(s);
    setSituationActionLoading(true);
    try {
      const locationName = situationForm.location?.trim() || s.location || 'Relocated';
      await apiPost(`/api/situations/${situationId}/location`, {
        location: locationName,
        x,
        y,
      });

      setSelectedSituation((prev) => {
        if (!prev) return prev;
        return resolveBackendSituationId(prev) === situationId
          ? { ...prev, x, y, location: locationName }
          : prev;
      });

      await refreshSituations(true);
    } catch (e) {
      console.error('relocateSituation', e);
    } finally {
      setSituationActionLoading(false);
      setIsRelocatingSituation(false);
    }
  };

  const addUnitToSituation = async (s: SituationRecord, unit: UnitDto) => {
    const situationId = resolveBackendSituationId(s);
    setSituationActionLoading(true);
    try {
      await apiPost(`/api/situations/${situationId}/units/add`, { UnitId: unit.id, AsLeadUnit: unit.isLeadUnit });
      await refreshUnits(true);
      await refreshSituations(true);
    } catch (e) {
      console.error('addUnitToSituation', e);
    } finally {
      setSituationActionLoading(false);
    }
  };

  const removeUnitFromSituation = async (s: SituationRecord, unit: UnitDto) => {
    const situationId = resolveBackendSituationId(s);
    setSituationActionLoading(true);
    try {
      await apiPost(`/api/situations/${situationId}/units/remove`, { UnitId: unit.id });
      await refreshUnits(true);
      await refreshSituations(true);
    } catch (e) {
      console.error('removeUnitFromSituation', e);
    } finally {
      setSituationActionLoading(false);
    }
  };

  // Small named-location lookup: map common location names to world coords.
  // Extend this list as needed. Keys are lower-cased for case-insensitive lookup.
  const NAMED_LOCATIONS: Record<string, { x: number; y: number }> = {
    downtown: { x: -1500, y: 1200 },
    docks: { x: 2000, y: -800 },
    airport: { x: 500, y: 1800 },
  };

  // View transform state (zoom/pan) and panning ref
  const [scale, setScale] = React.useState<number>(1);
  const [offset, setOffset] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const panRef = React.useRef<{ panning: boolean; startX: number; startY: number; startOffX: number; startOffY: number }>({
    panning: false,
    startX: 0,
    startY: 0,
    startOffX: 0,
    startOffY: 0,
  });

  /**
   * Try to decode a location field that may be:
   * - a pair of coordinates in a string like "123 -456"
   * - a named location (e.g. "Downtown")
   * - an object {x,y} or array [x,y]
   * Returns {x, y} numbers or null when cannot decode.
   */
  function decodeLocation(value: any): { x: number; y: number } | null {
    if (value == null) return null;
    // If already numeric pair
    if (typeof value === 'object' && value !== null && value.x !== undefined && value.y !== undefined) {
      const nx = Number(value.x);
      const ny = Number(value.y);
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
      return { x: nx, y: ny };
    }
    // If array [x,y]
    if (Array.isArray(value) && value.length >= 2) {
      const nx = Number(value[0]);
      const ny = Number(value[1]);
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
      return { x: nx, y: ny };
    }
    // If string like "123 -456" or "123,-456"
    if (typeof value === 'string') {
        const s = value.trim();
        // 1) Bracketed array like "[123, -456]" (or with semicolon/comma/space)
        const mBracket = s.match(/\[\s*(-?\d+(?:\.\d+)?)\s*[,;\s]+\s*(-?\d+(?:\.\d+)?)\s*\]/);
        if (mBracket) {
          const nx = Number(mBracket[1]);
          const ny = Number(mBracket[2]);
          if (Number.isFinite(nx) && Number.isFinite(ny)) return { x: nx, y: ny };
        }
        // 2) Exact pair like "123 -456" or "123,-456"
        const m = s.match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/m);
        if (m) {
          const nx = Number(m[1]);
          const ny = Number(m[2]);
          if (Number.isFinite(nx) && Number.isFinite(ny)) return { x: nx, y: ny };
        }
        // 3) Free-form text: extract first two numbers found anywhere (useful for logs/blocks)
        const allNums = s.match(/-?\d+(?:\.\d+)?/g);
        if (allNums && allNums.length >= 2) {
          const nx = Number(allNums[0]);
          const ny = Number(allNums[1]);
          if (Number.isFinite(nx) && Number.isFinite(ny)) return { x: nx, y: ny };
        }
            // 4) Named lookup (case-insensitive)
            const key = s.toLowerCase();
            if (NAMED_LOCATIONS[key]) return NAMED_LOCATIONS[key];
        }

        return null;
      }
  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

  const onWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    // This handler is used when attached as a React synthetic event (fallback).
    // Prefer the native listener with { passive: false } to avoid browser warnings.
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const next = clamp(scale + delta, 0.5, 10);
    setScale(next);
  };

  const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (isRelocatingSituation && selectedSituation) {
      const viewportEl = viewportRef.current;
      if (!viewportEl) return;

      const rect = viewportEl.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const relY = e.clientY - rect.top;

      const worldCoords = screenToMap(relX, relY);
      if (worldCoords) {
        void relocateSituation(selectedSituation, worldCoords.x, worldCoords.y);
      }
      return;
    }

    // Если в режиме создания метки - обработаем клик как выбор координаты
    if (isCreatingMarker) {
      const viewportEl = viewportRef.current;
      if (!viewportEl) return;
      
      const rect = viewportEl.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const relY = e.clientY - rect.top;
      
      const worldCoords = screenToMap(relX, relY);
      if (worldCoords) {
        setPendingMarkerCoords(worldCoords);
      }
      return;
    }
    
    // Иначе - обработаем как обычное перемещение
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panRef.current = { panning: true, startX: e.clientX, startY: e.clientY, startOffX: offset.x, startOffY: offset.y };
  };
  const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (isCreatingMarker) return; // Отключим панировку в режиме создания метки
    if (!panRef.current.panning) return;
    const dx = e.clientX - panRef.current.startX;
    const dy = e.clientY - panRef.current.startY;
    setOffset({ x: panRef.current.startOffX + dx, y: panRef.current.startOffY + dy });
  };
  const onPointerUp: React.PointerEventHandler<HTMLDivElement> = (e) => {
    panRef.current.panning = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const mapToScreen = React.useCallback(
    (wx: number, wy: number) => {
      const { w, h } = dims;
      if (w <= 0 || h <= 0) return { x: 0, y: 0, ready: false };

      const imgAspect = mapAspect;
      const containerAspect = w / h;
      let drawW: number;
      let drawH: number;
      let offX = 0;
      let offY = 0;

      if (containerAspect >= imgAspect) {
        // height-limited, horizontal letterbox
        drawH = h;
        drawW = h * imgAspect;
        offX = (w - drawW) / 2;
      } else {
        // width-limited, vertical letterbox
        drawW = w;
        drawH = w / imgAspect;
        offY = (h - drawH) / 2;
      }

      // Normalize world coordinates to 0-1 range
      const u = (wx - WORLD_MIN_X) / (WORLD_MAX_X - WORLD_MIN_X);
      const v = (wy - WORLD_MIN_Y) / (WORLD_MAX_Y - WORLD_MIN_Y);
      
      // Invert Y axis: SA-MP Y increases going north, but screen Y increases going down
      const vImg = 1 - v;

      // Apply padding/offset if map image has margins
      const usableW = drawW - MAP_PADDING_LEFT - MAP_PADDING_RIGHT;
      const usableH = drawH - MAP_PADDING_TOP - MAP_PADDING_BOTTOM;
      
      const sx = offX + MAP_PADDING_LEFT + u * usableW;
      const sy = offY + MAP_PADDING_TOP + vImg * usableH;
      
      // keep this function quiet in normal use; detailed logs for situations are emitted elsewhere
      
      return { x: sx, y: sy, ready: true };
    },
    [dims, mapAspect]
  );

  // Обратная функция: из экранных координат в мировые координаты
  const screenToMap = React.useCallback(
    (screenX: number, screenY: number) => {
      const { w, h } = dims;
      if (w <= 0 || h <= 0) return null;

      const imgAspect = mapAspect;
      const containerAspect = w / h;
      let drawW: number;
      let drawH: number;
      let offX = 0;
      let offY = 0;

      if (containerAspect >= imgAspect) {
        drawH = h;
        drawW = h * imgAspect;
        offX = (w - drawW) / 2;
      } else {
        drawW = w;
        drawH = w / imgAspect;
        offY = (h - drawH) / 2;
      }

      // Обратная трансформация: экран -> мир
      // transform-origin: center center, поэтому инвертируем через центр
      const cx = w / 2;
      const cy = h / 2;
      const unscaledX = cx + (screenX - offset.x - cx) / scale;
      const unscaledY = cy + (screenY - offset.y - cy) / scale;

      // Удаляем padding
      const usableW = drawW - MAP_PADDING_LEFT - MAP_PADDING_RIGHT;
      const usableH = drawH - MAP_PADDING_TOP - MAP_PADDING_BOTTOM;

      const relX = unscaledX - offX - MAP_PADDING_LEFT;
      const relY = unscaledY - offY - MAP_PADDING_TOP;

      // Нормализуем в 0-1 диапазон
      let u = relX / usableW;
      let v = relY / usableH;

      // Инвертируем Y
      v = 1 - v;

      // Трансформируем из 0-1 в мировые координаты
      const wx = WORLD_MIN_X + u * (WORLD_MAX_X - WORLD_MIN_X);
      const wy = WORLD_MIN_Y + v * (WORLD_MAX_Y - WORLD_MIN_Y);

      return { x: wx, y: wy };
    },
    [dims, scale, offset, mapAspect]
  );

  // Resize observer to measure available drawing area
  React.useEffect(() => {
    const el = viewportRef.current || containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setDims({ w: Math.max(0, rect.width), h: Math.max(0, rect.height) });
    });
    ro.observe(el);
    // initialize
    const rect = el.getBoundingClientRect();
    setDims({ w: Math.max(0, rect.width), h: Math.max(0, rect.height) });

    return () => ro.disconnect();
  }, []);

  // Native wheel listener to allow preventDefault (no passive warning)
  React.useEffect(() => {
    const el = viewportRef.current || containerRef.current;
    if (!el) return;
    const handler = (ev: WheelEvent) => {
      ev.preventDefault();
      const delta = ev.deltaY > 0 ? -0.1 : 0.1;
      const next = clamp(scale + delta, 0.5, 10);
      setScale(next);
    };
    el.addEventListener('wheel', handler as EventListener, { passive: false });
    return () => el.removeEventListener('wheel', handler as EventListener);
  }, [scale]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex flex-col overflow-hidden border border-border/40 bg-card/80 shadow-panel backdrop-blur transition-all duration-300",
        isFullscreen
          ? "fixed inset-0 z-[200] h-screen w-screen max-h-none rounded-none"
            : "h-[72vh] min-h-[360px] max-h-[880px] w-full rounded-[32px] z-[50]"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 bg-secondary/25 px-6 py-6 backdrop-blur-lg">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
            Тактический обзор
          </p>
          <h2 className="text-xl font-semibold text-foreground">
            Ситуации
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1 font-medium uppercase tracking-[0.2em] text-primary">
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-primary" />
            Онлайн-поток
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setScale((s) => Math.min(10, s + 0.5))}
              className="gap-1 text-xs"
              title="Приблизить карту"
            >
              <Plus className="h-3 w-3" />
            </Button>
            <span className="text-xs font-mono text-muted-foreground min-w-[48px] text-center">
              {(scale * 100).toFixed(0)}%
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setScale((s) => Math.max(0.5, s - 0.5))}
              className="gap-1 text-xs"
              title="Отдалить карту"
            >
              <Minus className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setScale(1);
                setOffset({ x: 0, y: 0 });
              }}
              className="gap-1 text-xs"
              title="Сброс вида"
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDebugGrid(!showDebugGrid)}
            className={cn(
              "gap-2 text-xs",
              showDebugGrid && "bg-yellow-500/20 border-yellow-500/50 text-yellow-300"
            )}
          >
            <Grid3x3 className="h-3 w-3" />
            {showDebugGrid ? "Скрыть сетку" : "Показать сетку"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (isCreatingMarker) {
                setIsCreatingMarker(false);
                setPendingMarkerCoords(null);
              } else {
                setIsRelocatingSituation(false);
                setIsCreatingMarker(true);
              }
            }}
            className={cn(
              "gap-2 text-xs",
              isCreatingMarker && "bg-rose-500/20 border-rose-500/50 text-rose-300"
            )}
          >
            <MapPin className="h-3 w-3" />
            {isCreatingMarker ? "Отмена" : "Добавить метку"}
          </Button>
          {isRelocatingSituation && (
            <Badge variant="destructive" className="px-2 py-1 text-[10px] uppercase tracking-[0.2em]">
              Перенос ситуации: кликните по карте
            </Badge>
          )}
          <Badge
            variant="outline"
            className="border-border/40 bg-background/60 px-3 py-1 font-mono text-[0.7rem] uppercase tracking-[0.24em] text-muted-foreground"
          >
            Обновлено {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFullscreen(f => !f)}
            className="gap-2 text-xs"
            title={isFullscreen ? "Свернуть карту" : "Развернуть карту"}
          >
            {isFullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </Button>
        </div>
      </div>
      <div
        className="relative flex-1 overflow-hidden touch-none select-none"
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={() => {
          if (isRelocatingSituation) return;
          if (selectedUnit) setSelectedUnit(null);
          if (selectedSituation) setSelectedSituation(null);
        }}
        style={{ userSelect: 'none', backgroundColor: '#b4cae6' }}
      >
        <div
          className="absolute inset-0"
        />
        <div
          className="absolute inset-0 flex items-center justify-center"
        >
          <div
            style={{ 
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: "center center",
              position: "relative",
              width: `${dims.w}px`,
              height: `${dims.h}px`
            }}
          >
            {/* Calculate map dimensions from mapToScreen */}
            {(() => {
              const topLeft = mapToScreen(WORLD_MIN_X, WORLD_MAX_Y);
              const bottomRight = mapToScreen(WORLD_MAX_X, WORLD_MIN_Y);
              
                      if (!topLeft.ready || !bottomRight.ready) {
                        // Not ready yet; render fallback image silently
                        return (
                          <img
                            src={saMap}
                            alt="San Andreas map (fallback)"
                            style={{
                              position: "absolute",
                              inset: 0,
                              width: "100%",
                              height: "100%",
                              objectFit: "contain",
                              opacity: 0.8
                            }}
                          />
                        );
                      }
              
              const mapWidth = bottomRight.x - topLeft.x;
              const mapHeight = bottomRight.y - topLeft.y;
              
              // Map box calculated (silent) — detailed diagnostics are emitted per-situation only
              
              return (
                <>
                  <img
                    src={saMap}
                    alt="San Andreas map"
                    style={{
                      position: "absolute",
                      left: `${topLeft.x}px`,
                      top: `${topLeft.y}px`,
                      width: `${mapWidth}px`,
                      height: `${mapHeight}px`,
                      opacity: 0.8,
                      // image left without explicit zIndex to avoid stacking surprises
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: `${topLeft.x}px`,
                      top: `${topLeft.y}px`,
                      width: `${mapWidth}px`,
                      height: `${mapHeight}px`,
                      opacity: 0.7,
                      backgroundImage:
                        "linear-gradient(to right, rgba(79, 112, 153, 0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(79, 112, 153, 0.15) 1px, transparent 1px)",
                      backgroundSize: "60px 60px",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: `${topLeft.x}px`,
                      top: `${topLeft.y}px`,
                      width: `${mapWidth}px`,
                      height: `${mapHeight}px`,
                      opacity: 0.5,
                      backgroundImage:
                        "linear-gradient(to right, rgba(34, 216, 255, 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(34, 216, 255, 0.08) 1px, transparent 1px)",
                      backgroundSize: "240px 240px",
                    }}
                  />
                  <svg
                    viewBox="0 0 100 100"
                    style={{
                      position: "absolute",
                      left: `${topLeft.x}px`,
                      top: `${topLeft.y}px`,
                      width: `${mapWidth}px`,
                      height: `${mapHeight}px`,
                      opacity: 0.2,
                      color: "rgb(148 163 184)"
                    }}
                    aria-hidden
                  >
                    <g fill="none" stroke="rgba(180, 210, 255, 0.22)" strokeWidth="0.4">
                      <path d="M6 20c6-7 12-10 22-11s24 6 30 14 12 10 20 9 15-6 20-14" />
                      <path d="M10 70c4-9 10-13 18-15s16 2 24 9 15 11 24 10 14-6 18-12" />
                      <path d="M40 12c2 7 4 13 3 22s-4 18-3 28 6 20 10 26" />
                    </g>
                    <g fill="rgba(34, 216, 255, 0.12)" stroke="rgba(34, 216, 255, 0.28)" strokeWidth="0.35">
                      <path d="M12 22c5-5 12-8 20-7 8 1 14 6 18 11s8 9 5 15-12 10-19 10-15-4-20-9-6-14-4-20Z" />
                      <path d="M60 12c6-3 12-5 19-3s14 6 18 12 3 14-3 18-17 8-25 6-12-10-15-16-2-14 6-17Z" />
                      <path d="M18 68c5-6 12-9 21-8s18 9 24 15 9 13 4 18-18 8-26 6-14-10-18-16-5-11-5-15Z" />
                    </g>
                  </svg>
                  
                  {/* Unit markers - only units, using server-computed unit coordinates */}
                  {units.map((unit) => {
                    const wx = typeof unit.x === 'number' ? unit.x : null;
                    const wy = typeof unit.y === 'number' ? unit.y : null;
                    if (wx == null || wy == null) return null;
                    if (wx === -10000 && wy === -10000) return null;

                    const pos = mapToScreen(wx, wy);
                    if (!pos.ready) return null;

                    const statusRaw = String(unit.status ?? '');
                    const statusStr = statusRaw.toLowerCase();
                    const codeMatch = statusStr.match(/code\s*([0-9]+)/i);
                    const codeNum = codeMatch?.[1];

                    const isCode0 = codeNum === '0';

                    let finalUnitColor = codeNum
                      ? (UNIT_MARKER_COLORS_BY_CODE[codeNum] ?? 'bg-cyan-500 text-white border-cyan-700')
                      : (unit.situationId ? 'bg-cyan-500 text-white border-cyan-700' : 'bg-emerald-400 text-emerald-950 border-emerald-700');

                    if (!codeNum && statusStr.includes('support')) {
                      finalUnitColor = 'bg-cyan-500 text-white border-cyan-700';
                    }

                    const keyId = `unit-${unit.id}`;
                    const isSelected = selectedUnit?.id === unit.id;

                    return (
                      <div
                        key={keyId}
                        className="absolute group"
                        style={{ left: `${pos.x}px`, top: `${pos.y}px`, transform: `translate(-50%, -50%) scale(${1 / scale})`, transformOrigin: 'center center', zIndex: 115, cursor: 'pointer' }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                        }}
                        onClick={(e) => { e.stopPropagation(); setSelectedUnit(isSelected ? null : unit); }}
                      >
                        {/* Selection ring */}
                        {isSelected && (
                          <div className="absolute -inset-3 rounded-full border-2 border-white/80 animate-pulse" />
                        )}
                        {/* Triangle via clip-path */}
                        <div
                          className={cn('w-5 h-5 rounded-none border-2 transition-transform', finalUnitColor, isCode0 ? 'animate-pulse' : '', isSelected ? 'scale-125' : 'group-hover:scale-110')}
                          style={{ clipPath: 'polygon(0% 0%, 100% 0%, 50% 100%)' }}
                        />
                        {/* Marking label */}
                        <div className={cn(
                          'absolute left-1/2 -translate-x-1/2 top-full mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap shadow',
                          finalUnitColor
                        )}>
                          {unit.marking}
                        </div>
                        {/* Hover tooltip (only when not selected) */}
                        {!isSelected && (
                          <div className="pointer-events-none absolute left-1/2 top-full mt-7 -translate-x-1/2 w-40 origin-top scale-95 rounded-2xl border border-border/40 bg-background/85 p-2 text-left text-xs text-foreground opacity-0 shadow-lg transition duration-150 group-hover:scale-100 group-hover:opacity-100">
                            <div className="font-semibold text-sm">{unit.marking}</div>
                            <div className="text-[11px] text-muted-foreground">{unit.status}</div>
                            <div className="mt-1 text-[11px]">Игроков: {unit.playerCount}</div>
                            <div className="mt-1 text-[10px] text-cyan-300">Нажмите для управления</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {(situations ?? []).map((situation) => {
                    const directX = typeof situation.x === 'number' && Number.isFinite(situation.x) ? situation.x : null;
                    const directY = typeof situation.y === 'number' && Number.isFinite(situation.y) ? situation.y : null;
                    const decodedCoords = directX != null && directY != null
                      ? { x: directX, y: directY }
                      : decodeLocation(situation.location) ?? decodeLocation(situation.notes);

                    if (!decodedCoords) return null;

                    const pos = mapToScreen(decodedCoords.x, decodedCoords.y);
                    if (!pos.ready) return null;

                    const descriptor = `${situation.code} ${situation.title} ${situation.status}`.toLowerCase();
                    let markerKey = 'Staged';
                    if (descriptor.includes('pursuit') || descriptor.includes('погон')) markerKey = 'Pursuit';
                    else if (descriptor.includes('code 7') || descriptor.includes('code7')) markerKey = 'Code 7';
                    else if (descriptor.includes('traffic') || descriptor.includes('трафик')) markerKey = 'Traffic Stop';
                    else if (descriptor.includes('911')) markerKey = '911';
                    else if (descriptor.includes('escalated')) markerKey = 'Support';

                    const markerColor = STATUS_MARKER_COLORS[markerKey] ?? 'bg-sky-400 text-sky-950';
                    const glowColor = HEAT_RING_STYLES[markerKey] ?? 'bg-sky-400/28';
                    const isHot = situation.status === 'Escalated' || markerKey === 'Pursuit' || markerKey === '911';
                    const isSituationSelected = !!selectedSituation && resolveBackendSituationId(selectedSituation) === resolveBackendSituationId(situation);

                    return (
                      <div
                        key={`situation-${situation.id}-${situation.code}`}
                        className="absolute group"
                        style={{
                          left: `${pos.x}px`,
                          top: `${pos.y}px`,
                          transform: `translate(-50%, -50%) scale(${1 / scale})`,
                          transformOrigin: 'center center',
                          zIndex: 180,
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          openSituationPanel(situation);
                        }}
                      >
                        <div className="absolute -inset-4 rounded-full" />
                        <div className={cn('absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full blur-md', glowColor, isHot ? 'animate-pulse' : '')} />
                        {isSituationSelected && (
                          <div className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-200/90 animate-pulse" />
                        )}
                        <div className={cn('relative rounded-full border-2 border-white/80 shadow-[0_0_0_1px_rgba(15,23,42,0.45)] transition-transform', markerColor, isSituationSelected ? 'h-5 w-5 scale-110' : 'h-4 w-4')} />
                        <div className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 w-44 origin-top scale-95 rounded-2xl border border-border/40 bg-background/85 p-2 text-left text-xs text-foreground opacity-0 shadow-lg transition duration-150 group-hover:scale-100 group-hover:opacity-100">
                          <div className="font-semibold text-sm">{situation.title}</div>
                          <div className="text-[11px] text-muted-foreground">{situation.code} · {situation.status}</div>
                          <div className="mt-1 text-[11px]">{situation.location || 'Без локации'}</div>
                          <div className="mt-1 text-[10px] text-cyan-200">Нажмите для редактирования</div>
                          <div className="mt-1 font-mono text-[11px] text-cyan-300">({decodedCoords.x.toFixed(0)}, {decodedCoords.y.toFixed(0)})</div>
                        </div>
                      </div>
                    );
                  })}
                </>
              );
            })()}
          
          {/* Debug Grid with Coordinates */}
          {showDebugGrid && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Info panel */}
            <div className="absolute bottom-4 left-4 bg-black/90 text-white text-[10px] font-mono p-3 rounded-lg border border-yellow-400/50 pointer-events-auto max-w-xs">
              <div className="font-bold text-yellow-400 mb-2">🗺️ MAP DEBUG INFO</div>
              <div className="mb-2">
                <div className="text-yellow-300">World Bounds:</div>
                <div>X: [{WORLD_MIN_X}, {WORLD_MAX_X}]</div>
                <div>Y: [{WORLD_MIN_Y}, {WORLD_MAX_Y}]</div>
              </div>
              <div className="mb-2">
                <div className="text-cyan-300">Image Padding:</div>
                <div>L:{MAP_PADDING_LEFT} T:{MAP_PADDING_TOP}</div>
                <div>R:{MAP_PADDING_RIGHT} B:{MAP_PADDING_BOTTOM}</div>
              </div>
              <div className="mb-2 text-gray-400">
                👤 {players.length} player(s) tracked
              </div>
              {players.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-700">
                  <div className="text-green-300">First Player:</div>
                  {players.map((p, idx) => {
                    if (idx > 0) return null;
                    const wx = (p as any).worldX;
                    const wy = (p as any).worldY;
                    if (wx === undefined) return null;
                    const pos = mapToScreen(wx, wy);
                    return (
                      <div key={p.id}>
                        <div>{p.nickname}</div>
                        <div>World: ({wx?.toFixed(1)}, {wy?.toFixed(1)})</div>
                        <div>Screen: ({pos.x?.toFixed(0)}, {pos.y?.toFixed(0)})</div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="mt-2 pt-2 border-t border-gray-700 text-[9px] text-gray-500">
                Calibrate in OperationsMap.tsx:
                <div>MAP_PADDING_* variables</div>
              </div>
            </div>
            
            {/* Vertical lines with X coordinates */}
            {[-3000, -2000, -1000, 0, 1000, 2000, 3000].map((worldX) => {
              const posTop = mapToScreen(worldX, WORLD_MAX_Y);
              const posBottom = mapToScreen(worldX, WORLD_MIN_Y);
              if (!posTop.ready || !posBottom.ready) return null;
              return (
                <div key={`vline-${worldX}`}>
                  <div
                    className="absolute border-l-2 border-yellow-400/40"
                    style={{ 
                      left: `${posTop.x}px`,
                      top: `${posTop.y}px`,
                      height: `${posBottom.y - posTop.y}px`
                    }}
                  />
                  <div
                    className="absolute bg-yellow-400/90 text-black text-[10px] font-mono px-1 rounded"
                    style={{ 
                      left: `${posTop.x}px`,
                      top: `${posTop.y + 8}px`,
                      transform: 'translateX(-50%)'
                    }}
                  >
                    X:{worldX}
                  </div>
                </div>
              );
            })}
            
            
            {/* Horizontal lines with Y coordinates */}
            {[-3000, -2000, -1000, 0, 1000, 2000, 3000].map((worldY) => {
              const posLeft = mapToScreen(WORLD_MIN_X, worldY);
              const posRight = mapToScreen(WORLD_MAX_X, worldY);
              if (!posLeft.ready || !posRight.ready) return null;
              return (
                <div key={`hline-${worldY}`}>
                  <div
                    className="absolute border-t-2 border-cyan-400/40"
                    style={{ 
                      left: `${posLeft.x}px`,
                      top: `${posLeft.y}px`,
                      width: `${posRight.x - posLeft.x}px`
                    }}
                  />
                  <div
                    className="absolute bg-cyan-400/90 text-black text-[10px] font-mono px-1 rounded"
                    style={{ 
                      left: `${posLeft.x + 8}px`,
                      top: `${posLeft.y}px`,
                      transform: 'translateY(-50%)'
                    }}
                  >
                    Y:{worldY}
                  </div>
                </div>
              );
            })}            {/* Center crosshair (0, 0) */}
            <div
              className="absolute w-4 h-4 border-2 border-red-500 rounded-full bg-red-500/30"
              style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
            >
              <div className="absolute left-6 top-0 bg-red-500 text-white text-[10px] font-mono px-1 rounded whitespace-nowrap">
                (0, 0)
              </div>
            </div>
            
            {/* Test markers for known SA locations */}
            {[
              { x: 1544.8, y: -1675.5, name: 'LSPD', color: 'bg-blue-500' },
              { x: 2495.0, y: -1687.0, name: 'Grove St', color: 'bg-green-500' },
              { x: 1479.0, y: -1748.0, name: 'City Hall', color: 'bg-purple-500' },
              { x: 0, y: 0, name: 'Blueberry', color: 'bg-orange-500' },
              // Add marker at player's exact location for comparison
              ...(players.length > 0 && (players[0] as any).worldX ? [{
                x: (players[0] as any).worldX,
                y: (players[0] as any).worldY,
                name: 'Player Pos',
                color: 'bg-yellow-500'
              }] : []),
            ].map((loc) => {
              const pos = mapToScreen(loc.x, loc.y);
              if (!pos.ready) return null;
              return (
                <div
                  key={loc.name}
                  className={`absolute w-3 h-3 border-2 border-white rounded-full ${loc.color}`}
                  style={{ 
                    left: `${pos.x}px`, 
                    top: `${pos.y}px`, 
                    transform: `translate(-50%, -50%) scale(${1 / scale})`,
                    transformOrigin: 'center center'
                  }}
                >
                  <div className="absolute left-4 top-0 bg-white text-black text-[9px] font-bold px-1 rounded whitespace-nowrap shadow-lg">
                    {loc.name}: ({loc.x}, {loc.y})
                  </div>
                </div>
              );
            })}
            
          </div>
          )}
          </div>
          {/* Relocation overlay – captures all pointer events above markers */}
          {isRelocatingSituation && selectedSituation && (
            <div
              className="absolute inset-0"
              style={{ zIndex: 400, cursor: 'crosshair', background: 'rgba(20,80,200,0.06)' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                const el = viewportRef.current;
                if (!el) return;
                const rect = el.getBoundingClientRect();
                const wc = screenToMap(e.clientX - rect.left, e.clientY - rect.top);
                if (wc) void relocateSituation(selectedSituation, wc.x, wc.y);
              }}
            >
              <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-md border border-amber-400/70 bg-amber-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-amber-100">
                Режим переноса активен — кликните новую точку
              </div>
              <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="h-8 w-8 rounded-full border-2 border-cyan-100/90 bg-cyan-400/20 shadow-[0_0_24px_rgba(56,189,248,0.55)]" />
              </div>
            </div>
          )}
        </div>
        </div>
      {/* ═══════════════════════════════════ SITUATION COMMAND PANEL ═══════════════════════════════════ */}
      {selectedSituation && (() => {
        const backendSituationId = resolveBackendSituationId(selectedSituation);
        const assignedUnits = units.filter(u => u.situationId === backendSituationId);
        const availableUnits = units.filter(u => !u.situationId || u.situationId === backendSituationId);

        return (
          <div className="absolute left-0 top-0 bottom-0 z-[260] pointer-events-auto flex w-80 flex-col gap-0 overflow-y-auto border-r border-border/40 bg-background/95 backdrop-blur-xl shadow-2xl"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/40 bg-secondary/30 px-4 py-3">
              <div className="font-bold text-base tracking-wide">{selectedSituation.code} · {selectedSituation.title}</div>
              <button onClick={() => { setSelectedSituation(null); setIsRelocatingSituation(false); }} className="rounded p-1 hover:bg-white/10 transition">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-4 py-3 border-b border-border/20 space-y-2">
              <Label className="text-xs">Заголовок</Label>
              <Input value={situationForm.title} onChange={(e) => setSituationForm(prev => ({ ...prev, title: e.target.value }))} />
              <Label className="text-xs">Локация</Label>
              <Input value={situationForm.location} onChange={(e) => setSituationForm(prev => ({ ...prev, location: e.target.value }))} />
              <Label className="text-xs">Приоритет</Label>
              <Select value={situationForm.priority} onValueChange={(v) => setSituationForm(prev => ({ ...prev, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Low">{PRIORITY_LABELS.Low}</SelectItem>
                  <SelectItem value="Moderate">{PRIORITY_LABELS.Moderate}</SelectItem>
                  <SelectItem value="High">{PRIORITY_LABELS.High}</SelectItem>
                  <SelectItem value="Critical">{PRIORITY_LABELS.Critical}</SelectItem>
                </SelectContent>
              </Select>
              <Label className="text-xs">Комментарий</Label>
              <textarea
                value={situationForm.notes}
                onChange={(e) => setSituationForm(prev => ({ ...prev, notes: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                rows={3}
              />
              <Button disabled={situationActionLoading} onClick={() => saveSituationMetadata(selectedSituation)} className="w-full">
                Сохранить характеристики
              </Button>
            </div>

            <div className="px-4 py-3 border-b border-border/20">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Статус ситуации</div>
              <div className="grid grid-cols-2 gap-2">
                {['Active', 'Stabilizing', 'Escalated', 'Monitoring'].map(st => (
                  <Button
                    key={st}
                    variant={situationForm.status === st ? 'default' : 'outline'}
                    disabled={situationActionLoading}
                    onClick={() => setSituationStatus(selectedSituation, st)}
                    className="text-xs"
                  >
                    {SITUATION_STATUS_LABELS[st] ?? st}
                  </Button>
                ))}
              </div>
            </div>

            <div className="px-4 py-3 border-b border-border/20">
              <Button
                variant={isRelocatingSituation ? 'destructive' : 'outline'}
                disabled={situationActionLoading}
                onClick={() => {
                  setIsCreatingMarker(false);
                  setIsRelocatingSituation(v => !v);
                }}
                className="w-full"
              >
                {isRelocatingSituation ? 'Отменить перенос' : 'Перенести на карте'}
              </Button>
              <div className="mt-2 text-[11px] text-muted-foreground">
                Координаты: {selectedSituation.x?.toFixed?.(1) ?? '—'}, {selectedSituation.y?.toFixed?.(1) ?? '—'}
              </div>
            </div>

            <div className="px-4 py-3 flex-1">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Прикреплённые юниты</div>
              <div className="space-y-2 mb-3">
                {assignedUnits.length === 0 ? (
                  <div className="text-xs text-muted-foreground">Нет прикреплённых юнитов</div>
                ) : assignedUnits.map(unit => (
                  <div key={unit.id} className="flex items-center gap-2 rounded border border-border/40 px-2 py-1.5 text-xs">
                    <span className="flex-1 font-semibold">{unit.marking}</span>
                    <Button size="sm" variant="destructive" disabled={situationActionLoading} onClick={() => removeUnitFromSituation(selectedSituation, unit)}>
                      Убрать
                    </Button>
                  </div>
                ))}
              </div>

              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Добавить юнит</div>
              <div className="space-y-2">
                {availableUnits.filter(unit => unit.situationId !== backendSituationId).map(unit => (
                  <div key={unit.id} className="flex items-center gap-2 rounded border border-border/40 px-2 py-1.5 text-xs">
                    <span className="flex-1 font-semibold">{unit.marking}</span>
                    <Button size="sm" disabled={situationActionLoading} onClick={() => addUnitToSituation(selectedSituation, unit)}>
                      Добавить
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══════════════════════════════════ UNIT COMMAND PANEL ═══════════════════════════════════ */}
      {selectedUnit && (() => {
        const u = units.find(x => x.id === selectedUnit.id) ?? selectedUnit;
        const activeSituations = (situations ?? []).filter(s => s.status !== 'Closed' && s.status !== 'Resolved');
        const currentSituation = u.situationId
          ? activeSituations.find(s => resolveBackendSituationId(s) === u.situationId)
          : null;
        return (
          <div className="absolute right-0 top-0 bottom-0 z-[260] pointer-events-auto flex w-72 flex-col gap-0 overflow-y-auto border-l border-border/40 bg-background/95 backdrop-blur-xl shadow-2xl"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/40 bg-secondary/30 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className={cn('h-3 w-3 rounded-full', /code\s*0/i.test(u.status ?? '') ? 'bg-red-500 animate-pulse' : 'bg-emerald-400')} />
                <span className="font-bold text-base tracking-wider">{u.marking}</span>
                {u.isLeadUnit && <span className="text-[10px] bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 rounded px-1">ВЕД.</span>}
              </div>
              <button onClick={() => setSelectedUnit(null)} className="rounded p-1 hover:bg-white/10 transition">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Info */}
            <div className="px-4 py-3 border-b border-border/20 space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                <span>Игроки: {u.playerNicks?.length > 0 ? u.playerNicks.join(', ') : '—'}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Radio className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-mono">{u.status || 'Нет статуса'}</span>
              </div>
              {u.situationId && (
                <div className="flex items-center gap-2 text-xs text-rose-300">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>На ситуации: {currentSituation?.title ?? u.situationId}</span>
                </div>
              )}
            </div>

            {/* Status buttons */}
            <div className="px-4 py-3 border-b border-border/20">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Статус</div>
              <div className="grid grid-cols-3 gap-1.5">
                {UNIT_STATUSES.map(st => (
                  <button
                    key={st.value}
                    disabled={unitActionLoading}
                    onClick={() => changeUnitStatus(u, st.value)}
                    className={cn(
                      'rounded-lg px-2 py-1.5 text-[11px] font-bold border transition hover:opacity-80 disabled:opacity-40',
                      st.color,
                      u.status?.startsWith(st.value) ? 'ring-2 ring-white/60' : 'opacity-70'
                    )}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Situation assign */}
            <div className="px-4 py-3 flex-1">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Назначить на ситуацию</div>
              {activeSituations.length === 0 ? (
                <p className="text-xs text-muted-foreground">Нет активных ситуаций</p>
              ) : (
                <div className="space-y-1.5">
                  {activeSituations.map(sit => (
                    <button
                      key={sit.id}
                      disabled={unitActionLoading || u.situationId === resolveBackendSituationId(sit)}
                      onClick={() => assignUnitToSituation(u, resolveBackendSituationId(sit))}
                      className={cn(
                        'w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition',
                        u.situationId === resolveBackendSituationId(sit)
                          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                          : 'border-border/40 bg-secondary/30 hover:bg-secondary/60 disabled:opacity-40'
                      )}
                    >
                      <Zap className="h-3 w-3 shrink-0" />
                      <span className="flex-1 truncate">{sit.title || sit.code || 'Ситуация'}</span>
                      {u.situationId === resolveBackendSituationId(sit) && <CheckCircle className="h-3 w-3 text-emerald-400" />}
                    </button>
                  ))}
                </div>
              )}
              {u.situationId && (
                <button
                  disabled={unitActionLoading}
                  onClick={() => detachUnitFromSituation(u)}
                  className="mt-3 w-full rounded-lg border border-rose-500/40 bg-rose-500/10 py-1.5 text-xs text-rose-300 hover:bg-rose-500/20 transition disabled:opacity-40"
                >
                  Снять с ситуации
                </button>
              )}
            </div>
          </div>
        );
      })()}

      <div className="flex flex-wrap items-center gap-4 border-t border-border/40 bg-secondary/20 px-6 py-4 text-[0.7rem] text-muted-foreground">
        <div className="flex items-center gap-2 text-foreground">
          <Compass className="h-4 w-4" />
          <span className="uppercase tracking-[0.26em]">Легенда</span>
        </div>
          <div className="flex flex-wrap gap-3">
          {Object.entries(STATUS_MARKER_COLORS).map(([status, color]) => (
            <div key={status} className="flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-full", color)} />
              <span className="text-muted-foreground">{STATUS_LABELS[status] ?? status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Диалог для создания новой ситуации с ручной меткой */}
      <Dialog open={pendingMarkerCoords !== null} onOpenChange={(open) => {
        if (!open) {
          setPendingMarkerCoords(null);
          setNewMarkerType('Patrol');
          setNewMarkerNotes('');
        }
      }}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Создать новую ситуацию</DialogTitle>
            <DialogDescription>
              Добавьте ситуацию с координатами [{pendingMarkerCoords?.x.toFixed(0)}, {pendingMarkerCoords?.y.toFixed(0)}]
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="marker-type">Тип ситуации</Label>
              <Select value={newMarkerType} onValueChange={setNewMarkerType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pursuit">Погоня</SelectItem>
                  <SelectItem value="Code 7">Code 7</SelectItem>
                  <SelectItem value="Traffic Stop">Остановка</SelectItem>
                  <SelectItem value="Patrol">Патруль</SelectItem>
                  <SelectItem value="Support">Поддержка</SelectItem>
                  <SelectItem value="Recon">Разведка</SelectItem>
                  <SelectItem value="911">911</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="marker-notes">Комментарий</Label>
              <textarea
                id="marker-notes"
                value={newMarkerNotes}
                onChange={(e) => setNewMarkerNotes(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                rows={3}
                placeholder="Добавьте комментарий..."
              />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div>
                <span className="block font-mono">X: {pendingMarkerCoords?.x.toFixed(1)}</span>
              </div>
              <div>
                <span className="block font-mono">Y: {pendingMarkerCoords?.y.toFixed(1)}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setPendingMarkerCoords(null);
              setNewMarkerType('Patrol');
              setNewMarkerNotes('');
            }}>
              Отмена
            </Button>
            <Button onClick={async () => {
              if (!pendingMarkerCoords) return;
              
              try {
                  await apiPost('/api/situations/create', {
                  type: newMarkerType,
                  metadata: {
                    x: pendingMarkerCoords.x.toFixed(1),
                    y: pendingMarkerCoords.y.toFixed(1),
                    notes: newMarkerNotes,
                  }
                });
                
                // Reset
                setPendingMarkerCoords(null);
                setIsCreatingMarker(false);
                setNewMarkerType('Patrol');
                setNewMarkerNotes('');
                
                await refreshSituations();
              } catch (err) {
                console.error('Failed to create situation:', err);
              }
            }}>
              Создать ситуацию
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
