import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Radio, Users, Activity, RefreshCw, Clock, Edit, Save, X, MessageSquare } from "lucide-react";
import { TacticalChannelDto } from "@shared/api";
import { cn } from "@/lib/utils";
import { useData } from "@/contexts/DataContext";

interface TacticalChannelsProps {
  className?: string;
}

export function TacticalChannels({ className }: TacticalChannelsProps) {
  const { tacticalChannels: channels, refreshTacticalChannels } = useData();
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState<string>("");

  const fetchChannels = async () => {
    try {
      setIsLoading(true);
      await refreshTacticalChannels();
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Error fetching channels:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchChannels();
    
    // Обновляем каждые 5 секунд
    const interval = setInterval(fetchChannels, 5000);
    
    // Слушаем события обновления ситуаций и каналов
    const handleUpdate = () => {
      fetchChannels();
    };
    
    window.addEventListener('situations:updated', handleUpdate);
    window.addEventListener('channels:updated', handleUpdate);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('situations:updated', handleUpdate);
      window.removeEventListener('channels:updated', handleUpdate);
    };
  }, []);

  const busyChannels = channels.filter(c => c.isBusy).length;
  const freeChannels = channels.filter(c => !c.isBusy).length;

  const startEditingNotes = (channel: TacticalChannelDto) => {
    setEditingChannelId(channel.id);
    setEditNotes(channel.notes || "");
  };

  const cancelEditingNotes = () => {
    setEditingChannelId(null);
    setEditNotes("");
  };

  const saveChannelNotes = async (channelId: string) => {
    try {
      const response = await fetch(`/api/channels/${channelId}/notes`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "changeme-key"
        },
        body: JSON.stringify({ notes: editNotes.trim() })
      });

      if (!response.ok) {
        throw new Error(`Failed to update notes: ${response.status}`);
      }

      // Refresh channels from Context
      await refreshTacticalChannels();
      
      setEditingChannelId(null);
      setEditNotes("");
    } catch (error) {
      console.error("Error saving channel notes:", error);
      alert(`Не удалось сохранить комментарий: ${error instanceof Error ? error.message : error}`);
    }
  };

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Radio className="w-6 h-6" />
                Тактические каналы
              </CardTitle>
              <CardDescription>
                Статус и доступность радиоканалов
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchChannels}
              disabled={isLoading}
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
              Обновить
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Статистика */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4 bg-blue-500/10 rounded-lg">
              <div className="text-3xl font-bold text-blue-400">{channels.length}</div>
              <div className="text-sm text-muted-foreground">Всего каналов</div>
            </div>
            <div className="text-center p-4 bg-red-500/10 rounded-lg">
              <div className="text-3xl font-bold text-red-400">{busyChannels}</div>
              <div className="text-sm text-muted-foreground">Заняты</div>
            </div>
            <div className="text-center p-4 bg-green-500/10 rounded-lg">
              <div className="text-3xl font-bold text-green-400">{freeChannels}</div>
              <div className="text-sm text-muted-foreground">Свободны</div>
            </div>
          </div>

          {/* Последнее обновление */}
          {lastUpdate && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <Clock className="w-4 h-4" />
              Обновлено: {lastUpdate.toLocaleTimeString("ru-RU")}
            </div>
          )}

          {/* Список каналов */}
          <div className="space-y-3">
            {isLoading && channels.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Загрузка...
              </div>
            ) : channels.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Нет доступных каналов
              </div>
            ) : (
              channels.map((channel) => (
                <Card
                  key={channel.id}
                  className={cn(
                    "transition-all",
                    channel.isBusy
                      ? "border-red-500/50 bg-red-500/5"
                      : "border-green-500/50 bg-green-500/5"
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {/* Иконка статуса */}
                        <div
                          className={cn(
                            "w-12 h-12 rounded-full flex items-center justify-center",
                            channel.isBusy
                              ? "bg-red-500/20 text-red-400"
                              : "bg-green-500/20 text-green-400"
                          )}
                        >
                          <Radio className={cn("w-6 h-6", channel.isBusy && "animate-pulse")} />
                        </div>

                        {/* Информация о канале */}
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-lg font-semibold">{channel.name}</h3>
                            <Badge
                              variant={channel.isBusy ? "destructive" : "default"}
                              className={cn(
                                channel.isBusy
                                  ? "bg-red-500/20 text-red-200 border-red-500/50"
                                  : "bg-green-500/20 text-green-200 border-green-500/50"
                              )}
                            >
                              {channel.isBusy ? "Занят" : "Свободен"}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground font-mono">
                            ID: {channel.id}
                          </div>
                          {channel.situationId && (
                            <div className="flex items-center gap-2 mt-2">
                              <Activity className="w-4 h-4 text-amber-400" />
                              <span className="text-sm text-amber-400">
                                Ситуация: {String(channel.situationId).substring(0, 8)}...
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Дополнительная информация */}
                      <div className="text-right">
                        {channel.isBusy ? (
                          <div className="flex items-center gap-2 text-red-400">
                            <Users className="w-5 h-5" />
                            <span className="text-sm font-medium">В использовании</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-green-400">
                            <Activity className="w-5 h-5" />
                            <span className="text-sm font-medium">Доступен</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Notes Section */}
                    {editingChannelId === channel.id ? (
                      <div className="mt-4 pt-4 border-t space-y-2">
                        <Label htmlFor={`notes-${channel.id}`} className="flex items-center gap-2">
                          <MessageSquare className="w-4 h-4" />
                          Комментарий
                        </Label>
                        <Input
                          id={`notes-${channel.id}`}
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder="Добавьте комментарий..."
                          className="text-sm"
                        />
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            onClick={() => saveChannelNotes(channel.id)}
                            className="gap-1"
                          >
                            <Save className="w-3 h-3" />
                            Сохранить
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={cancelEditingNotes}
                            className="gap-1"
                          >
                            <X className="w-3 h-3" />
                            Отмена
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 pt-4 border-t">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            {channel.notes ? (
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <MessageSquare className="w-4 h-4 text-muted-foreground" />
                                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Комментарий:</span>
                                </div>
                                <p className="text-sm">{channel.notes}</p>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <MessageSquare className="w-4 h-4" />
                                <span className="text-sm italic">Нет комментариев</span>
                              </div>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEditingNotes(channel)}
                            className="gap-1"
                          >
                            <Edit className="w-3 h-3" />
                            Изменить
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Легенда */}
          <div className="mt-6 p-4 bg-muted/20 rounded-lg">
            <h4 className="text-sm font-semibold mb-3">Информация:</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-muted-foreground">Свободный канал - доступен для назначения</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-muted-foreground">Занятый канал - используется ситуацией</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
