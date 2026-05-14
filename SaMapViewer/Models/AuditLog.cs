using System;

namespace SaMapViewer.Models
{
    /// <summary>
    /// Persistent audit / history log entry (replaces JSONL file).
    /// </summary>
    public class AuditLog
    {
        public long Id { get; set; }
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
        public string EventType { get; set; } = string.Empty;
        public string Payload { get; set; } = string.Empty;  // JSON blob
    }
}
