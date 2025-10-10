using System;
using System.Collections.Generic;

namespace SaMapViewer.Models
{
    public class Situation
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string Type { get; set; } = string.Empty; // Code7, Pursuit, TrafficStop, Code6, 911
        public Dictionary<string, string> Metadata { get; set; } = new();
        public HashSet<Guid> Units { get; set; } = new(); // ID юнитов на ситуации
        
        // Green Unit - юнит который инициировал ситуацию (первый)
        public Guid? GreenUnitId { get; set; }
        
        // Red Unit - юнит с сержантом или выше (автоматически назначается)
        // По умолчанию равен GreenUnitId, но меняется при появлении сержанта
        public Guid? RedUnitId { get; set; }
        
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public bool IsActive { get; set; } = true;

        // Добавить юнит на ситуацию
        public void AddUnit(Guid unitId, bool isInitiator = false)
        {
            Units.Add(unitId);
            
            // Если это инициатор (первый юнит), устанавливаем его как Green и Red
            if (isInitiator)
            {
                GreenUnitId = unitId;
                // По умолчанию Red Unit = Green Unit, пока не появится сержант
                if (!RedUnitId.HasValue)
                {
                    RedUnitId = unitId;
                }
            }
        }

        // Удалить юнит с ситуации
        public void RemoveUnit(Guid unitId)
        {
            Units.Remove(unitId);
            
            // Если удаляем Green Unit
            if (GreenUnitId == unitId)
            {
                GreenUnitId = null;
            }
            
            // Если удаляем Red Unit
            if (RedUnitId == unitId)
            {
                // Red Unit возвращается к Green Unit (если есть)
                RedUnitId = GreenUnitId;
            }
        }

        // Установить Red Unit (сержант или выше)
        public void SetRedUnit(Guid unitId)
        {
            if (Units.Contains(unitId))
            {
                RedUnitId = unitId;
            }
        }
        
        // Сбросить Red Unit к Green Unit
        public void ResetRedUnitToGreen()
        {
            RedUnitId = GreenUnitId;
        }
    }
}

