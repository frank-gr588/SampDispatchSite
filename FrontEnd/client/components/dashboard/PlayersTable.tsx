import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import type { PlayerPointDto } from "@shared/api";
import { getPlayerStatusText, getPlayerStatusColor, getPlayerRoleText, getPlayerRoleColor, getPlayerRankText } from "@shared/api";

interface PlayersTableProps {
  players: PlayerPointDto[];
  searchTerm: string;
  onSearchTermChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
}

export function PlayersTable({
  players,
  searchTerm,
  onSearchTermChange,
  statusFilter,
  onStatusFilterChange,
}: PlayersTableProps) {
  const statuses = [...new Set(players.map(p => String(p.status)))];

  const filtered = players.filter(p => {
    const matchStatus = statusFilter === 'all' || String(p.status) === statusFilter;
    const matchSearch = !searchTerm.trim() || p.nick.toLowerCase().includes(searchTerm.trim().toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <div className="rounded-[28px] border border-border/40 bg-card/80 shadow-panel backdrop-blur">
      <div className="flex flex-col gap-5 border-b border-border/40 px-6 py-6">
        <div className="flex flex-col gap-2">
          <p className="text-[0.65rem] uppercase tracking-[0.28em] text-muted-foreground">Активный состав</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-foreground">Игроки</h2>
            <Badge variant="outline" className="border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-primary">
              {players.length} онлайн
            </Badge>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Input value={searchTerm} onChange={(e) => onSearchTermChange(e.target.value)} placeholder="Поиск по нику" className="h-11 border-border/40 bg-background/70 pr-10" />
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
          <Select value={statusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger className="h-11 w-full border-border/40 bg-background/70 sm:w-[200px]">
              <SelectValue placeholder="Все статусы" />
            </SelectTrigger>
            <SelectContent className="bg-card/95 text-foreground">
              <SelectItem value="all">Все статусы</SelectItem>
              {statuses.map(s => (
                <SelectItem key={s} value={s}>{getPlayerStatusText(Number(s))}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 text-xs text-muted-foreground uppercase tracking-wider">
              <th className="px-4 py-3 text-left">Ник</th>
              <th className="px-4 py-3 text-left">Статус</th>
              <th className="px-4 py-3 text-left">Роль</th>
              <th className="px-4 py-3 text-left">Ранг</th>
              <th className="px-4 py-3 text-left">Юнит</th>
              <th className="px-4 py-3 text-left">Координаты</th>
              <th className="px-4 py-3 text-left">Обновлён</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {filtered.map(p => (
              <tr key={p.nick} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 font-medium">
                  <span className="flex items-center gap-2">
                    {p.nick}
                    {p.isAFK && <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30">AFK</Badge>}
                    {p.isInVehicle && <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/30">🚗</Badge>}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={cn("text-xs", getPlayerStatusColor(p.status))}>{getPlayerStatusText(p.status)}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={cn("text-xs", getPlayerRoleColor(p.role))}>{getPlayerRoleText(p.role)}</Badge>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{getPlayerRankText(p.rank)}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{p.unitId?.substring(0, 8) ?? '—'}</td>
                <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{p.x?.toFixed(0) ?? '—'}, {p.y?.toFixed(0) ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{p.lastUpdate ? new Date(p.lastUpdate).toLocaleTimeString('ru-RU') : '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">Нет игроков</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t border-border/40 px-6 py-3 text-xs text-muted-foreground">
        Всего: {players.length} | Отображено: {filtered.length}
      </div>
    </div>
  );
}
