using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SaMapViewer.Data;
using SaMapViewer.Hubs;
using SaMapViewer.Models;

namespace SaMapViewer.Services
{
    /// <summary>
    /// Background service that removes situations, units and players
    /// that have been inactive for more than 1 hour.
    /// </summary>
    public class InactivityCleanupService : BackgroundService
    {
        private static readonly TimeSpan InactivityLimit = TimeSpan.FromHours(1);
        private static readonly TimeSpan CheckInterval   = TimeSpan.FromMinutes(5);

        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<InactivityCleanupService> _logger;

        public InactivityCleanupService(
            IServiceScopeFactory scopeFactory,
            ILogger<InactivityCleanupService> logger)
        {
            _scopeFactory = scopeFactory;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await RunCleanupAsync(stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "InactivityCleanupService encountered an error");
                }

                await Task.Delay(CheckInterval, stoppingToken);
            }
        }

        private async Task RunCleanupAsync(CancellationToken ct)
        {
            using var scope = _scopeFactory.CreateScope();

            var db        = scope.ServiceProvider.GetRequiredService<SaMapDbContext>();
            var hub       = scope.ServiceProvider.GetRequiredService<IHubContext<CoordsHub>>();
            var units     = scope.ServiceProvider.GetRequiredService<UnitsService>();
            var history   = scope.ServiceProvider.GetRequiredService<HistoryService>();

            var cutoff = DateTime.UtcNow - InactivityLimit;

            // ── 1. Situations ─────────────────────────────────────────────────
            var staleSituations = await db.Situations
                .Where(s => s.IsActive &&
                            (s.LastActivityAt == null ? s.CreatedAt : s.LastActivityAt) < cutoff)
                .ToListAsync(ct);

            foreach (var sit in staleSituations)
            {
                _logger.LogInformation(
                    "Auto-removing inactive situation {Id} (type={Type}, lastActivity={LastActivity})",
                    sit.Id, sit.Type, sit.LastActivityAt ?? sit.CreatedAt);

                // Detach units from this situation
                foreach (var unitId in sit.Units.ToList())
                {
                    await units.AttachToSituation(unitId, null);
                    await units.SetLeadUnit(unitId, false);
                }

                db.Situations.Remove(sit);
                await hub.Clients.All.SendAsync("SituationDeleted", new { id = sit.Id }, ct);
                _ = history.AppendAsync(new { type = "auto_cleanup_situation", id = sit.Id, sit.Type, reason = "1h_inactivity" });
            }

            // ── 2. Units ──────────────────────────────────────────────────────
            var staleUnits = await db.Units
                .Where(u => u.CreatedAt < cutoff && !u.SituationId.HasValue)
                .ToListAsync(ct);

            foreach (var unit in staleUnits)
            {
                // Skip if any player in the unit was active recently
                var players = await db.Players
                    .Where(p => unit.PlayerNicks.Contains(p.Nick))
                    .ToListAsync(ct);

                bool anyActive = players.Any(p => p.LastUpdate >= cutoff);
                if (anyActive) continue;

                _logger.LogInformation(
                    "Auto-removing inactive unit {Id} (marking={Marking})", unit.Id, unit.Marking);

                foreach (var nick in unit.PlayerNicks.ToList())
                {
                    var player = await db.Players.FindAsync(new object[] { nick }, ct);
                    if (player != null)
                        player.RemoveFromUnit();
                }

                db.Units.Remove(unit);
                await hub.Clients.All.SendAsync("UnitDeleted", new { id = unit.Id }, ct);
                _ = history.AppendAsync(new { type = "auto_cleanup_unit", id = unit.Id, unit.Marking, reason = "1h_inactivity" });
            }

            // ── 3. Players ────────────────────────────────────────────────────
            // Only remove players that came from the script (X != -10000 / Y != -10000)
            var stalePlayers = await db.Players
                .Where(p => !(p.X == -10000f && p.Y == -10000f) && p.LastUpdate < cutoff)
                .ToListAsync(ct);

            foreach (var player in stalePlayers)
            {
                // If player is in a unit don't remove them (unit cleanup above handles this)
                if (player.UnitId.HasValue) continue;

                _logger.LogInformation(
                    "Auto-removing inactive player {Nick} (lastUpdate={LastUpdate})",
                    player.Nick, player.LastUpdate);

                db.Players.Remove(player);
                await hub.Clients.All.SendAsync("PlayerRemoved", new { nick = player.Nick }, ct);
                _ = history.AppendAsync(new { type = "auto_cleanup_player", nick = player.Nick, reason = "1h_inactivity" });
            }

            await db.SaveChangesAsync(ct);
        }
    }
}
