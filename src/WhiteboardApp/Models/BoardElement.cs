using System.Text.Json;

namespace WhiteboardApp.Models;

public enum ElementType
{
    Drawing,
    Text,
    Shape,
    Line,
    StickyNote,
    Image
}

public class BoardElement
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid BoardId { get; set; }
    public ElementType Type { get; set; }
    public double X { get; set; }
    public double Y { get; set; }
    public double? Width { get; set; }
    public double? Height { get; set; }
    public int ZIndex { get; set; } = 0;
    public string? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public JsonDocument? Data { get; set; }
    
    // Navigation property
    public Board? Board { get; set; }
}