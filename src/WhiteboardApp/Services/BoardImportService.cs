using Microsoft.AspNetCore.Hosting;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using WhiteboardApp.Data;
using WhiteboardApp.Models;

namespace WhiteboardApp.Services;

public class BoardImportService
{
    private readonly WhiteboardContext _context;
    private readonly BoardService _boardService;
    private readonly ImageService _imageService;
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<BoardImportService> _logger;

    public BoardImportService(
        WhiteboardContext context,
        BoardService boardService,
        ImageService imageService,
        IWebHostEnvironment environment,
        ILogger<BoardImportService> logger)
    {
        _context = context;
        _boardService = boardService;
        _imageService = imageService;
        _environment = environment;
        _logger = logger;
    }

    public async Task<ImportValidationResult> ValidateImportDataAsync(string jsonContent)
    {
        var result = new ImportValidationResult();

        try
        {
            // Parse JSON
            var jsonOptions = new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            };

            var importData = JsonSerializer.Deserialize<ImportBoardExportData>(jsonContent, jsonOptions);

            if (importData == null)
            {
                result.ValidationErrors.Add("Invalid JSON format: Could not parse the file");
                return result;
            }

            result.IsValidJson = true;

            // Validate required fields
            result.HasRequiredFields = ValidateRequiredFields(importData, result);

            if (result.HasRequiredFields)
            {
                // Extract metadata
                result.OriginalBoardName = importData.BoardData.Board.Name;
                result.ElementCount = importData.BoardData.Elements?.Count ?? 0;
                result.ImageCount = importData.BoardData.Images?.Count ?? 0;
                result.ExportVersion = importData.Metadata.ExportVersion;
                result.ExportedAt = importData.Metadata.ExportedAt;
                result.ExportedBy = importData.Metadata.ExportedBy;
                result.ImageMode = importData.Metadata.ImageMode;

                // Validate hash if provided
                if (!string.IsNullOrEmpty(importData.Metadata.DataHash))
                {
                    result.IsHashValid = ValidateDataHash(importData, result);
                }
                else
                {
                    result.ValidationWarnings.Add("No data hash provided for verification");
                    result.IsHashValid = false;
                }

                // Version compatibility check
                if (importData.Metadata.ExportVersion != "1.0")
                {
                    result.ValidationWarnings.Add($"Export version '{importData.Metadata.ExportVersion}' may not be fully compatible");
                }

                // Image validation
                ValidateImages(importData, result);
            }
        }
        catch (JsonException ex)
        {
            result.ValidationErrors.Add($"JSON parsing error: {ex.Message}");
            _logger.LogError(ex, "Error parsing import JSON");
        }
        catch (Exception ex)
        {
            result.ValidationErrors.Add($"Validation error: {ex.Message}");
            _logger.LogError(ex, "Error validating import data");
        }

        return result;
    }

    public async Task<BoardImportResult> ImportBoardAsync(string jsonContent, User currentUser, BoardImportOptions options)
    {
        var result = new BoardImportResult();

        try
        {
            // Validate the JSON first
            var validation = await ValidateImportDataAsync(jsonContent);
            result.ValidationResult = validation;

            if (!validation.IsValidJson || !validation.HasRequiredFields)
            {
                result.Success = false;
                result.Errors.AddRange(validation.ValidationErrors);
                result.Message = "Import failed due to validation errors";
                return result;
            }

            // Add validation warnings to result
            result.Warnings.AddRange(validation.ValidationWarnings);

            // Hash validation warning (but don't block import)
            if (options.ValidateHash && !validation.IsHashValid)
            {
                result.Warnings.Add("Data hash validation failed - proceeding with import but data integrity cannot be guaranteed");
            }

            // Parse the data for import
            var jsonOptions = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            var importData = JsonSerializer.Deserialize<ImportBoardExportData>(jsonContent, jsonOptions)!;

            // Create the new board
            var newBoardName = options.NewBoardName ?? $"{importData.BoardData.Board.Name} (Imported)";
            var newBoardEmoji = options.NewBoardEmoji ?? importData.BoardData.Board.Emoji;
            var newAccessLevel = options.NewAccessLevel ?? BoardAccessLevel.Private;

            var newBoard = await _boardService.CreateBoardAsync(newBoardName, currentUser, newAccessLevel, newBoardEmoji);

            // Process images first (if any)
            var imageMapping = new Dictionary<string, string>();
            if (options.ProcessImages && importData.BoardData.Images?.Any() == true)
            {
                imageMapping = await ProcessImportedImagesAsync(importData.BoardData.Images, result);
            }

            // Import elements
            var importedElementCount = await ImportBoardElementsAsync(
                importData.BoardData.Elements, 
                newBoard.Id, 
                currentUser, 
                imageMapping, 
                options);

            result.Success = true;
            result.BoardId = newBoard.Id;
            result.Message = $"Successfully imported board with {importedElementCount} elements";

            if (result.Warnings.Any())
            {
                result.Message += $" ({result.Warnings.Count} warnings)";
            }

            _logger.LogInformation("Successfully imported board {BoardId} for user {UserId}", newBoard.Id, currentUser.Id);
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Message = "Import failed due to an unexpected error";
            result.Errors.Add(ex.Message);
            _logger.LogError(ex, "Error importing board for user {UserId}", currentUser.Id);
        }

        return result;
    }

    private bool ValidateRequiredFields(ImportBoardExportData importData, ImportValidationResult result)
    {
        var errors = new List<string>();

        if (importData.Metadata == null)
            errors.Add("Missing metadata section");
        
        if (importData.BoardData == null)
            errors.Add("Missing boardData section");

        if (importData.BoardData?.Board == null)
            errors.Add("Missing board information");

        if (string.IsNullOrEmpty(importData.BoardData?.Board?.Name))
            errors.Add("Missing board name");

        if (importData.BoardData?.Elements == null)
            errors.Add("Missing elements array");

        result.ValidationErrors.AddRange(errors);
        return errors.Count == 0;
    }

    private bool ValidateDataHash(ImportBoardExportData importData, ImportValidationResult result)
    {
        try
        {
            // Serialize the board data section to match export format
            var boardDataJson = JsonSerializer.Serialize(importData.BoardData, new JsonSerializerOptions 
            { 
                WriteIndented = false,
                PropertyNameCaseInsensitive = true
            });

            var calculatedHash = GenerateDataHash(boardDataJson);
            var providedHash = importData.Metadata.DataHash;

            if (calculatedHash != providedHash)
            {
                result.ValidationWarnings.Add("Data hash mismatch - the board data may have been modified");
                return false;
            }

            return true;
        }
        catch (Exception ex)
        {
            result.ValidationWarnings.Add($"Could not validate data hash: {ex.Message}");
            return false;
        }
    }

    private void ValidateImages(ImportBoardExportData importData, ImportValidationResult result)
    {
        if (importData.BoardData.Images?.Any() != true)
            return;

        foreach (var image in importData.BoardData.Images.Values)
        {
            // Check if embedded data is present and valid
            if (importData.Metadata.ImageMode == ImageExportMode.Embedded)
            {
                if (string.IsNullOrEmpty(image.Base64Data))
                {
                    result.ValidationWarnings.Add($"Image {image.FileName} is missing embedded data");
                }
                else
                {
                    try
                    {
                        Convert.FromBase64String(image.Base64Data);
                    }
                    catch
                    {
                        result.ValidationWarnings.Add($"Image {image.FileName} has invalid Base64 data");
                    }
                }
            }
            else
            {
                result.ValidationWarnings.Add($"Image {image.FileName} is referenced by path - may not be available");
            }

            // Size check
            if (image.FileSizeBytes > 10 * 1024 * 1024) // 10MB limit
            {
                result.ValidationWarnings.Add($"Image {image.FileName} is very large ({image.FileSizeBytes / (1024 * 1024)}MB)");
            }
        }
    }

    private async Task<Dictionary<string, string>> ProcessImportedImagesAsync(
        Dictionary<string, ImportImageExportData> images, 
        BoardImportResult result)
    {
        var imageMapping = new Dictionary<string, string>();

        foreach (var kvp in images)
        {
            try
            {
                var originalFileName = kvp.Key;
                var imageData = kvp.Value;

                if (string.IsNullOrEmpty(imageData.Base64Data))
                {
                    result.Warnings.Add($"Skipping image {originalFileName} - no embedded data");
                    continue;
                }

                // Decode Base64 data
                var imageBytes = Convert.FromBase64String(imageData.Base64Data);

                // Generate new filename to avoid conflicts
                var fileExtension = Path.GetExtension(imageData.FileName);
                var newFileName = $"{Guid.NewGuid()}{fileExtension}";
                var uploadsPath = Path.Combine(_environment.WebRootPath, "uploads");
                var newFilePath = Path.Combine(uploadsPath, newFileName);

                // Ensure uploads directory exists
                Directory.CreateDirectory(uploadsPath);

                // Save the image
                await File.WriteAllBytesAsync(newFilePath, imageBytes);

                // Map old path to new path
                var newWebPath = $"/uploads/{newFileName}";
                imageMapping[imageData.OriginalPath] = newWebPath;

                _logger.LogDebug("Imported image {OriginalPath} -> {NewPath}", imageData.OriginalPath, newWebPath);
            }
            catch (Exception ex)
            {
                result.Warnings.Add($"Failed to import image {kvp.Key}: {ex.Message}");
                _logger.LogWarning(ex, "Failed to import image {ImageKey}", kvp.Key);
            }
        }

        return imageMapping;
    }

    private async Task<int> ImportBoardElementsAsync(
        List<ImportBoardElementExport> elements,
        Guid newBoardId,
        User currentUser,
        Dictionary<string, string> imageMapping,
        BoardImportOptions options)
    {
        var importedCount = 0;

        foreach (var element in elements)
        {
            try
            {
                var newElement = new BoardElement
                {
                    Id = options.CreateNewIds ? Guid.NewGuid() : element.Id,
                    BoardId = newBoardId,
                    Type = element.Type,
                    X = element.X,
                    Y = element.Y,
                    Width = element.Width,
                    Height = element.Height,
                    ZIndex = element.ZIndex,
                    CreatedByUserId = currentUser.Id,
                    ModifiedByUserId = currentUser.Id,
                    CreatedAt = options.PreserveTimestamps ? element.CreatedAt : DateTime.UtcNow,
                    ModifiedAt = options.PreserveTimestamps ? element.ModifiedAt : DateTime.UtcNow,
                    Data = element.Data,
                    GroupId = element.GroupId,
                    GroupOrder = element.GroupOrder
                };

                // Update image references in element data if needed
                if (element.Type == ElementType.Image && element.Data != null && imageMapping.Any())
                {
                    UpdateImageReferencesInElementData(newElement, imageMapping);
                }

                _context.BoardElements.Add(newElement);
                importedCount++;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to import element {ElementId}", element.Id);
            }
        }

        await _context.SaveChangesAsync();
        return importedCount;
    }

    private void UpdateImageReferencesInElementData(BoardElement element, Dictionary<string, string> imageMapping)
    {
        try
        {
            if (element.Data == null) return;

            var root = element.Data.RootElement;
            if (root.TryGetProperty("src", out var srcProperty))
            {
                var oldSrc = srcProperty.GetString();
                if (!string.IsNullOrEmpty(oldSrc) && imageMapping.ContainsKey(oldSrc))
                {
                    var newSrc = imageMapping[oldSrc];
                    
                    // Create updated JSON with new src
                    var dataDict = JsonSerializer.Deserialize<Dictionary<string, object>>(element.Data.RootElement.GetRawText());
                    if (dataDict != null)
                    {
                        dataDict["src"] = newSrc;
                        var updatedJson = JsonSerializer.Serialize(dataDict);
                        element.Data = JsonDocument.Parse(updatedJson);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to update image reference in element {ElementId}", element.Id);
        }
    }

    private string GenerateDataHash(string data)
    {
        using var sha256 = SHA256.Create();
        var hashBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(data));
        return Convert.ToBase64String(hashBytes);
    }
}