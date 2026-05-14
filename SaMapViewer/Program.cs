using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using SaMapViewer.Data;
using SaMapViewer.Services;
using System.IO;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
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
        Directory.CreateDirectory(dbDir);

    if (!File.Exists(dbPath))
        using var _ = File.Create(dbPath);

    opts.UseSqlite($"Data Source={dbPath}");
});
builder.Services.AddScoped<PlayerTrackerService>();
builder.Services.AddScoped<UnitsService>();
builder.Services.AddScoped<SituationsService>();
builder.Services.AddScoped<HistoryService>();
builder.Services.AddScoped<TacticalChannelsService>();
builder.Services.AddScoped<DatabaseMigrator>();
builder.Services.Configure<SaOptions>(builder.Configuration.GetSection("SaMap"));
builder.Services.AddHostedService<InactivityCleanupService>();

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

// Run migrations and seed defaults
using (var scope = app.Services.CreateScope())
{
    var migrator = scope.ServiceProvider.GetRequiredService<DatabaseMigrator>();
    await migrator.RunAsync();

    var channels = scope.ServiceProvider.GetRequiredService<TacticalChannelsService>();
    await channels.EnsureDefaultsAsync();
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