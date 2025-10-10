using SaMapViewer.Models;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Extensions.Logging;

namespace SaMapViewer.Services
{
    public class PlayerTrackerService
    {
        private readonly ConcurrentDictionary<string, PlayerPoint> _players = new();
        private readonly TimeSpan _timeout;
        private readonly ILogger<PlayerTrackerService> _logger;

        public PlayerTrackerService(Microsoft.Extensions.Options.IOptions<SaMapViewer.Services.SaOptions> options, ILogger<PlayerTrackerService> logger)
        {
            var seconds = Math.Max(1, options.Value.PlayerTtlSeconds);
            _timeout = TimeSpan.FromSeconds(seconds);
            _logger = logger;
            _logger.LogInformation("PlayerTrackerService initialized with timeout: {Timeout} seconds", seconds);
        }

        // Устаревший метод для совместимости с Lua скриптом
        public void Update(string nick, float x, float y)
        {
            UpdatePlayer(nick, x, y);
        }

        public void UpdatePlayer(string nick, float x, float y)
        {
            _logger.LogDebug("Updating player coordinates: {Nick} at ({X}, {Y})", nick, x, y);
            
            _players.AddOrUpdate(nick,
                _ => {
                    _logger.LogInformation("Creating new player from script: {Nick} at ({X}, {Y})", nick, x, y);
                    return new PlayerPoint(nick, x, y);
                },
                (_, existing) =>
                {
                    _logger.LogDebug("Updating existing player: {Nick} from ({OldX}, {OldY}) to ({NewX}, {NewY})", 
                        nick, existing.X, existing.Y, x, y);
                    existing.Update(x, y);
                    return existing;
                });
        }

        // Устаревший метод для совместимости с Lua скриптом
        public void SetStatus(string nick, string status)
        {
            // Конвертация старых строковых статусов в новые enum
            var playerStatus = status.ToLower() switch
            {
                "ничего" => PlayerStatus.OutOfDuty,
                "patrol" => PlayerStatus.OnDuty,
                "lead" => PlayerStatus.OnDutyLeadUnit,
                _ => PlayerStatus.OnDuty
            };

            SetPlayerStatus(nick, playerStatus);
        }

        public void SetPlayerStatus(string nick, PlayerStatus status)
        {
            _players.AddOrUpdate(nick,
                _ =>
                {
                    // ВАЖНО: если игрока нет в словаре, логируем предупреждение
                    // SetPlayerStatus должен вызываться только на существующих игроках!
                    _logger.LogWarning("SetPlayerStatus called on non-existent player: {Nick} - creating with manual coordinates", nick);
                    var p = new PlayerPoint(nick, -10000f, -10000f); // Создаем с "manual" координатами
                    p.SetStatus(status);
                    return p;
                },
                (_, existing) =>
                {
                    _logger.LogDebug("Setting player status: {Nick} from {OldStatus} to {NewStatus}", nick, existing.Status, status);
                    existing.SetStatus(status);
                    return existing;
                });
        }

        public PlayerPoint? GetPlayer(string nick)
        {
            _players.TryGetValue(nick, out var player);
            return player;
        }

        public List<PlayerPoint> GetAllPlayers()
        {
            return _players.Values.ToList();
        }

        public List<PlayerPoint> GetAlivePlayers()
        {
            var now = DateTime.UtcNow;
            var alivePlayers = _players.Values
                .Where(p => 
                    // Игроки созданные вручную (координаты -10000, -10000) всегда считаются "живыми"
                    (p.X == -10000f && p.Y == -10000f) || 
                    // Или игроки которые обновлялись недавно
                    (now - p.LastUpdate < _timeout)
                )
                .ToList();

            _logger.LogDebug("GetAlivePlayers: {TotalPlayers} total, {AlivePlayers} alive (timeout: {Timeout}s)", 
                _players.Count, alivePlayers.Count, _timeout.TotalSeconds);
                
            return alivePlayers;
        }

        public void RemovePlayer(string nick)
        {
            if (_players.TryRemove(nick, out var removedPlayer))
            {
                _logger.LogInformation("Removed player: {Nick} (was at {X}, {Y})", nick, removedPlayer.X, removedPlayer.Y);
            }
            else
            {
                _logger.LogWarning("Attempted to remove non-existent player: {Nick}", nick);
            }
        }

        public void AddPlayer(PlayerPoint player)
        {
            _logger.LogInformation("Adding player manually: {Nick} at ({X}, {Y}) with status {Status} and role {Role}", 
                player.Nick, player.X, player.Y, player.Status, player.Role);
            
            _players.AddOrUpdate(player.Nick, player, (_, existing) => {
                _logger.LogInformation("Replacing existing player: {Nick}", player.Nick);
                return player;
            });
        }

        public List<PlayerPoint> GetPlayersByStatus(PlayerStatus status)
        {
            return _players.Values
                .Where(p => p.Status == status)
                .ToList();
        }

        public List<PlayerPoint> GetPlayersByRole(PlayerRole role)
        {
            return _players.Values
                .Where(p => p.Role == role)
                .ToList();
        }

        public void SetPlayerAFK(string nick, bool isAFK)
        {
            if (_players.TryGetValue(nick, out var player))
            {
                player.IsAFK = isAFK;
                player.LastUpdate = DateTime.UtcNow;
                _logger.LogInformation("Player {Nick} AFK status set to: {IsAFK}", nick, isAFK);
            }
            else
            {
                _logger.LogWarning("Attempted to set AFK status for non-existent player: {Nick}", nick);
            }
        }

        public List<PlayerPoint> GetAvailablePlayersForUnit()
        {
            var availablePlayers = GetAlivePlayers() // Используем GetAlivePlayers чтобы включить созданных вручную
                .Where(p => p.Status == PlayerStatus.OnDutyOutOfUnit || p.Status == PlayerStatus.OnDuty)
                .Where(p => !p.UnitId.HasValue)
                .ToList();

            _logger.LogDebug("GetAvailablePlayersForUnit: {Count} players available for units", availablePlayers.Count);
            foreach (var player in availablePlayers)
            {
                _logger.LogDebug("Available player: {Nick} (Status: {Status}, Role: {Role}, Manual: {IsManual})", 
                    player.Nick, player.Status, player.Role, player.X == -10000f && player.Y == -10000f);
            }
            
            return availablePlayers;
        }

        public void AssignPlayerToUnit(string nick, Guid unitId)
        {
            if (_players.TryGetValue(nick, out var player))
            {
                _logger.LogInformation("Assigning player {Nick} to unit {UnitId}", nick, unitId);
                player.AssignToUnit(unitId);
            }
            else
            {
                _logger.LogWarning("Cannot assign player {Nick} to unit {UnitId} - player not found", nick, unitId);
            }
        }

        public void RemovePlayerFromUnit(string nick)
        {
            if (_players.TryGetValue(nick, out var player))
            {
                _logger.LogInformation("Removing player {Nick} from unit {UnitId}", nick, player.UnitId);
                player.RemoveFromUnit();
            }
            else
            {
                _logger.LogWarning("Cannot remove player {Nick} from unit - player not found", nick);
            }
        }
    }
}