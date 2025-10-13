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
        private readonly Microsoft.Extensions.Options.IOptions<SaMapViewer.Services.SaOptions> _options;

        public ChannelsController(TacticalChannelsService channels, SituationsService situations, IHubContext<CoordsHub> hub, HistoryService history, Microsoft.Extensions.Options.IOptions<SaMapViewer.Services.SaOptions> options)
        {
            _channels = channels;
            _situations = situations;
            _hub = hub;
            _history = history;
            _options = options;
        }

        public class CreateDto { public string Name { get; set; } = string.Empty; }
        public class BusyDto { public bool IsBusy { get; set; } }
        public class AttachDto { public Guid? SituationId { get; set; } }

        [HttpPost]
        public ActionResult<TacticalChannel> Create([FromBody] CreateDto dto)
        {
            if (!CheckApiKey(Request, _options.Value.ApiKey)) return Unauthorized();
            var ch = _channels.Create(dto?.Name ?? string.Empty);
            _hub.Clients.All.SendAsync("ChannelCreated", ch);
            _ = _history.AppendAsync(new { type = "channel_create", id = ch.Id, ch.Name });
            return ch;
        }

        [HttpGet("all")]
        public ActionResult<List<object>> GetAll()
        {
            var list = _channels.GetAll();
            var result = new List<object>();
            foreach (var ch in list)
            {
                string? sitTitle = null;
                if (ch.SituationId.HasValue)
                {
                    if (_situations.TryGet(ch.SituationId.Value, out var sit) && sit != null)
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
                    notes = (string?)null
                });
            }
            return result;
        }

        [HttpPost("{id}/busy")]
        public IActionResult SetBusy(Guid id, [FromBody] BusyDto dto)
        {
            if (!CheckApiKey(Request, _options.Value.ApiKey)) return Unauthorized();
            _channels.SetBusy(id, dto?.IsBusy == true);
            if (_channels.TryGet(id, out var ch) && ch != null)
            {
                _hub.Clients.All.SendAsync("ChannelUpdated", ch);
                var busyVal = ch.IsBusy;
                var chId = ch.Id;
                _ = _history.AppendAsync(new { type = "channel_busy", id = chId, IsBusy = busyVal });
            }
            return Ok();
        }

        [HttpPost("{id}/attach-situation")]
        public IActionResult AttachSituation(Guid id, [FromBody] AttachDto dto)
        {
            if (!CheckApiKey(Request, _options.Value.ApiKey)) return Unauthorized();
            _channels.AttachSituation(id, dto?.SituationId);
            if (_channels.TryGet(id, out var ch) && ch != null)
            {
                _hub.Clients.All.SendAsync("ChannelUpdated", ch);
                var sitIdVal = ch.SituationId;
                var chId = ch.Id;
                _ = _history.AppendAsync(new { type = "channel_attach_situation", id = chId, SituationId = sitIdVal });
            }
            return Ok();
        }

        private static bool CheckApiKey(Microsoft.AspNetCore.Http.HttpRequest req, string expected)
        {
            if (string.IsNullOrEmpty(expected)) return true;
            if (!req.Headers.TryGetValue("x-api-key", out var k)) return false;
            return string.Equals(k.ToString(), expected, System.StringComparison.Ordinal);
        }
    }
}


