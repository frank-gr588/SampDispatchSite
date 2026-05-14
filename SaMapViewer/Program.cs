using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using SaMapViewer.Data;
using SaMapViewer.Services;
using System.IO;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    });
builder.Services.AddSignalR();
builder.Services.AddDbContext<SaMapDbContext>((sp, opts) =>
{
    var sa = sp.GetRequiredService<IOptions<SaOptions>>().Value;
    var configuredPath = string.IsNullOrWhiteSpace(sa.DatabasePath) ? "samap.db" : sa.DatabasePath;
    var dbPath = Path.IsPathRooted(configuredPath)
        ? configuredPath
        : Path.Combine(AppContext.BaseDirectory, configuredPath);

    var dbDir = Path.GetDirectoryName(dbPath);
    if (!string.IsNullOrWhiteSpace(dbDir))
    {
        Directory.CreateDirectory(dbDir);
    }

    if (!File.Exists(dbPath))
    {
        using var _ = File.Create(dbPath);
    }

    opts.UseSqlite($"Data Source={dbPath}");
});
builder.Services.AddScoped<PlayerTrackerService>();
builder.Services.AddScoped<UnitsService>();
builder.Services.AddScoped<SituationsService>();
builder.Services.AddScoped<HistoryService>();
builder.Services.AddScoped<TacticalChannelsService>();
builder.Services.Configure<SaOptions>(builder.Configuration.GetSection("SaMap"));
builder.Services.AddHostedService<SaMapViewer.Services.InactivityCleanupService>();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyHeader()
              .AllowAnyMethod()
              .AllowAnyOrigin();
    });
});

var app = builder.Build();

static void EnsureSqliteColumn(SaMapDbContext db, string tableName, string columnName, string columnDefinition)
{
    var connection = db.Database.GetDbConnection();
    if (connection.State != System.Data.ConnectionState.Open)
    {
        connection.Open();
    }

    using var checkCmd = connection.CreateCommand();
    checkCmd.CommandText = $"PRAGMA table_info(\"{tableName}\");";

    var exists = false;
    using (var reader = checkCmd.ExecuteReader())
    {
        while (reader.Read())
        {
            var name = reader["name"]?.ToString();
            if (string.Equals(name, columnName, StringComparison.OrdinalIgnoreCase))
            {
                exists = true;
                break;
            }
        }
    }

    if (exists)
    {
        return;
    }

    using var alterCmd = connection.CreateCommand();
    alterCmd.CommandText = $"ALTER TABLE \"{tableName}\" ADD COLUMN \"{columnName}\" {columnDefinition};";
    alterCmd.ExecuteNonQuery();
}

// Ensure database is created
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<SaMapDbContext>();
    db.Database.EnsureCreated();

    if (db.Database.IsSqlite())
    {
        EnsureSqliteColumn(db, "Situations", "CreatorNick", "TEXT NOT NULL DEFAULT ''");
        EnsureSqliteColumn(db, "Situations", "GreenUnitId", "TEXT NULL");
        EnsureSqliteColumn(db, "Situations", "RedUnitId", "TEXT NULL");
        EnsureSqliteColumn(db, "Situations", "LocationName", "TEXT NOT NULL DEFAULT ''");
        EnsureSqliteColumn(db, "Situations", "X", "REAL NULL");
        EnsureSqliteColumn(db, "Situations", "Y", "REAL NULL");
        EnsureSqliteColumn(db, "Situations", "LastActivityAt", "TEXT NULL");
        EnsureSqliteColumn(db, "Units", "CreatorNick", "TEXT NOT NULL DEFAULT ''");
        EnsureSqliteColumn(db, "Players", "IsSuspect", "INTEGER NOT NULL DEFAULT 0");
    }

    var channels = scope.ServiceProvider.GetRequiredService<TacticalChannelsService>();
    channels.EnsureDefaultsAsync().GetAwaiter().GetResult();
}

app.UseCors();
app.Use(async (ctx, next) =>
{
    var opts = ctx.RequestServices.GetRequiredService<IOptions<SaOptions>>().Value;
    if (!string.IsNullOrWhiteSpace(opts.ApiKey))
    {
        if (!ctx.Request.Headers.TryGetValue("x-api-key", out var header) || header.Count == 0 || header.ToString() != opts.ApiKey)
        {
            ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }
    }

    await next();
});
app.UseStaticFiles();
app.MapControllers();
app.MapHub<SaMapViewer.Hubs.CoordsHub>("/coordshub");

app.Run("http://0.0.0.0:80");