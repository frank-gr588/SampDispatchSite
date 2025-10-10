import { API_BASE, cn } from "@/lib/utils";
import * as React from "react";
import { Compass, MapPin, Grid3x3, Plus, Minus, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PlayerRecord } from "./PlayersTable";
import type { SituationRecord } from "./SituationsPanel";
import type { UnitDto } from "@shared/api";

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
};

// San Andreas map bounds
// Try adjusting these if markers appear off the map
// Common ranges: [-3000, 3000] or [-6000, 6000]
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

export function OperationsMap({ players, units, assignments, situations }: OperationsMapProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = React.useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [showDebugGrid, setShowDebugGrid] = React.useState(true);
  const [showCalibration, setShowCalibration] = React.useState(false);

  // zoom & pan state
  const [scale, setScale] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const panRef = React.useRef<{ panning: boolean; startX: number; startY: number; startOffX: number; startOffY: number }>({ panning: false, startX: 0, startY: 0, startOffX: 0, startOffY: 0 });

  React.useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) {
        const cr = e.contentRect;
        setDims({ w: cr.width, h: cr.height });
      }
    });
    obs.observe(el);
    setDims({ w: el.clientWidth, h: el.clientHeight });
    return () => obs.disconnect();
  }, []);

  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

  const onWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const next = clamp(scale + delta, 0.5, 10);
    setScale(next);
  };

  const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panRef.current = { panning: true, startX: e.clientX, startY: e.clientY, startOffX: offset.x, startOffY: offset.y };
  };
  const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
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

      const imgAspect = 1; // square image
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
      
      // Debug logging (remove in production)
      if (Math.random() < 0.01) { // Log 1% of calls to avoid spam
        console.log(`[Map] World: (${wx.toFixed(1)}, ${wy.toFixed(1)}) → Normalized: (${u.toFixed(3)}, ${v.toFixed(3)}) → Screen: (${sx.toFixed(0)}, ${sy.toFixed(0)})`);
      }
      
      return { x: sx, y: sy, ready: true };
    },
    [dims]
  );

  return (
    <div ref={containerRef} className="relative aspect-square flex flex-col overflow-hidden rounded-[32px] border border-border/40 bg-card/80 shadow-panel backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 bg-secondary/25 px-6 py-6 backdrop-blur-lg">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
            Tactical overview
          </p>
          <h2 className="text-xl font-semibold text-foreground">
            Ситуации
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1 font-medium uppercase tracking-[0.2em] text-primary">
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-primary" />
            Realtime feed
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
          <Badge
            variant="outline"
            className="border-border/40 bg-background/60 px-3 py-1 font-mono text-[0.7rem] uppercase tracking-[0.24em] text-muted-foreground"
          >
            Updated {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Badge>
        </div>
      </div>
      <div
        className="relative flex-1 overflow-hidden touch-none select-none"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ userSelect: 'none' }}
      >
        <div
          className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(34,216,255,0.24),transparent_55%),radial-gradient(circle_at_82%_72%,rgba(112,71,255,0.22),transparent_60%)]"
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
                console.warn('⚠️ Map not ready, dims:', dims, 'topLeft:', topLeft, 'bottomRight:', bottomRight);
                // Fallback: render map with object-contain like before
                return (
                  <img
                    src={`${API_BASE}/sa_map.png`}
                    alt="San Andreas map (fallback)"
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      opacity: 0.8
                    }}
                    onLoad={() => console.log('✅ Map image loaded (fallback mode)')}
                    onError={(e) => console.error('❌ Map image failed to load:', e)}
                  />
                );
              }
              
              const mapWidth = bottomRight.x - topLeft.x;
              const mapHeight = bottomRight.y - topLeft.y;
              
              console.log('📐 Map box:', { 
                topLeft: `(${topLeft.x.toFixed(1)}, ${topLeft.y.toFixed(1)})`,
                bottomRight: `(${bottomRight.x.toFixed(1)}, ${bottomRight.y.toFixed(1)})`,
                size: `${mapWidth.toFixed(1)}x${mapHeight.toFixed(1)}`
              });
              
              return (
                <>
                  <img
                    src={`${API_BASE}/sa_map.png`}
                    alt="San Andreas map"
                    style={{
                      position: "absolute",
                      left: `${topLeft.x}px`,
                      top: `${topLeft.y}px`,
                      width: `${mapWidth}px`,
                      height: `${mapHeight}px`,
                      opacity: 0.8
                    }}
                    onLoad={() => console.log('✅ Map image loaded')}
                    onError={(e) => console.error('❌ Map image failed to load:', e)}
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
                  
                  {/* Player markers - inside same IIFE to share topLeft/bottomRight */}
                  {players.map((player) => {
                    const situationId = assignments?.[String(player.id)] ?? null;
                    const situation = situationId
                      ? situations?.find((item) => item.id === Number(situationId))
                      : undefined;

                    const hasWorld = (player as any).worldX !== undefined && (player as any).worldY !== undefined;
                    if (!hasWorld) return null; // Skip players without world coords
                    
                    const wx = (player as any).worldX;
                    const wy = (player as any).worldY;
                    const pos = mapToScreen(wx, wy);
                    if (!pos.ready) return null;

                    return (
                      <div
                        key={player.id}
                        className="absolute group"
                        style={{ 
                          left: `${pos.x}px`, 
                          top: `${pos.y}px`,
                          transform: `scale(${1 / scale})`,
                          transformOrigin: 'center center',
                          zIndex: 100 
                        }}
                      >
                        {/* Glow effect */}
                        <span
                          className={cn(
                            "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full blur-md transition duration-200 group-hover:scale-125 -z-10",
                            situation ? "bg-primary/25" : HEAT_RING_STYLES[player.status] ?? "bg-primary/20",
                          )}
                        />
                        {/* Main marker - much smaller */}
                        <span
                          className={cn(
                            "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-full border border-white/40 shadow-lg transition group-hover:scale-125",
                            STATUS_MARKER_COLORS[player.status] ?? "bg-primary text-primary-foreground",
                            situation && "border-primary/60 ring-2 ring-primary/50",
                            (player as any).isAFK && "opacity-50 grayscale",
                          )}
                        >
                          <MapPin className="h-2.5 w-2.5" />
                        </span>
                        {/* AFK Badge */}
                        {(player as any).isAFK && (
                          <span className="absolute -top-1 -right-1 bg-yellow-500 text-yellow-900 text-[8px] font-bold px-1 rounded-sm border border-yellow-600">
                            AFK
                          </span>
                        )}
                        {/* Tooltip */}
                        <div className="pointer-events-none absolute left-1/2 top-full mt-3 -translate-x-1/2 w-44 origin-top scale-95 rounded-2xl border border-border/40 bg-background/85 p-3 text-left text-xs text-foreground opacity-0 shadow-lg transition duration-200 group-hover:scale-100 group-hover:opacity-100">
                            <p className="text-sm font-semibold text-foreground mb-2">
                              {player.nickname}
                            </p>
                            <div className="mt-3 flex flex-col gap-1 text-[0.65rem] text-muted-foreground/80">
                              <span className="flex items-center justify-between">
                                <span>Status</span>
                                <span className="flex items-center gap-1">
                                  {player.status}
                                  {(player as any).isAFK && (
                                    <span className="text-yellow-400 text-[9px] font-semibold">AFK</span>
                                  )}
                                </span>
                              </span>
                              {hasWorld && (
                                <span className="flex items-center justify-between font-mono text-yellow-400">
                                  <span>Coords</span>
                                  <span>
                                    ({((player as any).worldX).toFixed(1)}, {((player as any).worldY).toFixed(1)})
                                  </span>
                                </span>
                              )}
                              <span className="flex items-center justify-between">
                                <span>Last update</span>
                                <span>{player.lastUpdate}</span>
                              </span>
                              {situation && (
                                <span className="flex items-center justify-between text-primary">
                                  <span>Tasked</span>
                                  <span>{situation.code}</span>
                                </span>
                              )}
                            </div>
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
        </div>
        </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-border/40 bg-secondary/20 px-6 py-4 text-[0.7rem] text-muted-foreground">
        <div className="flex items-center gap-2 text-foreground">
          <Compass className="h-4 w-4" />
          <span className="uppercase tracking-[0.26em]">Legend</span>
        </div>
        <div className="flex flex-wrap gap-3">
          {Object.entries(STATUS_MARKER_COLORS).map(([status, color]) => (
            <div key={status} className="flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-full", color)} />
              <span className="text-muted-foreground">{status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
