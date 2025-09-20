using System.ComponentModel.DataAnnotations;

namespace WhiteboardApp.Models;

/// <summary>
/// Tracks when users access boards for recent board functionality
/// </summary>
public class UserBoardAccess
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>
    /// The user who accessed the board
    /// </summary>
    public Guid UserId { get; set; }
    public virtual User User { get; set; } = null!;

    /// <summary>
    /// The board that was accessed
    /// </summary>
    public Guid BoardId { get; set; }
    public virtual Board Board { get; set; } = null!;

    /// <summary>
    /// When the user last accessed this board
    /// </summary>
    public DateTime LastAccessedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// How many times the user has accessed this board
    /// </summary>
    public int AccessCount { get; set; } = 1;

    /// <summary>
    /// Whether this access was a join or just a view
    /// </summary>
    public bool IsJoin { get; set; } = true;
}