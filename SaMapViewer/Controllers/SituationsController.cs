using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SaMapViewer.Data;
using SaMapViewer.Hubs;
using SaMapViewer.Models;
using SaMapViewer.Services;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace SaMapViewer.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class SituationsController : ControllerBase
    {
        private readonly SituationsService _situations;
        private readonly IHubContext<CoordsHub> _hub;
        private readonly HistoryService _history;
        private readonly TacticalChannelsService _channels;
        private readonly Microsoft.Extensions.Options.IOptions<SaMapViewer.Services.SaOptions> _options;
        private readonly SaMapDbContext _db;

        public SituationsController(SituationsService situations, IHubContext<CoordsHub> hub, HistoryService history, TacticalChannelsService channels, Microsoft.Extensions.Options.IOptions<SaMapViewer.Services.SaOptions> options, SaMapDbContext db)
        {
            _situations = situations;
            _hub = hub;
            _history = history;
            _channels = channels;
            _options = options;
            _db = db;
        }

        private void EnsureSqliteColumn(string tableName, string columnName, string columnDefinition)
        {
            var connection = _db.Database.GetDbConnection();
            if (connection.State != System.Data.ConnectionState.Open)
            {
                connection.Open();
            }

            using var checkCmd = connection.CreateCommand();
            checkCmd.CommandText = $"PRAGMA table_info(\"{tableName}\");";

            var exists = false;
            using (var reader = checkCmd.ExecuteReader())
            {
                while (reader.Read())
                {
                    var name = reader["name"]?.ToString();
                    if (string.Equals(name, columnName, StringComparison.OrdinalIgnoreCase))
                    {
                        exists = true;
                        break;
                    }
                }
            }

            if (exists)
                return;

            using var alterCmd = connection.CreateCommand();
            alterCmd.CommandText = $"ALTER TABLE \"{tableName}\" ADD COLUMN \"{columnName}\" {columnDefinition};";
            alterCmd.ExecuteNonQuery();
        }

        private void EnsureSituationsSqliteCompatibility()
        {
            if (!_db.Database.IsSqlite())
                return;

            EnsureSqliteColumn("Situations", "CreatorNick", "TEXT NOT NULL DEFAULT ''");
            EnsureSqliteColumn("Situations", "GreenUnitId", "TEXT NULL");
            EnsureSqliteColumn("Situations", "RedUnitId", "TEXT NULL");
            EnsureSqliteColumn("Situations", "LocationName", "TEXT NOT NULL DEFAULT ''");
            EnsureSqliteColumn("Situations", "X", "REAL NULL");
            EnsureSqliteColumn("Situations", "Y", "REAL NULL");
        }

        public class CreateDto
        {
            public string Type { get; set; } = string.Empty; // code7, pursuit, trafficstop, code6, 911
            public Dictionary<string, string> Metadata { get; set; } = new();
            public string CreatorNick { get; set; } = string.Empty; // Никнейм создателя
        }

        public class NickDto { public string Nick { get; set; } = string.Empty; }

        [HttpPost("create")]
        public async Task<ActionResult<Situation>> Create([FromBody] CreateDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto?.Type)) return BadRequest();

            var creatorNick = string.IsNullOrWhiteSpace(dto?.CreatorNick) ? "system" : dto.CreatorNick;
            Situation sit;
            try
            {
                sit = await _situations.Create(dto.Type, dto.Metadata ?? new Dictionary<string, string>(), creatorNick);
            }
            catch (SqliteException ex) when (ex.Message.Contains("no such column", StringComparison.OrdinalIgnoreCase)
                                             && ex.Message.Contains("CreatorNick", StringComparison.OrdinalIgnoreCase))
            {
                EnsureSituationsSqliteCompatibility();
                sit = await _situations.Create(dto.Type, dto.Metadata ?? new Dictionary<string, string>(), creatorNick);
            }

            // If metadata contains a channel name, attach that channel to the newly created situation
            try
            {
                if (dto?.Metadata != null && dto.Metadata.TryGetValue("channel", out var channelName) && !string.IsNullOrWhiteSpace(channelName))
                {
                    var ch = (await _channels.GetAll()).FirstOrDefault(c => string.Equals(c.Name, channelName, StringComparison.OrdinalIgnoreCase));
                    if (ch != null)
                    {
                        await _channels.AttachSituation(ch.Id, sit.Id);
                        await _channels.SetBusy(ch.Id, true);
                        await _hub.Clients.All.SendAsync("ChannelUpdated", ch);
                    }
                }
            }
            catch (Exception ex)
            {
                string? chName = null;
                if (dto?.Metadata != null && dto.Metadata.TryGetValue("channel", out var v)) chName = v;
                _ = _history.AppendAsync(new { type = "situation_channel_attach_error", situationId = sit.Id, channel = chName, error = ex.Message });
            }

            await _hub.Clients.All.SendAsync("SituationCreated", sit);
            _ = _history.AppendAsync(new { type = "situation_create", id = sit.Id, sit.Type, sit.Metadata });
            return sit;
        }

        [HttpPost("{id}/join")]
        public async Task<IActionResult> Join(Guid id, [FromBody] NickDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto?.Nick)) return BadRequest();
            // Use the non-obsolete API to add a player's tag/status for the situation
            await _situations.AddPlayerToSituation(id, dto.Nick);
            var (found, s) = await _situations.TryGet(id);
            if (found && s != null)
            {
                await _hub.Clients.All.SendAsync("SituationUpdated", s);
                await _hub.Clients.All.SendAsync("UpdatePlayerStatus", new { nick = dto.Nick, status = "" });
                _ = _history.AppendAsync(new { type = "situation_join", id = id, nick = dto.Nick });
            }
            return Ok();
        }

        [HttpPost("{id}/leave")]
        public async Task<IActionResult> Leave(Guid id, [FromBody] NickDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto?.Nick)) return BadRequest();
            // Use the non-obsolete API to remove a player's tag/status for the situation
            await _situations.RemovePlayerFromSituation(id, dto.Nick);
            var (found, s) = await _situations.TryGet(id);
            if (found && s != null)
            {
                await _hub.Clients.All.SendAsync("SituationUpdated", s);
                await _hub.Clients.All.SendAsync("UpdatePlayerStatus", new { nick = dto.Nick, status = "" });
                _ = _history.AppendAsync(new { type = "situation_leave", id = id, nick = dto.Nick });
            }
            return Ok();
        }

        [HttpGet("all")]
        public async Task<ActionResult<List<Situation>>> GetAll()
        {
            try
            {
                return await _situations.GetAll();
            }
            catch (SqliteException ex) when (ex.Message.Contains("no such column", StringComparison.OrdinalIgnoreCase)
                                             && ex.Message.Contains("CreatorNick", StringComparison.OrdinalIgnoreCase))
            {
                EnsureSituationsSqliteCompatibility();
                return await _situations.GetAll();
            }
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<Situation>> GetSituation(Guid id)
        {
            var situation = await _situations.GetSituation(id);
            if (situation == null)
                return NotFound($"Situation with ID {id} not found");
            return situation;
        }

        public class UpdateMetadataDto { public Dictionary<string, string> Metadata { get; set; } = new(); }

        [HttpPut("{id}/metadata")]
        public async Task<IActionResult> UpdateMetadata(Guid id, [FromBody] UpdateMetadataDto dto)
        {
            var situation = await _situations.GetSituation(id);
            if (situation == null)
                return NotFound($"Situation with ID {id} not found");

            // Save old channel name for re-binding logic
            situation.Metadata.TryGetValue("channel", out var oldChannelName);

            // Обновляем метаданные
            foreach (var kvp in dto.Metadata)
            {
                situation.Metadata[kvp.Key] = kvp.Value;
            }

            // Log received metadata for debugging
            _ = _history.AppendAsync(new { type = "received_metadata_update", id, incoming = dto.Metadata });

            // Attempt parsing for debug logging
            var parsedX = situation.Metadata.TryGetValue("x", out var sx) && float.TryParse(sx, out var fx) ? fx : (float?)null;
            var parsedY = situation.Metadata.TryGetValue("y", out var sy) && float.TryParse(sy, out var fy) ? fy : (float?)null;
            _ = _history.AppendAsync(new { type = "metadata_parsed_coords", id, parsedX, parsedY });

            // If metadata contains numeric coords, update the numeric fields too
            if (parsedX.HasValue) situation.X = parsedX.Value;
            if (parsedY.HasValue) situation.Y = parsedY.Value;
            if (situation.Metadata.TryGetValue("location", out var lname)) situation.LocationName = lname;

            situation.LastActivityAt = DateTime.UtcNow;

            // After updating metadata, check channel binding changes
            situation.Metadata.TryGetValue("channel", out var newChannelName);
            oldChannelName = string.IsNullOrWhiteSpace(oldChannelName) ? null : oldChannelName;
            newChannelName = string.IsNullOrWhiteSpace(newChannelName) ? null : newChannelName;

            if (!string.Equals(oldChannelName, newChannelName, StringComparison.Ordinal))
            {
                try
                {
                    // Detach old channel if necessary
                    if (!string.IsNullOrEmpty(oldChannelName))
                    {
                        var oldCh = (await _channels.GetAll()).FirstOrDefault(c => string.Equals(c.Name, oldChannelName, StringComparison.OrdinalIgnoreCase));
                        if (oldCh != null && oldCh.SituationId == id)
                        {
                            await _channels.AttachSituation(oldCh.Id, null);
                            await _channels.SetBusy(oldCh.Id, false);
                            await _hub.Clients.All.SendAsync("ChannelUpdated", oldCh);
                        }
                    }

                    // Attach new channel
                    if (!string.IsNullOrEmpty(newChannelName))
                    {
                        var newCh = (await _channels.GetAll()).FirstOrDefault(c => string.Equals(c.Name, newChannelName, StringComparison.OrdinalIgnoreCase));
                        if (newCh != null)
                        {
                            await _channels.AttachSituation(newCh.Id, id);
                            await _channels.SetBusy(newCh.Id, true);
                            await _hub.Clients.All.SendAsync("ChannelUpdated", newCh);
                        }
                    }
                }
                catch (Exception ex)
                {
                    // Don't fail the metadata update if channel sync fails; log to history and continue
                    _ = _history.AppendAsync(new { type = "situation_channel_sync_error", situationId = id, oldChannel = oldChannelName, newChannel = newChannelName, error = ex.Message });
                }
            }

            _db.Situations.Update(situation);
            await _db.SaveChangesAsync();

            await _hub.Clients.All.SendAsync("SituationUpdated", situation);
            _ = _history.AppendAsync(new { type = "situation_update_metadata", id, metadata = situation.Metadata });
            return Ok(situation);
        }

        public class UpdateLocationDto 
        { 
            public string Location { get; set; } = string.Empty;
            public float X { get; set; }
            public float Y { get; set; }
        }

        [HttpPut("{id}/location")]
        public async Task<IActionResult> UpdateLocation(Guid id, [FromBody] UpdateLocationDto dto)
        {
            var situation = await _situations.GetSituation(id);
            if (situation == null)
                return NotFound($"Situation with ID {id} not found");

            // Update both the human-friendly location name and numeric coord fields
            situation.LocationName = dto.Location;
            situation.X = dto.X;
            situation.Y = dto.Y;
            situation.LastActivityAt = DateTime.UtcNow;

            // Keep metadata compatible for clients that still expect strings
            situation.Metadata["location"] = dto.Location;
            situation.Metadata["x"] = dto.X.ToString();
            situation.Metadata["y"] = dto.Y.ToString();

            _db.Situations.Update(situation);
            await _db.SaveChangesAsync();

            await _hub.Clients.All.SendAsync("SituationLocationUpdated", new { id, location = dto.Location, x = dto.X, y = dto.Y });
            await _hub.Clients.All.SendAsync("SituationUpdated", situation);
            
            // Log the location update for debugging
            _ = _history.AppendAsync(new { type = "received_location_update", id, location = dto.Location, x = dto.X, y = dto.Y });
            _ = _history.AppendAsync(new { type = "situation_after_location", id, situation });

            return Ok(situation);
        }

        [HttpPost("{id}/location")]
        public async Task<IActionResult> UpdateLocationPost(Guid id, [FromBody] UpdateLocationDto dto)
        {
            return await UpdateLocation(id, dto);
        }

        [HttpPost("{id}/close")]
        public async Task<IActionResult> CloseSituation(
            Guid id,
            [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] NickDto? dto = null,
            [FromQuery] string? nick = null)
        {
            var existing = await _situations.GetSituation(id);
            if (existing == null)
                return NotFound($"Situation with ID {id} not found");

            var actorNick = string.IsNullOrWhiteSpace(dto?.Nick)
                ? nick?.Trim()
                : dto!.Nick.Trim();

            string message;
            if (string.IsNullOrWhiteSpace(actorNick))
            {
                await _situations.CloseSituation(id);
                message = "Ситуация закрыта";
            }
            else
            {
                var (success, closeMessage) = await _situations.CloseSituationWithValidation(id, actorNick);
                if (!success)
                    return Forbid();

                message = closeMessage;
            }

            var updatedSituation = await _situations.GetSituation(id);
            if (updatedSituation != null)
            {
                // Detach any tactical channels that were assigned to this situation so they become free
                try
                {
                    var channels = await _channels.GetAll();
                    foreach (var ch in channels.Where(c => c.SituationId == id).ToList())
                    {
                        await _channels.AttachSituation(ch.Id, null);
                        await _channels.SetBusy(ch.Id, false);
                        await _hub.Clients.All.SendAsync("ChannelUpdated", ch);
                    }
                }
                catch (Exception ex)
                {
                    _ = _history.AppendAsync(new { type = "situation_channel_detach_error_on_close", situationId = id, error = ex.Message });
                }

                await _hub.Clients.All.SendAsync("SituationUpdated", updatedSituation);
                _ = _history.AppendAsync(new { type = "situation_close", id, nick = actorNick ?? "system" });
            }
            return Ok(new { message });
        }

        [HttpPost("{id}/open")]
        public async Task<IActionResult> OpenSituation(Guid id)
        {
            var situation = await _situations.GetSituation(id);
            if (situation == null)
                return NotFound($"Situation with ID {id} not found");

            await _situations.OpenSituation(id);
            var updatedSituation = await _situations.GetSituation(id);
            if (updatedSituation != null)
            {
                await _hub.Clients.All.SendAsync("SituationUpdated", updatedSituation);
                _ = _history.AppendAsync(new { type = "situation_open", id });
            }
            return Ok();
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteSituation(
            Guid id,
            [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] NickDto? dto = null,
            [FromQuery] string? nick = null)
        {
            var existing = await _situations.GetSituation(id);
            if (existing == null)
                return NotFound($"Situation with ID {id} not found");

            // Always delete from site (no nick = unconditional delete)
            await _situations.RemoveSituation(id);

            // Detach any tactical channel attached to this situation
            try
            {
                var channels = await _channels.GetAll();
                foreach (var ch in channels.Where(c => c.SituationId == id).ToList())
                {
                    await _channels.AttachSituation(ch.Id, null);
                    await _channels.SetBusy(ch.Id, false);
                    await _hub.Clients.All.SendAsync("ChannelUpdated", ch);
                }
            }
            catch (Exception ex)
            {
                _ = _history.AppendAsync(new { type = "situation_channel_detach_error", situationId = id, error = ex.Message });
            }

            await _hub.Clients.All.SendAsync("SituationDeleted", new { id });
            _ = _history.AppendAsync(new { type = "situation_delete", id, nick = dto?.Nick ?? nick ?? "system" });
            return NoContent();
        }

        public class AddUnitDto { public Guid UnitId { get; set; } public bool AsLeadUnit { get; set; } }
        public class RemoveUnitDto { public Guid UnitId { get; set; } }

        [HttpPost("{id}/units/add")]
        public async Task<IActionResult> AddUnitToSituation(Guid id, [FromBody] AddUnitDto dto)
        {
            try
            {
                await _situations.AddUnitToSituation(id, dto.UnitId, dto.AsLeadUnit);
                var updatedSituation = await _situations.GetSituation(id);
                if (updatedSituation != null)
                {
                    await _hub.Clients.All.SendAsync("SituationUpdated", updatedSituation);
                    _ = _history.AppendAsync(new { type = "situation_add_unit", situationId = id, unitId = dto.UnitId, asLeadUnit = dto.AsLeadUnit });
                }
                return Ok();
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
        }

        [HttpPost("{id}/units/remove")]
        public async Task<IActionResult> RemoveUnitFromSituation(Guid id, [FromBody] RemoveUnitDto dto)
        {
            await _situations.RemoveUnitFromSituation(id, dto.UnitId);
            var updatedSituation = await _situations.GetSituation(id);
            if (updatedSituation != null)
            {
                await _hub.Clients.All.SendAsync("SituationUpdated", updatedSituation);
                _ = _history.AppendAsync(new { type = "situation_remove_unit", situationId = id, unitId = dto.UnitId });
            }
            return Ok();
        }

        public class SetRedUnitDto { public Guid UnitId { get; set; } }

        [HttpPost("{id}/lead")]
        public async Task<IActionResult> SetLeadUnit(Guid id, [FromBody] SetRedUnitDto dto)
        {
            var situation = await _situations.GetSituation(id);
            if (situation == null)
                return NotFound($"Situation with ID {id} not found");
            
            if (!situation.Units.Contains(dto.UnitId))
                return BadRequest("Unit is not part of this situation");
            
            await _situations.SetRedUnit(id, dto.UnitId);
            var updatedSituation = await _situations.GetSituation(id);
            if (updatedSituation != null)
            {
                await _hub.Clients.All.SendAsync("SituationUpdated", updatedSituation);
                _ = _history.AppendAsync(new { type = "situation_set_lead_unit", situationId = id, unitId = dto.UnitId });
            }
            return Ok();
        }

        public class PanicDto { public string Nick { get; set; } = string.Empty; public int Value { get; set; } } // 0 or 1

        [HttpPost("panic")]
        public async Task<IActionResult> Panic([FromBody] PanicDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto?.Nick)) return BadRequest();
            await _situations.SetPanic(dto.Nick, dto.Value == 1);
            await _hub.Clients.All.SendAsync("PanicUpdated", new { nick = dto.Nick, value = dto.Value });
            await _hub.Clients.All.SendAsync("UpdatePlayerStatus", new { nick = dto.Nick, status = "" });
            _ = _history.AppendAsync(new { type = "panic", nick = dto.Nick, value = dto.Value });
            return Ok();
        }

        [HttpGet("history")]
        public IActionResult History()
        {
            // Историю отдаём как сырой файл для простоты (JSONL)
            var path = _options.Value.HistoryPath ?? "history.jsonl";
            if (!System.IO.File.Exists(path)) return Ok(new object[0]);
            var lines = System.IO.File.ReadAllLines(path);
            return File(System.Text.Encoding.UTF8.GetBytes(string.Join("\n", lines)), "application/jsonl");
        }
    }
}

