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
    public class UnitsController : ControllerBase
    {
        private readonly UnitsService _units;
        private readonly PlayerTrackerService _playerTracker;
        private readonly IHubContext<CoordsHub> _hub;
        private readonly HistoryService _history;
        private readonly Microsoft.Extensions.Options.IOptions<SaMapViewer.Services.SaOptions> _options;

        public UnitsController(
            UnitsService units, 
            PlayerTrackerService playerTracker,
            IHubContext<CoordsHub> hub, 
            HistoryService history, 
            Microsoft.Extensions.Options.IOptions<SaMapViewer.Services.SaOptions> options)
        {
            _units = units;
            _playerTracker = playerTracker;
            _hub = hub;
            _history = history;
            _options = options;
        }

        public class CreateUnitDto 
        { 
            public string Marking { get; set; } = string.Empty; 
            public List<string> PlayerNicks { get; set; } = new List<string>();
            public bool IsLeadUnit { get; set; } 
        }

        public class AddPlayerToUnitDto
        {
            public string PlayerNick { get; set; } = string.Empty;
        }

        public class RemovePlayerFromUnitDto
        {
            public string PlayerNick { get; set; } = string.Empty;
        }

        public class PlayerInUnitDto
        {
            public string Nick { get; set; } = string.Empty;
            public float X { get; set; }
            public float Y { get; set; }
            public PlayerStatus Status { get; set; }
            public PlayerRole Role { get; set; }
            public PlayerRank Rank { get; set; }
            public string? UnitId { get; set; }
            public string LastUpdate { get; set; } = string.Empty;
        }
        
        public class UpdateUnitDto 
        { 
            public string? Marking { get; set; } 
        }
        
        public class StatusDto { public string Status { get; set; } = string.Empty; }
        public class AttachSituationDto { public Guid? SituationId { get; set; } }
        public class LeadUnitDto { public bool IsLeadUnit { get; set; } }
        public class ChannelDto { public Guid? ChannelId { get; set; } }

        [HttpPost]
        public ActionResult<Unit> CreateUnit([FromBody] CreateUnitDto dto)
        {
            if (!CheckApiKey(Request, _options.Value.ApiKey)) return Unauthorized();
            
            if (dto.PlayerNicks == null || dto.PlayerNicks.Count == 0)
                return BadRequest("PlayerNicks is required and must contain at least one player");

            try
            {
                var unit = _units.CreateUnit(dto.Marking, dto.PlayerNicks, dto.IsLeadUnit);
                _hub.Clients.All.SendAsync("UnitCreated", unit);
                _ = _history.AppendAsync(new { type = "unit_create", id = unit.Id, unit.Marking, playerNicks = unit.PlayerNicks, unit.IsLeadUnit });
                return unit;
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
            catch (InvalidOperationException ex)
            {
                return Conflict(ex.Message);
            }
        }

        [HttpGet]
        public ActionResult<List<Unit>> GetAllUnits() => _units.GetAll();

        [HttpGet("{id}")]
        public ActionResult<Unit> GetUnit(Guid id)
        {
            var unit = _units.GetUnit(id);
            if (unit == null)
                return NotFound($"Unit with ID {id} not found");
            return unit;
        }

        [HttpDelete("{id}")]
        public IActionResult DeleteUnit(Guid id)
        {
            if (!CheckApiKey(Request, _options.Value.ApiKey)) return Unauthorized();
            
            var unit = _units.GetUnit(id);
            if (unit == null)
                return NotFound($"Unit with ID {id} not found");

            _units.RemoveUnit(id);
            _hub.Clients.All.SendAsync("UnitDeleted", new { id });
            _ = _history.AppendAsync(new { type = "unit_delete", id, playerNicks = unit.PlayerNicks });
            return Ok();
        }

        [HttpPut("{id}")]
        public IActionResult UpdateUnit(Guid id, [FromBody] UpdateUnitDto dto)
        {
            if (!CheckApiKey(Request, _options.Value.ApiKey)) return Unauthorized();
            
            var unit = _units.GetUnit(id);
            if (unit == null)
                return NotFound($"Unit with ID {id} not found");

            _units.UpdateUnit(id, dto.Marking);
            var updatedUnit = _units.GetUnit(id);
            if (updatedUnit != null)
            {
                _hub.Clients.All.SendAsync("UnitUpdated", updatedUnit);
                _ = _history.AppendAsync(new { type = "unit_update", id = updatedUnit.Id, updatedUnit.Marking });
            }
            return Ok();
        }

        [HttpPut("{id}/status")]
        public IActionResult SetStatus(Guid id, [FromBody] StatusDto dto)
        {
            if (!CheckApiKey(Request, _options.Value.ApiKey)) return Unauthorized();
            
            var unit = _units.GetUnit(id);
            if (unit == null)
                return NotFound($"Unit with ID {id} not found");

            _units.SetUnitStatus(id, dto.Status);
            var updatedUnit = _units.GetUnit(id);
            if (updatedUnit != null)
            {
                _hub.Clients.All.SendAsync("UnitUpdated", updatedUnit);
                _ = _history.AppendAsync(new { type = "unit_status", id = updatedUnit.Id, updatedUnit.Status });
            }
            return Ok();
        }

        [HttpPut("{id}/situation")]
        public IActionResult AttachSituation(Guid id, [FromBody] AttachSituationDto dto)
        {
            if (!CheckApiKey(Request, _options.Value.ApiKey)) return Unauthorized();
            
            var unit = _units.GetUnit(id);
            if (unit == null)
                return NotFound($"Unit with ID {id} not found");

            _units.AttachToSituation(id, dto.SituationId);
            var updatedUnit = _units.GetUnit(id);
            if (updatedUnit != null)
            {
                _hub.Clients.All.SendAsync("UnitUpdated", updatedUnit);
                _ = _history.AppendAsync(new { type = "unit_attach_situation", id = updatedUnit.Id, updatedUnit.SituationId });
            }
            return Ok();
        }

        [HttpPut("{id}/lead")]
        public IActionResult SetLeadUnit(Guid id, [FromBody] LeadUnitDto dto)
        {
            if (!CheckApiKey(Request, _options.Value.ApiKey)) return Unauthorized();
            
            var unit = _units.GetUnit(id);
            if (unit == null)
                return NotFound($"Unit with ID {id} not found");

            _units.SetLeadUnit(id, dto.IsLeadUnit);
            var updatedUnit = _units.GetUnit(id);
            if (updatedUnit != null)
            {
                _hub.Clients.All.SendAsync("UnitUpdated", updatedUnit);
                _ = _history.AppendAsync(new { type = "unit_set_lead", id = updatedUnit.Id, updatedUnit.IsLeadUnit });
            }
            return Ok();
        }

        [HttpPut("{id}/channel")]
        public IActionResult AssignChannel(Guid id, [FromBody] ChannelDto dto)
        {
            if (!CheckApiKey(Request, _options.Value.ApiKey)) return Unauthorized();
            
            var unit = _units.GetUnit(id);
            if (unit == null)
                return NotFound($"Unit with ID {id} not found");

            _units.AssignTacticalChannel(id, dto.ChannelId);
            var updatedUnit = _units.GetUnit(id);
            if (updatedUnit != null)
            {
                _hub.Clients.All.SendAsync("UnitUpdated", updatedUnit);
                _ = _history.AppendAsync(new { type = "unit_assign_channel", id = updatedUnit.Id, updatedUnit.TacticalChannelId });
            }
            return Ok();
        }

        [HttpGet("available")]
        public ActionResult<List<Unit>> GetAvailableUnits() => _units.GetAvailableUnits();

        [HttpGet("by-situation/{situationId}")]
        public ActionResult<List<Unit>> GetUnitsBySituation(Guid situationId) => _units.GetUnitsBySituation(situationId);

        [HttpPost("{id}/players/add")]
        public IActionResult AddPlayerToUnit(Guid id, [FromBody] AddPlayerToUnitDto dto)
        {
            if (!CheckApiKey(Request, _options.Value.ApiKey)) return Unauthorized();
            
            if (string.IsNullOrWhiteSpace(dto.PlayerNick))
                return BadRequest("PlayerNick is required");

            try
            {
                _units.AddPlayerToUnit(id, dto.PlayerNick);
                var updatedUnit = _units.GetUnit(id);
                if (updatedUnit != null)
                {
                    _hub.Clients.All.SendAsync("UnitUpdated", updatedUnit);
                    _ = _history.AppendAsync(new { type = "unit_add_player", unitId = id, playerNick = dto.PlayerNick });
                }
                return Ok();
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
            catch (InvalidOperationException ex)
            {
                return Conflict(ex.Message);
            }
        }

        [HttpPost("{id}/players/remove")]
        public IActionResult RemovePlayerFromUnit(Guid id, [FromBody] RemovePlayerFromUnitDto dto)
        {
            if (!CheckApiKey(Request, _options.Value.ApiKey)) return Unauthorized();
            
            if (string.IsNullOrWhiteSpace(dto.PlayerNick))
                return BadRequest("PlayerNick is required");

            _units.RemovePlayerFromUnit(id, dto.PlayerNick);
            var updatedUnit = _units.GetUnit(id);
            if (updatedUnit != null)
            {
                _hub.Clients.All.SendAsync("UnitUpdated", updatedUnit);
            }
            else
            {
                // Юнит был удален, так как остался без игроков
                _hub.Clients.All.SendAsync("UnitDeleted", new { id });
            }
            _ = _history.AppendAsync(new { type = "unit_remove_player", unitId = id, playerNick = dto.PlayerNick });
            return Ok();
        }

        [HttpGet("{id}/players")]
        public ActionResult<List<PlayerInUnitDto>> GetPlayersInUnit(Guid id)
        {
            var players = _units.GetPlayersInUnit(id);
            var playerDtos = players.Select(p => new PlayerInUnitDto
            {
                Nick = p.Nick,
                X = p.X,
                Y = p.Y,
                Status = p.Status,
                Role = p.Role,
                Rank = p.Rank,
                UnitId = p.UnitId?.ToString(),
                LastUpdate = p.LastUpdate.ToString("O")
            }).ToList();
            
            return Ok(playerDtos);
        }

        [HttpGet("{id}/lead-player")]
        public ActionResult<string> GetLeadPlayer(Guid id)
        {
            var leadPlayer = _units.GetLeadPlayerNick(id);
            if (leadPlayer == null)
                return NotFound("No lead player found for this unit");
            
            return Ok(leadPlayer);
        }

        static bool CheckApiKey(HttpRequest req, string key)
        {
            if (string.IsNullOrWhiteSpace(key)) return true;
            if (!req.Headers.TryGetValue("X-API-Key", out var hdr)) return false;
            return string.Join("", hdr.ToArray()) == key;
        }
    }
}