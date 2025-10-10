using Microsoft.AspNetCore.Mvc;
using SaMapViewer.Models;
using SaMapViewer.Services;
using System.Linq;

namespace SaMapViewer.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class PlayersController : ControllerBase
    {
        private readonly PlayerTrackerService _playerTracker;
        private readonly UnitsService _unitsService;

        public PlayersController(PlayerTrackerService playerTracker, UnitsService unitsService)
        {
            _playerTracker = playerTracker;
            _unitsService = unitsService;
        }

        [HttpGet]
        public ActionResult<IEnumerable<PlayerPoint>> GetAllPlayers()
        {
            return Ok(_playerTracker.GetAllPlayers());
        }

        [HttpGet("{nick}")]
        public ActionResult<PlayerPoint> GetPlayer(string nick)
        {
            var player = _playerTracker.GetPlayer(nick);
            if (player == null)
                return NotFound($"Player '{nick}' not found");
            
            return Ok(player);
        }

        [HttpPost]
        public ActionResult<PlayerPoint> CreatePlayer([FromBody] CreatePlayerRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Nick))
                return BadRequest("Nick is required");

            var existingPlayer = _playerTracker.GetPlayer(request.Nick);
            if (existingPlayer != null)
                return Conflict($"Player '{request.Nick}' already exists");

            // Устанавливаем координаты -10000, -10000 для игроков созданных вручную (костыль-маркер)
            // Это позволяет отличить их от игроков созданных через скрипт SA-MP
            var x = request.X ?? -10000f;
            var y = request.Y ?? -10000f;
            
            var player = new PlayerPoint(request.Nick, x, y);
            if (request.Role.HasValue)
                player.SetRole(request.Role.Value);
            if (request.Status.HasValue)
                player.SetStatus(request.Status.Value);
            if (request.Rank.HasValue)
                player.SetRank(request.Rank.Value);

            _playerTracker.AddPlayer(player);
            return CreatedAtAction(nameof(GetPlayer), new { nick = player.Nick }, player);
        }

        [HttpPut("{nick}/status")]
        public ActionResult UpdatePlayerStatus(string nick, [FromBody] UpdateStatusRequest request)
        {
            var player = _playerTracker.GetPlayer(nick);
            if (player == null)
                return NotFound($"Player '{nick}' not found");

            player.SetStatus(request.Status);
            return Ok(player);
        }

        [HttpPut("{nick}/role")]
        public ActionResult UpdatePlayerRole(string nick, [FromBody] UpdateRoleRequest request)
        {
            var player = _playerTracker.GetPlayer(nick);
            if (player == null)
                return NotFound($"Player '{nick}' not found");

            var oldRole = player.Role;
            player.SetRole(request.Role);

            // Если игрок в юните, нужно пересчитать статус юнита и игрока
            if (player.UnitId.HasValue)
            {
                var unit = _unitsService.GetUnit(player.UnitId.Value);
                if (unit != null)
                {
                    // Проверяем, есть ли супервайзеры в юните
                    bool hasSupervisors = unit.PlayerNicks.Any(n =>
                    {
                        var p = _playerTracker.GetPlayer(n);
                        return p != null && (p.Role == PlayerRole.Supervisor || p.Role == PlayerRole.SuperSupervisor);
                    });

                    // Обновляем флаг ведущего юнита
                    bool wasLeadUnit = unit.IsLeadUnit;
                    unit.IsLeadUnit = hasSupervisors;

                    // Если изменился статус супервайзера, обновляем статусы всех игроков
                    if (wasLeadUnit != unit.IsLeadUnit ||
                        (oldRole != request.Role && (request.Role == PlayerRole.Supervisor || request.Role == PlayerRole.SuperSupervisor || oldRole == PlayerRole.Supervisor || oldRole == PlayerRole.SuperSupervisor)))
                    {
                        foreach (var n in unit.PlayerNicks)
                        {
                            var p = _playerTracker.GetPlayer(n);
                            if (p != null)
                            {
                                bool shouldBeLead = unit.IsLeadUnit && (p.Role == PlayerRole.Supervisor || p.Role == PlayerRole.SuperSupervisor);
                                _playerTracker.SetPlayerStatus(n, shouldBeLead ? PlayerStatus.OnDutyLeadUnit : PlayerStatus.OnDuty);
                            }
                        }
                    }
                }
            }

            return Ok(player);
        }

        [HttpDelete("{nick}")]
        public ActionResult DeletePlayer(string nick)
        {
            var player = _playerTracker.GetPlayer(nick);
            if (player == null)
                return NotFound($"Player '{nick}' not found");

            // Если игрок в юните, убираем его из юнита (но не удаляем сам юнит!)
            if (player.UnitId.HasValue)
            {
                _unitsService.RemovePlayerFromUnit(player.UnitId.Value, nick);
            }

            _playerTracker.RemovePlayer(nick);
            return NoContent();
        }

        [HttpGet("by-status/{status}")]
        public ActionResult<IEnumerable<PlayerPoint>> GetPlayersByStatus(PlayerStatus status)
        {
            var players = _playerTracker.GetAllPlayers()
                .Where(p => p.Status == status);
            return Ok(players);
        }

        [HttpGet("by-role/{role}")]
        public ActionResult<IEnumerable<PlayerPoint>> GetPlayersByRole(PlayerRole role)
        {
            var players = _playerTracker.GetAllPlayers()
                .Where(p => p.Role == role);
            return Ok(players);
        }

        [HttpGet("available-for-unit")]
        public ActionResult<IEnumerable<PlayerPoint>> GetAvailablePlayersForUnit()
        {
            var players = _playerTracker.GetAvailablePlayersForUnit();
            return Ok(players);
        }

        [HttpPut("{nick}/afk")]
        public ActionResult UpdatePlayerAFK(string nick, [FromBody] UpdateAFKRequest request)
        {
            var player = _playerTracker.GetPlayer(nick);
            if (player == null)
                return NotFound($"Player '{nick}' not found");

            _playerTracker.SetPlayerAFK(nick, request.IsAFK);
            return Ok(player);
        }

        [HttpPut("{nick}/rank")]
        public ActionResult UpdatePlayerRank(string nick, [FromBody] UpdateRankRequest request)
        {
            var player = _playerTracker.GetPlayer(nick);
            if (player == null)
                return NotFound($"Player '{nick}' not found");

            player.SetRank(request.Rank);
            return Ok(player);
        }
    }

    public class CreatePlayerRequest
    {
        public string Nick { get; set; } = string.Empty;
        public float? X { get; set; }
        public float? Y { get; set; }
        public PlayerRole? Role { get; set; }
        public PlayerStatus? Status { get; set; }
        public PlayerRank? Rank { get; set; }
    }

    public class UpdateStatusRequest
    {
        public PlayerStatus Status { get; set; }
    }

    public class UpdateRoleRequest
    {
        public PlayerRole Role { get; set; }
    }

    public class UpdateRankRequest
    {
        public PlayerRank Rank { get; set; }
    }

    public class UpdateAFKRequest
    {
        public bool IsAFK { get; set; }
    }
}