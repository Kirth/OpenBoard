using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using WhiteboardApp.Models;

namespace WhiteboardApp.Data;

public class WhiteboardContext : DbContext
{
    public WhiteboardContext(DbContextOptions<WhiteboardContext> options) : base(options)
    {
    }

    public DbSet<User> Users { get; set; }
    public DbSet<Board> Boards { get; set; }
    public DbSet<BoardElement> BoardElements { get; set; }
    public DbSet<BoardCollaborator> BoardCollaborators { get; set; }
    public DbSet<UserBoardAccess> UserBoardAccesses { get; set; }

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

        // Configure User entity
        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("users");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.SubjectId).HasColumnName("subjectid").HasMaxLength(255).IsRequired();
            entity.Property(e => e.Username).HasColumnName("username").HasMaxLength(255);
            entity.Property(e => e.Email).HasColumnName("email").HasMaxLength(255);
            entity.Property(e => e.Name).HasColumnName("name").HasMaxLength(255);
            entity.Property(e => e.DisplayName).HasColumnName("displayname").HasMaxLength(255).IsRequired();
            entity.Property(e => e.TimeZone).HasColumnName("timezone").HasMaxLength(100);
            entity.Property(e => e.Theme).HasColumnName("theme").HasMaxLength(20).HasDefaultValue("auto");
            entity.Property(e => e.CreatedAt).HasColumnName("createdat").HasDefaultValueSql("NOW()");
            entity.Property(e => e.LastLoginAt).HasColumnName("lastloginat").HasDefaultValueSql("NOW()");
            entity.Property(e => e.IsActive).HasColumnName("isactive").HasDefaultValue(true);

            // Unique constraint on SubjectId (OIDC sub claim)
            entity.HasIndex(e => e.SubjectId).IsUnique();
            entity.HasIndex(e => e.Email);
            entity.HasIndex(e => e.Username);
        });

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
            entity.Property(e => e.OwnerId).HasColumnName("ownerid");
            entity.Property(e => e.AccessLevel).HasColumnName("accesslevel").HasConversion<int>().HasDefaultValue(BoardAccessLevel.Private);

            // Configure relationship with User (Owner)
            entity.HasOne(e => e.Owner)
                  .WithMany(u => u.OwnedBoards)
                  .HasForeignKey(e => e.OwnerId)
                  .OnDelete(DeleteBehavior.Restrict); // Don't cascade delete boards when user is deleted

            entity.HasIndex(e => e.OwnerId);
            entity.HasIndex(e => e.AccessLevel);
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
            entity.Property(e => e.CreatedBy).HasColumnName("createdby").HasMaxLength(100); // Legacy field
            entity.Property(e => e.CreatedByUserId).HasColumnName("createdbyuserid");
            entity.Property(e => e.ModifiedByUserId).HasColumnName("modifiedbyuserid");
            entity.Property(e => e.CreatedAt).HasColumnName("createdat").HasDefaultValueSql("NOW()");
            entity.Property(e => e.ModifiedAt).HasColumnName("modifiedat").HasDefaultValueSql("NOW()");
            entity.Property(e => e.Data).HasColumnName("data").HasColumnType("jsonb");
            entity.Property(e => e.GroupId).HasColumnName("groupid");
            entity.Property(e => e.GroupOrder).HasColumnName("grouporder");
            
            // Board relationship
            entity.HasOne(e => e.Board)
                  .WithMany(b => b.Elements)
                  .HasForeignKey(e => e.BoardId)
                  .OnDelete(DeleteBehavior.Cascade);

            // User relationships
            entity.HasOne(e => e.CreatedByUser)
                  .WithMany(u => u.CreatedElements)
                  .HasForeignKey(e => e.CreatedByUserId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.ModifiedByUser)
                  .WithMany()
                  .HasForeignKey(e => e.ModifiedByUserId)
                  .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(e => e.BoardId);
            entity.HasIndex(e => e.Type);
            entity.HasIndex(e => e.GroupId);
            entity.HasIndex(e => e.CreatedByUserId);
        });

        // Configure BoardCollaborator (many-to-many relationship)
        modelBuilder.Entity<BoardCollaborator>(entity =>
        {
            entity.ToTable("boardcollaborators");
            entity.HasKey(e => new { e.BoardId, e.UserId });
            
            entity.Property(e => e.BoardId).HasColumnName("boardid");
            entity.Property(e => e.UserId).HasColumnName("userid");
            entity.Property(e => e.Role).HasColumnName("role").HasConversion<int>();
            entity.Property(e => e.GrantedAt).HasColumnName("grantedat").HasDefaultValueSql("NOW()");
            entity.Property(e => e.GrantedByUserId).HasColumnName("grantedbyuserid");

            // Relationships
            entity.HasOne(e => e.Board)
                  .WithMany(b => b.Collaborators)
                  .HasForeignKey(e => e.BoardId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.User)
                  .WithMany(u => u.BoardCollaborations)
                  .HasForeignKey(e => e.UserId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.GrantedByUser)
                  .WithMany()
                  .HasForeignKey(e => e.GrantedByUserId)
                  .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(e => e.UserId);
            entity.HasIndex(e => e.Role);
        });

        // Configure UserBoardAccess entity
        modelBuilder.Entity<UserBoardAccess>(entity =>
        {
            entity.ToTable("userboardaccesses");
            entity.HasKey(e => e.Id);
            
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.UserId).HasColumnName("userid");
            entity.Property(e => e.BoardId).HasColumnName("boardid");
            entity.Property(e => e.LastAccessedAt).HasColumnName("lastaccessedat").HasDefaultValueSql("NOW()");
            entity.Property(e => e.AccessCount).HasColumnName("accesscount").HasDefaultValue(1);
            entity.Property(e => e.IsJoin).HasColumnName("isjoin").HasDefaultValue(true);

            // Relationships
            entity.HasOne(e => e.User)
                  .WithMany(u => u.BoardAccesses)
                  .HasForeignKey(e => e.UserId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Board)
                  .WithMany()
                  .HasForeignKey(e => e.BoardId)
                  .OnDelete(DeleteBehavior.Cascade);

            // Unique constraint to prevent duplicate access records for the same user-board combination
            entity.HasIndex(e => new { e.UserId, e.BoardId }).IsUnique();
            entity.HasIndex(e => e.LastAccessedAt);
        });

        base.OnModelCreating(modelBuilder);
    }
}