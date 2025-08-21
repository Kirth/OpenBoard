namespace WhiteboardApp.Models;

public class Board
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public bool IsPublic { get; set; } = false; // false = unlisted, true = public
    public string? AdminPin { get; set; } = null; // Optional admin pin for later use
    public List<BoardElement> Elements { get; set; } = new();
}