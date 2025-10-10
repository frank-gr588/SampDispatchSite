import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Search, Edit } from "lucide-react";

export type PlayerPriority = "Routine" | "Elevated" | "Critical";

export interface PlayerRecord {
  id: number;
  nickname: string;
  callSign: string;
  status: string;
  comment: string;
  channel: string;
  lastUpdate: string;
  priority: PlayerPriority;
  location: {
    x: number;
    y: number;
  };
  worldX?: number;
  worldY?: number;
  isAFK?: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  Pursuit: "bg-rose-500/15 text-rose-200 border-rose-500/50",
  "Code 7": "bg-yellow-400/15 text-yellow-200 border-yellow-400/40",
  "Traffic Stop": "bg-amber-400/12 text-amber-100 border-amber-400/30",
  Staged: "bg-sky-500/12 text-sky-200 border-sky-400/35",
  "On Patrol": "bg-emerald-500/12 text-emerald-200 border-emerald-400/40",
  Unassigned: "bg-muted/30 text-muted-foreground border-border/50",
  Recon: "bg-indigo-500/15 text-indigo-200 border-indigo-500/40",
  Support: "bg-cyan-500/15 text-cyan-200 border-cyan-500/40",
};

const PRIORITY_STYLES: Record<PlayerPriority, string> = {
  Routine: "bg-emerald-500/15 text-emerald-200 border-emerald-500/40",
  Elevated: "bg-amber-500/15 text-amber-200 border-amber-500/40",
  Critical: "bg-rose-500/15 text-rose-200 border-rose-500/45",
};

export const STATUS_OPTIONS = Object.keys(STATUS_STYLES);

interface PlayersTableProps {
  players: PlayerRecord[];
  filteredPlayers: PlayerRecord[];
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  statuses: string[];
  onStatusChange?: (playerId: number, status: string) => void;
  onEditPlayer?: (playerId: number, updates: Partial<PlayerRecord>) => void;
}

export function PlayersTable({
  players,
  filteredPlayers,
  searchTerm,
  onSearchTermChange,
  statusFilter,
  onStatusFilterChange,
  statuses,
  onStatusChange,
  onEditPlayer,
}: PlayersTableProps) {
  const [editingPlayer, setEditingPlayer] = useState<PlayerRecord | null>(null);
  const [editForm, setEditForm] = useState<Partial<PlayerRecord>>({});

  const handleEditClick = (player: PlayerRecord) => {
    setEditingPlayer(player);
    setEditForm({
      nickname: player.nickname,
      callSign: player.callSign,
      channel: player.channel,
      comment: player.comment,
      priority: player.priority,
    });
  };

  const handleSaveEdit = () => {
    if (editingPlayer && onEditPlayer) {
      onEditPlayer(editingPlayer.id, editForm);
      setEditingPlayer(null);
      setEditForm({});
    }
  };

  return (
    <>
    <div className="rounded-[28px] border border-border/40 bg-card/80 shadow-panel backdrop-blur">
      <div className="flex flex-col gap-5 border-b border-border/40 px-6 py-6">
        <div className="flex flex-col gap-2">
          <p className="text-[0.65rem] uppercase tracking-[0.28em] text-muted-foreground">
            Активный состав
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-foreground">Юниты</h2>
            <Badge
              variant="outline"
              className="border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-primary"
            >
              {players.length} онлайн
            </Badge>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Input
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
              placeholder="Поиск по никнеймам или позывным"
              className="h-11 border-border/40 bg-background/70 pr-10"
            />
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
          <Select value={statusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger className="h-11 w-full border-border/40 bg-background/70 sm:w-[200px]">
              <SelectValue placeholder="Все статусы" />
            </SelectTrigger>
            <SelectContent className="bg-card/95 text-foreground">
              <SelectItem value="all">Все статусы</SelectItem>
              {statuses.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-3 px-6 py-6">
        {filteredPlayers.map((player) => (
          <div
            key={player.id}
            className="flex flex-col gap-4 rounded-2xl border border-border/40 bg-background/60 px-5 py-4 transition hover:border-primary/40 hover:shadow-glow lg:flex-row lg:items-center lg:justify-between"
          >
            <div className="flex flex-1 items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border/45 bg-secondary/30 text-base font-semibold uppercase tracking-[0.18em] text-primary">
                {(player.nickname ?? "").slice(0, 2)}
              </span>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-base font-semibold text-foreground">
                    {player.nickname ?? "—"}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "border-transparent px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.28em]",
                      PRIORITY_STYLES[player.priority ?? "Routine"],
                    )}
                  >
                    {player.priority ?? "Routine"}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground/80">
                  <span className="font-mono uppercase tracking-[0.28em]">
                    {player.callSign ?? "—"}
                  </span>
                  <span className="rounded-full border border-border/30 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.22em]">
                    {player.channel ?? "—"}
                  </span>
                  <span className="rounded-full border border-border/30 px-2 py-0.5 text-[0.65rem] text-muted-foreground">
                    {player.lastUpdate ?? "—"}
                  </span>
                </div>
                <p className="max-w-xl text-sm text-muted-foreground">
                  {player.comment ?? ""}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3 lg:w-64">
              <label className="text-[0.6rem] uppercase tracking-[0.28em] text-muted-foreground">
                Статус
              </label>
              <div className="flex gap-2">
                <Select
                  value={player.status ?? "OnDuty"}
                  onValueChange={(value) => onStatusChange?.(player.id, value)}
                >
                  <SelectTrigger className="h-11 border-border/40 bg-background/70">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card/95 text-foreground">
                    <SelectGroup>
                      {STATUS_OPTIONS.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  onClick={() => handleEditClick(player)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        {filteredPlayers.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border/40 bg-background/60 px-6 py-12 text-center text-sm text-muted-foreground">
            No units match the current filters.
          </div>
        )}
      </div>

      {/* Edit Player Dialog */}
      <Dialog open={!!editingPlayer} onOpenChange={(open) => !open && setEditingPlayer(null)}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Редактировать данные юнита</DialogTitle>
            <DialogDescription>
              Обновите информацию о юните. Нажмите сохранить, когда закончите.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="nickname">Никнейм</Label>
              <Input
                id="nickname"
                value={editForm.nickname || ""}
                onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="callSign">Позывной</Label>
              <Input
                id="callSign"
                value={editForm.callSign || ""}
                onChange={(e) => setEditForm({ ...editForm, callSign: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="channel">Канал</Label>
              <Input
                id="channel"
                value={editForm.channel || ""}
                onChange={(e) => setEditForm({ ...editForm, channel: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="comment">Комментарий</Label>
              <Input
                id="comment"
                value={editForm.comment || ""}
                onChange={(e) => setEditForm({ ...editForm, comment: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={editForm.priority || "Routine"}
                onValueChange={(value) => setEditForm({ ...editForm, priority: value as PlayerPriority })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Routine">Routine</SelectItem>
                  <SelectItem value="Elevated">Elevated</SelectItem>
                  <SelectItem value="Critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPlayer(null)}>
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
