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
    public long SequenceNumber { get; set; } = 0;
    [Obsolete("Use CreatedByUserId instead. Maintained for backward compatibility.")]
    public string? CreatedBy { get; set; }
    
    /// <summary>
    /// User who created this element
    /// </summary>
    public Guid CreatedByUserId { get; set; }
    public virtual User CreatedByUser { get; set; } = null!;
    
    /// <summary>
    /// User who last modified this element
    /// </summary>
    public Guid? ModifiedByUserId { get; set; }
    public virtual User? ModifiedByUser { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ModifiedAt { get; set; } = DateTime.UtcNow;
    public JsonDocument? Data { get; set; }
    
    // Group properties
    public Guid? GroupId { get; set; }
    public int? GroupOrder { get; set; }
    
    // Navigation property
    public virtual Board Board { get; set; } = null!;
}