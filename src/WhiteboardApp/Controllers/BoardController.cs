using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using WhiteboardApp.Models;
using WhiteboardApp.Services;
using System.Security.Claims;

namespace WhiteboardApp.Controllers;

[Route("api/[controller]")]
[ApiController]
[Authorize]
public class BoardController : ControllerBase
{
    private readonly BoardService _boardService;
    private readonly IUserService _userService;
    private readonly ILogger<BoardController> _logger;

    public BoardController(BoardService boardService, IUserService userService, ILogger<BoardController> logger)
    {
        _boardService = boardService;
        _userService = userService;
        _logger = logger;
    }

    [HttpGet("{boardId}/settings")]
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