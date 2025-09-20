namespace WhiteboardApp.Models;

public class Board
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string Emoji { get; set; } = "📋";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public bool IsPublic { get; set; } = false; // false = unlisted, true = public
    public string? AdminPin { get; set; } = null; // Optional admin pin for backward compatibility

    // Owner relationship
    public Guid OwnerId { get; set; }
    public virtual User Owner { get; set; } = null!;

    /// <summary>
    /// Board access level for non-owners
    /// </summary>
    public BoardAccessLevel AccessLevel { get; set; } = BoardAccessLevel.Private;

    // Navigation properties
    public virtual ICollection<BoardElement> Elements { get; set; } = new List<BoardElement>();
    public virtual ICollection<BoardCollaborator> Collaborators { get; set; } = new List<BoardCollaborator>();
}

public enum BoardAccessLevel
{
    Private = 1,        // Only owner and explicitly granted collaborators
    Unlisted = 2,       // Anyone with the board ID can access (not listed publicly)
    Public = 3          // Listed publicly, anyone can join as collaborator
}