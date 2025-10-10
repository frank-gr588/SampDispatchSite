using System;

namespace SaMapViewer.Models
{
    public enum PlayerStatus
    {
        OutOfDuty,      // вне службы
        OnDuty,         // на службе (без юнита)
        OnDutyLeadUnit, // на службе (ведущий юнита)
        OnDutyOutOfUnit // на службе (вне юнита)
    }

    public enum PlayerRole
    {
        Officer,          // офицер
        Supervisor,       // супервайзер
        SuperSupervisor   // суперсупервайзер
    }

    public enum PlayerRank
    {
        ChiefOfPolice = 0,           // Начальник полиции
        AssistantChiefOfPolice = 1,  // Помощник начальника
        DeputyChiefOfPolice = 2,     // Заместитель начальника
        PoliceCommander = 3,         // Командир
        PoliceCaptain = 4,           // Капитан
        PoliceLieutenant = 5,        // Лейтенант
        PoliceSergeant = 6,          // Сержант
        PoliceInspector = 7,         // Инспектор
        PoliceOfficer = 8            // Офицер
    }

    public class PlayerPoint
    {
        public string Nick { get; set; } = string.Empty;
        public float X { get; set; }
        public float Y { get; set; }
        public PlayerStatus Status { get; set; }
        public PlayerRole Role { get; set; }
        public PlayerRank Rank { get; set; }
        public Guid? UnitId { get; set; }  // ID юнита, в котором находится игрок
        public DateTime LastUpdate { get; set; }
        public DateTime LastActivityTime { get; set; }  // Последняя активность (движение)
        public bool IsAFK { get; set; }  // Статус AFK

        // Parameterless ctor for deserialization
        public PlayerPoint() {
            Nick = string.Empty;
            X = -10000f;
            Y = -10000f;
            Status = PlayerStatus.OnDutyOutOfUnit;
            Role = PlayerRole.Officer;
            Rank = PlayerRank.PoliceOfficer;
            LastUpdate = DateTime.UtcNow;
            LastActivityTime = DateTime.UtcNow;
            IsAFK = false;
        }

        public PlayerPoint(string nick, float x, float y)
        {
            Nick = nick;
            X = x;
            Y = y;
            // Для игроков созданных вручную (маркер -10000,-10000) используем OnDutyOutOfUnit
            // Для игроков из скрипта используем OutOfDuty
            Status = (x == -10000f && y == -10000f) ? PlayerStatus.OnDutyOutOfUnit : PlayerStatus.OutOfDuty;
            Role = PlayerRole.Officer;
            Rank = PlayerRank.PoliceOfficer; // По умолчанию - офицер
            LastUpdate = DateTime.UtcNow;
            LastActivityTime = DateTime.UtcNow;
            IsAFK = false;
        }

        public void Update(float x, float y)
        {
            X = x;
            Y = y;
            LastUpdate = DateTime.UtcNow;
            // Если координаты изменились значительно, обновляем LastActivityTime
            LastActivityTime = DateTime.UtcNow;
            IsAFK = false;
        }

        public void SetStatus(PlayerStatus status)
        {
            Status = status;
            LastUpdate = DateTime.UtcNow;
        }

        public void SetRole(PlayerRole role)
        {
            Role = role;
            LastUpdate = DateTime.UtcNow;
        }

        public void SetRank(PlayerRank rank)
        {
            Rank = rank;
            LastUpdate = DateTime.UtcNow;
        }

        public void AssignToUnit(Guid unitId)
        {
            UnitId = unitId;
            // НЕ изменяем Status - он должен устанавливаться UnitsService
            // в зависимости от роли игрока и типа юнита
            LastUpdate = DateTime.UtcNow;
        }

        public void RemoveFromUnit()
        {
            UnitId = null;
            Status = PlayerStatus.OnDutyOutOfUnit;
            LastUpdate = DateTime.UtcNow;
        }
    }
}