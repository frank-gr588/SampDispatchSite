import { cn } from '@/lib/utils';
import * as React from 'react';
import type { PlayerPointDto, UnitDto, SituationDto } from '@shared/api';

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

export function OperationsMap({ players, units, situations }: OperationsMapProps) {
  const [scale, setScale] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const [dims, setDims] = React.useState({ w: 800, h: 600 });
  const [mapAspect, setMapAspect] = React.useState(1);
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

  const unitColor = (u: UnitDto) => {
    switch (u.status) {
      case 'Code 0': case 'Code 1': return { fill: '#ff2020', glow: '0 0 10px #ff2020' };
      case 'Code 3': return { fill: '#33ff66', glow: '0 0 8px #33ff66' };
      case 'Code 2': return { fill: '#ffaa00', glow: '0 0 6px #ffaa00' };
      default: return { fill: '#5a9a5a', glow: 'none' };
    }
  };

  const sitBorder = (s: SituationDto) => {
    const p = s.metadata?.priority;
    if (p === 'Critical') return '#ff2020';
    if (p === 'High') return '#ffaa00';
    return '#007a1f';
  };

  const transform = `scale(${scale}) translate(${offset.x / scale}px,${offset.y / scale}px)`;

  return (
    <div ref={ref} className="relative w-full h-full bg-[#010203] cursor-crosshair overflow-hidden"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      <div className="absolute inset-0 opacity-[0.06]" style={{
        backgroundImage: 'radial-gradient(circle, #33ff66 1px, transparent 1px)',
        backgroundSize: '28px 28px'
      }} />
      <div className="absolute inset-0" style={{
        transform,
        transformOrigin: 'center center'
      }}>
        <img src={saMap} className="w-full h-full object-contain opacity-80" alt="SA Map"
          style={{ filter: 'hue-rotate(85deg) saturate(0.4) brightness(0.85) contrast(1.1)' }} />
        {players.filter(p => p.x > -9000).map(p => {
          const { x, y } = worldToScreen(p.x, p.y);
          return <div key={p.nick} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: x, top: y }}>
            <div className={cn('w-[6px] h-[6px]', p.isAFK ? 'bg-[#ffaa00]' : 'bg-[#33ff66]')}
              style={{ boxShadow: p.isAFK ? '0 0 6px #ffaa00' : '0 0 6px #33ff66' }} />
            <span className="absolute left-[8px] top-[-4px] text-[10px] text-[#33ff66]/70 whitespace-nowrap font-mono">{p.nick}</span>
          </div>;
        })}
        {units.filter(u => u.x != null && u.y != null).map(u => {
          const { x, y } = worldToScreen(u.x!, u.y!);
          const c = unitColor(u);
          return (
            <div key={u.id} className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer group" style={{ left: x, top: y }}
              onClick={() => setSelUnit(u)}>
              <div className="w-[8px] h-[8px]" style={{ background: c.fill, boxShadow: c.glow }} />
              <span className="absolute left-[10px] top-[-5px] text-[10px] text-[#5a9a5a] group-hover:text-[#33ff66] whitespace-nowrap font-mono">
                {u.marking}
              </span>
            </div>
          );
        })}
        {(situations ?? []).filter(s => s.x != null && s.y != null).map(s => {
          const { x, y } = worldToScreen(s.x!, s.y!);
          const borderColor = sitBorder(s);
          return (
            <div key={s.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: x, top: y }}>
              <div className="w-[6px] h-[6px] border" style={{ borderColor, boxShadow: `0 0 8px ${borderColor}` }} />
              <span className="absolute left-[10px] top-[-4px] text-[10px] text-[#5a9a5a] whitespace-nowrap font-mono">
                {s.metadata?.title || s.type}
              </span>
            </div>
          );
        })}
      </div>
      <div className="absolute top-2 left-2 flex gap-1 z-10">
        {[{ l: '+', a: () => setScale(s => Math.min(10, s + 0.3)) }, { l: '\u2212', a: () => setScale(s => Math.max(0.5, s - 0.3)) }, { l: '\u2302', a: () => { setScale(1); setOffset({ x: 0, y: 0 }); } }].map(b => (
          <button key={b.l} onClick={b.a} className="w-[22px] h-[22px] flex items-center justify-center border border-[#003d10] bg-[#020304] text-[#5a9a5a] text-[11px] hover:text-[#33ff66] hover:border-[#33ff66]">{b.l}</button>
        ))}
      </div>
      <div className="absolute bottom-3 right-3 w-[36px] h-[36px] flex items-center justify-center border border-[#003d10] bg-[#020304]/80 text-[#33ff66] text-[11px] font-mono">N</div>
      {selUnit && (
        <div className="absolute top-2 right-2 z-10 border border-[#003d10] bg-[#060a0e] p-2 text-[10px] min-w-[140px]"
          onClick={() => setSelUnit(null)}>
          <div className="text-[#33ff66] text-[10px] mb-1">{'\u25b8'} {selUnit.marking}</div>
          <div className="text-[#5a9a5a]">STATUS: <span className="text-[#33ff66]">{selUnit.status}</span></div>
          <div className="text-[#5a9a5a]">CREW: <span className="text-[#33ff66]">{selUnit.playerCount}</span></div>
          <div className="text-[#5a9a5a] mt-1 text-[10px]">[CLICK TO DISMISS]</div>
        </div>
      )}
    </div>
  );
}
