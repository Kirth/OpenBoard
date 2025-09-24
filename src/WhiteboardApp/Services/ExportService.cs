using Microsoft.JSInterop;
using WhiteboardApp.Models;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using System.Security.Claims;

namespace WhiteboardApp.Services;

public class ExportService
{
    private readonly IJSRuntime _jsRuntime;
    private readonly BoardService _boardService;
    private readonly ImageService _imageService;
    private readonly IUserService _userService;
    private readonly IWebHostEnvironment _environment;

    public ExportService(IJSRuntime jsRuntime, BoardService boardService, ImageService imageService, IUserService userService, IWebHostEnvironment environment)
    {
        _jsRuntime = jsRuntime;
        _boardService = boardService;
        _imageService = imageService;
        _userService = userService;
        _environment = environment;
    }

    public async Task<string> ExportBoardAsPngAsync(Guid boardId, string filename = null)
    {
        try
        {
            // Get board info for filename if not provided
            if (string.IsNullOrEmpty(filename))
            {
                var board = await _boardService.GetBoardAsync(boardId);
                filename = $"{board?.Name ?? "Board"}_{DateTime.Now:yyyyMMdd_HHmmss}.png";
            }

            // Call JavaScript to export canvas as PNG
            var result = await _jsRuntime.InvokeAsync<string>("exportCanvasAsPng", filename);
            return result;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error exporting PNG: {ex.Message}");
            throw new Exception($"Failed to export board as PNG: {ex.Message}");
        }
    }

    public async Task<string> ExportBoardAsPdfAsync(Guid boardId, string filename = null)
    {
        try
        {
            // Get board info for filename if not provided
            if (string.IsNullOrEmpty(filename))
            {
                var board = await _boardService.GetBoardAsync(boardId);
                filename = $"{board?.Name ?? "Board"}_{DateTime.Now:yyyyMMdd_HHmmss}.pdf";
            }

            // Call JavaScript to export canvas as PDF
            var result = await _jsRuntime.InvokeAsync<string>("exportCanvasAsPdf", filename);
            return result;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error exporting PDF: {ex.Message}");
            throw new Exception($"Failed to export board as PDF: {ex.Message}");
        }
    }

    public async Task<BoardExportData> ExportBoardAsJsonAsync(Guid boardId, User currentUser, JsonExportOptions? options = null)
    {
        try
        {
            options ??= new JsonExportOptions();

            // Verify board ownership
            var board = await _boardService.GetBoardWithAccessCheckAsync(boardId, currentUser, BoardRole.Owner);
            if (board == null)
            {
                throw new UnauthorizedAccessException("Only board owners can export boards to JSON");
            }

            // Build export data
            var exportData = new BoardExportData
            {
                Metadata = await BuildMetadataAsync(board, currentUser, options),
                BoardData = await BuildBoardDataAsync(board, options)
            };

            // Generate hash for board data
            var boardDataJson = JsonSerializer.Serialize(exportData.BoardData, new JsonSerializerOptions 
            { 
                WriteIndented = false 
            });
            exportData.Metadata.DataHash = GenerateDataHash(boardDataJson);

            // Update file size in metadata
            var fullJson = JsonSerializer.Serialize(exportData, new JsonSerializerOptions 
            { 
                WriteIndented = true 
            });
            exportData.Metadata.FileSizeBytes = Encoding.UTF8.GetByteCount(fullJson);

            return exportData;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error exporting board as JSON: {ex.Message}");
            throw new Exception($"Failed to export board as JSON: {ex.Message}");
        }
    }

    private async Task<BoardExportMetadata> BuildMetadataAsync(Board board, User currentUser, JsonExportOptions options)
    {
        return new BoardExportMetadata
        {
            ExportVersion = "1.0",
            ExportedAt = DateTime.UtcNow,
            ExportedBy = currentUser.DisplayName,
            ExportedByUserId = currentUser.Id.ToString(),
            BoardId = board.Id,
            BoardName = board.Name,
            ApplicationVersion = "OpenBoard 1.0",
            ImageMode = options.ImageMode,
            TotalElements = board.Elements?.Count ?? 0
        };
    }

    private async Task<BoardExportBoardData> BuildBoardDataAsync(Board board, JsonExportOptions options)
    {
        var exportData = new BoardExportBoardData
        {
            Board = new BoardInfo
            {
                Id = board.Id,
                Name = board.Name,
                Emoji = board.Emoji,
                CreatedAt = board.CreatedAt,
                UpdatedAt = board.UpdatedAt,
                AccessLevel = board.AccessLevel,
                OwnerDisplayName = board.Owner?.DisplayName ?? "",
                OwnerEmail = board.Owner?.Email ?? ""
            },
            Elements = new List<BoardElementExport>(),
            Collaborators = new List<CollaboratorInfo>(),
            Images = new Dictionary<string, ImageExportData>()
        };

        // Export elements
        if (board.Elements != null)
        {
            foreach (var element in board.Elements)
            {
                var exportElement = new BoardElementExport
                {
                    Id = element.Id,
                    Type = element.Type,
                    X = element.X,
                    Y = element.Y,
                    Width = element.Width,
                    Height = element.Height,
                    ZIndex = element.ZIndex,
                    CreatedByDisplayName = element.CreatedByUser?.DisplayName ?? "",
                    ModifiedByDisplayName = element.ModifiedByUser?.DisplayName,
                    CreatedAt = element.CreatedAt,
                    ModifiedAt = element.ModifiedAt,
                    Data = element.Data,
                    GroupId = element.GroupId,
                    GroupOrder = element.GroupOrder
                };

                exportData.Elements.Add(exportElement);

                // Handle image elements
                if (element.Type == ElementType.Image && element.Data != null)
                {
                    await ProcessImageElement(element.Data, exportData.Images, options.ImageMode);
                }
            }
        }

        // Export collaborators
        if (options.IncludeCollaborators && board.Collaborators != null)
        {
            // Add owner first
            exportData.Collaborators.Add(new CollaboratorInfo
            {
                DisplayName = board.Owner?.DisplayName ?? "",
                Email = board.Owner?.Email ?? "",
                Username = board.Owner?.Username ?? "",
                Role = BoardRole.Owner,
                GrantedAt = board.CreatedAt,
                IsOwner = true
            });

            // Add other collaborators
            foreach (var collaborator in board.Collaborators)
            {
                exportData.Collaborators.Add(new CollaboratorInfo
                {
                    DisplayName = collaborator.User?.DisplayName ?? "",
                    Email = collaborator.User?.Email ?? "",
                    Username = collaborator.User?.Username ?? "",
                    Role = collaborator.Role,
                    GrantedAt = collaborator.GrantedAt,
                    GrantedByDisplayName = collaborator.GrantedByUser?.DisplayName,
                    IsOwner = false
                });
            }
        }

        return exportData;
    }

    private async Task ProcessImageElement(JsonDocument imageData, Dictionary<string, ImageExportData> imagesDict, ImageExportMode mode)
    {
        try
        {
            var root = imageData.RootElement;
            if (root.TryGetProperty("src", out var srcProperty))
            {
                var imagePath = srcProperty.GetString();
                if (!string.IsNullOrEmpty(imagePath) && imagePath.StartsWith("/uploads/"))
                {
                    var fileName = Path.GetFileName(imagePath);
                    
                    // Avoid duplicate processing
                    if (imagesDict.ContainsKey(fileName))
                        return;

                    var fullPath = Path.Combine(_environment.WebRootPath, "uploads", fileName);
                    
                    if (File.Exists(fullPath))
                    {
                        var imageExportData = new ImageExportData
                        {
                            OriginalPath = imagePath,
                            FileName = fileName,
                            ContentType = GetContentType(fileName),
                            FileSizeBytes = new FileInfo(fullPath).Length
                        };

                        // Get image dimensions
                        var (width, height) = await _imageService.GetImageDimensionsAsync(imagePath);
                        imageExportData.Width = width;
                        imageExportData.Height = height;

                        // Embed image data if requested
                        if (mode == ImageExportMode.Embedded)
                        {
                            var imageBytes = await File.ReadAllBytesAsync(fullPath);
                            imageExportData.Base64Data = Convert.ToBase64String(imageBytes);
                        }

                        imagesDict[fileName] = imageExportData;
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error processing image element: {ex.Message}");
        }
    }

    private string GenerateDataHash(string data)
    {
        using var sha256 = SHA256.Create();
        var hashBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(data));
        return Convert.ToBase64String(hashBytes);
    }

    private string GetContentType(string fileName)
    {
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        return extension switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".gif" => "image/gif",
            ".webp" => "image/webp",
            _ => "application/octet-stream"
        };
    }

    public async Task<ExportInfo> GetExportInfoAsync(Guid boardId)
    {
        try
        {
            var board = await _boardService.GetBoardAsync(boardId);
            if (board == null)
            {
                throw new ArgumentException($"Board with ID {boardId} not found.");
            }

            // Get canvas dimensions from JavaScript
            var canvasInfo = await _jsRuntime.InvokeAsync<CanvasInfo>("getCanvasInfo");

            return new ExportInfo
            {
                BoardId = boardId,
                BoardName = board.Name,
                CanvasWidth = canvasInfo.Width,
                CanvasHeight = canvasInfo.Height,
                ElementCount = board.Elements.Count,
                SuggestedFilename = $"{board.Name}_{DateTime.Now:yyyyMMdd_HHmmss}"
            };
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error getting export info: {ex.Message}");
            throw;
        }
    }
}

public class ExportInfo
{
    public Guid BoardId { get; set; }
    public string BoardName { get; set; } = string.Empty;
    public int CanvasWidth { get; set; }
    public int CanvasHeight { get; set; }
    public int ElementCount { get; set; }
    public string SuggestedFilename { get; set; } = string.Empty;
}

public class CanvasInfo
{
    public int Width { get; set; }
    public int Height { get; set; }
    public double Scale { get; set; }
}