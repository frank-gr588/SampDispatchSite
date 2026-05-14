using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SaMapViewer.Data;
using SaMapViewer.Models;

namespace SaMapViewer.Services
{
    public class TacticalChannelsService
    {
        private readonly SaMapDbContext _db;
        private readonly ILogger<TacticalChannelsService> _logger;

        public TacticalChannelsService(SaMapDbContext db, ILogger<TacticalChannelsService> logger)
        {
            _db = db;
            _logger = logger;
        }

        public async Task EnsureDefaultsAsync()
        {
            var existing = await _db.TacticalChannels.AsNoTracking().ToListAsync();
            if (existing.Count == 0)
            {
                await Create("TAC-1");
                await Create("TAC-2");
                await Create("TAC-3");
                _logger.LogInformation("Seeded default tactical channels TAC-1..3");
            }
        }

        public async Task<TacticalChannel> Create(string name)
        {
            var ch = new TacticalChannel { Name = name ?? string.Empty };
            _db.TacticalChannels.Add(ch);
            await _db.SaveChangesAsync();
            return ch;
        }

        public Task<List<TacticalChannel>> GetAll() => _db.TacticalChannels.AsNoTracking().OrderBy(c => c.Name).ToListAsync();

        public async Task<(bool, TacticalChannel?)> TryGet(Guid id)
        {
            var ch = await _db.TacticalChannels.FindAsync(id);
            return (ch != null, ch);
        }

        public async Task SetBusy(Guid id, bool busy)
        {
            var ch = await _db.TacticalChannels.FindAsync(id);
            if (ch == null) return;
            ch.IsBusy = busy;
            _db.TacticalChannels.Update(ch);
            await _db.SaveChangesAsync();
        }

        public async Task AttachSituation(Guid id, Guid? situationId)
        {
            var ch = await _db.TacticalChannels.FindAsync(id);
            if (ch == null) return;
            ch.SituationId = situationId;
            _db.TacticalChannels.Update(ch);
            await _db.SaveChangesAsync();
        }

        public async Task SetNotes(Guid id, string? notes)
        {
            var ch = await _db.TacticalChannels.FindAsync(id);
            if (ch == null) return;
            ch.Notes = notes ?? string.Empty;
            _db.TacticalChannels.Update(ch);
            await _db.SaveChangesAsync();
        }
    }
}


