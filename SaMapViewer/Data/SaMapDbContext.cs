using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using SaMapViewer.Models;

namespace SaMapViewer.Data
{
    public class SaMapDbContext : DbContext
    {
        public SaMapDbContext(DbContextOptions<SaMapDbContext> options) : base(options) { }

        public DbSet<PlayerPoint> Players => Set<PlayerPoint>();
        public DbSet<Unit> Units => Set<Unit>();
        public DbSet<Situation> Situations => Set<Situation>();
        public DbSet<TacticalChannel> TacticalChannels => Set<TacticalChannel>();
        public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            var jsonOptions = new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                WriteIndented = false
            };

            // Player
            modelBuilder.Entity<PlayerPoint>(builder =>
            {
                builder.HasKey(p => p.Nick);
                builder.Property(p => p.Nick).HasMaxLength(64);
                builder.Property(p => p.Status).HasConversion<int>();
                builder.Property(p => p.Role).HasConversion<int>();
                builder.Property(p => p.Rank).HasConversion<int>();
                builder.Property(p => p.LastUpdate).IsConcurrencyToken(false);
                builder.Property(p => p.LastActivityTime).IsConcurrencyToken(false);
            });

            // Unit
            modelBuilder.Entity<Unit>(builder =>
            {
                builder.HasKey(u => u.Id);
                builder.Property(u => u.Marking).HasMaxLength(32);
                builder.Property(u => u.Status).HasMaxLength(64);
                builder.Property(u => u.PlayerNicks)
                    .HasConversion(
                        v => JsonSerializer.Serialize(v, jsonOptions),
                        v => JsonSerializer.Deserialize<HashSet<string>>(v, jsonOptions) ?? new HashSet<string>(StringComparer.OrdinalIgnoreCase))
                    .Metadata.SetValueComparer(new ValueComparer<HashSet<string>>(
                        (c1, c2) => c1!.SequenceEqual(c2!),
                        c => c!.Aggregate(0, (a, v) => HashCode.Combine(a, v.GetHashCode())),
                        c => new HashSet<string>(c!, StringComparer.OrdinalIgnoreCase)));
            });

            // Situation
            modelBuilder.Entity<Situation>(builder =>
            {
                builder.HasKey(s => s.Id);
                builder.Property(s => s.Type).HasMaxLength(64);
                builder.Property(s => s.LocationName).HasMaxLength(256);
                builder.Property(s => s.Metadata)
                    .HasConversion(
                        v => JsonSerializer.Serialize(v, jsonOptions),
                        v => JsonSerializer.Deserialize<Dictionary<string, string>>(v, jsonOptions) ?? new Dictionary<string, string>())
                    .Metadata.SetValueComparer(new ValueComparer<Dictionary<string, string>>(
                        (d1, d2) => d1!.Count == d2!.Count && !d1.Except(d2).Any(),
                        d => d!.Aggregate(0, (a, kv) => HashCode.Combine(a, kv.Key.GetHashCode(), kv.Value.GetHashCode())),
                        d => new Dictionary<string, string>(d!)));

                builder.Property(s => s.Units)
                    .HasConversion(
                        v => JsonSerializer.Serialize(v, jsonOptions),
                        v => JsonSerializer.Deserialize<HashSet<Guid>>(v, jsonOptions) ?? new HashSet<Guid>())
                    .Metadata.SetValueComparer(new ValueComparer<HashSet<Guid>>(
                        (c1, c2) => c1!.SetEquals(c2!),
                        c => c!.Aggregate(0, (a, v) => HashCode.Combine(a, v.GetHashCode())),
                        c => new HashSet<Guid>(c!)));
            });

            // Tactical channels
            modelBuilder.Entity<TacticalChannel>(builder =>
            {
                builder.HasKey(c => c.Id);
                builder.Property(c => c.Name).HasMaxLength(64);
                builder.Property(c => c.Notes).HasMaxLength(1024);
            });

            // Audit log
            modelBuilder.Entity<AuditLog>(builder =>
            {
                builder.HasKey(a => a.Id);
                builder.Property(a => a.EventType).HasMaxLength(64);
                builder.HasIndex(a => a.Timestamp);
            });

            base.OnModelCreating(modelBuilder);
        }
    }
}
