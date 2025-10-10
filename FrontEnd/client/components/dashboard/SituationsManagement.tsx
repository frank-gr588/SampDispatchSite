import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useData } from "@/contexts/DataContext";
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
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, AlertTriangle, Crown, Users, X, Target, Edit, Save } from "lucide-react";
import { 
  SituationDto, 
  UnitDto,
  CreateSituationRequest
} from "@shared/api";
import { emitAppEvent } from "@/lib/utils";
import type { SituationRecord } from "./SituationsPanel";

interface SituationsManagementProps {
  className?: string;
  situations?: SituationRecord[];
  setSituations?: React.Dispatch<React.SetStateAction<SituationRecord[]>>;
  assignments?: Record<string, string | null>;
  setAssignments?: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
}

const SITUATION_TYPES = [
  { value: "pursuit", label: "Погоня", color: "bg-red-500/15 text-red-200 border-red-500/50" },
  { value: "trafficstop", label: "Трафик-стоп", color: "bg-amber-500/15 text-amber-200 border-amber-500/50" },
  { value: "code6", label: "Code 6", color: "bg-purple-500/15 text-purple-200 border-purple-500/50" },
  { value: "911", label: "911", color: "bg-red-600/15 text-red-300 border-red-600/50" },
  { value: "panic", label: "PANIC", color: "bg-rose-600/20 text-rose-200 border-rose-600/60" },
];

const TACTICAL_CHANNELS = [
  { value: "none", label: "Нет канала" },
  { value: "TAC-1", label: "TAC-1" },
  { value: "TAC-2", label: "TAC-2" },
  { value: "TAC-3", label: "TAC-3" },
];

const PRIORITY_OPTIONS = [
  { value: "critical", label: "Критический" },
  { value: "high", label: "Высокий" },
  { value: "moderate", label: "Средний" },
  { value: "low", label: "Низкий" },
];

const generateFallbackId = () => {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
};

const sanitizeSituation = (situation: SituationDto): SituationDto => ({
  ...situation,
  id: situation?.id ? String(situation.id) : generateFallbackId(),
  type: typeof situation?.type === "string" ? situation.type : "unknown",
  metadata: situation?.metadata && typeof situation.metadata === "object"
    ? { ...situation.metadata }
    : {},
  units: Array.isArray(situation?.units) ? [...situation.units] : [],
  greenUnitId: situation?.greenUnitId ?? null,
  redUnitId: situation?.redUnitId ?? null,
  createdAt: situation?.createdAt ?? new Date().toISOString(),
  isActive: situation?.isActive !== undefined ? Boolean(situation.isActive) : true, // По умолчанию true
});

export function SituationsManagement({ className }: SituationsManagementProps) {
  // Используем глобальное состояние из Context
  const { situations, setSituations, units, refreshSituations, refreshUnits, isLoading: globalLoading } = useData();
  
  const [filteredSituations, setFilteredSituations] = useState<SituationDto[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedSituation, setSelectedSituation] = useState<SituationDto | null>(null);
  const [situationUnits, setSituationUnits] = useState<UnitDto[]>([]);
  const [showAddUnitDialog, setShowAddUnitDialog] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string>("none");
  const [isEditMode, setIsEditMode] = useState(false);
  const [editNotes, setEditNotes] = useState<string>("");
  const [editLocation, setEditLocation] = useState<string>("");
  const [editPriority, setEditPriority] = useState<string>("");
  const [editTitle, setEditTitle] = useState<string>("");

  // Form states
  const [newSituation, setNewSituation] = useState<CreateSituationRequest>({
    type: "",
    metadata: {}
  });
  const [newSituationChannel, setNewSituationChannel] = useState<string>("none");

  // Данные загружаются автоматически через DataContext при монтировании App

  // Фильтрация
  useEffect(() => {
    const source = Array.isArray(situations) ? situations : [];
    let filtered = source;

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(situation => {
        const t = String(situation?.type ?? "").toLowerCase();
        const id = String(situation?.id ?? "").toLowerCase();
        return t.includes(q) || id.includes(q);
      });
    }

    if (typeFilter !== "all") {
      filtered = filtered.filter(situation => situation?.type === typeFilter);
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter(situation => 
        statusFilter === "active" ? !!situation?.isActive : !situation?.isActive
      );
    }

    setFilteredSituations(filtered);
  }, [situations, searchTerm, typeFilter, statusFilter]);

  // Удалены fetchSituations и fetchAvailableUnits - теперь данные приходят из Context
  
  const fetchSituationUnits = async (situationId: string) => {
    try {
      const response = await fetch(`/api/units/by-situation/${situationId}`);
      if (response.ok) {
        const data = await response.json();
        setSituationUnits(Array.isArray(data) ? data : []);
      } else {
        console.warn("Failed to fetch situation units", response.status, response.statusText);
        setSituationUnits([]);
      }
    } catch (error) {
      console.error("Error fetching situation units:", error);
      setSituationUnits([]);
    }
  };

  const createSituation = async () => {
    try {
      const response = await fetch("/api/situations/create", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-API-Key": "changeme-key"
        },
        body: JSON.stringify({
          ...newSituation,
          metadata: {
            ...(newSituation.metadata ?? {}),
            ...(newSituationChannel && newSituationChannel !== "none" ? { channel: newSituationChannel } : {}),
          }
        })
      });

      console.log('createSituation response status', response.status);
      let bodyData = null;
      try { bodyData = await response.json(); } catch (e) { /* ignore non-json */ }
      console.log('createSituation response body', bodyData);
      if (response.ok) {
        // Update the authoritative list.
        await refreshSituations();
        setIsCreateDialogOpen(false);
        setNewSituation({ type: "", metadata: {} });
        setNewSituationChannel("none");
        emitAppEvent('situations:updated');
        emitAppEvent('channels:updated');
      } else {
        console.error('Failed create situation, status:', response.status, bodyData);
        alert(`Ошибка создания ситуации: ${response.status} - ${JSON.stringify(bodyData)}`);
      }
    } catch (error) {
      console.error("Error creating situation:", error);
      alert(`Ошибка создания ситуации: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const updateSituationChannel = async (situation: SituationDto, channel: string) => {
    try {
      const metadata = { ...(situation.metadata ?? {}) } as Record<string, string>;
      if (channel && channel !== "none") {
        metadata.channel = channel;
      } else {
        delete metadata.channel;
      }
      const response = await fetch(`/api/situations/${situation.id}/metadata`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "changeme-key"
        },
        body: JSON.stringify({ metadata })
      });
      if (!response.ok) {
        throw new Error(`Failed to update channel: ${response.status}`);
      }
      setSelectedChannel(channel);
      setSelectedSituation(prev => prev ? { ...prev, metadata } : prev);
      await refreshSituations();
      emitAppEvent('situations:updated');
      emitAppEvent('channels:updated');
    } catch (error) {
      console.error('Error updating tactical channel:', error);
      alert(`Не удалось обновить тактический канал: ${error instanceof Error ? error.message : error}`);
    }
  };

  const saveSituationDetails = async () => {
    if (!selectedSituation) return;
    
    try {
      const metadata = {
        ...(selectedSituation.metadata as Record<string, string>),
        notes: editNotes.trim(),
        location: editLocation.trim(),
        priority: editPriority.trim(),
        title: editTitle.trim(),
      };

      const response = await fetch(`/api/situations/${selectedSituation.id}/metadata`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "changeme-key"
        },
        body: JSON.stringify({ metadata })
      });

      if (!response.ok) {
        throw new Error(`Failed to update situation: ${response.status}`);
      }

      setSelectedSituation(prev => prev ? { ...prev, metadata } : prev);
      await refreshSituations();
      setIsEditMode(false);
      emitAppEvent('situations:updated');
      alert("Детали ситуации успешно обновлены!");
    } catch (error) {
      console.error('Error updating situation details:', error);
      alert(`Не удалось обновить детали: ${error instanceof Error ? error.message : error}`);
    }
  };

  const closeSituation = async (situationId: string) => {
    if (!confirm("Закрыть ситуацию? Все юниты будут освобождены.")) return;

    try {
      const response = await fetch(`/api/situations/${situationId}/close`, {
        method: "POST",
        headers: { "X-API-Key": "changeme-key" }
      });

      if (response.ok) {
        await refreshSituations();
        await refreshUnits();
        emitAppEvent('situations:updated');
        emitAppEvent('units:updated');
        emitAppEvent('channels:updated');
      }
    } catch (error) {
      console.error("Error closing situation:", error);
    }
  };

  const addUnitToSituation = async (situationId: string, unitId: string, asLeadUnit: boolean = false) => {
    try {
      const response = await fetch(`/api/situations/${situationId}/units/add`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-API-Key": "changeme-key"
        },
        body: JSON.stringify({ unitId, asLeadUnit })
      });

      if (response.ok) {
        await refreshSituations();
        await refreshUnits();
        if (selectedSituation?.id === situationId) {
          await fetchSituationUnits(situationId);
        }
        emitAppEvent('situations:updated');
        emitAppEvent('units:updated');
      }
    } catch (error) {
      console.error("Error adding unit to situation:", error);
    }
  };

  const removeUnitFromSituation = async (situationId: string, unitId: string) => {
    if (!confirm("Убрать юнит с ситуации?")) return;

    try {
      const response = await fetch(`/api/situations/${situationId}/units/remove`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-API-Key": "changeme-key"
        },
        body: JSON.stringify({ unitId })
      });

      if (response.ok) {
        await refreshSituations();
        await refreshUnits();
        if (selectedSituation?.id === situationId) {
          await fetchSituationUnits(situationId);
        }
      }
    } catch (error) {
      console.error("Error removing unit from situation:", error);
    }
  };

  const setLeadUnit = async (situationId: string, unitId: string) => {
    try {
      const response = await fetch(`/api/situations/${situationId}/lead-unit`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-API-Key": "changeme-key"
        },
        body: JSON.stringify({ unitId })
      });

      if (response.ok) {
        await refreshSituations();
        if (selectedSituation?.id === situationId) {
          await fetchSituationUnits(situationId);
        }
        emitAppEvent('situations:updated');
        emitAppEvent('units:updated');
      }
    } catch (error) {
      console.error("Error setting lead unit:", error);
    }
  };

  const openSituationDetails = async (situation: SituationDto) => {
    const normalized = sanitizeSituation(situation);
    setSelectedSituation(normalized);
    const metadata = normalized.metadata as Record<string, string>;
    const channelValue = metadata?.channel;
    setSelectedChannel(channelValue || TACTICAL_CHANNELS[0].value);
    
    // Заполняем поля для редактирования
    setEditNotes(metadata?.notes || "");
    setEditLocation(metadata?.location || "");
    setEditPriority(metadata?.priority || "");
    setEditTitle(metadata?.title || "");
    setIsEditMode(false);
    
    await fetchSituationUnits(normalized.id);
  };

  const getSituationTypeInfo = (type: string) => {
    return SITUATION_TYPES.find(t => t.value === type) || { 
      value: type, 
      label: type, 
      color: "bg-muted/30 text-muted-foreground border-border/50" 
    };
  };

  const getActiveSituationsCount = () => (Array.isArray(situations) ? situations : []).filter(s => !!s?.isActive).length;
  const getTotalUnitsOnSituations = () => {
    const source = Array.isArray(situations) ? situations : [];
    return source.reduce((total, situation) => total + (Array.isArray(situation?.units) ? situation.units.length : 0), 0);
  };

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Управление ситуациями</CardTitle>
              <CardDescription>
                Активных: {getActiveSituationsCount()} | Всего: {Array.isArray(situations) ? situations.length : 0} | Юнитов задействовано: {getTotalUnitsOnSituations()}
              </CardDescription>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Создать ситуацию
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Создать новую ситуацию</DialogTitle>
                  <DialogDescription>
                    Создание новой критической ситуации
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="type" className="text-right">Тип</Label>
                    <Select value={newSituation.type} onValueChange={(value) => setNewSituation({...newSituation, type: value})}>
                      <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Выберите тип ситуации" />
                      </SelectTrigger>
                      <SelectContent>
                        {SITUATION_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="channel" className="text-right">Тактический канал</Label>
                    <Select value={newSituationChannel} onValueChange={setNewSituationChannel}>
                      <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Выберите канал" />
                      </SelectTrigger>
                      <SelectContent>
                        {TACTICAL_CHANNELS.map((channel) => (
                          <SelectItem key={channel.value || "none"} value={channel.value}>
                            {channel.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={createSituation} disabled={!newSituation.type}>
                    Создать ситуацию
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {/* Статистика */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="text-center p-3 bg-red-500/10 rounded-lg">
              <div className="text-2xl font-bold">{getActiveSituationsCount()}</div>
              <div className="text-sm text-muted-foreground">Активных ситуаций</div>
            </div>
            <div className="text-center p-3 bg-yellow-500/10 rounded-lg">
              <div className="text-2xl font-bold">
                {(Array.isArray(situations) ? situations : []).filter(s => s?.redUnitId).length}
              </div>
              <div className="text-sm text-muted-foreground">С Red Unit (командирами)</div>
            </div>
            <div className="text-center p-3 bg-blue-500/10 rounded-lg">
              <div className="text-2xl font-bold">{getTotalUnitsOnSituations()}</div>
              <div className="text-sm text-muted-foreground">Юнитов задействовано</div>
            </div>
            <div className="text-center p-3 bg-green-500/10 rounded-lg">
              <div className="text-2xl font-bold">{Array.isArray(units) ? units.filter(u => !u.situationId).length : 0}</div>
              <div className="text-sm text-muted-foreground">Доступных юнитов</div>
            </div>
          </div>

          {/* Фильтры и поиск */}
          <div className="flex gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Поиск по типу или ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Фильтр по типу" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все типы</SelectItem>
                {SITUATION_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Фильтр по статусу" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="active">Активные</SelectItem>
                <SelectItem value="closed">Закрытые</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Таблица ситуаций */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Юнитов</TableHead>
                  <TableHead>Ведущий юнит</TableHead>
                  <TableHead>Создана</TableHead>
                  <TableHead>Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center">Загрузка...</TableCell>
                  </TableRow>
                ) : (Array.isArray(filteredSituations) ? filteredSituations.length : 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center">Ситуации не найдены</TableCell>
                  </TableRow>
                ) : (
                  (Array.isArray(filteredSituations) ? filteredSituations : []).map((situation) => {
                    const typeInfo = getSituationTypeInfo(situation?.type ?? "unknown");
                    const unitCount = Array.isArray(situation?.units) ? situation.units.length : 0;
                    const createdAtSafe = situation?.createdAt ? new Date(situation.createdAt) : null;
                    return (
                      <TableRow key={situation?.id ?? ""}>
                        <TableCell className="font-mono text-sm">
                          {String(situation?.id ?? "").substring(0, 8)}...
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge className={typeInfo.color}>
                              {typeInfo.label}
                            </Badge>
                            {(situation?.type?.toLowerCase() === 'panic' || situation?.type?.toLowerCase() === 'pursuit') && situation?.isActive && (
                              <Badge className="bg-red-600 text-white animate-pulse">
                                🔴 LIVE
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={situation?.isActive ? "destructive" : "secondary"}>
                            {situation?.isActive ? "Активна" : "Закрыта"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            {unitCount}
                          </div>
                        </TableCell>
                        <TableCell>
                          {situation?.redUnitId ? (
                            <Badge className="bg-red-500/15 text-red-200 border-red-500/50">
                              <Crown className="w-3 h-3 mr-1" />
                              Red Unit
                            </Badge>
                          ) : (
                            <Badge variant="outline">Нет командира</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {createdAtSafe ? createdAtSafe.toLocaleString("ru-RU") : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openSituationDetails(situation)}
                            >
                              <Target className="w-4 h-4" />
                            </Button>
                            {situation?.isActive && (
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => situation?.id && closeSituation(situation.id)}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Диалог детали ситуации */}
      <Dialog open={!!selectedSituation} onOpenChange={() => setSelectedSituation(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Ситуация: {selectedSituation ? (getSituationTypeInfo(selectedSituation?.type ?? "unknown")?.label ?? "Неизвестно") : ""}
            </DialogTitle>
            <DialogDescription>
              ID: {selectedSituation?.id ?? "—"} | Создана: {selectedSituation?.createdAt ? new Date(selectedSituation.createdAt).toLocaleString("ru-RU") : "—"}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {/* Edit Mode Section */}
            {isEditMode ? (
              <div className="space-y-4 mb-6 border rounded-lg p-4 bg-muted/20">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-sm">Редактирование деталей</h4>
                  <Button variant="ghost" size="sm" onClick={() => setIsEditMode(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid gap-4">
                  <div>
                    <Label htmlFor="edit-title">Заголовок</Label>
                    <Input 
                      id="edit-title"
                      value={editTitle} 
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Краткое описание ситуации"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-location">Локация</Label>
                    <Input 
                      id="edit-location"
                      value={editLocation} 
                      onChange={(e) => setEditLocation(e.target.value)}
                      placeholder="Место происшествия"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-priority">Приоритет</Label>
                    <Select value={editPriority} onValueChange={setEditPriority}>
                      <SelectTrigger id="edit-priority">
                        <SelectValue placeholder="Выберите приоритет" />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="edit-notes">Комментарии</Label>
                    <Textarea 
                      id="edit-notes"
                      value={editNotes} 
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Дополнительная информация, комментарии..."
                      rows={4}
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button onClick={saveSituationDetails} className="gap-2">
                    <Save className="h-4 w-4" />
                    Сохранить
                  </Button>
                  <Button variant="outline" onClick={() => setIsEditMode(false)}>
                    Отмена
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mb-6 border rounded-lg p-4 bg-muted/20">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-sm">Детали ситуации</h4>
                  <Button variant="outline" size="sm" onClick={() => setIsEditMode(true)} className="gap-2">
                    <Edit className="h-4 w-4" />
                    Редактировать
                  </Button>
                </div>
                <div className="grid gap-2 text-sm">
                  {editTitle && (
                    <div>
                      <span className="text-muted-foreground">Заголовок:</span> {editTitle}
                    </div>
                  )}
                  {editLocation && (
                    <div>
                      <span className="text-muted-foreground">Локация:</span> {editLocation}
                    </div>
                  )}
                  {editPriority && (
                    <div>
                      <span className="text-muted-foreground">Приоритет:</span> {PRIORITY_OPTIONS.find(p => p.value === editPriority)?.label || editPriority}
                    </div>
                  )}
                  {editNotes && (
                    <div>
                      <span className="text-muted-foreground">Комментарии:</span>
                      <div className="mt-1 whitespace-pre-wrap">{editNotes}</div>
                    </div>
                  )}
                  {!editTitle && !editLocation && !editPriority && !editNotes && (
                    <div className="text-muted-foreground italic">Нет дополнительной информации</div>
                  )}
                </div>
              </div>
            )}
            
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-semibold">Юниты на ситуации ({Array.isArray(situationUnits) ? situationUnits.length : 0})</h4>
              <div className="flex items-center gap-4">
                <div className="grid gap-1">
                  <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Тактический канал</Label>
                  <Select
                    value={selectedChannel}
                    onValueChange={(value) => {
                      if (selectedSituation) {
                        updateSituationChannel(selectedSituation, value);
                      }
                    }}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Канал" />
                    </SelectTrigger>
                    <SelectContent>
                      {TACTICAL_CHANNELS.map((channel) => (
                        <SelectItem key={channel.value || "none"} value={channel.value}>
                          {channel.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Dialog open={showAddUnitDialog} onOpenChange={setShowAddUnitDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      Добавить юнит
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Добавить юнит на ситуацию</DialogTitle>
                    </DialogHeader>
                    <div className="py-4 max-h-60 overflow-y-auto">
                      {(Array.isArray(units.filter(u => !u.situationId)) ? units.filter(u => !u.situationId).length : 0) === 0 ? (
                        <p className="text-muted-foreground">Нет доступных юнитов</p>
                      ) : (
                        (Array.isArray(units.filter(u => !u.situationId)) ? units.filter(u => !u.situationId) : []).map((unit) => (
                          <div key={unit?.id} className="flex items-center justify-between py-2 border-b">
                            <div>
                              <span className="font-medium">{unit?.marking ?? "—"}</span>
                              <Badge className="ml-2" variant="outline">
                                {unit?.playerCount ?? 0} игроков
                              </Badge>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  if (selectedSituation && unit?.id) {
                                    addUnitToSituation(selectedSituation.id, unit.id, false);
                                    setShowAddUnitDialog(false);
                                  }
                                }}
                              >
                                Green Unit
                              </Button>
                              <Button
                                size="sm"
                                className="bg-yellow-600 hover:bg-yellow-700"
                                onClick={() => {
                                  if (selectedSituation && unit?.id) {
                                    addUnitToSituation(selectedSituation.id, unit.id, true);
                                    setShowAddUnitDialog(false);
                                  }
                                }}
                              >
                                <Crown className="w-3 h-3 mr-1" />
                                Lead Unit
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="space-y-2">
              {(Array.isArray(situationUnits) ? situationUnits.length : 0) === 0 ? (
                <p className="text-muted-foreground">На ситуации нет юнитов</p>
              ) : (
                <div className="space-y-4">
                  {/* Green Unit (Инициатор) */}
                  {selectedSituation?.greenUnitId && (
                    <div>
                      <h5 className="font-medium text-green-400 mb-2 flex items-center">
                        <Target className="w-4 h-4 mr-2" />
                        Green Unit (Инициатор)
                      </h5>
                      {(Array.isArray(situationUnits) ? situationUnits : [])
                        .filter(unit => unit?.id === selectedSituation?.greenUnitId)
                        .map((unit) => (
                          <div key={unit?.id} className="flex items-center justify-between p-3 border border-green-500/50 bg-green-500/10 rounded">
                            <div>
                              <span className="font-medium">{unit?.marking ?? "—"}</span>
                              <Badge className="ml-2" variant="outline">
                                {unit?.playerCount ?? 0} игроков
                              </Badge>
                            </div>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                if (selectedSituation) {
                                  removeUnitFromSituation(selectedSituation.id, unit.id);
                                }
                              }}
                            >
                              Убрать
                            </Button>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* Red Unit (Командир/Сержант) */}
                  {selectedSituation?.redUnitId && (
                    <div>
                      <h5 className="font-medium text-red-400 mb-2 flex items-center">
                        <Crown className="w-4 h-4 mr-2" />
                        Red Unit (Командир)
                      </h5>
                      {(Array.isArray(situationUnits) ? situationUnits : [])
                        .filter(unit => unit?.id === selectedSituation?.redUnitId)
                        .map((unit) => (
                          <div key={unit?.id} className="flex items-center justify-between p-3 border border-red-500/50 bg-red-500/10 rounded">
                            <div>
                              <span className="font-medium">{unit?.marking ?? "—"}</span>
                              <Badge className="ml-2" variant="outline">
                                {unit?.playerCount ?? 0} игроков
                              </Badge>
                            </div>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                if (selectedSituation) {
                                  removeUnitFromSituation(selectedSituation.id, unit.id);
                                }
                              }}
                            >
                              Убрать
                            </Button>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* Regular Units (Обычные юниты) */}
                  {(Array.isArray(situationUnits) ? situationUnits : [])
                    .filter(unit => 
                      unit?.id !== selectedSituation?.greenUnitId && 
                      unit?.id !== selectedSituation?.redUnitId
                    ).length > 0 && (
                    <div>
                      <h5 className="font-medium text-blue-400 mb-2 flex items-center">
                        <Users className="w-4 h-4 mr-2" />
                        Обычные юниты
                      </h5>
                      {(Array.isArray(situationUnits) ? situationUnits : [])
                        .filter(unit => 
                          unit?.id !== selectedSituation?.greenUnitId && 
                          unit?.id !== selectedSituation?.redUnitId
                        )
                        .map((unit) => (
                          <div key={unit?.id} className="flex items-center justify-between p-3 border border-blue-500/50 bg-blue-500/10 rounded">
                            <div>
                              <span className="font-medium">{unit?.marking ?? "—"}</span>
                              <Badge className="ml-2" variant="outline">
                                {unit?.playerCount ?? 0} игроков
                              </Badge>
                            </div>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                if (selectedSituation && unit?.id) {
                                  removeUnitFromSituation(selectedSituation.id, unit.id);
                                }
                              }}
                            >
                              Убрать
                            </Button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
