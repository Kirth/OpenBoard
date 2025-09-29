using System.Text.Json;
using WhiteboardApp.Models;

namespace WhiteboardApp.Models;

public class BoardImportRequest
{
    public string BoardName { get; set; } = string.Empty;
    public string? BoardEmoji { get; set; }
    public BoardAccessLevel AccessLevel { get; set; } = BoardAccessLevel.Private;
    public bool ValidateHash { get; set; } = true;
}

public class BoardImportResult
{
    public bool Success { get; set; }
    public Guid? BoardId { get; set; }
    public string? Message { get; set; }
    public List<string> Warnings { get; set; } = new();
    public List<string> Errors { get; set; } = new();
    public ImportValidationResult? ValidationResult { get; set; }
}

public class ImportValidationResult
{
    public bool IsValidJson { get; set; }
    public bool HasRequiredFields { get; set; }
    public bool IsHashValid { get; set; }
    public string? OriginalBoardName { get; set; }
    public int ElementCount { get; set; }
    public int ImageCount { get; set; }
    public string? ExportVersion { get; set; }
    public DateTime? ExportedAt { get; set; }
    public string? ExportedBy { get; set; }
    public ImageExportMode ImageMode { get; set; }
    public List<string> ValidationErrors { get; set; } = new();
    public List<string> ValidationWarnings { get; set; } = new();
}

// Models for parsing the imported JSON structure
public class ImportBoardExportData
{
    public ImportBoardExportMetadata Metadata { get; set; } = new();
    public ImportBoardExportBoardData BoardData { get; set; } = new();
}

public class ImportBoardExportMetadata
{
    public string ExportVersion { get; set; } = string.Empty;
    public DateTime ExportedAt { get; set; }
    public string ExportedBy { get; set; } = string.Empty;
    public string ExportedByUserId { get; set; } = string.Empty;
    public Guid BoardId { get; set; }
    public string BoardName { get; set; } = string.Empty;
    public string ApplicationVersion { get; set; } = string.Empty;
    public string DataHash { get; set; } = string.Empty;
    public ImageExportMode ImageMode { get; set; }
    public int TotalElements { get; set; }
    public long FileSizeBytes { get; set; }
}

public class ImportBoardExportBoardData
{
    public ImportBoardInfo Board { get; set; } = new();
    public List<ImportBoardElementExport> Elements { get; set; } = new();
    public List<ImportCollaboratorInfo> Collaborators { get; set; } = new();
    public Dictionary<string, ImportImageExportData> Images { get; set; } = new();
}

public class ImportBoardInfo
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

public class ImportBoardElementExport
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

public class ImportCollaboratorInfo
{
    public string DisplayName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public BoardRole Role { get; set; }
    public DateTime GrantedAt { get; set; }
    public string? GrantedByDisplayName { get; set; }
    public bool IsOwner { get; set; }
}

public class ImportImageExportData
{
    public string OriginalPath { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string? Base64Data { get; set; }
    public string ContentType { get; set; } = string.Empty;
    public int Width { get; set; }
    public int Height { get; set; }
    public long FileSizeBytes { get; set; }
}

public class BoardImportOptions
{
    public bool ValidateHash { get; set; } = true;
    public bool CreateNewIds { get; set; } = true;
    public bool PreserveTimestamps { get; set; } = false;
    public string? NewBoardName { get; set; }
    public string? NewBoardEmoji { get; set; }
    public BoardAccessLevel? NewAccessLevel { get; set; }
    public bool ProcessImages { get; set; } = true;
    public int MaxImageSizeMB { get; set; } = 10;
}