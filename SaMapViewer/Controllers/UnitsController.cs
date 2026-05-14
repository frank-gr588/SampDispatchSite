using Microsoft.AspNetCore.Mvc;
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
    public class UnitsController : ControllerBase
    {
        private readonly UnitsService _units;
        private readonly IHubContext<CoordsHub> _hub;
        private readonly HistoryService _history;
        private readonly SaMapDbContext _db;

        public UnitsController(
            UnitsService units,
            IHubContext<CoordsHub> hub,
            HistoryService history,
            SaMapDbContext db)
        {
            _units = units;
            _hub = hub;
            _history = history;
            _db = db;
        }

        public class CreateUnitDto 
        { 
            public string Marking { get; set; } = string.Empty; 
            public List<string> PlayerNicks { get; set; } = new List<string>();
            public bool IsLeadUnit { get; set; }
            public string CreatorNick { get; set; } = string.Empty; // Никнейм создателя
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

        public class UnitWithCoordsDto
        {
            public Guid Id { get; set; }
            public string Marking { get; set; } = string.Empty;
            public List<string> PlayerNicks { get; set; } = new List<string>();
            public int PlayerCount { get; set; }
            public string Status { get; set; } = string.Empty;
            public Guid? SituationId { get; set; }
            public bool IsLeadUnit { get; set; }
            public Guid? TacticalChannelId { get; set; }
            public DateTime CreatedAt { get; set; }
            public float? X { get; set; }
            public float? Y { get; set; }
        }
        
        public class UpdateUnitDto 
        { 
            public string? Marking { get; set; } 
        }
        
        public class StatusDto 
        { 
            public string Status { get; set; } = string.Empty;
            public string Nick { get; set; } = string.Empty; // Никнейм того, кто меняет статус
        }
        public class AttachSituationDto { public Guid? SituationId { get; set; } }
        public class LeadUnitDto 
        { 
            public bool IsLeadUnit { get; set; }
            public string Nick { get; set; } = string.Empty; // Никнейм того, кто меняет лидер
        }
        public class ChannelDto { public Guid? ChannelId { get; set; } }

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

        private void EnsureUnitsSqliteCompatibility()
        {
            if (!_db.Database.IsSqlite())
                return;

            EnsureSqliteColumn("Units", "CreatorNick", "TEXT NOT NULL DEFAULT ''");
        }

        [HttpPost]
        public async Task<ActionResult<Unit>> CreateUnit([FromBody] CreateUnitDto dto)
        {
            if (dto.PlayerNicks == null || dto.PlayerNicks.Count == 0)
                return BadRequest("PlayerNicks is required and must contain at least one player");

            var creatorNick = string.IsNullOrWhiteSpace(dto.CreatorNick)
                ? dto.PlayerNicks.FirstOrDefault() ?? string.Empty
                : dto.CreatorNick;

            try
            {
                var unit = await _units.CreateUnit(dto.Marking, dto.PlayerNicks, dto.IsLeadUnit, creatorNick);
                await _hub.Clients.All.SendAsync("UnitCreated", unit);
                _ = _history.AppendAsync(new { type = "unit_create", id = unit.Id, unit.Marking, playerNicks = unit.PlayerNicks, unit.IsLeadUnit, creatorNick });
                return unit;
            }
            catch (SqliteException ex) when (ex.Message.Contains("no such column", StringComparison.OrdinalIgnoreCase)
                                             && ex.Message.Contains("CreatorNick", StringComparison.OrdinalIgnoreCase))
            {
                EnsureUnitsSqliteCompatibility();
                var unit = await _units.CreateUnit(dto.Marking, dto.PlayerNicks, dto.IsLeadUnit, creatorNick);
                await _hub.Clients.All.SendAsync("UnitCreated", unit);
                _ = _history.AppendAsync(new { type = "unit_create", id = unit.Id, unit.Marking, playerNicks = unit.PlayerNicks, unit.IsLeadUnit, creatorNick });
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

        private async Task<UnitWithCoordsDto> ToUnitWithCoordsDto(Unit unit)
        {
            var pos = await _units.GetUnitPosition(unit.Id);
            return new UnitWithCoordsDto
            {
                Id = unit.Id,
                Marking = unit.Marking,
                PlayerNicks = unit.PlayerNicks.ToList(),
                PlayerCount = unit.PlayerCount,
                Status = unit.Status,
                SituationId = unit.SituationId,
                IsLeadUnit = unit.IsLeadUnit,
                TacticalChannelId = unit.TacticalChannelId,
                CreatedAt = unit.CreatedAt,
                X = pos?.x,
                Y = pos?.y
            };
        }

        [HttpGet]
        public async Task<ActionResult<List<UnitWithCoordsDto>>> GetAllUnits()
        {
            try
            {
                var units = await _units.GetAll();
                var result = await Task.WhenAll(units.Select(ToUnitWithCoordsDto));
                return Ok(result.ToList());
            }
            catch (SqliteException ex) when (ex.Message.Contains("no such column", StringComparison.OrdinalIgnoreCase)
                                             && ex.Message.Contains("CreatorNick", StringComparison.OrdinalIgnoreCase))
            {
                EnsureUnitsSqliteCompatibility();
                var units = await _units.GetAll();
                var result = await Task.WhenAll(units.Select(ToUnitWithCoordsDto));
                return Ok(result.ToList());
            }
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<UnitWithCoordsDto>> GetUnit(Guid id)
        {
            var unit = await _units.GetUnit(id);
            if (unit == null)
                return NotFound($"Unit with ID {id} not found");

            return Ok(await ToUnitWithCoordsDto(unit));
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteUnit(Guid id)
        {
            var unit = await _units.GetUnit(id);
            if (unit == null)
                return NotFound($"Unit with ID {id} not found");

            await _units.RemoveUnit(id);
            await _hub.Clients.All.SendAsync("UnitDeleted", new { id });
            _ = _history.AppendAsync(new { type = "unit_delete", id, playerNicks = unit.PlayerNicks });
            return Ok();
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateUnit(Guid id, [FromBody] UpdateUnitDto dto)
        {
            var unit = await _units.GetUnit(id);
            if (unit == null)
                return NotFound($"Unit with ID {id} not found");

            await _units.UpdateUnit(id, dto.Marking);
            var updatedUnit = await _units.GetUnit(id);
            if (updatedUnit != null)
            {
                await _hub.Clients.All.SendAsync("UnitUpdated", updatedUnit);
                _ = _history.AppendAsync(new { type = "unit_update", id = updatedUnit.Id, updatedUnit.Marking });
            }
            return Ok();
        }

        [HttpPut("{id}/status")]
        public async Task<IActionResult> SetStatus(Guid id, [FromBody] StatusDto dto)
        {
            var unit = await _units.GetUnit(id);
            if (unit == null)
                return NotFound($"Unit with ID {id} not found");

            string actorNick = dto?.Nick ?? string.Empty;
            if (!string.IsNullOrWhiteSpace(actorNick))
            {
                var (success, message) = await _units.SetUnitStatusWithValidation(id, dto!.Status, actorNick);
                if (!success)
                    return Forbid();
            }
            else
            {
                await _units.SetUnitStatus(id, dto?.Status ?? string.Empty);
            }

            var updatedUnit = await _units.GetUnit(id);
            if (updatedUnit != null)
            {
                await _hub.Clients.All.SendAsync("UnitUpdated", updatedUnit);
                _ = _history.AppendAsync(new { type = "unit_status", id = updatedUnit.Id, updatedUnit.Status, nick = actorNick });
            }
            return Ok(new { message = "Status updated" });
        }

        [HttpPut("{id}/situation")]
        public async Task<IActionResult> AttachSituation(Guid id, [FromBody] AttachSituationDto dto)
        {
            var unit = await _units.GetUnit(id);
            if (unit == null)
                return NotFound($"Unit with ID {id} not found");

            await _units.AttachToSituation(id, dto.SituationId);
            var updatedUnit = await _units.GetUnit(id);
            if (updatedUnit != null)
            {
                await _hub.Clients.All.SendAsync("UnitUpdated", updatedUnit);
                _ = _history.AppendAsync(new { type = "unit_attach_situation", id = updatedUnit.Id, updatedUnit.SituationId });
            }
            return Ok();
        }

        [HttpPut("{id}/lead")]
        public async Task<IActionResult> SetLeadUnit(Guid id, [FromBody] LeadUnitDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto?.Nick))
                return BadRequest("Nick is required");

            var (success, message) = await _units.SetLeadUnitWithValidation(id, dto.IsLeadUnit, dto.Nick);
            if (!success)
                return Forbid();

            var updatedUnit = await _units.GetUnit(id);
            if (updatedUnit != null)
            {
                await _hub.Clients.All.SendAsync("UnitUpdated", updatedUnit);
                _ = _history.AppendAsync(new { type = "unit_set_lead", id = updatedUnit.Id, updatedUnit.IsLeadUnit, nick = dto.Nick });
            }
            return Ok(new { message });
        }

        [HttpPut("{id}/channel")]
        public async Task<IActionResult> AssignChannel(Guid id, [FromBody] ChannelDto dto)
        {
            var unit = await _units.GetUnit(id);
            if (unit == null)
                return NotFound($"Unit with ID {id} not found");

            await _units.AssignTacticalChannel(id, dto.ChannelId);
            var updatedUnit = await _units.GetUnit(id);
            if (updatedUnit != null)
            {
                await _hub.Clients.All.SendAsync("UnitUpdated", updatedUnit);
                _ = _history.AppendAsync(new { type = "unit_assign_channel", id = updatedUnit.Id, updatedUnit.TacticalChannelId });
            }
            return Ok();
        }

        [HttpGet("available")]
        public async Task<ActionResult<List<UnitWithCoordsDto>>> GetAvailableUnits()
        {
            var units = await _units.GetAvailableUnits();
            var result = await Task.WhenAll(units.Select(ToUnitWithCoordsDto));
            return Ok(result.ToList());
        }

        [HttpGet("by-situation/{situationId}")]
        public async Task<ActionResult<List<UnitWithCoordsDto>>> GetUnitsBySituation(Guid situationId)
        {
            var units = await _units.GetUnitsBySituation(situationId);
            var result = await Task.WhenAll(units.Select(ToUnitWithCoordsDto));
            return Ok(result.ToList());
        }

        [HttpPost("{id}/players/add")]
        public async Task<IActionResult> AddPlayerToUnit(Guid id, [FromBody] AddPlayerToUnitDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.PlayerNick))
                return BadRequest("PlayerNick is required");

            try
            {
                await _units.AddPlayerToUnit(id, dto.PlayerNick);
                var updatedUnit = await _units.GetUnit(id);
                if (updatedUnit != null)
                {
                    await _hub.Clients.All.SendAsync("UnitUpdated", updatedUnit);
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
        public async Task<IActionResult> RemovePlayerFromUnit(Guid id, [FromBody] RemovePlayerFromUnitDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.PlayerNick))
                return BadRequest("PlayerNick is required");

            await _units.RemovePlayerFromUnit(id, dto.PlayerNick);
            var updatedUnit = await _units.GetUnit(id);
            if (updatedUnit != null)
            {
                await _hub.Clients.All.SendAsync("UnitUpdated", updatedUnit);
            }
            else
            {
                // Юнит был удален, так как остался без игроков
                await _hub.Clients.All.SendAsync("UnitDeleted", new { id });
            }
            _ = _history.AppendAsync(new { type = "unit_remove_player", unitId = id, playerNick = dto.PlayerNick });
            return Ok();
        }

        [HttpGet("{id}/players")]
        public async Task<ActionResult<List<PlayerInUnitDto>>> GetPlayersInUnit(Guid id)
        {
            var players = await _units.GetPlayersInUnit(id);
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
        public async Task<ActionResult<string>> GetLeadPlayer(Guid id)
        {
            var leadPlayer = await _units.GetLeadPlayerNick(id);
            if (leadPlayer == null)
                return NotFound("No lead player found for this unit");
            
            return Ok(leadPlayer);
        }

        /// <summary>
        /// Находит ближайшие юниты к указанным координатам
        /// GET /api/units/nearest?x=1234.56&y=789.12&limit=5&onlyAvailable=false
        /// </summary>
        [HttpGet("nearest")]
        public async Task<ActionResult<List<object>>> GetNearestUnits(
            [FromQuery] float x, 
            [FromQuery] float y, 
            [FromQuery] int limit = 5,
            [FromQuery] bool onlyAvailable = false)
        {
            if (limit < 1 || limit > 50)
                return BadRequest("Limit must be between 1 and 50");

            var nearestUnits = await _units.GetNearestUnits(x, y, limit, onlyAvailable);

            var response = nearestUnits.Select(u => new
            {
                id = u.Unit.Id,
                marking = u.Unit.Marking,
                playerNicks = u.Unit.PlayerNicks,
                playerCount = u.Unit.PlayerCount,
                status = u.Unit.Status,
                situationId = u.Unit.SituationId,
                isLeadUnit = u.Unit.IsLeadUnit,
                tacticalChannelId = u.Unit.TacticalChannelId,
                distance = Math.Round(u.Distance, 2), // Округляем до 2 знаков
                x = u.X,
                y = u.Y
            }).ToList();

            return Ok(response);
        }
    }
}