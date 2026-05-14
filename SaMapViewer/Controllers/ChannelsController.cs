using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using SaMapViewer.Hubs;
using SaMapViewer.Models;
using SaMapViewer.Services;
using System;
using System.Collections.Generic;

namespace SaMapViewer.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ChannelsController : ControllerBase
    {
    private readonly TacticalChannelsService _channels;
    private readonly SituationsService _situations;
        private readonly IHubContext<CoordsHub> _hub;
        private readonly HistoryService _history;

        public ChannelsController(TacticalChannelsService channels, SituationsService situations, IHubContext<CoordsHub> hub, HistoryService history)
        {
            _channels = channels;
            _situations = situations;
            _hub = hub;
            _history = history;
        }

        public class CreateDto { public string Name { get; set; } = string.Empty; }
        public class BusyDto { public bool IsBusy { get; set; } }
        public class AttachDto { public Guid? SituationId { get; set; } }
        public class NotesDto { public string Notes { get; set; } = string.Empty; }

        [HttpPost]
        public async Task<ActionResult<TacticalChannel>> Create([FromBody] CreateDto dto)
        {
            var ch = await _channels.Create(dto?.Name ?? string.Empty);
            await _hub.Clients.All.SendAsync("ChannelCreated", ch);
            _ = _history.AppendAsync(new { type = "channel_create", id = ch.Id, ch.Name });
            return ch;
        }

        [HttpGet("all")]
        public async Task<ActionResult<List<object>>> GetAll()
        {
            var list = await _channels.GetAll();
            var result = new List<object>();
            foreach (var ch in list)
            {
                string? sitTitle = null;
                if (ch.SituationId.HasValue)
                {
                    var sit = await _situations.GetSituation(ch.SituationId.Value);
                    if (sit != null)
                    {
                        // Prefer metadata.title then type
                        sitTitle = sit.Metadata != null && sit.Metadata.TryGetValue("title", out var t) && !string.IsNullOrWhiteSpace(t) ? t : sit.Type;
                    }
                }
                result.Add(new {
                    id = ch.Id,
                    name = ch.Name,
                    isBusy = ch.IsBusy,
                    situationId = ch.SituationId,
                    situationTitle = sitTitle,
                    notes = ch.Notes
                });
            }
            return result;
        }

        [HttpPost("{id}/busy")]
        public async Task<IActionResult> SetBusy(Guid id, [FromBody] BusyDto dto)
        {
            await _channels.SetBusy(id, dto?.IsBusy == true);
            var (found, ch) = await _channels.TryGet(id);
            if (found && ch != null)
            {
                await _hub.Clients.All.SendAsync("ChannelUpdated", ch);
                var busyVal = ch.IsBusy;
                var chId = ch.Id;
                _ = _history.AppendAsync(new { type = "channel_busy", id = chId, IsBusy = busyVal });
            }
            return Ok();
        }

        [HttpPost("{id}/attach-situation")]
        public async Task<IActionResult> AttachSituation(Guid id, [FromBody] AttachDto dto)
        {
            await _channels.AttachSituation(id, dto?.SituationId);
            var (found, ch) = await _channels.TryGet(id);
            if (found && ch != null)
            {
                await _hub.Clients.All.SendAsync("ChannelUpdated", ch);
                var sitIdVal = ch.SituationId;
                var chId = ch.Id;
                _ = _history.AppendAsync(new { type = "channel_attach_situation", id = chId, SituationId = sitIdVal });
            }
            return Ok();
        }

        [HttpPut("{id}/notes")]
        public async Task<IActionResult> SetNotes(Guid id, [FromBody] NotesDto dto)
        {
            await _channels.SetNotes(id, dto?.Notes);
            var (found, ch) = await _channels.TryGet(id);
            if (found && ch != null)
            {
                await _hub.Clients.All.SendAsync("ChannelUpdated", ch);
                _ = _history.AppendAsync(new { type = "channel_notes", id = ch.Id, notes = ch.Notes });
            }

            return Ok();
        }

    }
}


