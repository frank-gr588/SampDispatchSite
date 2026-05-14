import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { useData } from "@/contexts/DataContext";
import { Trash2, Edit, MessageSquare } from "lucide-react";

export type SituationPriority = "Low" | "Moderate" | "High" | "Critical";

export interface SituationRecord {
  id: number;
  backendId?: string;
  code: string;
  title: string;
  status: string;
  location: string;
  x?: number;
  y?: number;
  leadUnit: string;
  greenUnitId?: string;  // Green Unit (Инициатор)
  redUnitId?: string;    // Red Unit (Командир)
  units?: string[];      // Все юниты на ситуации
  unitsAssigned: number;
  channel: string;
  priority: SituationPriority;
  updated: string;
  notes?: string;
}

const STATUS_STYLES: Record<string, string> = {
  Active: "bg-emerald-500/15 text-emerald-200 border-emerald-500/45",
  Stabilizing: "bg-sky-500/15 text-sky-200 border-sky-500/40",
  Escalated: "bg-rose-500/18 text-rose-200 border-rose-500/50",
  Monitoring: "bg-muted/30 text-muted-foreground border-border/40",
};

const PRIORITY_STYLES: Record<SituationPriority, string> = {
  Low: "bg-emerald-500/12 text-emerald-200 border-emerald-500/30",
  Moderate: "bg-amber-500/12 text-amber-200 border-amber-500/30",
  High: "bg-orange-500/15 text-orange-200 border-orange-500/35",
  Critical: "bg-rose-500/18 text-rose-200 border-rose-500/45",
};

export const SITUATION_STATUS_OPTIONS = [
  { value: 'Active', label: 'Активна' },
  { value: 'Stabilizing', label: 'Стабилизация' },
  { value: 'Escalated', label: 'Эскалировано' },
  { value: 'Monitoring', label: 'Мониторинг' },
];

const PRIORITY_LABELS: Record<string, string> = {
  Low: 'Низкий',
  Moderate: 'Средний',
  High: 'Высокий',
  Critical: 'Критический',
};

interface SituationsPanelProps {
  situations: SituationRecord[];
  onStatusChange?: (situationId: number, status: string) => void;
  onDeleteSituation?: (situationId: number) => void;
  onEditSituation?: (situationId: number, updates: Partial<SituationRecord>) => void;
}

export function SituationsPanel({ situations, onStatusChange, onDeleteSituation, onEditSituation }: SituationsPanelProps) {
  const { tacticalChannels } = useData();
  const [editingSituation, setEditingSituation] = useState<SituationRecord | null>(null);
  const [editForm, setEditForm] = useState<Partial<SituationRecord>>({});

  const handleEditClick = (situation: SituationRecord) => {
    if (!situation) return;
    setEditingSituation(situation);
    setEditForm({
      code: situation.code ?? "",
      title: situation.title ?? "",
      location: situation.location ?? "",
      x: situation.x ?? undefined,
      y: situation.y ?? undefined,
      leadUnit: situation.leadUnit ?? "",
      channel: situation.channel ?? "",
      notes: situation.notes ?? "",
      priority: situation.priority ?? "Moderate",
    });
  };

  const handleSaveEdit = () => {
    if (editingSituation && onEditSituation) {
      onEditSituation(editingSituation.id, editForm);
      setEditingSituation(null);
      setEditForm({});
    }
  };

  return (
    <>
    <div className="rounded-[28px] border border-border/40 bg-card/80 shadow-panel backdrop-blur">
      <div className="flex items-center justify-between gap-3 border-b border-border/40 px-6 py-6">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.28em] text-muted-foreground">
            Ситуации
          </p>
          <h2 className="text-xl font-semibold text-foreground">Тактический обзор</h2>
        </div>
        <Badge
          variant="outline"
          className="border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-primary"
        >
          {situations.length} активных
        </Badge>
      </div>
      <div className="space-y-4 px-6 py-5">
        {situations.map((situation) => (
          <div
            key={situation.id}
            className="relative flex flex-col gap-4 rounded-2xl border border-border/40 bg-secondary/20 px-5 py-5 transition hover:border-primary/40 hover:bg-secondary/25"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[0.58rem] uppercase tracking-[0.3em] text-muted-foreground">
                  {situation.code}
                </p>
                <h3 className="text-base font-semibold text-foreground">
                  {situation.title}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={situation.status}
                  onValueChange={(value) => onStatusChange?.(situation.id, value)}
                >
                  <SelectTrigger className="h-10 w-[150px] border-border/40 bg-background/70 text-xs uppercase tracking-[0.22em]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card/95 text-foreground">
                    {SITUATION_STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Badge
                  variant="outline"
                  className={cn(
                    "border-transparent px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em]",
                    PRIORITY_STYLES[situation.priority] ?? "bg-muted/30 text-muted-foreground border-border/40",
                  )}
                >
                  {situation.priority}
                </Badge>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => handleEditClick(situation)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="grid gap-4 text-xs text-muted-foreground sm:grid-cols-2">
              <div>
                <span className="block text-[0.58rem] uppercase tracking-[0.24em] text-muted-foreground/70">
                  Местоположение
                </span>
                <span className="text-foreground/90">{situation?.location ?? "—"}</span>
              </div>
              <div>
                <span className="block text-[0.58rem] uppercase tracking-[0.24em] text-muted-foreground/70">
                  Канал
                </span>
                <span className="text-foreground/90">{situation?.channel ?? "—"}</span>
              </div>
            </div>
            
            {/* Green Unit (Инициатор) и Red Unit (Командир) */}
            <div className="grid gap-3 text-xs mt-2">
                  {situation?.greenUnitId && (
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="shrink-0 border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.18em] text-emerald-200"
                  >
                    🟢 Инициатор
                  </Badge>
                  <span className="text-foreground/90">{situation.greenUnitId}</span>
                  <span className="text-muted-foreground/60 text-[0.65rem]">(Инициатор)</span>
                </div>
              )}
              {situation?.redUnitId && (
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="shrink-0 border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.18em] text-rose-200"
                  >
                    🔴 Командир
                  </Badge>
                  <span className="text-foreground/90">{situation.redUnitId}</span>
                  <span className="text-muted-foreground/60 text-[0.65rem]">(Командир)</span>
                </div>
              )}
              {situation?.units && situation.units.length > 0 && (
                <div className="flex items-start gap-2">
                  <Badge
                    variant="outline"
                    className="shrink-0 border-border/40 bg-muted/20 px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.18em] text-muted-foreground"
                  >
                    ⚪ Юниты
                  </Badge>
                  <div className="flex flex-wrap gap-1.5">
                    {situation.units
                      .filter(u => u !== situation.greenUnitId && u !== situation.redUnitId)
                      .map((unit, idx) => (
                        <span key={idx} className="text-foreground/90">
                          {unit}{idx < situation.units!.filter(u => u !== situation.greenUnitId && u !== situation.redUnitId).length - 1 ? ',' : ''}
                        </span>
                      ))}
                    {situation.units.filter(u => u !== situation.greenUnitId && u !== situation.redUnitId).length === 0 && (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[0.58rem] uppercase tracking-[0.24em] text-muted-foreground/70">
                  Всего юнитов:
                </span>
                <span className="text-foreground/90 font-semibold">{situation?.unitsAssigned ?? 0}</span>
              </div>
            </div>
            {situation?.notes && (
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
              <div className="flex flex-wrap items-center justify-between gap-3 text-[0.65rem] text-muted-foreground">
              <span className="font-mono uppercase tracking-[0.24em]">
                {situation?.updated ?? "—"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => situation?.id && onDeleteSituation?.(situation.id)}
                className="gap-2 text-muted-foreground/80 hover:text-rose-200"
              >
                <Trash2 className="h-4 w-4" />
                Удалить
              </Button>
            </div>
          </div>
        ))}
        {situations.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border/40 bg-background/60 px-4 py-8 text-center text-sm text-muted-foreground">
            Активных ситуаций нет. Будьте готовы.
          </div>
        )}
      </div>

      {/* Edit Situation Dialog */}
      <Dialog open={!!editingSituation} onOpenChange={(open) => !open && setEditingSituation(null)}>
        <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
            <DialogTitle>Редактировать детали ситуации</DialogTitle>
            <DialogDescription>
              Обновите информацию о ситуации. Нажмите «Сохранить», когда закончите.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="code">Код</Label>
              <Input
                id="code"
                value={editForm.code || ""}
                onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="title">Название</Label>
              <Input
                id="title"
                value={editForm.title || ""}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="location">Местоположение</Label>
              <Input
                id="location"
                value={editForm.location || ""}
                onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label htmlFor="coord-x">X</Label>
                <Input
                  id="coord-x"
                  value={editForm.x !== undefined ? String(editForm.x) : ""}
                  onChange={(e) => setEditForm({ ...editForm, x: e.target.value === "" ? undefined : Number(e.target.value) })}
                />
              </div>
              <div>
                <Label htmlFor="coord-y">Y</Label>
                <Input
                  id="coord-y"
                  value={editForm.y !== undefined ? String(editForm.y) : ""}
                  onChange={(e) => setEditForm({ ...editForm, y: e.target.value === "" ? undefined : Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="leadUnit">Главный юнит</Label>
              <Input
                id="leadUnit"
                value={editForm.leadUnit || ""}
                onChange={(e) => setEditForm({ ...editForm, leadUnit: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="channel">Канал</Label>
              <Select
                value={editForm.channel || "none"}
                onValueChange={(value) => {
                  // If tacticalChannels available, prevent selecting a busy channel owned by another situation
                  if (Array.isArray(tacticalChannels) && tacticalChannels.length > 0 && value && value !== 'none') {
                    const found = tacticalChannels.find((c:any) => String(c.name) === String(value) || String(c.id) === String(value));
                    if (found && found.isBusy && found.situationId && String(found.situationId) !== String(editingSituation?.id)) {
                      alert(`Канал ${found.name} занят другой ситуацией.`);
                      return;
                    }
                  }
                  setEditForm({ ...editForm, channel: value });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    if (Array.isArray(tacticalChannels) && tacticalChannels.length > 0) {
                      const list = [ { id: 'none', name: 'Нет канала', isBusy: false, situationId: null }, ...tacticalChannels.map((c:any) => ({ id: String(c.id), name: c.name, isBusy: !!c.isBusy, situationId: c.situationId })) ];
                      return list.map((channel) => (
                        <SelectItem key={channel.id || "none"} value={channel.name}>
                          {channel.name}{channel.isBusy ? ` — занято` : ''}
                        </SelectItem>
                      ));
                    }
                    const FALLBACK = [ { value: 'none', label: 'Нет канала' }, { value: 'TAC-1', label: 'TAC-1' }, { value: 'TAC-2', label: 'TAC-2' }, { value: 'TAC-3', label: 'TAC-3' } ];
                    return FALLBACK.map((ch) => (
                      <SelectItem key={ch.value} value={ch.value}>{ch.label}</SelectItem>
                    ));
                  })()}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="priority">Приоритет</Label>
              <Select
                value={editForm.priority || "Moderate"}
                onValueChange={(value) => setEditForm({ ...editForm, priority: value as SituationPriority })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Low">Низкий</SelectItem>
                  <SelectItem value="Moderate">Средний</SelectItem>
                  <SelectItem value="High">Высокий</SelectItem>
                  <SelectItem value="Critical">Критический</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Комментарий</Label>
              <textarea
                id="notes"
                value={String(editForm.notes || "")}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                className="w-full rounded-md border px-3 py-2 text-sm"
                rows={4}
                placeholder="Добавьте комментарий..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSituation(null)}>
              Отмена
            </Button>
            <Button onClick={handleSaveEdit}>Сохранить изменения</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}
