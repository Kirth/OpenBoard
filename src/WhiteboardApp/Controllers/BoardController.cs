using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using WhiteboardApp.Models;
using WhiteboardApp.Services;
using System.Security.Claims;
using System.Text.Json;

namespace WhiteboardApp.Controllers;

[Route("api/[controller]")]
[ApiController]
public class BoardController : ControllerBase
{
    private readonly BoardService _boardService;
    private readonly IUserService _userService;
    private readonly ILogger<BoardController> _logger;
    private readonly ExportService _exportService;
    private readonly BoardImportService _importService;

    public BoardController(BoardService boardService, IUserService userService, ILogger<BoardController> logger, ExportService exportService, BoardImportService importService)
    {
        _boardService = boardService;
        _userService = userService;
        _logger = logger;
        _exportService = exportService;
        _importService = importService;
    }

    [HttpGet("test")]
    public IActionResult Test()
    {
        return Ok(new { message = "API is working", timestamp = DateTime.UtcNow });
    }

    [HttpGet("{boardId}/settings")]
    [Authorize]
    public async Task<IActionResult> GetBoardSettings(Guid boardId)
    {
        try
        {
            var currentUser = await _userService.GetOrCreateUserAsync(User);
            var board = await _boardService.GetBoardWithAccessCheckAsync(boardId, currentUser, BoardRole.Owner);
            
            if (board == null)
            {
                return NotFound("Board not found or insufficient permissions");
            }

            return Ok(new
            {
                board.Id,
                board.Name,
                board.AccessLevel,
                board.CreatedAt,
                board.UpdatedAt,
                IsOwner = board.OwnerId == currentUser.Id,
                CollaboratorsCount = board.Collaborators?.Count ?? 0
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting board settings for board {BoardId}", boardId);
            return StatusCode(500, "An error occurred while retrieving board settings");
        }
    }

    [HttpPut("{boardId}/settings")]
    [Authorize]
    public async Task<IActionResult> UpdateBoardSettings(Guid boardId, [FromBody] UpdateBoardSettingsRequest request)
    {
        try
        {
            var currentUser = await _userService.GetOrCreateUserAsync(User);
            var board = await _boardService.GetBoardWithAccessCheckAsync(boardId, currentUser, BoardRole.Owner);
            
            if (board == null)
            {
                return NotFound("Board not found or insufficient permissions");
            }

            // Update board settings
            board.Name = request.Name?.Trim() ?? board.Name;
            board.AccessLevel = request.AccessLevel;
            board.UpdatedAt = DateTime.UtcNow;

            await _boardService.UpdateBoardAsync(board);

            return Ok(new { message = "Board settings updated successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating board settings for board {BoardId}", boardId);
            return StatusCode(500, "An error occurred while updating board settings");
        }
    }

    [HttpGet("{boardId}/collaborators")]
    [Authorize]
    public async Task<IActionResult> GetBoardCollaborators(Guid boardId)
    {
        try
        {
            var currentUser = await _userService.GetOrCreateUserAsync(User);
            var board = await _boardService.GetBoardWithAccessCheckAsync(boardId, currentUser, BoardRole.Collaborator);
            
            if (board == null)
            {
                return NotFound("Board not found or insufficient permissions");
            }

            var collaborators = board.Collaborators?.Select(c => new
            {
                c.UserId,
                c.User.DisplayName,
                c.User.Email,
                c.User.Username,
                c.Role,
                c.GrantedAt,
                GrantedBy = c.GrantedByUser?.DisplayName,
                IsOwner = c.UserId == board.OwnerId
            }).ToList();

            var result = new List<object>();
            
            // Add board owner first
            result.Add(new
            {
                UserId = board.Owner.Id,
                DisplayName = board.Owner.DisplayName,
                Email = board.Owner.Email,
                Username = board.Owner.Username,
                Role = BoardRole.Owner,
                GrantedAt = board.CreatedAt,
                GrantedBy = (string?)null,
                IsOwner = true
            });
            
            // Add other collaborators
            if (collaborators != null)
            {
                result.AddRange(collaborators.Where(c => c.UserId != board.OwnerId));
            }

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting board collaborators for board {BoardId}", boardId);
            return StatusCode(500, "An error occurred while retrieving collaborators");
        }
    }

    [HttpPost("{boardId}/collaborators")]
    [Authorize]
    public async Task<IActionResult> AddCollaborator(Guid boardId, [FromBody] AddCollaboratorRequest request)
    {
        try
        {
            var currentUser = await _userService.GetOrCreateUserAsync(User);
            var board = await _boardService.GetBoardWithAccessCheckAsync(boardId, currentUser, BoardRole.Owner);
            
            if (board == null)
            {
                return NotFound("Board not found or insufficient permissions");
            }

            var targetUser = await _userService.GetUserByEmailAsync(request.Email);
            if (targetUser == null)
            {
                return BadRequest("User not found with that email address");
            }

            // Check if user is already a collaborator
            var existingCollaboration = board.Collaborators?.FirstOrDefault(c => c.UserId == targetUser.Id);
            if (existingCollaboration != null)
            {
                return BadRequest("User is already a collaborator on this board");
            }

            // Check if user is the owner
            if (board.OwnerId == targetUser.Id)
            {
                return BadRequest("User is already the owner of this board");
            }

            await _boardService.AddCollaboratorAsync(boardId, targetUser.Id, request.Role, currentUser.Id);

            return Ok(new { message = "Collaborator added successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding collaborator to board {BoardId}", boardId);
            return StatusCode(500, "An error occurred while adding the collaborator");
        }
    }

    [HttpPut("{boardId}/collaborators/{userId}")]
    [Authorize]
    public async Task<IActionResult> UpdateCollaboratorRole(Guid boardId, Guid userId, [FromBody] UpdateCollaboratorRoleRequest request)
    {
        try
        {
            var currentUser = await _userService.GetOrCreateUserAsync(User);
            var board = await _boardService.GetBoardWithAccessCheckAsync(boardId, currentUser, BoardRole.Owner);
            
            if (board == null)
            {
                return NotFound("Board not found or insufficient permissions");
            }

            // Can't change owner role
            if (board.OwnerId == userId)
            {
                return BadRequest("Cannot change the role of the board owner");
            }

            await _boardService.UpdateCollaboratorRoleAsync(boardId, userId, request.Role);

            return Ok(new { message = "Collaborator role updated successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating collaborator role for board {BoardId}", boardId);
            return StatusCode(500, "An error occurred while updating the collaborator role");
        }
    }

    [HttpDelete("{boardId}/collaborators/{userId}")]
    [Authorize]
    public async Task<IActionResult> RemoveCollaborator(Guid boardId, Guid userId)
    {
        try
        {
            var currentUser = await _userService.GetOrCreateUserAsync(User);
            var board = await _boardService.GetBoardWithAccessCheckAsync(boardId, currentUser, BoardRole.Owner);
            
            if (board == null)
            {
                return NotFound("Board not found or insufficient permissions");
            }

            // Can't remove owner
            if (board.OwnerId == userId)
            {
                return BadRequest("Cannot remove the board owner");
            }

            await _boardService.RemoveCollaboratorAsync(boardId, userId);

            return Ok(new { message = "Collaborator removed successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error removing collaborator from board {BoardId}", boardId);
            return StatusCode(500, "An error occurred while removing the collaborator");
        }
    }

    [HttpGet("{boardId}/export/json")]
    [Authorize]
    public async Task<IActionResult> ExportBoardAsJson(Guid boardId, [FromQuery] string imageMode = "embedded", [FromQuery] bool includeCollaborators = true)
    {
        try
        {
            var currentUser = await _userService.GetOrCreateUserAsync(User);
            
            // Parse image mode
            var imageModeEnum = imageMode.ToLower() switch
            {
                "referenced" => ImageExportMode.Referenced,
                "embedded" => ImageExportMode.Embedded,
                _ => ImageExportMode.Embedded
            };

            var exportOptions = new JsonExportOptions
            {
                ImageMode = imageModeEnum,
                IncludeCollaborators = includeCollaborators,
                IncludeMetadata = true
            };

            var exportData = await _exportService.ExportBoardAsJsonAsync(boardId, currentUser, exportOptions);

            // Serialize with proper formatting
            var jsonOptions = new JsonSerializerOptions
            {
                WriteIndented = true,
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            };

            var jsonString = JsonSerializer.Serialize(exportData, jsonOptions);

            // Create filename
            var board = await _boardService.GetBoardAsync(boardId);
            var filename = $"{board?.Name ?? "Board"}_{DateTime.Now:yyyyMMdd_HHmmss}.json";

            // Return as downloadable file
            var jsonBytes = System.Text.Encoding.UTF8.GetBytes(jsonString);
            return File(jsonBytes, "application/json", filename);
        }
        catch (UnauthorizedAccessException ex)
        {
            _logger.LogWarning(ex, "Unauthorized attempt to export board {BoardId}", boardId);
            return Forbid("Only board owners can export boards to JSON");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error exporting board {BoardId} as JSON", boardId);
            return StatusCode(500, "An error occurred while exporting the board");
        }
    }

    [HttpPost("validate-import")]
    [Authorize]
    public async Task<IActionResult> ValidateImportData([FromBody] ValidateImportRequest request)
    {
        try
        {
            var currentUser = await _userService.GetOrCreateUserAsync(User);
            
            // Ensure user is authenticated (not anonymous)
            if (currentUser.SubjectId == "anonymous-user")
            {
                return Unauthorized("Board import is only available to authenticated users");
            }

            if (string.IsNullOrEmpty(request.JsonContent))
            {
                return BadRequest(new ImportValidationResult 
                {
                    IsValidJson = false,
                    HasRequiredFields = false,
                    ValidationErrors = new List<string> { "No JSON content provided" }
                });
            }

            var validationResult = await _importService.ValidateImportDataAsync(request.JsonContent);

            // Always return OK with the validation result, even if validation failed
            // This prevents the frontend from treating it as an HTTP error
            return Ok(validationResult);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error validating import data for user {UserId}", User.Identity?.Name);
            
            // Return a structured validation result instead of HTTP 500
            return Ok(new ImportValidationResult
            {
                IsValidJson = false,
                HasRequiredFields = false,
                ValidationErrors = new List<string> { $"Validation service error: {ex.Message}" }
            });
        }
    }

    [HttpPost("import")]
    [Authorize]
    public async Task<IActionResult> ImportBoard([FromBody] ImportBoardRequest request)
    {
        try
        {
            var currentUser = await _userService.GetOrCreateUserAsync(User);
            
            // Ensure user is authenticated (not anonymous)
            if (currentUser.SubjectId == "anonymous-user")
            {
                return Unauthorized("Board import is only available to authenticated users");
            }

            if (string.IsNullOrEmpty(request.JsonContent))
            {
                return BadRequest("No JSON content provided");
            }

            var importOptions = new BoardImportOptions
            {
                ValidateHash = request.ValidateHash,
                NewBoardName = request.BoardName,
                NewBoardEmoji = request.BoardEmoji,
                NewAccessLevel = request.AccessLevel,
                CreateNewIds = true,
                PreserveTimestamps = false,
                ProcessImages = true,
                MaxImageSizeMB = 10
            };

            var importResult = await _importService.ImportBoardAsync(request.JsonContent, currentUser, importOptions);

            if (importResult.Success)
            {
                return Ok(importResult);
            }
            else
            {
                return BadRequest(importResult);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error importing board for user {UserId}", User.Identity?.Name);
            return StatusCode(500, "An error occurred while importing the board");
        }
    }
}

public class UpdateBoardSettingsRequest
{
    public string? Name { get; set; }
    public BoardAccessLevel AccessLevel { get; set; }
}

public class AddCollaboratorRequest
{
    public string Email { get; set; } = string.Empty;
    public BoardRole Role { get; set; } = BoardRole.Collaborator;
}

public class UpdateCollaboratorRoleRequest
{
    public BoardRole Role { get; set; }
}

public class ValidateImportRequest
{
    public string JsonContent { get; set; } = string.Empty;
}

public class ImportBoardRequest
{
    public string JsonContent { get; set; } = string.Empty;
    public string? BoardName { get; set; }
    public string? BoardEmoji { get; set; }
    public BoardAccessLevel AccessLevel { get; set; } = BoardAccessLevel.Private;
    public bool ValidateHash { get; set; } = true;
}