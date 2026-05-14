import { cn, apiPost, apiPut } from "@/lib/utils";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PlayerPointDto, UnitDto, SituationDto } from "@shared/api";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/hooks/useDataQueries";

const saMap = '../../../sa_map.png';

export interface OperationsMapProps {
  players: PlayerPointDto[];
  units: UnitDto[];
  assignments?: Record<string, string | null>;
  situations?: SituationDto[];
  onAssignmentChange?: (unitId: string, situationId: string | null) => void;
}

const WORLD_MIN_X = -3000; const WORLD_MAX_X = 3000;
const WORLD_MIN_Y = -3000; const WORLD_MAX_Y = 3000;

const CODE_COLORS: Record<string, string> = {
  'Code 0': 'bg-red-600 text-white', 'Code 1': 'bg-orange-600 text-white',
  'Code 2': 'bg-yellow-500 text-black', 'Code 3': 'bg-blue-500 text-white',
  'Code 4': 'bg-emerald-500 text-white', 'Code 6': 'bg-violet-500 text-white',
  'Code 7': 'bg-slate-400 text-black',
};

function getSitType(s: SituationDto) { return s.metadata?.title || s.type || '?'; }
function getSitLoc(s: SituationDto) { return s.locationName || s.metadata?.location || ''; }
function getSitPriority(s: SituationDto): string { return s.metadata?.priority || 'Moderate'; }
function getSitStatus(s: SituationDto): string { return s.metadata?.status || (s.isActive ? 'Active' : 'Monitoring'); }
function getSitNotes(s: SituationDto) { return s.metadata?.notes || ''; }
function getPlayerStatusStr(p: PlayerPointDto) {
  switch(p.status) { case 0: return 'Off'; case 1: return 'On'; case 2: return 'Lead'; case 3: return 'Solo'; default: return '?'; }
}

export function OperationsMap({ players, units, assignments, situations, onAssignmentChange }: OperationsMapProps) {
  const qc = useQueryClient();
  const inv = () => { qc.invalidateQueries({ queryKey: qk.units }); qc.invalidateQueries({ queryKey: qk.situations }); };

  const [scale, setScale] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const [dims, setDims] = React.useState({ w: 800, h: 600 });
  const [mapAspect, setMapAspect] = React.useState(1);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [selSit, setSelSit] = React.useState<SituationDto | null>(null);
  const [selUnit, setSelUnit] = React.useState<UnitDto | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);
  const pan = React.useRef<any>(null);

  React.useEffect(() => {
    const img = new Image(); img.onload = () => setMapAspect(img.naturalWidth / img.naturalHeight); img.src = saMap;
  }, []);
  React.useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => { const r = el!.getBoundingClientRect(); setDims({ w: r.width, h: r.height }); });
    ro.observe(el); return () => ro.disconnect();
  }, []);
  React.useEffect(() => {
    const el = ref.current; if (!el) return;
    const h = (e: WheelEvent) => { e.preventDefault(); setScale(s => Math.max(0.5, Math.min(10, s + (e.deltaY > 0 ? -0.15 : 0.15)))); };
    el.addEventListener('wheel', h, { passive: false }); return () => el.removeEventListener('wheel', h);
  }, []);

  const screenToWorld = React.useCallback((sx: number, sy: number) => {
    const { w, h } = dims; if (!w || !h) return null;
    const ar = mapAspect; const ca = w / h;
    let dw: number, dh: number, ox = 0, oy = 0;
    if (ca >= ar) { dh = h; dw = h * ar; ox = (w - dw) / 2; } else { dw = w; dh = w / ar; oy = (h - dh) / 2; }
    const cx = w/2, cy = h/2;
    const ux = cx + (sx - offset.x - cx) / scale; const uy = cy + (sy - offset.y - cy) / scale;
    let u = (ux - ox) / dw, v = 1 - (uy - oy) / dh;
    return { x: WORLD_MIN_X + u * (WORLD_MAX_X - WORLD_MIN_X), y: WORLD_MIN_Y + v * (WORLD_MAX_Y - WORLD_MIN_Y) };
  }, [dims, scale, offset, mapAspect]);

  const worldToScreen = React.useCallback((wx: number, wy: number) => {
    const { w, h } = dims; if (!w || !h) return { x: 0, y: 0 };
    const ar = mapAspect; const ca = w / h;
    let dw: number, dh: number, ox = 0, oy = 0;
    if (ca >= ar) { dh = h; dw = h * ar; ox = (w - dw) / 2; } else { dw = w; dh = w / ar; oy = (h - dh) / 2; }
    const u = (wx - WORLD_MIN_X) / (WORLD_MAX_X - WORLD_MIN_X);
    const v = 1 - (wy - WORLD_MIN_Y) / (WORLD_MAX_Y - WORLD_MIN_Y);
    return { x: ox + u * dw, y: oy + v * dh };
  }, [dims, mapAspect]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pan.current = { on: true, sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pan.current?.on) return;
    setOffset({ x: pan.current.ox + e.clientX - pan.current.sx, y: pan.current.oy + e.clientY - pan.current.sy });
  };
  const onPointerUp = (e: React.PointerEvent) => { pan.current = null; (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); };

  const handleUnitStatus = async (u: UnitDto, st: string) => { await apiPut(`/api/units/${u.id}/status`, { status: st }); inv(); };
  const handleUnitAssign = async (u: UnitDto, sitId: string) => {
    await apiPut(`/api/units/${u.id}/status`, { status: 'Code 2' });
    await apiPost(`/api/situations/${sitId}/units/add`, { unitId: u.id, asLeadUnit: u.isLeadUnit }); inv();
  };
  const handleUnitDetach = async (u: UnitDto) => { await apiPut(`/api/units/${u.id}/situation`, { situationId: null }); inv(); };

  return (
    <div className={cn("relative flex flex-col border border-border/40 bg-card/80 rounded-[32px] overflow-hidden",
      fullscreen ? "fixed inset-0 z-[200]" : "h-[72vh] min-h-[360px]")}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/40 bg-secondary/25 shrink-0">
        <span className="text-xs uppercase tracking-widest text-muted-foreground">Тактическая карта</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setScale(s => Math.min(10, s + 0.3))}>+</Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setScale(s => Math.max(0.5, s - 0.3))}>−</Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }}>⌂</Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFullscreen(f => !f)}>{fullscreen ? '⤓' : '⤢'}</Button>
        </div>
      </div>
      {/* Map area */}
      <div ref={ref} className="flex-1 relative overflow-hidden bg-[#0a1628] cursor-crosshair"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        <div className="absolute inset-0" style={{ transform: `scale(${scale}) translate(${offset.x/scale}px,${offset.y/scale}px)`, transformOrigin: 'center center' }}>
          <img src={saMap} className="w-full h-full object-contain opacity-90" alt="SA Map" />
          {/* Player markers */}
          {players.filter(p => p.x > -9000).map(p => {
            const { x, y } = worldToScreen(p.x, p.y);
            return <div key={p.nick} className="absolute flex flex-col items-center -translate-x-1/2 -translate-y-1/2" style={{ left: x, top: y }}>
              <div className={cn("w-2.5 h-2.5 rounded-full border border-white/50", p.isAFK ? 'bg-amber-500' : 'bg-emerald-400')} />
              <span className="text-[9px] text-white/70 mt-0.5 whitespace-nowrap font-mono">{p.nick}</span>
            </div>;
          })}
          {/* Unit markers */}
          {units.filter(u => u.x != null && u.y != null).map(u => {
            const { x, y } = worldToScreen(u.x!, u.y!);
            const cls = CODE_COLORS[u.status] || 'bg-slate-500 text-white';
            return <div key={u.id} className={cn("absolute -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer border border-white/30", cls)}
              style={{ left: x, top: y }} onClick={() => setSelUnit(u)}>
              {u.marking}
            </div>;
          })}
        </div>
      </div>
    </div>
  );
}
