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
        private readonly IHubContext<CoordsHub> _hub;
        private readonly HistoryService _history;
        private readonly Microsoft.Extensions.Options.IOptions<SaMapViewer.Services.SaOptions> _options;

        public ChannelsController(TacticalChannelsService channels, IHubContext<CoordsHub> hub, HistoryService history, Microsoft.Extensions.Options.IOptions<SaMapViewer.Services.SaOptions> options)
        {
            _channels = channels;
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
        public ActionResult<List<TacticalChannel>> GetAll() => _channels.GetAll();

        [HttpPost("{id}/busy")]
        public IActionResult SetBusy(Guid id, [FromBody] BusyDto dto)
        {
            if (!CheckApiKey(Request, _options.Value.ApiKey)) return Unauthorized();
            _channels.SetBusy(id, dto?.IsBusy == true);
            if (_channels.TryGet(id, out var ch))
            {
                _hub.Clients.All.SendAsync("ChannelUpdated", ch);
                _ = _history.AppendAsync(new { type = "channel_busy", id = ch.Id, ch.IsBusy });
            }
            return Ok();
        }

        [HttpPost("{id}/attach-situation")]
        public IActionResult AttachSituation(Guid id, [FromBody] AttachDto dto)
        {
            if (!CheckApiKey(Request, _options.Value.ApiKey)) return Unauthorized();
            _channels.AttachSituation(id, dto?.SituationId);
            if (_channels.TryGet(id, out var ch))
            {
                _hub.Clients.All.SendAsync("ChannelUpdated", ch);
                _ = _history.AppendAsync(new { type = "channel_attach_situation", id = ch.Id, ch.SituationId });
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


