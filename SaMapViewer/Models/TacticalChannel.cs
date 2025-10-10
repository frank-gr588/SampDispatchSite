using System;

namespace SaMapViewer.Models
{
    public class TacticalChannel
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string Name { get; set; } = string.Empty;
        public bool IsBusy { get; set; }
        public Guid? SituationId { get; set; } // Привязанная ситуация
    }
}


