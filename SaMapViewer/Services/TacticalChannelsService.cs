using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using SaMapViewer.Models;

namespace SaMapViewer.Services
{
    public class TacticalChannelsService
    {
        private readonly ConcurrentDictionary<Guid, TacticalChannel> _channels = new ConcurrentDictionary<Guid, TacticalChannel>();

        public TacticalChannelsService()
        {
            // Initialize default tactical channels
            Create("TAC-1");
            Create("TAC-2");
            Create("TAC-3");
        }

        public TacticalChannel Create(string name)
        {
            var ch = new TacticalChannel { Name = name ?? string.Empty };
            _channels[ch.Id] = ch;
            return ch;
        }

        public List<TacticalChannel> GetAll() => _channels.Values.OrderBy(c => c.Name).ToList();

        public bool TryGet(Guid id, out TacticalChannel? ch) => _channels.TryGetValue(id, out ch);

        public void SetBusy(Guid id, bool busy)
        {
            if (_channels.TryGetValue(id, out var ch))
            {
                ch.IsBusy = busy;
            }
        }

        public void AttachSituation(Guid id, Guid? situationId)
        {
            if (_channels.TryGetValue(id, out var ch))
            {
                ch.SituationId = situationId;
            }
        }
    }
}


