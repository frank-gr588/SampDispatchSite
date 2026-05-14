using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SaMapViewer.Data;
using SaMapViewer.Models;

namespace SaMapViewer.Services
{
    public class PlayerTrackerService
    {
        private readonly SaMapDbContext _db;
        private readonly TimeSpan _timeout;
        private readonly ILogger<PlayerTrackerService> _logger;

        public PlayerTrackerService(
            SaMapDbContext db,
            Microsoft.Extensions.Options.IOptions<SaOptions> options,
            ILogger<PlayerTrackerService> logger)
        {
            _db = db;
            var seconds = Math.Max(1, options.Value.PlayerTtlSeconds);
            _timeout = TimeSpan.FromSeconds(seconds);
            _logger = logger;
            _logger.LogInformation("PlayerTrackerService initialized with timeout: {Timeout} seconds", seconds);
        }

        // Устаревший метод для совместимости с Lua скриптом
        // Устаревший метод для совместимости с Lua скриптом
        public Task Update(string nick, float x, float y) => UpdatePlayer(nick, x, y, true);

        public async Task UpdatePlayer(string nick, float x, float y, bool inVehicle = true)
        {
            _logger.LogDebug("Updating player coordinates: {Nick} at ({X}, {Y}) inVehicle={InVehicle}", nick, x, y, inVehicle);

            var player = await _db.Players.FindAsync(nick);
            if (player == null)
            {
                _logger.LogInformation("Creating new player from script: {Nick} at ({X}, {Y})", nick, x, y);
                player = new PlayerPoint(nick, x, y) { InVehicle = inVehicle };
                _db.Players.Add(player);
            }
            else
            {
                _logger.LogDebug("Updating existing player: {Nick} from ({OldX}, {OldY}) to ({NewX}, {NewY}) inVehicle={InVehicle}",
                    nick, player.X, player.Y, x, y, inVehicle);

                if (!inVehicle)
                {
                    player.SetInVehicle(false);
                }
                else
                {
                    player.SetInVehicle(true);
                    player.Update(x, y);
                }
            }

            await _db.SaveChangesAsync();
        }

        // Устаревший метод для совместимости с Lua скриптом
        public async Task SetStatus(string nick, string status)
        {
            // Конвертация старых строковых статусов в новые enum
            var playerStatus = status.ToLower() switch
            {
                "ничего" => PlayerStatus.OutOfDuty,
                "patrol" => PlayerStatus.OnDuty,
                "lead" => PlayerStatus.OnDutyLeadUnit,
                _ => PlayerStatus.OnDuty
            };

            await SetPlayerStatus(nick, playerStatus);
        }

        public async Task SetPlayerStatus(string nick, PlayerStatus status)
        {
            var player = await _db.Players.FindAsync(nick);
            if (player == null)
            {
                _logger.LogWarning("SetPlayerStatus called on non-existent player: {Nick} - creating with manual coordinates", nick);
                player = new PlayerPoint(nick, -10000f, -10000f);
                _db.Players.Add(player);
            }

            _logger.LogDebug("Setting player status: {Nick} from {OldStatus} to {NewStatus}", nick, player.Status, status);
            player.SetStatus(status);
            await _db.SaveChangesAsync();
        }

        public Task<PlayerPoint?> GetPlayer(string nick) => _db.Players.AsNoTracking().FirstOrDefaultAsync(p => p.Nick == nick);

        public Task<List<PlayerPoint>> GetAllPlayers() => _db.Players.AsNoTracking().ToListAsync();

        public async Task<List<PlayerPoint>> GetAlivePlayers()
        {
            var now = DateTime.UtcNow;
            var alivePlayers = await _db.Players
                .AsNoTracking()
                .Where(p => (p.X == -10000f && p.Y == -10000f) || (now - p.LastUpdate < _timeout))
                .ToListAsync();

            var total = await _db.Players.CountAsync();
            _logger.LogDebug("GetAlivePlayers: {TotalPlayers} total, {AlivePlayers} alive (timeout: {Timeout}s)", total, alivePlayers.Count, _timeout.TotalSeconds);
            return alivePlayers;
        }

        public async Task RemovePlayer(string nick)
        {
            var player = await _db.Players.FindAsync(nick);
            if (player == null)
            {
                _logger.LogWarning("Attempted to remove non-existent player: {Nick}", nick);
                return;
            }

            _db.Players.Remove(player);
            await _db.SaveChangesAsync();
            _logger.LogInformation("Removed player: {Nick} (was at {X}, {Y})", nick, player.X, player.Y);
        }

        public async Task AddPlayer(PlayerPoint player)
        {
            _logger.LogInformation("Adding player manually: {Nick} at ({X}, {Y}) with status {Status} and role {Role}", 
                player.Nick, player.X, player.Y, player.Status, player.Role);

            var existing = await _db.Players.FindAsync(player.Nick);
            if (existing == null)
            {
                _db.Players.Add(player);
            }
            else
            {
                _db.Entry(existing).CurrentValues.SetValues(player);
            }

            await _db.SaveChangesAsync();
        }

        public Task<List<PlayerPoint>> GetPlayersByStatus(PlayerStatus status) =>
            _db.Players.AsNoTracking().Where(p => p.Status == status).ToListAsync();

        public Task<List<PlayerPoint>> GetPlayersByRole(PlayerRole role) =>
            _db.Players.AsNoTracking().Where(p => p.Role == role).ToListAsync();

        public async Task SetPlayerAFK(string nick, bool isAFK)
        {
            var player = await _db.Players.FindAsync(nick);
            if (player == null)
            {
                _logger.LogWarning("Attempted to set AFK status for non-existent player: {Nick}", nick);
                return;
            }

            player.IsAFK = isAFK;
            player.LastUpdate = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            _logger.LogInformation("Player {Nick} AFK status set to: {IsAFK}", nick, isAFK);
        }

        public async Task<List<PlayerPoint>> GetAvailablePlayersForUnit()
        {
            var now = DateTime.UtcNow;
            var timeout = _timeout;
            var onDutyOutOfUnit = PlayerStatus.OnDutyOutOfUnit;
            var onDuty = PlayerStatus.OnDuty;
            
            // Fetch all players and filter in memory (SQLite doesn't support complex LINQ translations)
            var allPlayers = await _db.Players
                .AsNoTracking()
                .ToListAsync();
            
            var availablePlayers = allPlayers
                .Where(p =>
                    ((p.X == -10000f && p.Y == -10000f) || (now - p.LastUpdate < timeout)) &&
                    (p.Status == onDutyOutOfUnit || p.Status == onDuty) &&
                    !p.UnitId.HasValue)
                .ToList();

            _logger.LogDebug("GetAvailablePlayersForUnit: {Count} players available for units", availablePlayers.Count);
            return availablePlayers;
        }

        public async Task AssignPlayerToUnit(string nick, Guid unitId)
        {
            var player = await _db.Players.FindAsync(nick);
            if (player == null)
            {
                _logger.LogWarning("Cannot assign player {Nick} to unit {UnitId} - player not found", nick, unitId);
                return;
            }

            _logger.LogInformation("Assigning player {Nick} to unit {UnitId}", nick, unitId);
            player.AssignToUnit(unitId);
            await _db.SaveChangesAsync();
        }

        public async Task RemovePlayerFromUnit(string nick)
        {
            var player = await _db.Players.FindAsync(nick);
            if (player == null)
            {
                _logger.LogWarning("Cannot remove player {Nick} from unit - player not found", nick);
                return;
            }

            _logger.LogInformation("Removing player {Nick} from unit {UnitId}", nick, player.UnitId);
            player.RemoveFromUnit();
            await _db.SaveChangesAsync();
        }
    }
}