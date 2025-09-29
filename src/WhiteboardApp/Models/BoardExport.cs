using System.Text.Json;
using WhiteboardApp.Models;

namespace WhiteboardApp.Models;

public class BoardExportData
{
    public BoardExportMetadata Metadata { get; set; } = new();
    public BoardExportBoardData BoardData { get; set; } = new();
}

public class BoardExportMetadata
{
    public string ExportVersion { get; set; } = "1.0";
    public DateTime ExportedAt { get; set; } = DateTime.UtcNow;
    public string ExportedBy { get; set; } = string.Empty;
    public string ExportedByUserId { get; set; } = string.Empty;
    public Guid BoardId { get; set; }
    public string BoardName { get; set; } = string.Empty;
    public string ApplicationVersion { get; set; } = "OpenBoard 1.0";
    public string DataHash { get; set; } = string.Empty;
    public ImageExportMode ImageMode { get; set; } = ImageExportMode.Embedded;
    public int TotalElements { get; set; }
    public long FileSizeBytes { get; set; }
}

public class BoardExportBoardData
{
    public BoardInfo Board { get; set; } = new();
    public List<BoardElementExport> Elements { get; set; } = new();
    public List<CollaboratorInfo> Collaborators { get; set; } = new();
    public Dictionary<string, ImageExportData> Images { get; set; } = new();
}

public class BoardInfo
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Emoji { get; set; } = "📋";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public BoardAccessLevel AccessLevel { get; set; }
    public string OwnerDisplayName { get; set; } = string.Empty;
    public string OwnerEmail { get; set; } = string.Empty;
}

public class BoardElementExport
{
    public Guid Id { get; set; }
    public ElementType Type { get; set; }
    public double X { get; set; }
    public double Y { get; set; }
    public double? Width { get; set; }
    public double? Height { get; set; }
    public int ZIndex { get; set; }
    public string CreatedByDisplayName { get; set; } = string.Empty;
    public string? ModifiedByDisplayName { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime ModifiedAt { get; set; }
    public JsonDocument? Data { get; set; }
    public Guid? GroupId { get; set; }
    public int? GroupOrder { get; set; }
}

public class CollaboratorInfo
{
    public string DisplayName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public BoardRole Role { get; set; }
    public DateTime GrantedAt { get; set; }
    public string? GrantedByDisplayName { get; set; }
    public bool IsOwner { get; set; }
}

public class ImageExportData
{
    public string OriginalPath { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string? Base64Data { get; set; }
    public string ContentType { get; set; } = string.Empty;
    public int Width { get; set; }
    public int Height { get; set; }
    public long FileSizeBytes { get; set; }
}

public enum ImageExportMode
{
    Embedded = 1,    // Images embedded as base64 in JSON
    Referenced = 2   // Images referenced by path only
}

public class JsonExportOptions
{
    public ImageExportMode ImageMode { get; set; } = ImageExportMode.Embedded;
    public bool IncludeCollaborators { get; set; } = true;
    public bool IncludeMetadata { get; set; } = true;
}