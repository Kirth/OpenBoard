namespace WhiteboardApp.Models;

public class UserSession
{
    public string ConnectionId { get; set; } = string.Empty;
    public Guid BoardId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public double CursorX { get; set; }
    public double CursorY { get; set; }
    public bool IsActive { get; set; }
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastActivity { get; set; } = DateTime.UtcNow;
}