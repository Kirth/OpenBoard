using System.ComponentModel.DataAnnotations;

namespace WhiteboardApp.Models;

public class User
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>
    /// Subject identifier from the OIDC provider (sub claim)
    /// This is the unique, stable identifier for the user
    /// </summary>
    [Required]
    public string SubjectId { get; set; } = string.Empty;

    /// <summary>
    /// Preferred username from OIDC provider
    /// </summary>
    public string? Username { get; set; }

    /// <summary>
    /// Email address from OIDC provider
    /// </summary>
    public string? Email { get; set; }

    /// <summary>
    /// Full name from OIDC provider
    /// </summary>
    public string? Name { get; set; }

    /// <summary>
    /// Display name used in the whiteboard application
    /// Defaults to Username, Email, or Name if not set
    /// </summary>
    public string DisplayName { get; set; } = string.Empty;

    /// <summary>
    /// User's time zone preference
    /// </summary>
    public string? TimeZone { get; set; }

    /// <summary>
    /// User's preferred theme (light, dark, auto)
    /// </summary>
    public string Theme { get; set; } = "auto";

    /// <summary>
    /// When the user was first created in our system
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// When the user last logged in
    /// </summary>
    public DateTime LastLoginAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Whether the user account is active
    /// </summary>
    public bool IsActive { get; set; } = true;

    // Navigation properties
    public virtual ICollection<Board> OwnedBoards { get; set; } = new List<Board>();
    public virtual ICollection<BoardElement> CreatedElements { get; set; } = new List<BoardElement>();
    public virtual ICollection<BoardCollaborator> BoardCollaborations { get; set; } = new List<BoardCollaborator>();
}

/// <summary>
/// Many-to-many relationship between Users and Boards for collaboration
/// </summary>
public class BoardCollaborator
{
    public Guid BoardId { get; set; }
    public virtual Board Board { get; set; } = null!;

    public Guid UserId { get; set; }
    public virtual User User { get; set; } = null!;

    /// <summary>
    /// Role of the user on this board (owner, collaborator, viewer)
    /// </summary>
    public BoardRole Role { get; set; } = BoardRole.Collaborator;

    /// <summary>
    /// When the user was granted access to this board
    /// </summary>
    public DateTime GrantedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Who granted this user access to the board
    /// </summary>
    public Guid? GrantedByUserId { get; set; }
    public virtual User? GrantedByUser { get; set; }
}

public enum BoardRole
{
    Viewer = 1,     // Can view board content only
    Collaborator = 2,   // Can edit board content
    Owner = 3       // Full control including deletion and access management
}