using System;
using System.Collections.Generic;
using System.Linq;

namespace SaMapViewer.Models
{
    public class Unit
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string Marking { get; set; } = string.Empty; // Маркировка (макс 8 символов)
        public HashSet<string> PlayerNicks { get; set; } = new(StringComparer.OrdinalIgnoreCase); // Игроки в юните
        public int PlayerCount => PlayerNicks.Count; // Количество игроков
        public string Status { get; set; } = string.Empty; // Статус (с фронта)
        public Guid? SituationId { get; set; } // Прикреплённость к ситуации
        public bool IsLeadUnit { get; set; } // Ведущий юнит (red unit)
        public Guid? TacticalChannelId { get; set; } // Какой тактический канал закреплён
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        
        // Никнейм создателя юнита (для валидации прав)
        public string CreatorNick { get; set; } = string.Empty;
    }

    /// <summary>
    /// Юнит с информацией о расстоянии до указанной точки
    /// </summary>
    public class UnitWithDistance
    {
        public Unit Unit { get; set; } = new();
        public float Distance { get; set; } // Расстояние до точки
        public float X { get; set; } // X координата юнита
        public float Y { get; set; } // Y координата юнита
    }
}
