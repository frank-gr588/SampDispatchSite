import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Fragment,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MessageSquare } from "lucide-react";

import type { UnitDto } from "@shared/api";
import type { SituationRecord } from "./SituationsPanel";

interface AssignmentBoardProps {
  units: UnitDto[];
  situations: SituationRecord[];
  assignments: Record<string, string | null>;
  onAssignmentChange: (unitId: string, situationId: string | null) => void;
}

type Connection = {
  id: string;
  path: string;
  gradientId: string;
};

const DRAG_DATA_TYPE = "application/x-dispatch-player";

export function AssignmentBoard({
  units,
  situations,
  assignments,
  onAssignmentChange,
}: AssignmentBoardProps) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const unitRefs = useRef(new Map<string, HTMLButtonElement>());
  const situationRefs = useRef(new Map<string, HTMLDivElement>());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoveredSituation, setHoveredSituation] = useState<string | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);

  const assignmentsBySituation = useMemo(() => {
    const grouped = new Map<string, UnitDto[]>();
    situations.forEach((situation) => {
      if (situation?.id) grouped.set(String(situation.id), []);
    });
    units.forEach((unit) => {
      // Prefer explicit assignment map, fall back to unit.situationId mapped via guidToUi
      const target = assignments[unit?.id];
      if (target == null) return;
      const bucket = grouped.get(target);
      if (!bucket) return;
      bucket.push(unit);
    });
    return grouped;
  }, [assignments, units, situations]);

  const handleDragStart = useCallback(
    (event: React.DragEvent<HTMLButtonElement>, unitId: string) => {
      event.dataTransfer.setData(DRAG_DATA_TYPE, unitId);
      event.dataTransfer.effectAllowed = "move";
      setDraggingId(unitId);
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setHoveredSituation(null);
  }, []);

  const assignUnit = useCallback(
    (unitId: string, situationId: string | null) => {
      onAssignmentChange(unitId, situationId);
    },
    [onAssignmentChange],
  );

  const handleDropOnSituation = useCallback(
    (event: React.DragEvent<HTMLDivElement>, situationId: string) => {
      event.preventDefault();
      const data = event.dataTransfer.getData(DRAG_DATA_TYPE);
      if (!data) return;
      assignUnit(data, situationId);
      setHoveredSituation(null);
    },
    [assignUnit],
  );

  const handleDropOnUnassigned = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const data = event.dataTransfer.getData(DRAG_DATA_TYPE);
      if (!data) return;
      assignUnit(data, null);
    },
    [assignUnit],
  );

  const setupUnitRef = useCallback(
    (unitId: string) => (node: HTMLButtonElement | null) => {
      if (!node) {
        unitRefs.current.delete(unitId);
        return;
      }
      unitRefs.current.set(unitId, node);
    },
    [],
  );

  const setupSituationRef = useCallback(
    (situationId: string) => (node: HTMLDivElement | null) => {
      if (!node) {
        situationRefs.current.delete(situationId);
        return;
      }
      situationRefs.current.set(situationId, node);
    },
    [],
  );

  const recomputeConnections = useCallback(() => {
    const boardEl = boardRef.current;
    if (!boardEl) {
      setConnections([]);
      return;
    }
    const boardRect = boardEl.getBoundingClientRect();
    const next: Connection[] = [];

    Object.entries(assignments).forEach(([unitId, situationIdValue]) => {
      if (situationIdValue == null) return;
      const unitEl = unitRefs.current.get(unitId);
      const situationEl = situationRefs.current.get(situationIdValue);
      if (!unitEl || !situationEl) return;

      const unitRect = unitEl.getBoundingClientRect();
      const situationRect = situationEl.getBoundingClientRect();

      const startX = unitRect.left + unitRect.width / 2 - boardRect.left;
      const startY = unitRect.top + unitRect.height / 2 - boardRect.top;
      const endX = situationRect.left + situationRect.width / 2 - boardRect.left;
      const endY = situationRect.top + 12 - boardRect.top;
      const controlX = (startX + endX) / 2;

      next.push({
        id: `${unitId}-${situationIdValue}`,
        gradientId: `gradient-${unitId}-${situationIdValue}`,
        path: `M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}`,
      });
    });

    setConnections(next);
  }, [assignments]);

  useLayoutEffect(() => {
    recomputeConnections();
  }, [assignments, recomputeConnections, units.length, situations.length]);

  useLayoutEffect(() => {
    if (!boardRef.current) return;
    const observer = new ResizeObserver(recomputeConnections);
    observer.observe(boardRef.current);
    const handleResize = () => recomputeConnections();
    window.addEventListener("resize", handleResize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [recomputeConnections]);

  const unassignedCount = useMemo(() => {
    return units.filter((unit) => assignments[unit.id] == null).length;
  }, [assignments, units]);

  const statusClass = (status?: string) => {
    switch (status) {
      case "Code 0":
        return "bg-red-600 text-white";
      case "Code 1":
        return "bg-orange-600 text-white";
      case "Code 2":
        return "bg-amber-400 text-amber-900";
      case "Code 3":
        return "bg-emerald-500 text-emerald-900";
      case "Code 4":
      case "Code 4 Adam":
        return "bg-green-500 text-white";
      case "Code 6":
        return "bg-sky-500 text-white";
      case "Code 7":
        return "bg-muted/20 text-muted-foreground";
      default:
        return "bg-secondary/20 text-primary";
    }
  };

  return (
    <div
      ref={boardRef}
      className="relative overflow-hidden rounded-[28px] border border-border/40 bg-card/85 shadow-panel backdrop-blur"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(34,216,255,0.16),transparent_60%),radial-gradient(circle_at_100%_100%,rgba(112,71,255,0.14),transparent_60%)]" />
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        {connections.map((connection) => (
          <Fragment key={connection.id}>
            <defs>
              <linearGradient
                id={connection.gradientId}
                gradientUnits="userSpaceOnUse"
                x1="0"
                x2="100"
                y1="0"
                y2="0"
              >
                <stop offset="0%" stopColor="rgba(34,216,255,0.25)" />
                <stop offset="100%" stopColor="rgba(112,71,255,0.35)" />
              </linearGradient>
            </defs>
            <path
              d={connection.path}
              stroke={`url(#${connection.gradientId})`}
              strokeWidth={1.8}
              strokeLinecap="round"
              fill="none"
              className="drop-shadow-[0_0_6px_rgba(34,216,255,0.2)]"
            />
          </Fragment>
        ))}
      </svg>
      <div className="relative grid gap-6 px-6 py-7 lg:grid-cols-[360px_1fr] lg:px-8 lg:py-9">
        <section className="space-y-5">
          <header className="flex flex-col gap-2">
            <p className="text-[0.6rem] uppercase tracking-[0.28em] text-muted-foreground">
              Дежурная часть
            </p>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">Доступные юниты</h2>
              <Badge
                variant="outline"
                className="border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-primary"
              >
                {unassignedCount} ожидают задание
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Drag a unit token onto a situation to commit them. Drop back into the hold area to release.
            </p>
          </header>
          <div className="flex flex-wrap gap-3">
            {units.map((unit, idx) => {
              const isAssigned = assignments[unit.id] != null;
              return (
                <button
                  key={unit.id}
                  type="button"
                  draggable
                  onDragStart={(event) => handleDragStart(event, unit.id)}
                  onDragEnd={handleDragEnd}
                  ref={setupUnitRef(unit.id)}
                  className={cn(
                    "group relative flex min-w-[140px] flex-col gap-2 rounded-2xl border border-border/40 bg-background/70 px-4 py-3 text-left shadow-sm transition hover:border-primary/40 hover:shadow-glow",
                    draggingId === unit.id && "opacity-70",
                    isAssigned && "border-primary/50 bg-primary/10",
                  )}
                >
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-full border border-border/50 text-sm font-semibold uppercase tracking-[0.06em]",
                        statusClass(unit.status)
                      )} title={`Unit ${idx + 1}`}>
                        {String(idx + 1)}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{unit.marking ?? "—"}</p>
                      </div>
                    </div>
                  <div className="flex items-center justify-between text-[0.65rem] text-muted-foreground">
                    <span>{unit.status ?? "—"}</span>
                    <span>{unit.playerCount ?? 0} чел.</span>
                  </div>
                  {isAssigned && (
                    <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[0.6rem] uppercase tracking-[0.24em] text-primary">
                      Linked to situation
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={handleDropOnUnassigned}
            className="flex min-h-[80px] items-center justify-center rounded-2xl border border-dashed border-border/40 bg-background/60 text-center text-xs text-muted-foreground"
          >
            Перетащите сюда для снятия назначения
          </div>
        </section>
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[0.6rem] uppercase tracking-[0.28em] text-muted-foreground">Ситуации</p>
              <h2 className="text-lg font-semibold">Активные инциденты</h2>
            </div>
            <Badge
              variant="outline"
              className="border-border/40 bg-background/70 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground"
            >
              Перетащите юниты на карточку инцидента
            </Badge>
          </div>
          <div className="space-y-4">
            {situations.map((situation) => {
              if (!situation?.id) return null;
              const situationIdStr = String(situation.id);
              const assigned = assignmentsBySituation.get(situationIdStr) ?? [];
              return (
                <div
                  key={situationIdStr}
                  ref={setupSituationRef(situationIdStr)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setHoveredSituation(situationIdStr);
                  }}
                  onDragLeave={() => {
                    setHoveredSituation((current) =>
                      current === situationIdStr ? null : current,
                    );
                  }}
                  onDrop={(event) => handleDropOnSituation(event, situationIdStr)}
                  className={cn(
                    "relative overflow-hidden rounded-2xl border border-border/40 bg-secondary/20 px-5 py-5 transition hover:border-primary/40 hover:bg-secondary/25",
                    hoveredSituation === situationIdStr && "border-primary/60 bg-secondary/30 shadow-glow",
                  )}
                >
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/0 via-primary/35 to-primary/0 opacity-0 transition group-hover:opacity-100" />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[0.6rem] uppercase tracking-[0.3em] text-muted-foreground">
                        {situation.code ?? "—"}
                      </p>
                      <h3 className="text-base font-semibold text-foreground">
                        {situation.title ?? "Без названия"}
                      </h3>
                    </div>
                    <div className="flex flex-col items-end gap-2 text-right">
                      <Badge
                        variant="outline"
                        className="border-transparent bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                      >
                        {situation.status ?? "—"}
                      </Badge>
                      <p className="text-[0.6rem] uppercase tracking-[0.24em] text-muted-foreground">
                        {situation.channel ?? "—"}
                      </p>
                    </div>
                  </div>
                  {situation.notes && (
                    <div className="mt-3 rounded-lg border border-border/30 bg-muted/20 px-3 py-2">
                      <div className="flex items-center gap-2 mb-1">
                        <MessageSquare className="w-3 h-3 text-muted-foreground/70" />
                        <span className="text-[0.58rem] uppercase tracking-[0.24em] text-muted-foreground/70">
                          Комментарий
                        </span>
                      </div>
                      <p className="text-xs text-foreground/90 whitespace-pre-wrap">{situation.notes}</p>
                    </div>
                  )}
                  <div className="mt-4 grid gap-4 text-xs text-muted-foreground sm:grid-cols-2">
                    <div>
                      <span className="block text-[0.58rem] uppercase tracking-[0.24em] text-muted-foreground/70">
                        Location
                      </span>
                      <span className="text-foreground/90">{situation.location}</span>
                    </div>
                    <div>
                      <span className="block text-[0.58rem] uppercase tracking-[0.24em] text-muted-foreground/70">
                        Lead unit
                      </span>
                      <span className="text-foreground/90">{situation.leadUnit}</span>
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl border border-border/30 bg-background/50 p-4">
                    <p className="text-[0.58rem] uppercase tracking-[0.24em] text-muted-foreground">
                      Assigned units
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {assigned.length === 0 && (
                        <span className="rounded-full border border-dashed border-border/50 px-3 py-1 text-[0.65rem] text-muted-foreground">
                          Drop units here
                        </span>
                      )}
                      {assigned.map((unit) => (
                        <div
                          key={unit.id}
                          className="group flex items-center gap-2 rounded-full border border-border/50 bg-background/70 px-3 py-1 text-[0.65rem] text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                        >
                          <span className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-full border border-border/50 text-[0.55rem] font-semibold uppercase tracking-[0.12em]",
                            statusClass(unit.status)
                          )} title={`Unit ${units.findIndex(u => u.id === unit.id) + 1}`}>
                            {String(units.findIndex(u => u.id === unit.id) + 1)}
                          </span>
                          <button
                            type="button"
                            onClick={() => assignUnit(unit.id, null)}
                            className="text-xs uppercase tracking-[0.24em] text-muted-foreground transition hover:text-primary"
                          >
                            Release
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
