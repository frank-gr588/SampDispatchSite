import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Search, Plus, Edit, Trash2, Filter } from "lucide-react";
import { 
  PlayerStatus, 
  PlayerRole, 
  PlayerRank,
  PlayerPointDto,
  getPlayerRankText,
  getPlayerRankColor
} from "@shared/api";
import { emitAppEvent } from "@/lib/utils";
import { useData } from "@/contexts/DataContext";

interface PlayersManagementProps {
  className?: string;
}

export function PlayersManagement({ className }: PlayersManagementProps) {
  const { players, refreshPlayers } = useData();
  const [filteredPlayers, setFilteredPlayers] = useState<PlayerPointDto[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | "all">("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<PlayerPointDto | null>(null);
  const [newPlayer, setNewPlayer] = useState({
    nick: "",
    role: PlayerRole.Officer,
    rank: PlayerRank.PoliceOfficer,
    status: PlayerStatus.OnDutyOutOfUnit, // Изменено с OutOfDuty на OnDutyOutOfUnit для доступности в юнитах
    x: -10000, // Костыль-маркер для созданных вручную
    y: -10000, // Костыль-маркер для созданных вручную
  });

  // Функции для перевода enum'ов
  const getStatusText = (status: PlayerStatus) => {
    switch (status) {
      case PlayerStatus.OutOfDuty: return "Вне службы";
      case PlayerStatus.OnDuty: return "На службе";
      case PlayerStatus.OnDutyLeadUnit: return "На службе (ведущий)";
      case PlayerStatus.OnDutyOutOfUnit: return "На службе (вне юнита)";
      default: return "Неизвестно";
    }
  };

  const getRoleText = (role: PlayerRole) => {
    switch (role) {
      case PlayerRole.Officer: return "Офицер";
      case PlayerRole.Supervisor: return "Супервайзер";
      case PlayerRole.SuperSupervisor: return "Суперсупервайзер";
      default: return "Неизвестно";
    }
  };

  const formatLastUpdate = (lastUpdate: string) => {
    try {
      const date = new Date(lastUpdate);
      return date.toLocaleString('ru-RU');
    } catch {
      return lastUpdate;
    }
  };

  // Фильтрация
  const filterPlayers = () => {
    let filtered = players;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(player => (player?.nick ?? "").toLowerCase().includes(q));
    }
    if (statusFilter !== "all") {
      filtered = filtered.filter(player => String(player?.status ?? "").toString() === statusFilter);
    }
    setFilteredPlayers(filtered);
  };
  
  // вызывать фильтрацию при изменении зависимостей
  useEffect(() => { 
    filterPlayers(); 
  }, [players, searchTerm, statusFilter]);

  const createPlayer = async () => {
    if (!newPlayer.nick) {
      alert("Введите никнейм игрока");
      return;
    }
    
    try {
      const requestData = {
        nick: newPlayer.nick,
        x: newPlayer.x || -10000, // Костыль-маркер: -10000 означает создан вручную
        y: newPlayer.y || -10000, // Костыль-маркер: -10000 означает создан вручную
        role: newPlayer.role,
        status: newPlayer.status
      };
      
      // Отправляем запрос на создание игрока через API
      const response = await fetch("/api/players", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-API-Key": "changeme-key"
        },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create player: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const createdPlayer = await response.json();
      
      // Refresh players from Context
      await refreshPlayers();
      emitAppEvent('players:updated');
      setIsCreateDialogOpen(false);
      setNewPlayer({
        nick: "",
        role: PlayerRole.Officer,
        rank: PlayerRank.PoliceOfficer,
        status: PlayerStatus.OnDutyOutOfUnit, // Изменено с OutOfDuty на OnDutyOutOfUnit для доступности в юнитах
        x: -10000, // Костыль-маркер для созданных вручную
        y: -10000, // Костыль-маркер для созданных вручную
      });
      
      alert("Игрок успешно создан!");
    } catch (error) {
      console.error("Error creating player:", error);
      alert(`Ошибка создания игрока: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const openEditDialog = (player: PlayerPointDto) => {
    setEditingPlayer(player);
    setIsEditDialogOpen(true);
  };

  const updatePlayer = async () => {
    if (!editingPlayer) return;
    
    try {
      // Обновляем роль
      const roleResponse = await fetch(`/api/players/${encodeURIComponent(editingPlayer.nick)}/role`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "X-API-Key": "changeme-key"
        },
        body: JSON.stringify({ role: editingPlayer.role })
      });

      if (!roleResponse.ok) {
        const errorText = await roleResponse.text();
        throw new Error(`Failed to update role: ${roleResponse.status} - ${errorText}`);
      }

      // Обновляем звание
      const rankResponse = await fetch(`/api/players/${encodeURIComponent(editingPlayer.nick)}/rank`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "X-API-Key": "changeme-key"
        },
        body: JSON.stringify({ rank: editingPlayer.rank })
      });

      if (!rankResponse.ok) {
        const errorText = await rankResponse.text();
        throw new Error(`Failed to update rank: ${rankResponse.status} - ${errorText}`);
      }

      // Обновляем статус
      const statusResponse = await fetch(`/api/players/${encodeURIComponent(editingPlayer.nick)}/status`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "X-API-Key": "changeme-key"
        },
        body: JSON.stringify({ status: editingPlayer.status })
      });

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        throw new Error(`Failed to update status: ${statusResponse.status} - ${errorText}`);
      }

      // Refresh players from Context
      await refreshPlayers();
      emitAppEvent('players:updated');
      
      setIsEditDialogOpen(false);
      setEditingPlayer(null);
      alert("Характеристики игрока успешно обновлены!");
    } catch (error) {
      console.error("Error updating player:", error);
      alert(`Ошибка обновления игрока: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const deletePlayer = async (nick: string) => {
    const player = players.find(p => p.nick === nick);
    if (!player) {
      alert("Игрок не найден");
      return;
    }

    if (!confirm(`Удалить игрока "${player.nick}"?`)) return;
    
    try {
      console.log(`Deleting player: ${player.nick}`);

      // First: remove the player from any units that contain them
      try {
        // Fetch units to find which units include this player
        const unitsResp = await fetch(`/api/units`);
        if (unitsResp.ok) {
          const unitsData = await unitsResp.json();
          const units = Array.isArray(unitsData) ? unitsData : [];
          const affected = units.filter((u: any) => Array.isArray(u.playerNicks) && u.playerNicks.includes(player.nick));
          for (const u of affected) {
            try {
              await fetch(`/api/units/${u.id}/players/remove`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-API-Key": "changeme-key" },
                body: JSON.stringify({ playerNick: player.nick })
              });
            } catch (inner) {
              console.warn(`Failed to remove ${player.nick} from unit ${u.id}:`, inner);
            }
          }
        }
      } catch (e) {
        console.warn("Failed to query units while deleting player:", e);
      }

      // Now delete the player on the server
      const response = await fetch(`/api/players/${encodeURIComponent(player.nick)}`, {
        method: "DELETE",
        headers: { 
          "X-API-Key": "changeme-key"
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to delete player: ${response.status} ${response.statusText} - ${errorText}`);
      }

      console.log(`Player ${player.nick} deleted from server`);

      // Refresh players from Context
      await refreshPlayers();
      // Notify app
      emitAppEvent('player:deleted', { nick: player.nick });
      emitAppEvent('players:updated');

      alert("Игрок успешно удален!");
    } catch (error) {
      console.error("Error deleting player:", error);
      alert(`Ошибка удаления игрока: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Можно реализовать простую статистику по статусу, если нужно
  const statusCounts = {};

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Управление игроками</CardTitle>
              <CardDescription>
                Всего игроков: {players.length} | Отображается: {filteredPlayers.length}
              </CardDescription>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Добавить игрока
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>Добавить нового игрока</DialogTitle>
                  <DialogDescription>
                    Создание нового игрока в системе. Поля отмеченные * являются обязательными.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="nick" className="text-right">Ник *</Label>
                    <Input
                      id="nick"
                      value={newPlayer.nick}
                      onChange={(e) => setNewPlayer({...newPlayer, nick: e.target.value})}
                      className="col-span-3"
                      placeholder="Введите никнейм игрока"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="role" className="text-right">Роль</Label>
                    <Select value={newPlayer.role?.toString()} onValueChange={(value) => setNewPlayer({ ...newPlayer, role: parseInt(value) as PlayerRole })}>
                      <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Выберите роль" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Офицер</SelectItem>
                        <SelectItem value="1">Супервайзер</SelectItem>
                        <SelectItem value="2">Суперсупервайзер</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="rank" className="text-right">Звание</Label>
                    <Select value={newPlayer.rank?.toString()} onValueChange={(value) => setNewPlayer({ ...newPlayer, rank: parseInt(value) as PlayerRank })}>
                      <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Выберите звание" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Chief of Police</SelectItem>
                        <SelectItem value="1">Assistant Chief of Police</SelectItem>
                        <SelectItem value="2">Deputy Chief of Police</SelectItem>
                        <SelectItem value="3">Police Commander</SelectItem>
                        <SelectItem value="4">Police Captain</SelectItem>
                        <SelectItem value="5">Police Lieutenant</SelectItem>
                        <SelectItem value="6">Police Sergeant</SelectItem>
                        <SelectItem value="7">Police Inspector</SelectItem>
                        <SelectItem value="8">Police Officer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="status" className="text-right">Статус</Label>
                    <Select value={newPlayer.status?.toString()} onValueChange={(value) => setNewPlayer({ ...newPlayer, status: parseInt(value) as PlayerStatus })}>
                      <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Выберите статус" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Вне службы</SelectItem>
                        <SelectItem value="1">На службе</SelectItem>
                        <SelectItem value="2">На службе (ведущий)</SelectItem>
                        <SelectItem value="3">На службе (вне юнита)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">Координаты</Label>
                    <div className="col-span-3 grid grid-cols-2 gap-2">
                      <Input
                        placeholder="X координата (-10000 = создан вручную)"
                        type="number"
                        value={newPlayer.x || ''}
                        onChange={(e) => setNewPlayer({
                          ...newPlayer, 
                          x: parseFloat(e.target.value) || -10000
                        })}
                      />
                      <Input
                        placeholder="Y координата (-10000 = создан вручную)"
                        type="number"
                        value={newPlayer.y || ''}
                        onChange={(e) => setNewPlayer({
                          ...newPlayer, 
                          y: parseFloat(e.target.value) || -10000
                        })}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button 
                    onClick={createPlayer}
                    disabled={!newPlayer.nick}
                  >
                    Создать игрока
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {/* Статистика по статусам убрана. */}

          {/* Фильтр и поиск */}
          <div className="flex gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Поиск по нику..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Таблица игроков */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ник</TableHead>
                  <TableHead>Звание</TableHead>
                  <TableHead>Роль</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Юнит</TableHead>
                  <TableHead>Координаты</TableHead>
                  <TableHead>Последнее обновление</TableHead>
                  <TableHead>Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlayers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center">Игроки не найдены</TableCell>
                  </TableRow>
                ) : (
                  filteredPlayers.map((player) => (
                    <TableRow key={player.nick}>
                      <TableCell className="font-medium">{player.nick}</TableCell>
                      <TableCell>
                        <Badge className={getPlayerRankColor(player.rank)}>
                          {getPlayerRankText(player.rank)}
                        </Badge>
                      </TableCell>
                      <TableCell>{getRoleText(player.role)}</TableCell>
                      <TableCell>
                        <Badge variant={player.status === PlayerStatus.OnDuty || player.status === PlayerStatus.OnDutyLeadUnit || player.status === PlayerStatus.OnDutyOutOfUnit ? "default" : "secondary"}>
                          {getStatusText(player.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{player.unitId || "Не назначен"}</TableCell>
                      <TableCell>
                        {player.x === -10000 && player.y === -10000 
                          ? "Создан вручную" 
                          : `${player.x}, ${player.y}`}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {formatLastUpdate(player.lastUpdate || "Не указано")}
                          {player.isAFK && (
                            <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-300 border-yellow-500/50">
                              AFK
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEditDialog(player)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => deletePlayer(player.nick)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Диалог редактирования игрока */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Редактировать игрока: {editingPlayer?.nick}</DialogTitle>
            <DialogDescription>
              Изменить роль и статус игрока. Изменения будут применены немедленно.
            </DialogDescription>
          </DialogHeader>
          {editingPlayer && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-role" className="text-right">Роль</Label>
                <Select 
                  value={editingPlayer.role?.toString()} 
                  onValueChange={(value) => setEditingPlayer({ 
                    ...editingPlayer, 
                    role: parseInt(value) as PlayerRole 
                  })}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Выберите роль" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Офицер</SelectItem>
                    <SelectItem value="1">Супервайзер</SelectItem>
                    <SelectItem value="2">Суперсупервайзер</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-rank" className="text-right">Звание</Label>
                <Select 
                  value={editingPlayer.rank?.toString()} 
                  onValueChange={(value) => setEditingPlayer({ 
                    ...editingPlayer, 
                    rank: parseInt(value) as PlayerRank 
                  })}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Выберите звание" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Chief of Police</SelectItem>
                    <SelectItem value="1">Assistant Chief of Police</SelectItem>
                    <SelectItem value="2">Deputy Chief of Police</SelectItem>
                    <SelectItem value="3">Police Commander</SelectItem>
                    <SelectItem value="4">Police Captain</SelectItem>
                    <SelectItem value="5">Police Lieutenant</SelectItem>
                    <SelectItem value="6">Police Sergeant</SelectItem>
                    <SelectItem value="7">Police Inspector</SelectItem>
                    <SelectItem value="8">Police Officer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-status" className="text-right">Статус</Label>
                <Select 
                  value={editingPlayer.status?.toString()} 
                  onValueChange={(value) => setEditingPlayer({ 
                    ...editingPlayer, 
                    status: parseInt(value) as PlayerStatus 
                  })}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Выберите статус" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Вне службы</SelectItem>
                    <SelectItem value="1">На службе</SelectItem>
                    <SelectItem value="2">На службе (ведущий)</SelectItem>
                    <SelectItem value="3">На службе (вне юнита)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editingPlayer.unitId && (
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right text-muted-foreground">Юнит</Label>
                  <div className="col-span-3 text-muted-foreground">
                    {editingPlayer.unitId}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={updatePlayer}>
              Сохранить изменения
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}