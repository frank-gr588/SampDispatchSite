using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using SaMapViewer.Hubs;
using SaMapViewer.Models;
using SaMapViewer.Services;
using System;
using System.Collections.Generic;
using System.Linq;

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

        public SituationsController(SituationsService situations, IHubContext<CoordsHub> hub, HistoryService history, TacticalChannelsService channels, Microsoft.Extensions.Options.IOptions<SaMapViewer.Services.SaOptions> options)
        {
            _situations = situations;
            _hub = hub;
            _history = history;
            _channels = channels;
            _options = options;
        }

        public class CreateDto
        {
            public string Type { get; set; } = string.Empty; // code7, pursuit, trafficstop, code6, 911
            public Dictionary<string, string> Metadata { get; set; } = new();
        }

        public class NickDto { public string Nick { get; set; } = string.Empty; }

        [HttpPost("create")]
        public ActionResult<Situation> Create([FromBody] CreateDto dto)
        {
            if (!CheckApiKey(Request, _options.Value.ApiKey)) return Unauthorized();
            if (string.IsNullOrWhiteSpace(dto?.Type)) return BadRequest();
            var sit = _situations.Create(dto.Type, dto.Metadata ?? new Dictionary<string, string>());

            // If metadata contains a channel name, attach that channel to the newly created situation
            try
            {
                if (dto?.Metadata != null && dto.Metadata.TryGetValue("channel", out var channelName) && !string.IsNullOrWhiteSpace(channelName))
                {
                    var ch = _channels.GetAll().FirstOrDefault(c => string.Equals(c.Name, channelName, StringComparison.OrdinalIgnoreCase));
                    if (ch != null)
                    {
                        _channels.AttachSituation(ch.Id, sit.Id);
                        _channels.SetBusy(ch.Id, true);
                        _hub.Clients.All.SendAsync("ChannelUpdated", ch);
                    }
                }
            }
            catch (Exception ex)
            {
                string? chName = null;
                if (dto?.Metadata != null && dto.Metadata.TryGetValue("channel", out var v)) chName = v;
                _ = _history.AppendAsync(new { type = "situation_channel_attach_error", situationId = sit.Id, channel = chName, error = ex.Message });
            }

            _hub.Clients.All.SendAsync("SituationCreated", sit);
            _ = _history.AppendAsync(new { type = "situation_create", id = sit.Id, sit.Type, sit.Metadata });
            return sit;
        }

        [HttpPost("{id}/join")]
        public IActionResult Join(Guid id, [FromBody] NickDto dto)
        {
            if (!CheckApiKey(Request, _options.Value.ApiKey)) return Unauthorized();
            if (string.IsNullOrWhiteSpace(dto?.Nick)) return BadRequest();
            // Use the non-obsolete API to add a player's tag/status for the situation
            _situations.AddPlayerToSituation(id, dto.Nick);
            if (_situations.TryGet(id, out var s))
            {
                _hub.Clients.All.SendAsync("SituationUpdated", s);
                _hub.Clients.All.SendAsync("UpdatePlayerStatus", new { nick = dto.Nick, status = "" });
                _ = _history.AppendAsync(new { type = "situation_join", id = id, nick = dto.Nick });
            }
            return Ok();
        }

        [HttpPost("{id}/leave")]
        public IActionResult Leave(Guid id, [FromBody] NickDto dto)
        {
            if (!CheckApiKey(Request, _options.Value.ApiKey)) return Unauthorized();
            if (string.IsNullOrWhiteSpace(dto?.Nick)) return BadRequest();
            // Use the non-obsolete API to remove a player's tag/status for the situation
            _situations.RemovePlayerFromSituation(id, dto.Nick);
            if (_situations.TryGet(id, out var s))
            {
                _hub.Clients.All.SendAsync("SituationUpdated", s);
                _hub.Clients.All.SendAsync("UpdatePlayerStatus", new { nick = dto.Nick, status = "" });
                _ = _history.AppendAsync(new { type = "situation_leave", id = id, nick = dto.Nick });
            }
            return Ok();
        }

        [HttpGet("all")]
        public ActionResult<List<Situation>> GetAll()
        {
            return _situations.GetAll();
        }

        [HttpGet("{id}")]
        public ActionResult<Situation> GetSituation(Guid id)
        {
            var situation = _situations.GetSituation(id);
            if (situation == null)
                return NotFound($"Situation with ID {id} not found");
            return situation;
        }

        public class UpdateMetadataDto { public Dictionary<string, string> Metadata { get; set; } = new(); }

        [HttpPut("{id}/metadata")]
        public IActionResult UpdateMetadata(Guid id, [FromBody] UpdateMetadataDto dto)
        {
            if (!CheckApiKey(Request, _options.Value.ApiKey)) return Unauthorized();
            
            var situation = _situations.GetSituation(id);
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
                        var oldCh = _channels.GetAll().FirstOrDefault(c => string.Equals(c.Name, oldChannelName, StringComparison.OrdinalIgnoreCase));
                        if (oldCh != null && oldCh.SituationId == id)
                        {
                            _channels.AttachSituation(oldCh.Id, null);
                            _channels.SetBusy(oldCh.Id, false);
                            _hub.Clients.All.SendAsync("ChannelUpdated", oldCh);
                        }
                    }

                    // Attach new channel
                    if (!string.IsNullOrEmpty(newChannelName))
                    {
                        var newCh = _channels.GetAll().FirstOrDefault(c => string.Equals(c.Name, newChannelName, StringComparison.OrdinalIgnoreCase));
                        if (newCh != null)
                        {
                            _channels.AttachSituation(newCh.Id, id);
                            _channels.SetBusy(newCh.Id, true);
                            _hub.Clients.All.SendAsync("ChannelUpdated", newCh);
                        }
                    }
                }
                catch (Exception ex)
                {
                    // Don't fail the metadata update if channel sync fails; log to history and continue
                    _ = _history.AppendAsync(new { type = "situation_channel_sync_error", situationId = id, oldChannel = oldChannelName, newChannel = newChannelName, error = ex.Message });
                }
            }

            _hub.Clients.All.SendAsync("SituationUpdated", situation);
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
        public IActionResult UpdateLocation(Guid id, [FromBody] UpdateLocationDto dto)
        {
            if (!CheckApiKey(Request, _options.Value.ApiKey)) return Unauthorized();
            
            var situation = _situations.GetSituation(id);
            if (situation == null)
                return NotFound($"Situation with ID {id} not found");

            // Update both the human-friendly location name and numeric coord fields
            situation.LocationName = dto.Location;
            situation.X = dto.X;
            situation.Y = dto.Y;

            // Keep metadata compatible for clients that still expect strings
            situation.Metadata["location"] = dto.Location;
            situation.Metadata["x"] = dto.X.ToString();
            situation.Metadata["y"] = dto.Y.ToString();

            _hub.Clients.All.SendAsync("SituationLocationUpdated", new { id, location = dto.Location, x = dto.X, y = dto.Y });
            _hub.Clients.All.SendAsync("SituationUpdated", situation);
            
            // Log the location update for debugging
            _ = _history.AppendAsync(new { type = "received_location_update", id, location = dto.Location, x = dto.X, y = dto.Y });
            _ = _history.AppendAsync(new { type = "situation_after_location", id, situation });

            return Ok(situation);
        }

        [HttpPost("{id}/close")]
        public IActionResult CloseSituation(Guid id)
        {
            if (!CheckApiKey(Request, _options.Value.ApiKey)) return Unauthorized();
            
            var situation = _situations.GetSituation(id);
            if (situation == null)
                return NotFound($"Situation with ID {id} not found");

            _situations.CloseSituation(id);
            var updatedSituation = _situations.GetSituation(id);
            if (updatedSituation != null)
            {
                // Detach any tactical channels that were assigned to this situation so they become free
                try
                {
                    var channels = _channels.GetAll();
                    foreach (var ch in channels.Where(c => c.SituationId == id).ToList())
                    {
                        _channels.AttachSituation(ch.Id, null);
                        _channels.SetBusy(ch.Id, false);
                        _hub.Clients.All.SendAsync("ChannelUpdated", ch);
                    }
                }
                catch (Exception ex)
                {
                    _ = _history.AppendAsync(new { type = "situation_channel_detach_error_on_close", situationId = id, error = ex.Message });
                }

                _hub.Clients.All.SendAsync("SituationUpdated", updatedSituation);
                _ = _history.AppendAsync(new { type = "situation_close", id });
            }
            return Ok();
        }

        [HttpPost("{id}/open")]
        public IActionResult OpenSituation(Guid id)
        {
            if (!CheckApiKey(Request, _options.Value.ApiKey)) return Unauthorized();
            
            var situation = _situations.GetSituation(id);
            if (situation == null)
                return NotFound($"Situation with ID {id} not found");

            _situations.OpenSituation(id);
            var updatedSituation = _situations.GetSituation(id);
            if (updatedSituation != null)
            {
                _hub.Clients.All.SendAsync("SituationUpdated", updatedSituation);
                _ = _history.AppendAsync(new { type = "situation_open", id });
            }
            return Ok();
        }

        [HttpDelete("{id}")]
        public IActionResult DeleteSituation(Guid id)
        {
            if (!CheckApiKey(Request, _options.Value.ApiKey)) return Unauthorized();
            
            var situation = _situations.GetSituation(id);
            if (situation == null)
                return NotFound($"Situation with ID {id} not found");
            // Detach any tactical channel attached to this situation
            try
            {
                var channels = _channels.GetAll();
                foreach (var ch in channels.Where(c => c.SituationId == id).ToList())
                {
                    _channels.AttachSituation(ch.Id, null);
                    _channels.SetBusy(ch.Id, false);
                    _hub.Clients.All.SendAsync("ChannelUpdated", ch);
                }
            }
            catch (Exception ex)
            {
                _ = _history.AppendAsync(new { type = "situation_channel_detach_error", situationId = id, error = ex.Message });
            }

            _situations.RemoveSituation(id);
            _hub.Clients.All.SendAsync("SituationDeleted", new { id });
            _ = _history.AppendAsync(new { type = "situation_delete", id });
            return NoContent();
        }

        public class AddUnitDto { public Guid UnitId { get; set; } public bool AsLeadUnit { get; set; } }
        public class RemoveUnitDto { public Guid UnitId { get; set; } }

        [HttpPost("{id}/units/add")]
        public IActionResult AddUnitToSituation(Guid id, [FromBody] AddUnitDto dto)
        {
            if (!CheckApiKey(Request, _options.Value.ApiKey)) return Unauthorized();
            
            try
            {
                _situations.AddUnitToSituation(id, dto.UnitId, dto.AsLeadUnit);
                var updatedSituation = _situations.GetSituation(id);
                if (updatedSituation != null)
                {
                    _hub.Clients.All.SendAsync("SituationUpdated", updatedSituation);
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
        public IActionResult RemoveUnitFromSituation(Guid id, [FromBody] RemoveUnitDto dto)
        {
            if (!CheckApiKey(Request, _options.Value.ApiKey)) return Unauthorized();
            
            _situations.RemoveUnitFromSituation(id, dto.UnitId);
            var updatedSituation = _situations.GetSituation(id);
            if (updatedSituation != null)
            {
                _hub.Clients.All.SendAsync("SituationUpdated", updatedSituation);
                _ = _history.AppendAsync(new { type = "situation_remove_unit", situationId = id, unitId = dto.UnitId });
            }
            return Ok();
        }

        public class PanicDto { public string Nick { get; set; } = string.Empty; public int Value { get; set; } } // 0 or 1

        [HttpPost("panic")]
        public IActionResult Panic([FromBody] PanicDto dto)
        {
            if (!CheckApiKey(Request, _options.Value.ApiKey)) return Unauthorized();
            if (string.IsNullOrWhiteSpace(dto?.Nick)) return BadRequest();
            _situations.SetPanic(dto.Nick, dto.Value == 1);
            _hub.Clients.All.SendAsync("PanicUpdated", new { nick = dto.Nick, value = dto.Value });
            _hub.Clients.All.SendAsync("UpdatePlayerStatus", new { nick = dto.Nick, status = "" });
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

        static bool CheckApiKey(Microsoft.AspNetCore.Http.HttpRequest req, string expected)
        {
            if (string.IsNullOrEmpty(expected)) return true;
            if (!req.Headers.TryGetValue("x-api-key", out var k)) return false;
            return string.Equals(k.ToString(), expected, System.StringComparison.Ordinal);
        }
    }
}

