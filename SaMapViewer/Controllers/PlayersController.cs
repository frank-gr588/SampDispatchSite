using Microsoft.AspNetCore.Mvc;
using SaMapViewer.Models;
using SaMapViewer.Services;
using System.Linq;
using System.Threading.Tasks;

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
        public async Task<ActionResult<IEnumerable<PlayerPoint>>> GetAllPlayers()
        {
            return Ok(await _playerTracker.GetAllPlayers());
        }

        [HttpGet("{nick}")]
        public async Task<ActionResult<PlayerPoint>> GetPlayer(string nick)
        {
            var player = await _playerTracker.GetPlayer(nick);
            if (player == null)
                return NotFound($"Player '{nick}' not found");
            
            return Ok(player);
        }

        [HttpPost]
        public async Task<ActionResult<PlayerPoint>> CreatePlayer([FromBody] CreatePlayerRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Nick))
                return BadRequest("Nick is required");

            var existingPlayer = await _playerTracker.GetPlayer(request.Nick);
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

            await _playerTracker.AddPlayer(player);
            return CreatedAtAction(nameof(GetPlayer), new { nick = player.Nick }, player);
        }

        [HttpPut("{nick}/status")]
        public async Task<ActionResult> UpdatePlayerStatus(string nick, [FromBody] UpdateStatusRequest request)
        {
            var player = await _playerTracker.GetPlayer(nick);
            if (player == null)
                return NotFound($"Player '{nick}' not found");

            await _playerTracker.SetPlayerStatus(nick, request.Status);
            var updated = await _playerTracker.GetPlayer(nick);
            return Ok(updated);
        }

        [HttpPut("{nick}/role")]
        public async Task<ActionResult> UpdatePlayerRole(string nick, [FromBody] UpdateRoleRequest request)
        {
            var player = await _playerTracker.GetPlayer(nick);
            if (player == null)
                return NotFound($"Player '{nick}' not found");

            var oldRole = player.Role;
            player.SetRole(request.Role);
            await _playerTracker.AddPlayer(player);

            // Если игрок в юните, нужно пересчитать статус юнита и игрока
            if (player.UnitId.HasValue)
            {
                var unit = await _unitsService.GetUnit(player.UnitId.Value);
                if (unit != null)
                {
                    // Проверяем, есть ли супервайзеры в юните
                    bool hasSupervisors = false;
                    foreach (var n in unit.PlayerNicks)
                    {
                        var p = await _playerTracker.GetPlayer(n);
                        if (p != null && (p.Role == PlayerRole.Supervisor || p.Role == PlayerRole.SuperSupervisor))
                        {
                            hasSupervisors = true;
                            break;
                        }
                    }

                    // Обновляем флаг ведущего юнита
                    bool wasLeadUnit = unit.IsLeadUnit;
                    unit.IsLeadUnit = hasSupervisors;

                    // Если изменился статус супервайзера, обновляем статусы всех игроков
                    if (wasLeadUnit != unit.IsLeadUnit ||
                        (oldRole != request.Role && (request.Role == PlayerRole.Supervisor || request.Role == PlayerRole.SuperSupervisor || oldRole == PlayerRole.Supervisor || oldRole == PlayerRole.SuperSupervisor)))
                    {
                        foreach (var n in unit.PlayerNicks)
                        {
                            var p = await _playerTracker.GetPlayer(n);
                            if (p != null)
                            {
                                bool shouldBeLead = unit.IsLeadUnit && (p.Role == PlayerRole.Supervisor || p.Role == PlayerRole.SuperSupervisor);
                                await _playerTracker.SetPlayerStatus(n, shouldBeLead ? PlayerStatus.OnDutyLeadUnit : PlayerStatus.OnDuty);
                            }
                        }
                    }
                }
            }

            return Ok(player);
        }

        [HttpPost("suspect")]
        public async Task<ActionResult<PlayerPoint>> UpsertSuspect([FromBody] CreateSuspectRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Nick))
                return BadRequest("Nick is required");
            if (string.IsNullOrWhiteSpace(request.CreatorNick))
                return BadRequest("CreatorNick is required");

            var existingPlayer = await _playerTracker.GetPlayer(request.Nick);
            if (existingPlayer != null)
            {
                // Update coordinates
                await _playerTracker.UpdatePlayer(request.Nick, request.X ?? existingPlayer.X, request.Y ?? existingPlayer.Y, existingPlayer.InVehicle);
                var updated = await _playerTracker.GetPlayer(request.Nick);
                return Ok(updated);
            }

            var player = new global::SaMapViewer.Models.PlayerPoint(
                request.Nick,
                request.X ?? -10000f,
                request.Y ?? -10000f)
            {
                IsSuspect = true
            };

            await _playerTracker.AddPlayer(player);
            return CreatedAtAction(nameof(GetPlayer), new { nick = player.Nick }, player);
        }

        [HttpDelete("{nick}/suspect")]
        public async Task<ActionResult> DeleteSuspect(string nick)
        {
            var player = await _playerTracker.GetPlayer(nick);
            if (player == null || !player.IsSuspect)
                return NotFound($"Suspect '{nick}' not found");

            await _playerTracker.RemovePlayer(nick);
            return NoContent();
        }

        [HttpDelete("{nick}")]
        public async Task<ActionResult> DeletePlayer(string nick)
        {
            var player = await _playerTracker.GetPlayer(nick);
            if (player == null)
                return NotFound($"Player '{nick}' not found");

            // Если игрок в юните, убираем его из юнита (но не удаляем сам юнит!)
            if (player.UnitId.HasValue)
            {
                await _unitsService.RemovePlayerFromUnit(player.UnitId.Value, nick);
            }

            await _playerTracker.RemovePlayer(nick);
            return NoContent();
        }

        [HttpGet("by-status/{status}")]
        public async Task<ActionResult<IEnumerable<PlayerPoint>>> GetPlayersByStatus(PlayerStatus status)
        {
            var players = await _playerTracker.GetPlayersByStatus(status);
            return Ok(players.AsEnumerable());
        }

        [HttpGet("by-role/{role}")]
        public async Task<ActionResult<IEnumerable<PlayerPoint>>> GetPlayersByRole(PlayerRole role)
        {
            var players = await _playerTracker.GetPlayersByRole(role);
            return Ok(players.AsEnumerable());
        }

        [HttpGet("available-for-unit")]
        public async Task<ActionResult<IEnumerable<PlayerPoint>>> GetAvailablePlayersForUnit()
        {
            var players = await _playerTracker.GetAvailablePlayersForUnit();
            return Ok(players);
        }

        [HttpPut("{nick}/afk")]
        public async Task<ActionResult> UpdatePlayerAFK(string nick, [FromBody] UpdateAFKRequest request)
        {
            var player = await _playerTracker.GetPlayer(nick);
            if (player == null)
                return NotFound($"Player '{nick}' not found");

            await _playerTracker.SetPlayerAFK(nick, request.IsAFK);
            var updated = await _playerTracker.GetPlayer(nick);
            return Ok(updated);
        }

        [HttpPut("{nick}/rank")]
        public async Task<ActionResult> UpdatePlayerRank(string nick, [FromBody] UpdateRankRequest request)
        {
            var player = await _playerTracker.GetPlayer(nick);
            if (player == null)
                return NotFound($"Player '{nick}' not found");

            player.SetRank(request.Rank);
            await _playerTracker.AddPlayer(player);
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

    public class CreateSuspectRequest
    {
        public string Nick { get; set; } = string.Empty;
        public string CreatorNick { get; set; } = string.Empty; // Кто инициировал погоню
        public float? X { get; set; }
        public float? Y { get; set; }
    }
}