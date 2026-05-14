using System;
using System.Threading.Tasks;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SaMapViewer.Data;

namespace SaMapViewer.Services
{
    /// <summary>
    /// Centralised database schema migration runner.
    /// Replaces the scattered EnsureSqliteColumn() calls across Program.cs and controllers.
    /// </summary>
    public class DatabaseMigrator
    {
        private readonly SaMapDbContext _db;

        public DatabaseMigrator(SaMapDbContext db) => _db = db;

        public async Task RunAsync()
        {
            await _db.Database.EnsureCreatedAsync();

            if (!_db.Database.IsSqlite())
                return;

            await EnsureColumnAsync("Situations", "CreatorNick", "TEXT NOT NULL DEFAULT ''");
            await EnsureColumnAsync("Situations", "GreenUnitId", "TEXT NULL");
            await EnsureColumnAsync("Situations", "RedUnitId", "TEXT NULL");
            await EnsureColumnAsync("Situations", "LocationName", "TEXT NOT NULL DEFAULT ''");
            await EnsureColumnAsync("Situations", "X", "REAL NULL");
            await EnsureColumnAsync("Situations", "Y", "REAL NULL");
            await EnsureColumnAsync("Situations", "LastActivityAt", "TEXT NULL");
            await EnsureColumnAsync("Units", "CreatorNick", "TEXT NOT NULL DEFAULT ''");
            await EnsureColumnAsync("Players", "IsSuspect", "INTEGER NOT NULL DEFAULT 0");
        }

        private async Task EnsureColumnAsync(string table, string column, string definition)
        {
            var conn = _db.Database.GetDbConnection();
            if (conn.State != System.Data.ConnectionState.Open)
                await conn.OpenAsync();

            using var check = conn.CreateCommand();
            check.CommandText = $"PRAGMA table_info(\"{table}\");";
            using var reader = await check.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                if (string.Equals(reader["name"]?.ToString(), column, StringComparison.OrdinalIgnoreCase))
                    return;
            }
            await reader.DisposeAsync();

            using var alter = conn.CreateCommand();
            alter.CommandText = $"ALTER TABLE \"{table}\" ADD COLUMN \"{column}\" {definition};";
            await alter.ExecuteNonQueryAsync();
        }
    }
}
