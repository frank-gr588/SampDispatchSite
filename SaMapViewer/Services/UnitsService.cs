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
    public class UnitsService
    {
        private readonly SaMapDbContext _db;
        private readonly PlayerTrackerService _playerTracker;
        private readonly ILogger<UnitsService> _logger;

        public UnitsService(SaMapDbContext db, PlayerTrackerService playerTracker, ILogger<UnitsService> logger)
        {
            _db = db;
            _playerTracker = playerTracker;
            _logger = logger;
        }

        public async Task<Unit> CreateUnit(string marking, List<string> playerNicks, bool isLeadUnit = false, string creatorNick = "")
        {
            // Валидация маркировки
            if (string.IsNullOrWhiteSpace(marking) || marking.Length > 8)
                throw new ArgumentException("Marking must be 1-8 characters");

            // Проверяем, что все игроки доступны для создания юнита
            foreach (var nick in playerNicks)
            {
                var player = await _playerTracker.GetPlayer(nick);
                if (player == null)
                    throw new ArgumentException($"Player '{nick}' not found");

                if (player.UnitId.HasValue)
                    throw new InvalidOperationException($"Player '{nick}' is already in a unit");
            }

            var unit = new Unit
            {
                Marking = marking,
                PlayerNicks = new HashSet<string>(playerNicks, StringComparer.OrdinalIgnoreCase),
                IsLeadUnit = isLeadUnit,
                CreatorNick = creatorNick
            };

            _db.Units.Add(unit);

            // Назначаем игроков в юнит
            // If the unit is marked as a lead unit, mark only the first player as the lead player.
            for (int i = 0; i < playerNicks.Count; i++)
            {
                var nick = playerNicks[i];
                var player = await _playerTracker.GetPlayer(nick);
                if (player != null)
                {
                    if (isLeadUnit && i == 0)
                    {
                        await _playerTracker.SetPlayerStatus(nick, PlayerStatus.OnDutyLeadUnit);
                        unit.IsLeadUnit = true;
                    }
                    else
                    {
                        await _playerTracker.SetPlayerStatus(nick, PlayerStatus.OnDuty);
                    }

                    await _playerTracker.AssignPlayerToUnit(nick, unit.Id);
                }
            }

            await _db.SaveChangesAsync();

            return unit;
        }

        public Task<Unit> CreateUnitFromSinglePlayer(string marking, string playerNick, bool isLeadUnit = false)
        {
            return CreateUnit(marking, new List<string> { playerNick }, isLeadUnit);
        }

        public Task<Unit?> GetUnit(Guid id) => _db.Units.FindAsync(id).AsTask();

        public async Task<(bool, Unit?)> TryGet(Guid id)
        {
            var unit = await _db.Units.FindAsync(id);
            return (unit != null, unit);
        }

        public Task<List<Unit>> GetAll() => _db.Units.AsNoTracking().OrderBy(u => u.Marking).ToListAsync();

        public async Task RemoveUnit(Guid id)
        {
            var unit = await _db.Units.FindAsync(id);
            if (unit == null) return;

            foreach (var nick in unit.PlayerNicks.ToList())
            {
                await _playerTracker.RemovePlayerFromUnit(nick);
            }

            _db.Units.Remove(unit);
            await _db.SaveChangesAsync();
        }

        public async Task AddPlayerToUnit(Guid unitId, string playerNick)
        {
            var unit = await GetUnit(unitId);
            if (unit == null)
                throw new ArgumentException($"Unit {unitId} not found");

            var player = await _playerTracker.GetPlayer(playerNick);
            if (player == null)
                throw new ArgumentException($"Player '{playerNick}' not found");

            if (player.UnitId.HasValue)
                throw new InvalidOperationException($"Player '{playerNick}' is already in a unit");

            // Добавляем игрока в юнит
            unit.PlayerNicks.Add(playerNick);

            // Determine if there is already a lead player in the unit (player with OnDutyLeadUnit status)
            var unitPlayers = await _db.Players.Where(p => unit.PlayerNicks.Contains(p.Nick)).ToListAsync();
            bool hasLeadPlayer = unitPlayers.Any(p => p.Status == PlayerStatus.OnDutyLeadUnit);

            // If unit is configured as a lead unit and there is no lead yet, make this new player the lead; otherwise set as normal OnDuty
            if (unit.IsLeadUnit && !hasLeadPlayer)
            {
                await _playerTracker.SetPlayerStatus(playerNick, PlayerStatus.OnDutyLeadUnit);
            }
            else
            {
                await _playerTracker.SetPlayerStatus(playerNick, PlayerStatus.OnDuty);
            }

            await _playerTracker.AssignPlayerToUnit(playerNick, unitId);
            _db.Units.Update(unit);
            await _db.SaveChangesAsync();
        }

        public async Task RemovePlayerFromUnit(Guid unitId, string playerNick)
        {
            var unit = await GetUnit(unitId);
            if (unit == null)
                return;
            if (unit.PlayerNicks.Remove(playerNick))
            {
                await _playerTracker.RemovePlayerFromUnit(playerNick);

                // Если юнит стал пустым, удаляем его
                if (unit.PlayerNicks.Count == 0)
                {
                    await RemoveUnit(unitId);
                }
                else
                {
                    // Если после удаления в юните не осталось игрока со статусом OnDutyLeadUnit, сбрасываем флаг ведущего и обновляем статусы
                    var remaining = await _db.Players.Where(p => unit.PlayerNicks.Contains(p.Nick)).ToListAsync();
                    bool hasLead = remaining.Any(p => p.Status == PlayerStatus.OnDutyLeadUnit);

                    if (!hasLead && unit.IsLeadUnit)
                    {
                        unit.IsLeadUnit = false;
                        foreach (var nick in unit.PlayerNicks)
                        {
                            await _playerTracker.SetPlayerStatus(nick, PlayerStatus.OnDuty);
                        }
                    }
                }

                _db.Units.Update(unit);
                await _db.SaveChangesAsync();
            }
        }

        public async Task UpdateUnit(Guid id, string? marking = null)
        {
            var unit = await _db.Units.FindAsync(id);
            if (unit != null)
            {
                if (marking != null)
                {
                    if (marking.Length > 8)
                        throw new ArgumentException("Marking must be max 8 characters");
                    unit.Marking = marking;
                }

                _db.Units.Update(unit);
                await _db.SaveChangesAsync();
            }
        }

        public async Task SetUnitStatus(Guid id, string status)
        {
            var unit = await _db.Units.FindAsync(id);
            if (unit != null)
            {
                unit.Status = status ?? string.Empty;
                _db.Units.Update(unit);
                await _db.SaveChangesAsync();
            }
        }

        public async Task AttachToSituation(Guid id, Guid? situationId)
        {
            var unit = await _db.Units.FindAsync(id);
            if (unit != null)
            {
                unit.SituationId = situationId;
                _db.Units.Update(unit);
                await _db.SaveChangesAsync();
            }
        }

        public async Task SetLeadUnit(Guid id, bool isLeadUnit)
        {
            var unit = await _db.Units.FindAsync(id);
            if (unit != null)
            {
                unit.IsLeadUnit = isLeadUnit;

                if (isLeadUnit)
                {
                    // Choose one lead player: prefer an existing player with OnDutyLeadUnit, otherwise the first player
                    var players = await _db.Players.Where(p => unit.PlayerNicks.Contains(p.Nick)).ToListAsync();
                    string? leadNick = players.FirstOrDefault(p => p.Status == PlayerStatus.OnDutyLeadUnit)?.Nick;

                    if (leadNick == null)
                    {
                        leadNick = unit.PlayerNicks.FirstOrDefault();
                    }

                    foreach (var nick in unit.PlayerNicks)
                    {
                        if (nick == leadNick)
                        {
                            await _playerTracker.SetPlayerStatus(nick, PlayerStatus.OnDutyLeadUnit);
                        }
                        else
                        {
                            await _playerTracker.SetPlayerStatus(nick, PlayerStatus.OnDuty);
                        }
                    }
                }
                else
                {
                    // Not a lead unit anymore: set everyone to OnDuty
                    foreach (var nick in unit.PlayerNicks)
                    {
                        await _playerTracker.SetPlayerStatus(nick, PlayerStatus.OnDuty);
                    }
                }

                _db.Units.Update(unit);
                await _db.SaveChangesAsync();
            }
        }

        public async Task AssignTacticalChannel(Guid id, Guid? channelId)
        {
            var unit = await _db.Units.FindAsync(id);
            if (unit != null)
            {
                unit.TacticalChannelId = channelId;
                _db.Units.Update(unit);
                await _db.SaveChangesAsync();
            }
        }

        public Task<List<Unit>> GetUnitsBySituation(Guid situationId) =>
            _db.Units.AsNoTracking().Where(u => u.SituationId == situationId).ToListAsync();

        public Task<List<Unit>> GetAvailableUnits() =>
            _db.Units.AsNoTracking().Where(u => !u.SituationId.HasValue).ToListAsync();

        public async Task<string?> GetLeadPlayerNick(Guid unitId)
        {
            var unit = await GetUnit(unitId);
            if (unit == null) return null;

            var players = await _db.Players.AsNoTracking().Where(p => unit.PlayerNicks.Contains(p.Nick)).ToListAsync();

            var superSup = players.FirstOrDefault(p => p.Role == PlayerRole.SuperSupervisor);
            if (superSup != null) return superSup.Nick;

            var sup = players.FirstOrDefault(p => p.Role == PlayerRole.Supervisor);
            if (sup != null) return sup.Nick;
            
            // Если нет supervisor'ов, возвращаем первого игрока
            return unit.PlayerNicks.FirstOrDefault();
        }

        public async Task<List<PlayerPoint>> GetPlayersInUnit(Guid unitId)
        {
            var unit = await GetUnit(unitId);
            if (unit == null) return new List<PlayerPoint>();

            var players = await _db.Players.AsNoTracking()
                .Where(p => unit.PlayerNicks.Contains(p.Nick))
                .ToListAsync();
            return players;
        }

        /// <summary>
        /// Находит ближайшие юниты к указанным координатам
        /// </summary>
        /// <param name="x">X координата</param>
        /// <param name="y">Y координата</param>
        /// <param name="limit">Максимальное количество юнитов для возврата (по умолчанию 5)</param>
        /// <param name="onlyAvailable">Возвращать только свободные юниты (без ситуации)</param>
        /// <returns>Список юнитов с расстоянием, отсортированный по близости</returns>
        public async Task<List<UnitWithDistance>> GetNearestUnits(float x, float y, int limit = 5, bool onlyAvailable = false)
        {
            var units = onlyAvailable 
                ? await _db.Units.AsNoTracking().Where(u => !u.SituationId.HasValue).ToListAsync()
                : await _db.Units.AsNoTracking().ToListAsync();

            var unitsWithDistance = new List<UnitWithDistance>();

            foreach (var unit in units)
            {
                // Получаем координаты юнита (используем ведущего игрока или среднее всех игроков)
                var unitPosition = await GetUnitPosition(unit);
                
                // Пропускаем юниты без валидных координат (игроки не в мире или -10000,-10000)
                if (unitPosition == null || (unitPosition.Value.x == -10000f && unitPosition.Value.y == -10000f))
                    continue;

                // Вычисляем расстояние
                var distance = CalculateDistance(x, y, unitPosition.Value.x, unitPosition.Value.y);

                unitsWithDistance.Add(new UnitWithDistance
                {
                    Unit = unit,
                    Distance = distance,
                    X = unitPosition.Value.x,
                    Y = unitPosition.Value.y
                });
            }

            // Сортируем по расстоянию и берём первые N
            return unitsWithDistance
                .OrderBy(u => u.Distance)
                .Take(limit)
                .ToList();
        }

        public async Task<(float x, float y)?> GetUnitPosition(Guid unitId)
        {
            var unit = await _db.Units.AsNoTracking().FirstOrDefaultAsync(u => u.Id == unitId);
            if (unit == null)
                return null;

            return await GetUnitPosition(unit);
        }

        /// <summary>
        /// Получает позицию юнита (координаты ведущего игрока или среднее всех игроков)
        /// </summary>
        private async Task<(float x, float y)?> GetUnitPosition(Unit unit)
        {
            var players = await _db.Players.AsNoTracking()
                .Where(p => unit.PlayerNicks.Contains(p.Nick))
                .ToListAsync();

            if (!players.Any())
                return null;

            // Пытаемся найти ведущего игрока
            var leadPlayer = players.FirstOrDefault(p => p.Status == PlayerStatus.OnDutyLeadUnit);
            
            if (leadPlayer != null)
            {
                return (leadPlayer.X, leadPlayer.Y);
            }

            // Если ведущего нет, используем среднее всех игроков
            // Фильтруем игроков с валидными координатами (не -10000, -10000)
            var validPlayers = players.Where(p => !(p.X == -10000f && p.Y == -10000f)).ToList();
            
            if (!validPlayers.Any())
                return null;

            var avgX = validPlayers.Average(p => p.X);
            var avgY = validPlayers.Average(p => p.Y);

            return (avgX, avgY);
        }

        /// <summary>
        /// Вычисляет евклидово расстояние между двумя точками
        /// </summary>
        private float CalculateDistance(float x1, float y1, float x2, float y2)
        {
            var dx = x2 - x1;
            var dy = y2 - y1;
            return (float)Math.Sqrt(dx * dx + dy * dy);
        }

        // Валидация прав: установка статуса юнита (только создатель может менять)
        public async Task<(bool success, string message)> SetUnitStatusWithValidation(Guid unitId, string status, string userNick)
        {
            var unit = await GetUnit(unitId);
            if (unit == null)
                return (false, "Юнит не найден");

            if (!string.Equals(unit.CreatorNick, userNick, StringComparison.OrdinalIgnoreCase))
                return (false, "Только создатель юнита может менять статус");

            await SetUnitStatus(unitId, status);
            return (true, "Статус юнита изменён");
        }

        // Валидация прав: установка флага лидера (только создатель может менять)
        public async Task<(bool success, string message)> SetLeadUnitWithValidation(Guid unitId, bool isLeadUnit, string userNick)
        {
            var unit = await GetUnit(unitId);
            if (unit == null)
                return (false, "Юнит не найден");

            if (!string.Equals(unit.CreatorNick, userNick, StringComparison.OrdinalIgnoreCase))
                return (false, "Только создатель юнита может менять флаг лидера");

            await SetLeadUnit(unitId, isLeadUnit);
            return (true, "Флаг лидера изменён");
        }
    }
}


