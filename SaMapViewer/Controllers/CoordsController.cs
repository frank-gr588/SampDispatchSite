using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using SaMapViewer.Models;
using SaMapViewer.Services;
using SaMapViewer.Hubs;
using System.Collections.Generic;

namespace SaMapViewer.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CoordsController : ControllerBase
    {
        private readonly PlayerTrackerService _tracker;
        private readonly SituationsService _situations;
        private readonly IHubContext<CoordsHub> _hubContext;
        private readonly HistoryService _history;
        private readonly Microsoft.Extensions.Options.IOptions<SaMapViewer.Services.SaOptions> _options;

        public CoordsController(PlayerTrackerService tracker, IHubContext<CoordsHub> hubContext, SituationsService situations, HistoryService history, Microsoft.Extensions.Options.IOptions<SaMapViewer.Services.SaOptions> options)
        {
            _tracker = tracker;
            _hubContext = hubContext;
            _situations = situations;
            _history = history;
            _options = options;
        }

        public class CoordsDto
        {
            public string Nick { get; set; } = string.Empty;
            public float X { get; set; }
            public float Y { get; set; }
            public bool IsAFK { get; set; }
        }

        public class StatusDto
        {
            public string Nick { get; set; } = string.Empty;
            public string Status { get; set; } = string.Empty;
        }

        [HttpPost]
        public IActionResult Post([FromBody] CoordsDto data)
        {
            if (!CheckApiKey(Request, _options.Value.ApiKey)) return Unauthorized();
            if (string.IsNullOrWhiteSpace(data.Nick))
                return BadRequest();

            _tracker.Update(data.Nick, data.X, data.Y);
            
            // Обновляем AFK статус
            _tracker.SetPlayerAFK(data.Nick, data.IsAFK);

            // Рассылаем всем клиентам новое положение игрока
            _hubContext.Clients.All.SendAsync("UpdatePlayer", new
            {
                nick = data.Nick,
                x = data.X,
                y = data.Y,
                isAFK = data.IsAFK
            });

            // также синхронизируем статус после движения
            var statusNow = _situations.GetStatus(data.Nick);
            _hubContext.Clients.All.SendAsync("UpdatePlayerStatus", new { nick = data.Nick, status = statusNow });

            _ = _history.AppendAsync(new { type = "coords", nick = data.Nick, x = data.X, y = data.Y, isAFK = data.IsAFK });

            return Ok();
        }

        [HttpPost("status")]
        public IActionResult PostStatus([FromBody] StatusDto data)
        {
            if (!CheckApiKey(Request, _options.Value.ApiKey)) return Unauthorized();
            if (string.IsNullOrWhiteSpace(data.Nick))
                return BadRequest();

            _situations.SetBaseStatus(data.Nick, data.Status ?? "ничего");

            var combined = _situations.GetStatus(data.Nick);
            _hubContext.Clients.All.SendAsync("UpdatePlayerStatus", new { nick = data.Nick, status = combined });

            _ = _history.AppendAsync(new { type = "status", nick = data.Nick, status = combined });

            return Ok();
        }

        [HttpGet("all")]
        public ActionResult<List<PlayerPoint>> GetAll()
        {
            return _tracker.GetAlivePlayers();
        }
        
        private static bool CheckApiKey(Microsoft.AspNetCore.Http.HttpRequest req, string expected)
        {
            if (string.IsNullOrEmpty(expected)) return true;
            if (!req.Headers.TryGetValue("x-api-key", out var k)) return false;
            return string.Equals(k.ToString(), expected, System.StringComparison.Ordinal);
        }
    }
}