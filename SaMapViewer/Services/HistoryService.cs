using System;
using System.Text.Json;
using System.Threading.Tasks;
using SaMapViewer.Data;
using SaMapViewer.Models;

namespace SaMapViewer.Services
{
    public class HistoryService
    {
        private readonly SaMapDbContext _db;

        public HistoryService(SaMapDbContext db)
        {
            _db = db;
        }

        public async Task AppendAsync(object evt)
        {
            var entry = new AuditLog
            {
                Timestamp = DateTime.UtcNow,
                EventType = (evt as dynamic)?.type?.ToString() ?? "generic",
                Payload = JsonSerializer.Serialize(evt)
            };
            _db.AuditLogs.Add(entry);
            await _db.SaveChangesAsync();
        }
    }
}

