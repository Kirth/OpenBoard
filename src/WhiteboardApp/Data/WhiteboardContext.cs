using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using WhiteboardApp.Models;

namespace WhiteboardApp.Data;

public class WhiteboardContext : DbContext
{
    public WhiteboardContext(DbContextOptions<WhiteboardContext> options) : base(options)
    {
    }

    public DbSet<Board> Boards { get; set; }
    public DbSet<BoardElement> BoardElements { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Configure DateTime properties to be treated as UTC for PostgreSQL
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            foreach (var property in entityType.GetProperties())
            {
                if (property.ClrType == typeof(DateTime) || property.ClrType == typeof(DateTime?))
                {
                    property.SetValueConverter(new DateTimeUtcConverter());
                }
            }
        }
        modelBuilder.Entity<Board>(entity =>
        {
            entity.ToTable("boards");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Name).HasColumnName("name").HasMaxLength(255).IsRequired();
            entity.Property(e => e.CreatedAt).HasColumnName("createdat").HasDefaultValueSql("NOW()");
            entity.Property(e => e.UpdatedAt).HasColumnName("updatedat").HasDefaultValueSql("NOW()");
            entity.Property(e => e.IsPublic).HasColumnName("ispublic").HasDefaultValue(false);
            entity.Property(e => e.AdminPin).HasColumnName("adminpin").HasMaxLength(100);
        });

        modelBuilder.Entity<BoardElement>(entity =>
        {
            entity.ToTable("boardelements");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.BoardId).HasColumnName("boardid");
            entity.Property(e => e.Type).HasColumnName("type").HasConversion<string>().HasMaxLength(50);
            entity.Property(e => e.X).HasColumnName("x");
            entity.Property(e => e.Y).HasColumnName("y");
            entity.Property(e => e.Width).HasColumnName("width");
            entity.Property(e => e.Height).HasColumnName("height");
            entity.Property(e => e.ZIndex).HasColumnName("zindex");
            entity.Property(e => e.CreatedBy).HasColumnName("createdby").HasMaxLength(100);
            entity.Property(e => e.CreatedAt).HasColumnName("createdat").HasDefaultValueSql("NOW()");
            entity.Property(e => e.Data).HasColumnName("data").HasColumnType("jsonb");
            entity.Property(e => e.GroupId).HasColumnName("groupid");
            entity.Property(e => e.GroupOrder).HasColumnName("grouporder");
            
            entity.HasOne(e => e.Board)
                  .WithMany(b => b.Elements)
                  .HasForeignKey(e => e.BoardId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.BoardId);
            entity.HasIndex(e => e.Type);
            entity.HasIndex(e => e.GroupId);
        });

        base.OnModelCreating(modelBuilder);
    }
}