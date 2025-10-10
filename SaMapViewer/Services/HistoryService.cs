using System;
using System.IO;
using System.Text.Json;
using System.Threading;
using Microsoft.Extensions.Options;

namespace SaMapViewer.Services
{
    public class SaOptions
    {
        public string ApiKey { get; set; } = string.Empty;
        public int PlayerTtlSeconds { get; set; } = 10;
        public string HistoryPath { get; set; } = "history.jsonl";
    }

    public class HistoryService
    {
        private readonly string _path;
        private readonly SemaphoreSlim _sem = new(1,1);

        public HistoryService(IOptions<SaOptions> options)
        {
            _path = options.Value.HistoryPath ?? "history.jsonl";
        }

        public async System.Threading.Tasks.Task AppendAsync(object evt)
        {
            await _sem.WaitAsync();
            try
            {
                var json = JsonSerializer.Serialize(new { ts = DateTime.UtcNow, ev = evt });
                await File.AppendAllTextAsync(_path, json + Environment.NewLine);
            }
            finally
            {
                _sem.Release();
            }
        }
    }
}

