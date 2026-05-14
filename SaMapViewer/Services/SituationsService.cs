using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SaMapViewer.Data;
using SaMapViewer.Models;

namespace SaMapViewer.Services
{
    public class SituationsService
    {
        private static readonly ConcurrentDictionary<string, HashSet<string>> _nickToTags = new(StringComparer.OrdinalIgnoreCase);
        private static readonly ConcurrentDictionary<string, string> _nickToBaseStatus = new(StringComparer.OrdinalIgnoreCase);
        private readonly SaMapDbContext _db;
        private readonly PlayerTrackerService _tracker;
        private readonly UnitsService _unitsService;
        private readonly ILogger<SituationsService> _logger;

        public SituationsService(SaMapDbContext db, PlayerTrackerService tracker, UnitsService unitsService, ILogger<SituationsService> logger)
        {
            _db = db;
            _tracker = tracker;
            _unitsService = unitsService;
            _logger = logger;
        }

        public async Task<Situation> Create(string type, Dictionary<string, string>? metadata = null, string creatorNick = "")
        {
            var sit = new Situation
            {
                Id = Guid.NewGuid(),
                Type = type ?? string.Empty,
                Metadata = metadata ?? new Dictionary<string, string>(),
                CreatorNick = creatorNick,
                LastActivityAt = DateTime.UtcNow
            };

            if (sit.Metadata.TryGetValue("x", out var sx) && float.TryParse(sx, out var fx)) sit.X = fx;
            if (sit.Metadata.TryGetValue("y", out var sy) && float.TryParse(sy, out var fy)) sit.Y = fy;
            if (sit.Metadata.TryGetValue("location", out var lname)) sit.LocationName = lname;

            _db.Situations.Add(sit);
            await _db.SaveChangesAsync();
            return sit;
        }

        public Task<Situation?> GetSituation(Guid id) => _db.Situations.FindAsync(id).AsTask();

        public async Task<(bool, Situation?)> TryGet(Guid id)
        {
            var situation = await _db.Situations.FindAsync(id);
            return (situation != null, situation);
        }

        public Task<List<Situation>> GetAll() => _db.Situations.AsNoTracking().OrderBy(s => s.CreatedAt).ToListAsync();

        public Task<List<Situation>> GetActiveSituations() =>
            _db.Situations.AsNoTracking().Where(s => s.IsActive).OrderBy(s => s.CreatedAt).ToListAsync();

        public async Task RemoveSituation(Guid id)
        {
            var situation = await _db.Situations.FindAsync(id);
            if (situation == null) return;

            foreach (var unitId in situation.Units.ToList())
            {
                await RemoveUnitFromSituation(id, unitId);
            }

            _db.Situations.Remove(situation);
            await _db.SaveChangesAsync();
        }

        public async Task CloseSituation(Guid id)
        {
            var situation = await _db.Situations.FindAsync(id);
            if (situation == null) return;

            situation.IsActive = false;
            foreach (var unitId in situation.Units.ToList())
            {
                await RemoveUnitFromSituation(id, unitId);
            }

            _db.Situations.Update(situation);
            await _db.SaveChangesAsync();
        }

        public async Task OpenSituation(Guid id)
        {
            var situation = await _db.Situations.FindAsync(id);
            if (situation == null) return;
            situation.IsActive = true;
            _db.Situations.Update(situation);
            await _db.SaveChangesAsync();
        }

        // Закрыть ситуацию с проверкой прав (только создатель может закрыть)
        public async Task<(bool success, string message)> CloseSituationWithValidation(Guid id, string userNick)
        {
            var situation = await _db.Situations.FindAsync(id);
            if (situation == null)
                return (false, "Ситуация не найдена");

            if (!string.Equals(situation.CreatorNick, userNick, StringComparison.OrdinalIgnoreCase))
                return (false, "Только создатель может закрыть ситуацию");

            await CloseSituation(id);
            return (true, "Ситуация закрыта");
        }

        // Удалить ситуацию с проверкой прав (только создатель может удалить)
        public async Task<(bool success, string message)> RemoveSituationWithValidation(Guid id, string userNick)
        {
            var situation = await _db.Situations.FindAsync(id);
            if (situation == null)
                return (false, "Ситуация не найдена");

            if (!string.Equals(situation.CreatorNick, userNick, StringComparison.OrdinalIgnoreCase))
                return (false, "Только создатель может удалить ситуацию");

            await RemoveSituation(id);
            return (true, "Ситуация удалена");
        }

        public async Task AddUnitToSituation(Guid situationId, Guid unitId, bool asInitiator = false)
        {
            var situation = await _db.Situations.FindAsync(situationId) ?? throw new ArgumentException($"Situation {situationId} not found");
            var unit = await _unitsService.GetUnit(unitId) ?? throw new ArgumentException($"Unit {unitId} not found");

            if (unit.SituationId.HasValue && unit.SituationId != situationId)
            {
                await RemoveUnitFromSituation(unit.SituationId.Value, unitId);
            }

            bool isFirstUnit = situation.Units.Count == 0;
            situation.AddUnit(unitId, isFirstUnit || asInitiator);
            situation.LastActivityAt = DateTime.UtcNow;
            await _unitsService.AttachToSituation(unitId, situationId);

            await CheckAndAssignRedUnit(situationId, unitId);

            _db.Situations.Update(situation);
            await _db.SaveChangesAsync();
        }

        private async Task CheckAndAssignRedUnit(Guid situationId, Guid unitId)
        {
            var situation = await _db.Situations.FindAsync(situationId);
            if (situation == null) return;

            var unit = await _unitsService.GetUnit(unitId);
            if (unit == null) return;

            foreach (var playerNick in unit.PlayerNicks)
            {
                var player = await _tracker.GetPlayer(playerNick);
                if (player == null) continue;

                if (player.Rank <= PlayerRank.PoliceSergeant)
                {
                    situation.SetRedUnit(unitId);
                    await _unitsService.SetLeadUnit(unitId, true);
                    _db.Situations.Update(situation);
                    await _db.SaveChangesAsync();
                    return;
                }
            }
        }

        public async Task RemoveUnitFromSituation(Guid situationId, Guid unitId)
        {
            var situation = await _db.Situations.FindAsync(situationId);
            if (situation == null) return;

            situation.RemoveUnit(unitId);
            await _unitsService.AttachToSituation(unitId, null);
            await _unitsService.SetLeadUnit(unitId, false);

            _db.Situations.Update(situation);
            await _db.SaveChangesAsync();
        }

        public async Task SetRedUnit(Guid situationId, Guid unitId)
        {
            var situation = await _db.Situations.FindAsync(situationId);
            if (situation == null) return;

            situation.SetRedUnit(unitId);
            await _unitsService.SetLeadUnit(unitId, true);

            foreach (var otherUnitId in situation.Units.Where(u => u != unitId))
            {
                await _unitsService.SetLeadUnit(otherUnitId, false);
            }

            _db.Situations.Update(situation);
            await _db.SaveChangesAsync();
        }

        public async Task<List<Unit>> GetUnitsInSituation(Guid situationId)
        {
            var situation = await _db.Situations.FindAsync(situationId);
            if (situation == null) return new List<Unit>();

            var units = new List<Unit>();
            foreach (var uid in situation.Units)
            {
                var unit = await _unitsService.GetUnit(uid);
                if (unit != null) units.Add(unit);
            }
            return units;
        }

        public async Task<Unit?> GetGreenUnit(Guid situationId)
        {
            var situation = await _db.Situations.FindAsync(situationId);
            if (situation?.GreenUnitId == null) return null;
            return await _unitsService.GetUnit(situation.GreenUnitId.Value);
        }

        public async Task<Unit?> GetRedUnit(Guid situationId)
        {
            var situation = await _db.Situations.FindAsync(situationId);
            if (situation?.RedUnitId == null) return null;
            return await _unitsService.GetUnit(situation.RedUnitId.Value);
        }

        public async Task<List<Unit>> GetRegularUnits(Guid situationId)
        {
            var situation = await _db.Situations.FindAsync(situationId);
            if (situation == null) return new List<Unit>();

            var units = new List<Unit>();
            foreach (var uid in situation.Units.Where(u => u != situation.GreenUnitId && u != situation.RedUnitId))
            {
                var unit = await _unitsService.GetUnit(uid);
                if (unit != null) units.Add(unit);
            }
            return units;
        }

        public async Task SetBaseStatus(string nick, string baseStatus)
        {
            _nickToBaseStatus[nick] = baseStatus ?? "ничего";
            await RecomputeStatus(nick);
        }

        public async Task SetPanic(string nick, bool panic)
        {
            if (panic) await AddTag(nick, "PANIC");
            else await RemoveTag(nick, "PANIC");
        }

        public async Task AddPlayerToSituation(Guid id, string nick)
        {
            var (found, s) = await TryGet(id);
            if (!found || s == null) return;
            var tag = GetTagForSituation(s);
            if (!string.IsNullOrEmpty(tag)) await AddTag(nick, tag);
        }

        public async Task RemovePlayerFromSituation(Guid id, string nick)
        {
            var (found, s) = await TryGet(id);
            if (!found || s == null) return;
            var tag = GetTagForSituation(s);
            if (!string.IsNullOrEmpty(tag)) await RemoveTag(nick, tag);
        }

        private async Task AddTag(string nick, string tag)
        {
            var set = _nickToTags.GetOrAdd(nick, _ => new HashSet<string>(StringComparer.OrdinalIgnoreCase));
            set.Add(tag);
            await RecomputeStatus(nick);
        }

        private async Task RemoveTag(string nick, string tag)
        {
            if (_nickToTags.TryGetValue(nick, out var set))
            {
                set.Remove(tag);
                if (set.Count == 0) _nickToTags.TryRemove(nick, out _);
            }
            await RecomputeStatus(nick);
        }

        private string GetTagForSituation(Situation s)
        {
            switch ((s.Type ?? string.Empty).ToLowerInvariant())
            {
                case "code7":
                    return "Code 7";
                case "pursuit":
                    var mode = s.Metadata.TryGetValue("mode", out var m) ? m : "";
                    var tac = s.Metadata.TryGetValue("tac", out var t) ? t : null;
                    var label = mode switch
                    {
                        "passive" => "Погоня (пас.)",
                        "active" => "Погоня (акт.)",
                        "foot" => "Пешая погоня",
                        _ => "Погоня"
                    };
                    if (!string.IsNullOrWhiteSpace(tac)) label += $" TAC-{tac}";
                    return label;
                case "trafficstop":
                    var risk = s.Metadata.TryGetValue("risk", out var r) ? r : "";
                    return risk == "high" ? "Трафик-стоп (выс.)" : risk == "low" ? "Трафик-стоп (низ.)" : "Трафик-стоп";
                case "code6":
                    return "Code 6";
                case "911":
                    return "911";
                default:
                    return string.Empty;
            }
        }

        public string GetStatus(string nick)
        {
            var baseStatus = _nickToBaseStatus.TryGetValue(nick, out var b) ? b : "ничего";
            var tags = _nickToTags.TryGetValue(nick, out var set) ? set.OrderBy(x => x).ToArray() : Array.Empty<string>();
            var final = tags.Length > 0 ? baseStatus + " | " + string.Join(" | ", tags) : baseStatus;
            return final;
        }

        private async Task RecomputeStatus(string nick)
        {
            var final = GetStatus(nick);
            await _tracker.SetStatus(nick, final);
        }
    }
}

