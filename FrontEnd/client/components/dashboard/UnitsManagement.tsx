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
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Plus, Users, UserPlus, UserMinus, Trash2, Crown } from "lucide-react";
import { 
  UnitDto, 
  PlayerPointDto,
  PlayerStatus,
  CreateUnitRequest,
  AddPlayerToUnitRequest,
  RemovePlayerFromUnitRequest,
  getPlayerStatusText,
  getPlayerStatusColor
} from "@shared/api";
import { emitAppEvent } from "@/lib/utils";
import type { PlayerRecord } from "./PlayersTable";
import { MarkingSelector } from "./MarkingSelector";
import { useData } from "@/contexts/DataContext";

interface UnitsManagementProps {
  className?: string;
  assignments?: Record<string, string | null>;
  setAssignments?: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
}

export function UnitsManagement({ 
  className, 
  assignments = {}, 
  setAssignments 
}: UnitsManagementProps) {
  const { players, units: contextUnits, refreshUnits, refreshPlayers } = useData();
  const [units, setUnits] = useState<UnitDto[]>([]);
  const [availablePlayers, setAvailablePlayers] = useState<PlayerPointDto[]>([]);
  const [filteredUnits, setFilteredUnits] = useState<UnitDto[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<UnitDto | null>(null);
  const [unitPlayers, setUnitPlayers] = useState<PlayerPointDto[]>([]);
  const [showAddPlayerDialog, setShowAddPlayerDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [unitForStatusChange, setUnitForStatusChange] = useState<UnitDto | null>(null);
  const [newUnitStatus, setNewUnitStatus] = useState<string>("");

  // Form states
  const [newUnit, setNewUnit] = useState<CreateUnitRequest>({
    marking: "",
    playerNicks: [],
    isLeadUnit: false
  });
  const [selectedPlayerNicks, setSelectedPlayerNicks] = useState<string[]>([]);
  const [selectedLeadNick, setSelectedLeadNick] = useState<string | null>(null);

  // Синхронизация локального state с Context
  useEffect(() => {
    console.log('[UnitsManagement] Context units updated:', contextUnits.length);
    setUnits(contextUnits);
    // Set loading to false once we have units from context
    if (contextUnits.length >= 0) {
      setIsLoading(false);
    }
  }, [contextUnits]);

  // Загрузка данных
  useEffect(() => {
    fetchAvailablePlayers();
  }, []);

  // Фильтрация
  useEffect(() => {
    let filtered = units;

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(unit => (unit?.marking ?? "").toLowerCase().includes(q));
    }

    setFilteredUnits(filtered);
  }, [units, searchTerm]);

  const fetchUnits = async () => {
    try {
      setIsLoading(true);
      await refreshUnits();
      // Sync local units state from context
      setUnits(contextUnits);
    } catch (error) {
      console.error("Error fetching units:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAvailablePlayers = async () => {
    try {
      const response = await fetch("/api/players/available-for-unit");
      if (response.ok) {
        const data = await response.json();
        console.log(`Fetched ${data.length} available players:`, data);
        setAvailablePlayers(data);
      } else {
        console.error("Failed to fetch available players:", response.status, await response.text());
      }
    } catch (error) {
      console.error("Error fetching available players:", error);
    }
  };

  const fetchUnitPlayers = async (unitId: string) => {
    try {
      const response = await fetch(`/api/units/${unitId}/players`);
      if (response.ok) {
        const data = await response.json();
        setUnitPlayers(data);
      }
    } catch (error) {
      console.error("Error fetching unit players:", error);
    }
  };

  const createUnit = async () => {
    try {
      if (!newUnit.marking) {
        alert("Заполните маркировку юнита (макс. 8 символов)");
        return;
      }
      
      if (newUnit.marking.length > 8) {
        alert("Маркировка не может быть длиннее 8 символов");
        return;
      }
      
      if (selectedPlayerNicks.length === 0) {
        alert("Выберите хотя бы одного игрока для создания юнита");
        return;
      }

      // Prepare player list; if a lead is selected, ensure it's first (backend treats first as lead)
      let playerList = [...selectedPlayerNicks];
      if (newUnit.isLeadUnit && selectedLeadNick) {
        playerList = [selectedLeadNick, ...playerList.filter(n => n.toLowerCase() !== selectedLeadNick.toLowerCase())];
      }

      // Создаем юнит со всеми выбранными игроками
      // Используем заглавные буквы для совместимости с C# DTO
      const unitToCreate = {
        Marking: newUnit.marking,
        PlayerNicks: playerList,
        IsLeadUnit: newUnit.isLeadUnit
      };

      console.log("Creating unit:", unitToCreate);
      console.log("Available players before creation:", availablePlayers.length);

      const response = await fetch("/api/units", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-API-Key": "changeme-key"
        },
        body: JSON.stringify(unitToCreate)
      });

      if (response.ok) {
        console.log('[UnitsManagement] Unit created successfully, refreshing...');
        await refreshUnits(); // Refresh from Context instead of local fetch
        await fetchAvailablePlayers();
        emitAppEvent('units:updated');
        emitAppEvent('players:updated');
        setIsCreateDialogOpen(false);
        setNewUnit({
          marking: "",
          playerNicks: [],
          isLeadUnit: false
        });
        setSelectedPlayerNicks([]);
        setSelectedLeadNick(null);
        alert("Юнит успешно создан!");
      } else {
        const errorText = await response.text();
        alert(`Ошибка создания юнита: ${response.status} - ${errorText}`);
        console.error("Error creating unit:", response.status, errorText);
      }
    } catch (error) {
      console.error("Error creating unit:", error);
      alert(`Ошибка создания юнита: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const deleteUnit = async (unitId: string) => {
    if (!confirm("Удалить юнит? Все игроки будут освобождены.")) return;

    try {
      const response = await fetch(`/api/units/${unitId}`, {
        method: "DELETE",
        headers: { "X-API-Key": "changeme-key" }
      });

      if (response.ok) {
        await refreshUnits(); // Use Context refresh
        await fetchAvailablePlayers();
      }
    } catch (error) {
      console.error("Error deleting unit:", error);
    }
  };

  const addPlayerToUnit = async (unitId: string, playerNick: string) => {
    try {
      const request: AddPlayerToUnitRequest = { playerNick };
      const response = await fetch(`/api/units/${unitId}/players/add`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-API-Key": "changeme-key"
        },
        body: JSON.stringify(request)
      });

      if (response.ok) {
        await refreshUnits(); // Use Context refresh
        await fetchAvailablePlayers();
        emitAppEvent('units:updated');
        emitAppEvent('players:updated');
        if (selectedUnit?.id === unitId) {
          await fetchUnitPlayers(unitId);
        }
      }
    } catch (error) {
      console.error("Error adding player to unit:", error);
    }
  };

  const removePlayerFromUnit = async (unitId: string, playerNick: string) => {
    if (!confirm(`Удалить игрока ${playerNick} из юнита?`)) return;

    try {
      const request: RemovePlayerFromUnitRequest = { playerNick };
      const response = await fetch(`/api/units/${unitId}/players/remove`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-API-Key": "changeme-key"
        },
        body: JSON.stringify(request)
      });

      if (response.ok) {
        await refreshUnits(); // Use Context refresh
        await fetchAvailablePlayers();
        emitAppEvent('units:updated');
        emitAppEvent('players:updated');
        if (selectedUnit?.id === unitId) {
          await fetchUnitPlayers(unitId);
        }
      }
    } catch (error) {
      console.error("Error removing player from unit:", error);
    }
  };

  const togglePlayerSelection = (playerNick: string) => {
    setSelectedPlayerNicks(prev => 
      prev.includes(playerNick)
        ? prev.filter(nick => nick !== playerNick)
        : [...prev, playerNick]
    );
  };

  const openUnitDetails = async (unit: UnitDto) => {
    setSelectedUnit(unit);
    await fetchUnitPlayers(unit.id);
  };

  const openStatusDialog = (unit: UnitDto) => {
    setUnitForStatusChange(unit);
    // Default to Code 0 when no explicit status present
    setNewUnitStatus(unit.status || "Code 0");
    setShowStatusDialog(true);
  };

  const updateUnitStatus = async () => {
    if (!unitForStatusChange) return;

    try {
      const response = await fetch(`/api/units/${unitForStatusChange.id}/status`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "X-API-Key": "changeme-key"
        },
        body: JSON.stringify({ status: newUnitStatus })
      });

      if (response.ok) {
        await refreshUnits(); // Use Context refresh
        emitAppEvent('units:updated');
        setShowStatusDialog(false);
        setUnitForStatusChange(null);
        setNewUnitStatus("");
      } else {
        const errorText = await response.text();
        alert(`Ошибка изменения статуса: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      console.error("Error updating unit status:", error);
      alert(`Ошибка изменения статуса: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Управление юнитами</CardTitle>
              <CardDescription>
                Всего юнитов: {units.length} | Активных: {units.filter(u => (u?.playerCount ?? 0) > 0).length}
              </CardDescription>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
              setIsCreateDialogOpen(open);
              if (open) {
                // Обновляем список доступных игроков при открытии диалога
                fetchAvailablePlayers();
              }
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Создать юнит
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Создать новый юнит</DialogTitle>
                  <DialogDescription>
                    Создайте новый оперативный юнит с маркировкой (макс. 8 символов) и составом игроков. Все поля отмеченные * являются обязательными.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label>Маркировка *</Label>
                    {isCreateDialogOpen && (
                      <MarkingSelector
                        value={newUnit.marking}
                        onChange={(marking) => setNewUnit({...newUnit, marking})}
                        existingMarkings={units.map(u => u?.marking ?? "")}
                      />
                    )}
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">Ведущий юнит</Label>
                    <div className="col-span-3">
                      <Checkbox
                        checked={newUnit.isLeadUnit}
                        onCheckedChange={(checked) => setNewUnit({...newUnit, isLeadUnit: !!checked})}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 items-start gap-4">
                    <Label className="text-right mt-2">Игроки *</Label>
                    <div className="col-span-3 max-h-40 overflow-y-auto border rounded p-2">
                      {availablePlayers.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Нет доступных игроков</p>
                      ) : (
                        availablePlayers.map((player) => (
                          <div key={player.nick} className="flex items-center space-x-2 py-1">
                            <Checkbox
                              checked={selectedPlayerNicks.includes(player.nick)}
                              onCheckedChange={() => togglePlayerSelection(player.nick)}
                            />
                            <span className="flex-1">{player.nick}</span>
                            <Badge className={getPlayerStatusColor(player.status)}>
                              {getPlayerStatusText(player.status)}
                            </Badge>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  {newUnit.isLeadUnit && selectedPlayerNicks.length > 0 && (
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label className="text-right">Выбрать ведущего</Label>
                      <div className="col-span-3">
                        <Select value={selectedLeadNick ?? ""} onValueChange={(v) => setSelectedLeadNick(v || null)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Выберите ведущего" />
                          </SelectTrigger>
                          <SelectContent>
                            {selectedPlayerNicks.map(nick => (
                              <SelectItem key={nick} value={nick}>{nick}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button 
                    onClick={createUnit} 
                    disabled={!newUnit.marking || newUnit.marking.length > 8 || selectedPlayerNicks.length === 0}
                  >
                    Создать юнит
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {/* Поиск */}
          <div className="flex gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Поиск по маркировке..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Таблица юнитов */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Маркировка</TableHead>
                  <TableHead>Игроков</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Ситуация</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center">Загрузка...</TableCell>
                  </TableRow>
                ) : filteredUnits.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center">Юниты не найдены</TableCell>
                  </TableRow>
                ) : (
                  filteredUnits.map((unit) => (
                    <TableRow key={unit.id}>
                      <TableCell className="font-medium text-lg">{unit.marking}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          {unit.playerCount}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={
                            unit.status === "Code 0" ? "destructive" :
                            unit.status === "Code 1" ? "destructive" :
                            unit.status === "Code 3" ? "default" :
                            unit.status === "Code 4 Adam" ? "default" :
                            unit.status ? "secondary" : "outline"
                          }
                          className={`cursor-pointer hover:opacity-80 ${
                            unit.status === "Code 0" ? "bg-red-600 text-white animate-pulse" :
                            unit.status === "Code 1" ? "bg-orange-600 text-white" : ""
                          }`}
                          onClick={() => openStatusDialog(unit)}
                        >
                          {unit.status || "Code 0"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {unit.situationId ? (
                          <Badge variant="destructive">На ситуации</Badge>
                        ) : (
                          <Badge variant="outline">Свободен</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {unit.isLeadUnit ? (
                          <Badge className="bg-yellow-500/15 text-yellow-200 border-yellow-500/50">
                            <Crown className="w-3 h-3 mr-1" />
                            Ведущий
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Обычный</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openUnitDetails(unit)}
                          >
                            <Users className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteUnit(unit.id)}
                          >
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

      {/* Диалог детали юнита */}
      <Dialog open={!!selectedUnit} onOpenChange={() => setSelectedUnit(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Юнит: {selectedUnit?.marking}
            </DialogTitle>
            <DialogDescription>
              Управление игроками в юните
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-semibold">Игроки в юните ({unitPlayers.length})</h4>
              <Dialog open={showAddPlayerDialog} onOpenChange={setShowAddPlayerDialog}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Добавить игрока
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Добавить игрока в юнит</DialogTitle>
                  </DialogHeader>
                  <div className="py-4 max-h-60 overflow-y-auto">
                    {availablePlayers.length === 0 ? (
                      <p className="text-muted-foreground">Нет доступных игроков</p>
                    ) : (
                      availablePlayers.map((player) => (
                        <div key={player.nick} className="flex items-center justify-between py-2 border-b">
                          <div>
                            <span className="font-medium">{player.nick}</span>
                            <Badge className={`ml-2 ${getPlayerStatusColor(player.status)}`}>
                              {getPlayerStatusText(player.status)}
                            </Badge>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => {
                              if (selectedUnit) {
                                addPlayerToUnit(selectedUnit.id, player.nick);
                                setShowAddPlayerDialog(false);
                              }
                            }}
                          >
                            Добавить
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <div className="space-y-2">
              {unitPlayers.length === 0 ? (
                <p className="text-muted-foreground">Юнит пуст</p>
              ) : (
                unitPlayers.map((player) => (
                  <div key={player.nick} className="flex items-center justify-between p-3 border rounded">
                    <div>
                      <span className="font-medium">{player.nick}</span>
                      <Badge className={`ml-2 ${getPlayerStatusColor(player.status)}`}>
                        {getPlayerStatusText(player.status)}
                      </Badge>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (selectedUnit) {
                          removePlayerFromUnit(selectedUnit.id, player.nick);
                        }
                      }}
                    >
                      <UserMinus className="w-4 h-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Диалог изменения статуса юнита */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Изменить статус юнита</DialogTitle>
            <DialogDescription>
              Установите радиокод для юнита "{unitForStatusChange?.marking}". Code 0/1 - критические, требуют немедленной реакции!
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="unit-status">Статус</Label>
              <Select value={newUnitStatus} onValueChange={setNewUnitStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите статус (Code X)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Code 0">Code 0 (Офицер на земле - критично!)</SelectItem>
                  <SelectItem value="Code 1">Code 1 (Офицер в бедственном положении)</SelectItem>
                  <SelectItem value="Code 2">Code 2 (Вызов низкого приоритета)</SelectItem>
                  <SelectItem value="Code 3">Code 3 (Вызов высокого приоритета)</SelectItem>
                  <SelectItem value="Code 4">Code 4 (Помощь не требуется)</SelectItem>
                  <SelectItem value="Code 4 Adam">Code 4 Adam (Преступник потерян, поиск)</SelectItem>
                  <SelectItem value="Code 6">Code 6 (Резервный/Проверка)</SelectItem>
                  <SelectItem value="Code 7">Code 7 (Убытие со службы/Перерыв)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStatusDialog(false)}>
              Отмена
            </Button>
            <Button onClick={updateUnitStatus}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}