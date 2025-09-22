using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using WhiteboardApp.Models;
using WhiteboardApp.Services;
using System.Text.Json;
using System.Security.Claims;

namespace WhiteboardApp.Hubs;

public class CollaborationHub : Hub
{
    private readonly ElementService _elementService;
    private readonly BoardService _boardService;
    private readonly IUserSessionManager _userSessionManager;
    private readonly IUserService _userService;
    private readonly ILogger<CollaborationHub> _logger;

    public CollaborationHub(
        ElementService elementService,
        BoardService boardService,
        IUserSessionManager userSessionManager,
        IUserService userService,
        ILogger<CollaborationHub> logger)
    {
        _elementService = elementService;
        _boardService = boardService;
        _userSessionManager = userSessionManager;
        _userService = userService;
        _logger = logger;
    }

    /// <summary>
    /// Derives display name from claims for authenticated users or generates anonymous name
    /// </summary>
    private static string GetDisplayName(ClaimsPrincipal? user, string connectionId, string? anonymousUserId = null)
    {
        if (user?.Identity?.IsAuthenticated == true)
        {
            // Extract username from claims (preferred order)
            return user.FindFirst("preferred_username")?.Value
                   ?? user.FindFirst("name")?.Value
                   ?? user.Identity.Name
                   ?? user.FindFirst(ClaimTypes.Email)?.Value
                   ?? user.FindFirst(ClaimTypes.NameIdentifier)?.Value
                   ?? user.FindFirst("sub")?.Value
                   ?? "Unknown User";
        }
        
        // Use fingerprint-based anonymous user ID if provided and valid
        if (!string.IsNullOrEmpty(anonymousUserId) && 
            Guid.TryParse(anonymousUserId, out var anonymousGuid) && 
            AnonymousUserService.IsAnonymousGuid(anonymousGuid))
        {
            return AnonymousUserService.GenerateAnonymousDisplayName(anonymousGuid);
        }
        
        // Fallback: Generate deterministic anonymous name using last 4 chars of connection ID
        return $"Guest-{connectionId[^4..]}";
    }

    public async Task JoinBoard(string boardId, string? anonymousUserId = null)
    {
        try
        {
            _logger.LogInformation("JoinBoard called with boardId: {BoardId}, anonymousUserId: {AnonymousUserId}", boardId, anonymousUserId);
            _logger.LogInformation("Context.User.Identity.IsAuthenticated: {IsAuthenticated}", Context.User?.Identity?.IsAuthenticated);
            _logger.LogInformation("Context.User.Identity.Name: '{Name}'", Context.User?.Identity?.Name);
            
            if (!Guid.TryParse(boardId, out var boardGuid))
            {
                await Clients.Caller.SendAsync("Error", "Invalid board ID format");
                return;
            }

            // Verify board exists first
            var board = await _boardService.GetBoardAsync(boardGuid);
            if (board == null)
            {
                await Clients.Caller.SendAsync("Error", "Board not found");
                return;
            }

            // Get display name from server-side logic (never trust client)
            var displayName = GetDisplayName(Context.User, Context.ConnectionId, anonymousUserId);
            _logger.LogInformation("User '{DisplayName}' joining board {BoardId} (Authenticated: {IsAuthenticated})", 
                displayName, boardId, Context.User?.Identity?.IsAuthenticated);

            // Check authentication status and board access
            User? user = null;
            bool hasWriteAccess = false;

            if (Context.User?.Identity?.IsAuthenticated == true)
            {
                // Authenticated user
                user = await _userService.GetOrCreateUserAsync(Context.User);
                
                // Check if authenticated user has access to this board
                var role = await _userService.GetUserBoardRoleAsync(user.Id, boardGuid);
                hasWriteAccess = role >= BoardRole.Collaborator;
                
                if (role == null && board.AccessLevel == BoardAccessLevel.Private)
                {
                    await Clients.Caller.SendAsync("Error", "Access denied to this private board");
                    return;
                }
            }
            else
            {
                // Anonymous user - only allowed for public boards
                if (board.AccessLevel == BoardAccessLevel.Private)
                {
                    await Clients.Caller.SendAsync("Error", "Authentication required for private boards");
                    return;
                }
                
                hasWriteAccess = (board.AccessLevel == BoardAccessLevel.Public || 
                                 board.AccessLevel == BoardAccessLevel.Unlisted);
            }

            await Groups.AddToGroupAsync(Context.ConnectionId, $"Board_{boardId}");

            // Track board access for authenticated users
            if (user != null)
            {
                try
                {
                    await _boardService.TrackBoardAccessAsync(user.Id, boardGuid, isJoin: true);
                }
                catch (Exception ex)
                {
                    // Log but don't fail board join if tracking fails (table may not exist yet)
                    _logger.LogWarning(ex, "Failed to track board access for user {UserId} on board {BoardId}", user.Id, boardGuid);
                }
            }

            // Create user session
            var userSession = await _userSessionManager.CreateSessionAsync(Context.ConnectionId, boardGuid, displayName);

            // Get all active users for this board
            var activeUsers = await _userSessionManager.GetBoardSessionsAsync(boardGuid);
            var activeUserList = activeUsers
                .Where(u => u.IsActive)
                .Select(u => new
                {
                    connectionId = u.ConnectionId,
                    userName = u.UserName,
                    cursorX = u.CursorX,
                    cursorY = u.CursorY
                })
                .ToList();

            // Notify others that user joined and send current user list to new user
            await Clients.Group($"Board_{boardId}").SendAsync("UserJoined",
                new { connectionId = Context.ConnectionId, userName = displayName });
            await Clients.Caller.SendAsync("ActiveUsersUpdated", activeUserList);
            
            // Send board permissions to the client
            await Clients.Caller.SendAsync("BoardPermissions", new 
            { 
                canEdit = hasWriteAccess,
                isAuthenticated = user != null,
                accessLevel = board.AccessLevel.ToString(),
                isOwner = user?.Id == board.OwnerId
            });

            // Send current collaborative state (selections and cursors) to the new user
            await SendCurrentStateToUser(boardId, boardGuid);

            _logger.LogInformation("User {DisplayName} joined board {BoardId}", displayName, boardId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error joining board {BoardId}", boardId);
            await Clients.Caller.SendAsync("Error", "Failed to join board");
        }
    }

    public async Task LeaveBoard(string boardId)
    {
        try
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"Board_{boardId}");

            // Get user session before removing
            var userSession = await _userSessionManager.GetSessionAsync(Context.ConnectionId);
            if (userSession != null)
            {
                await _userSessionManager.RemoveSessionAsync(Context.ConnectionId);
                await Clients.Group($"Board_{boardId}").SendAsync("UserLeft",
                    new { connectionId = Context.ConnectionId, userName = userSession.UserName });

                _logger.LogInformation("User {UserName} left board {BoardId}",
                    userSession.UserName, boardId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error leaving board {BoardId}", boardId);
        }
    }

    private async Task SendCurrentStateToUser(string boardId, Guid boardGuid)
    {
        try
        {
            // Get all current user sessions with their selections and cursors
            var activeSessions = await _userSessionManager.GetBoardSessionsAsync(boardGuid);
            var currentCollaborativeState = new List<object>();

            foreach (var session in activeSessions.Where(s => s.ConnectionId != Context.ConnectionId))
            {
                // Only include users who have active selections or cursors
                if (session.SelectedElementIds.Any() || session.CursorX != 0 || session.CursorY != 0)
                {
                    currentCollaborativeState.Add(new
                    {
                        connectionId = session.ConnectionId,
                        userName = session.UserName,
                        selectedElementIds = session.SelectedElementIds.ToArray(),
                        cursorX = session.CursorX,
                        cursorY = session.CursorY,
                        lastSelectionUpdate = session.LastSelectionUpdate,
                        lastActivity = session.LastActivity
                    });
                }
            }

            if (currentCollaborativeState.Any())
            {
                await Clients.Caller.SendAsync("CurrentStateUpdate", currentCollaborativeState);
                _logger.LogDebug("Sent current collaborative state to new user: {StateCount} active users", 
                    currentCollaborativeState.Count);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending current state to user in board {BoardId}", boardId);
        }
    }

    public async Task AddDrawingPath(string boardId, object pathData)
    {
        try
        {
            if (!await ValidateBoardAccess(boardId))
                return;

            var jsonData = JsonDocument.Parse(JsonSerializer.Serialize(pathData));

            var element = new BoardElement
            {
                BoardId = Guid.Parse(boardId),
                Type = ElementType.Drawing,
                X = 0,
                Y = 0,
                Data = jsonData,
                CreatedBy = Context.UserIdentifier ?? "Anonymous", // Legacy field
                CreatedByUserId = Context.User?.Identity?.IsAuthenticated == true 
                    ? (await _userService.GetOrCreateUserAsync(Context.User!)).Id
                    : (await _userService.GetAnonymousUserAsync()).Id,
                ModifiedByUserId = Context.User?.Identity?.IsAuthenticated == true 
                    ? (await _userService.GetOrCreateUserAsync(Context.User!)).Id
                    : (await _userService.GetAnonymousUserAsync()).Id
            };

            var savedElement = await _elementService.AddElementAsync(element);

            // Broadcast to all users in the board  
            await Clients.Group($"Board_{boardId}").SendAsync("ElementAdded", CreateElementResponse(savedElement, null));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding drawing path to board {BoardId}", boardId);
            await Clients.Caller.SendAsync("Error", "Failed to add drawing");
        }
    }

    public async Task AddElement(string boardId, object elementData)
    {
        try
        {
            if (!await ValidateBoardAccess(boardId))
                return;

            var jsonString = JsonSerializer.Serialize(elementData);
            var elementObj = JsonSerializer.Deserialize<JsonElement>(jsonString);

            var elementType = elementObj.GetProperty("type").GetString();
            var x = elementObj.GetProperty("x").GetDouble();
            var y = elementObj.GetProperty("y").GetDouble();
            var width = elementObj.TryGetProperty("width", out var widthProp) ? widthProp.GetDouble() : 0;
            var height = elementObj.TryGetProperty("height", out var heightProp) ? heightProp.GetDouble() : 0;
            var data = elementObj.GetProperty("data");
            var tempId = elementObj.TryGetProperty("tempId", out var tempIdProp) ? tempIdProp.GetString() : null;

            var type = elementType switch
            {
                "Text" => ElementType.Text,
                "Shape" => ElementType.Shape,
                "Line" => ElementType.Line,
                "StickyNote" => ElementType.StickyNote,
                "Image" => ElementType.Image,
                "rectangle" => ElementType.Shape,
                "circle" => ElementType.Shape,
                "triangle" => ElementType.Shape,
                "diamond" => ElementType.Shape,
                "ellipse" => ElementType.Shape,
                "star" => ElementType.Shape,
                "Path" => ElementType.Drawing,
                _ => ElementType.Drawing
            };

            // Parse the data and preserve the original element type for shapes
            var dataDict = JsonSerializer.Deserialize<Dictionary<string, object>>(data.GetRawText()) ?? new Dictionary<string, object>();
            if (type == ElementType.Shape)
            {
                dataDict["shapeType"] = elementType; // Preserve original shape type (rectangle, circle, etc.)
            }

            var element = new BoardElement
            {
                BoardId = Guid.Parse(boardId),
                Type = type,
                X = x,
                Y = y,
                Width = width,
                Height = height,
                Data = JsonDocument.Parse(JsonSerializer.Serialize(dataDict)),
                CreatedBy = Context.UserIdentifier ?? "Anonymous", // Legacy field
                CreatedByUserId = Context.User?.Identity?.IsAuthenticated == true 
                    ? (await _userService.GetOrCreateUserAsync(Context.User!)).Id
                    : (await _userService.GetAnonymousUserAsync()).Id,
                ModifiedByUserId = Context.User?.Identity?.IsAuthenticated == true 
                    ? (await _userService.GetOrCreateUserAsync(Context.User!)).Id
                    : (await _userService.GetAnonymousUserAsync()).Id
            };

            var savedElement = await _elementService.AddElementAsync(element);

            // Broadcast to all users in the board
            await Clients.Group($"Board_{boardId}").SendAsync("ElementAdded", CreateElementResponse(savedElement, tempId));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding element to board {BoardId}", boardId);
            await Clients.Caller.SendAsync("Error", "Failed to add element");
        }
    }

    public async Task UpdateCursor(string boardId, double x, double y)
    {
        try
        {
            await _userSessionManager.UpdateCursorPositionAsync(Context.ConnectionId, x, y);
            
            // Get display name from server-side logic (never trust client)
            var userName = GetDisplayName(Context.User, Context.ConnectionId);
            
            await Clients.OthersInGroup($"Board_{boardId}").SendAsync("CursorUpdated", Context.ConnectionId, x, y, userName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating cursor for board {BoardId}", boardId);
        }
    }

    public async Task MoveElement(string boardId, string elementId, double newX, double newY)
    {
        try
        {
            if (!await ValidateBoardAccess(boardId) || !Guid.TryParse(elementId, out var elementGuid))
                return;

            var element = await _elementService.GetElementAsync(elementGuid);
            if (element == null)
            {
                await Clients.Caller.SendAsync("Error", "Element not found");
                return;
            }

            // Calculate the offset for line endpoint translation
            var deltaX = newX - element.X;
            var deltaY = newY - element.Y;

            element.X = newX;
            element.Y = newY;
            element.ModifiedByUserId = Context.User?.Identity?.IsAuthenticated == true 
                ? (await _userService.GetOrCreateUserAsync(Context.User!)).Id
                : (await _userService.GetAnonymousUserAsync()).Id;
            element.ModifiedAt = DateTime.UtcNow;

            // For lines, also update endpoint coordinates in the data
            if (element.Type == ElementType.Line && element.Data != null)
            {
                UpdateLineEndpoints(element, deltaX, deltaY);
            }

            // For drawings, we used to also update path coordinates in the data
            // this lead to a bug after refreshing 
            // where the path's bounding box would still be in the right place
            // but the drawing itself would be double-off distance-wise 
            //if (element.Type == ElementType.Drawing && element.Data != null)
            //{
            //                UpdateDrawingPathCoordinates(element, deltaX, deltaY);
            //}

            await _elementService.UpdateElementAsync(element);

            // Broadcast to all users in the board
            await Clients.Group($"Board_{boardId}").SendAsync("ElementMoved", elementId, newX, newY);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error moving element {ElementId} in board {BoardId}", elementId, boardId);
            await Clients.Caller.SendAsync("Error", "Failed to move element");
        }
    }

    public async Task UpdateStickyNote(string boardId, string elementId, object updatedData)
    {
        await UpdateElementData(boardId, elementId, updatedData, ElementType.StickyNote, "StickyNoteUpdated");
    }

    public async Task UpdateTextElement(string boardId, string elementId, object updatedData)
    {
        await UpdateElementData(boardId, elementId, updatedData, ElementType.Text, "TextElementUpdated");
    }

    [Authorize]
    public async Task ClearBoard(string boardId)
    {
        try
        {
            if (!await ValidateBoardAccess(boardId))
                return;

            // Notify all users in the board that it was cleared
            await Clients.Group($"Board_{boardId}").SendAsync("BoardCleared");
            _logger.LogInformation("Board {BoardId} was cleared", boardId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error clearing board {BoardId}", boardId);
        }
    }

    public async Task UpdateSelection(string boardId, string[] elementIds)
    {
        try
        {
            if (!await ValidateBoardAccess(boardId))
                return;

            var userSession = await _userSessionManager.GetSessionAsync(Context.ConnectionId);
            if (userSession != null)
            {
                // Persist selection state in session manager
                await _userSessionManager.UpdateSelectionAsync(Context.ConnectionId, elementIds);
                
                // Broadcast to other users
                await Clients.OthersInGroup($"Board_{boardId}").SendAsync("SelectionUpdated",
                    elementIds, userSession.UserName, Context.ConnectionId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating selection in board {BoardId}", boardId);
            await Clients.Caller.SendAsync("Error", "Failed to update selection");
        }
    }

    public async Task ClearSelection(string boardId)
    {
        try
        {
            if (!await ValidateBoardAccess(boardId))
                return;

            // Clear selection state in session manager
            await _userSessionManager.ClearSelectionAsync(Context.ConnectionId);
            
            await Clients.OthersInGroup($"Board_{boardId}").SendAsync("SelectionCleared", Context.ConnectionId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error clearing selection in board {BoardId}", boardId);
            await Clients.Caller.SendAsync("Error", "Failed to clear selection");
        }
    }

    // Legacy methods for backward compatibility
    public async Task SelectElement(string boardId, string elementId)
    {
        await UpdateSelection(boardId, new[] { elementId });
    }

    public async Task DeselectElement(string boardId, string elementId)
    {
        await ClearSelection(boardId);
    }

    public async Task BringToFront(string boardId, string elementId)
    {
        await UpdateElementZIndex(boardId, elementId, async (element) =>
        {
            var maxZIndex = await _elementService.GetMaxZIndexAsync(element.BoardId);
            return maxZIndex + 1;
        });
    }

    public async Task SendToBack(string boardId, string elementId)
    {
        await UpdateElementZIndex(boardId, elementId, async (element) =>
        {
            var minZIndex = await _elementService.GetMinZIndexAsync(element.BoardId);
            return minZIndex - 1;
        });
    }

    [Authorize]
    public async Task DeleteElement(string boardId, string elementId)
    {
        try
        {
            if (!await ValidateBoardAccess(boardId) || !Guid.TryParse(elementId, out var elementGuid))
                return;

            var success = await _elementService.DeleteElementAsync(elementGuid);
            if (success)
            {
                await Clients.Group($"Board_{boardId}").SendAsync("ElementDeleted", elementId);
                _logger.LogInformation("Element {ElementId} deleted from board {BoardId}", elementId, boardId);
            }
            else
            {
                await Clients.Caller.SendAsync("Error", "Element not found or could not be deleted");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting element {ElementId} from board {BoardId}", elementId, boardId);
            await Clients.Caller.SendAsync("Error", "Failed to delete element");
        }
    }

    public async Task ResizeElement(string boardId, string elementId, double x, double y, double width, double height)
    {
        try
        {
            if (!await ValidateBoardAccess(boardId) || !Guid.TryParse(elementId, out var elementGuid))
                return;

            var element = await _elementService.GetElementAsync(elementGuid);
            if (element != null)
            {
                element.X = x;
                element.Y = y;
                element.Width = width;
                element.Height = height;
                await _elementService.UpdateElementAsync(element);

                await Clients.Group($"Board_{boardId}").SendAsync("ElementResized", elementId, x, y, width, height);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error resizing element {ElementId} in board {BoardId}", elementId, boardId);
            await Clients.Caller.SendAsync("Error", "Failed to resize element");
        }
    }

    public async Task UpdateLineEndpoints(string boardId, string elementId, double startX, double startY, double endX, double endY)
    {
        try
        {
            if (!await ValidateBoardAccess(boardId) || !Guid.TryParse(elementId, out var elementGuid))
                return;

            var element = await _elementService.GetElementAsync(elementGuid);
            if (element != null && element.Type == ElementType.Line)
            {
                // Update coordinates using canonical representation: X/Y = start, Width/Height = delta
                element.X = startX;
                element.Y = startY;
                element.Width = endX - startX;
                element.Height = endY - startY;

                // Update absolute coordinates in data
                var existingData = element.Data?.RootElement.GetRawText() ?? "{}";
                var dataObj = JsonSerializer.Deserialize<Dictionary<string, object>>(existingData) ?? new Dictionary<string, object>();

                dataObj["startX"] = startX;
                dataObj["startY"] = startY;
                dataObj["endX"] = endX;
                dataObj["endY"] = endY;

                element.Data = JsonDocument.Parse(JsonSerializer.Serialize(dataObj));

                await _elementService.UpdateElementAsync(element);

                // Broadcast line endpoint update to all clients
                await Clients.Group($"Board_{boardId}").SendAsync("LineEndpointsUpdated", elementId, startX, startY, endX, endY);
            }
            else
            {
                await Clients.Caller.SendAsync("Error", "Line element not found");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating line endpoints {ElementId} in board {BoardId}", elementId, boardId);
            await Clients.Caller.SendAsync("Error", "Failed to update line endpoints");
        }
    }

    public async Task UpdateElementStyle(string boardId, string elementId, object styleData)
    {
        try
        {
            if (!await ValidateBoardAccess(boardId) || !Guid.TryParse(elementId, out var elementGuid))
                return;

            var element = await _elementService.GetElementAsync(elementGuid);
            if (element == null || !IsStyleableElement(element.Type))
                return;

            // Merge the style data with existing data
            var existingData = element.Data?.RootElement.GetRawText() ?? "{}";
            var existingDataObj = JsonSerializer.Deserialize<Dictionary<string, object>>(existingData) ?? new Dictionary<string, object>();
            var styleDataObj = JsonSerializer.Deserialize<Dictionary<string, object>>(JsonSerializer.Serialize(styleData)) ?? new Dictionary<string, object>();

            // Validate rotation value if present
            if (styleDataObj.ContainsKey("rotation") && styleDataObj["rotation"] != null)
            {
                if (double.TryParse(styleDataObj["rotation"].ToString(), out var rotation))
                {
                    // Normalize rotation to 0-360 degrees
                    rotation = ((rotation % 360) + 360) % 360;
                    styleDataObj["rotation"] = rotation;
                }
                else
                {
                    // Invalid rotation value, remove it
                    styleDataObj.Remove("rotation");
                }
            }

            // Update the style properties
            foreach (var kvp in styleDataObj)
            {
                existingDataObj[kvp.Key] = kvp.Value;
            }

            element.Data = JsonDocument.Parse(JsonSerializer.Serialize(existingDataObj));

            // For lines, also update the bounding box if endpoint coordinates changed
            if (element.Type == ElementType.Line && HasLineCoordinateChanges(styleDataObj))
            {
                UpdateLineBoundingBox(element, existingDataObj);
            }

            await _elementService.UpdateElementAsync(element);

            // Broadcast to all users in the board
            await Clients.Group($"Board_{boardId}").SendAsync("ElementStyleUpdated", elementId, styleData);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating style for element {ElementId} in board {BoardId}", elementId, boardId);
            await Clients.Caller.SendAsync("Error", "Failed to update element style");
        }
    }

    public async Task UpdateElementLock(string boardId, string elementId, bool locked)
    {
        try
        {
            if (!await ValidateBoardAccess(boardId) || !Guid.TryParse(elementId, out var elementGuid))
                return;

            var element = await _elementService.GetElementAsync(elementGuid);
            if (element == null)
                return;

            // Update the locked property in the element data
            var existingData = element.Data?.RootElement.GetRawText() ?? "{}";
            var existingDataObj = JsonSerializer.Deserialize<Dictionary<string, object>>(existingData) ?? new Dictionary<string, object>();

            // Set the locked property
            existingDataObj["locked"] = locked;

            element.Data = JsonDocument.Parse(JsonSerializer.Serialize(existingDataObj));

            await _elementService.UpdateElementAsync(element);

            // Broadcast to all users in the board
            await Clients.Group($"Board_{boardId}").SendAsync("ElementLockUpdated", elementId, locked);

            _logger.LogInformation("Element {ElementId} lock state updated to {Locked} in board {BoardId}", elementId, locked, boardId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating lock state for element {ElementId} in board {BoardId}", elementId, boardId);
            await Clients.Caller.SendAsync("Error", "Failed to update element lock state");
        }
    }

    // Group Operations
    public async Task CreateGroup(string boardId, string[] elementIds)
    {
        try
        {
            if (!await ValidateBoardAccess(boardId))
                return;

            var elementGuids = elementIds.Select(id => Guid.Parse(id)).ToList();
            var groupId = await _elementService.CreateGroupAsync(Guid.Parse(boardId), elementGuids, 
                Context.UserIdentifier ?? "Anonymous");

            await Clients.Group($"Board_{boardId}").SendAsync("GroupCreated", new
            {
                groupId = groupId.ToString(),
                elementIds = elementIds,
                createdBy = Context.UserIdentifier ?? "Anonymous"
            });

            _logger.LogInformation("Group {GroupId} created with {ElementCount} elements in board {BoardId}", 
                groupId, elementIds.Length, boardId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating group in board {BoardId}", boardId);
            await Clients.Caller.SendAsync("Error", "Failed to create group");
        }
    }

    public async Task UngroupElements(string boardId, string groupId)
    {
        try
        {
            if (!await ValidateBoardAccess(boardId) || !Guid.TryParse(groupId, out var groupGuid))
                return;

            var groupElements = await _elementService.GetGroupElementsAsync(groupGuid);
            var elementIds = groupElements.Select(e => e.Id.ToString()).ToArray();

            var success = await _elementService.UngroupElementsAsync(groupGuid);
            if (success)
            {
                await Clients.Group($"Board_{boardId}").SendAsync("GroupUngrouped", new
                {
                    groupId = groupId,
                    elementIds = elementIds
                });

                _logger.LogInformation("Group {GroupId} ungrouped in board {BoardId}", groupId, boardId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error ungrouping group {GroupId} in board {BoardId}", groupId, boardId);
            await Clients.Caller.SendAsync("Error", "Failed to ungroup elements");
        }
    }

    public async Task MoveGroup(string boardId, string groupId, double deltaX, double deltaY)
    {
        try
        {
            if (!await ValidateBoardAccess(boardId) || !Guid.TryParse(groupId, out var groupGuid))
                return;

            var success = await _elementService.MoveGroupAsync(groupGuid, deltaX, deltaY);
            if (success)
            {
                await Clients.Group($"Board_{boardId}").SendAsync("GroupMoved", new
                {
                    groupId = groupId,
                    deltaX = deltaX,
                    deltaY = deltaY
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error moving group {GroupId} in board {BoardId}", groupId, boardId);
            await Clients.Caller.SendAsync("Error", "Failed to move group");
        }
    }

    [Authorize]
    public async Task DeleteGroup(string boardId, string groupId)
    {
        try
        {
            if (!await ValidateBoardAccess(boardId) || !Guid.TryParse(groupId, out var groupGuid))
                return;

            var success = await _elementService.DeleteGroupAsync(groupGuid);
            if (success)
            {
                await Clients.Group($"Board_{boardId}").SendAsync("GroupDeleted", new
                {
                    groupId = groupId
                });

                _logger.LogInformation("Group {GroupId} deleted from board {BoardId}", groupId, boardId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting group {GroupId} from board {BoardId}", groupId, boardId);
            await Clients.Caller.SendAsync("Error", "Failed to delete group");
        }
    }

    public async Task BringGroupToFront(string boardId, string groupId)
    {
        try
        {
            if (!await ValidateBoardAccess(boardId) || !Guid.TryParse(groupId, out var groupGuid))
                return;

            var maxZIndex = await _elementService.GetMaxZIndexAsync(Guid.Parse(boardId));
            var success = await _elementService.SetGroupZIndexAsync(groupGuid, maxZIndex + 1);
            
            if (success)
            {
                await Clients.Group($"Board_{boardId}").SendAsync("GroupZIndexChanged", new
                {
                    groupId = groupId,
                    newBaseZIndex = maxZIndex + 1
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error bringing group {GroupId} to front in board {BoardId}", groupId, boardId);
            await Clients.Caller.SendAsync("Error", "Failed to bring group to front");
        }
    }

    public async Task SendGroupToBack(string boardId, string groupId)
    {
        try
        {
            if (!await ValidateBoardAccess(boardId) || !Guid.TryParse(groupId, out var groupGuid))
                return;

            var minZIndex = await _elementService.GetMinZIndexAsync(Guid.Parse(boardId));
            var groupElements = await _elementService.GetGroupElementsAsync(groupGuid);
            var newBaseZIndex = minZIndex - groupElements.Count;
            
            var success = await _elementService.SetGroupZIndexAsync(groupGuid, newBaseZIndex);
            
            if (success)
            {
                await Clients.Group($"Board_{boardId}").SendAsync("GroupZIndexChanged", new
                {
                    groupId = groupId,
                    newBaseZIndex = newBaseZIndex
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending group {GroupId} to back in board {BoardId}", groupId, boardId);
            await Clients.Caller.SendAsync("Error", "Failed to send group to back");
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        try
        {
            var userSession = await _userSessionManager.GetSessionAsync(Context.ConnectionId);
            if (userSession != null)
            {
                await _userSessionManager.RemoveSessionAsync(Context.ConnectionId);
                await Clients.Group($"Board_{userSession.BoardId}").SendAsync("UserLeft",
                    new { connectionId = Context.ConnectionId, userName = userSession.UserName });

                _logger.LogInformation("User {UserName} disconnected from board {BoardId}",
                    userSession.UserName, userSession.BoardId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling disconnect for connection {ConnectionId}", Context.ConnectionId);
        }

        await base.OnDisconnectedAsync(exception);
    }

    // Helper methods
    private async Task<bool> ValidateBoardAccess(string boardId, bool requireWriteAccess = true)
    {
        if (!Guid.TryParse(boardId, out var boardGuid))
        {
            await Clients.Caller.SendAsync("Error", "Invalid board ID format");
            return false;
        }

        // First check if user has session in the board (joined via SignalR)
        if (!await _userSessionManager.IsUserInBoardAsync(Context.ConnectionId, boardGuid))
        {
            await Clients.Caller.SendAsync("Error", "User not joined to this board");
            return false;
        }

        if (!requireWriteAccess)
        {
            return true; // Just need to be in the board
        }

        // Get board to check access level
        var board = await _boardService.GetBoardAsync(boardGuid);
        if (board == null)
        {
            await Clients.Caller.SendAsync("Error", "Board not found");
            return false;
        }

        if (Context.User?.Identity?.IsAuthenticated == true)
        {
            // Authenticated user - check their specific permissions
            var user = await _userService.GetOrCreateUserAsync(Context.User);
            var role = await _userService.GetUserBoardRoleAsync(user.Id, boardGuid);
            
            if (role == null && board.AccessLevel == BoardAccessLevel.Private)
            {
                await Clients.Caller.SendAsync("Error", "Access denied to this private board");
                return false;
            }
            
            if (role < BoardRole.Collaborator && board.AccessLevel == BoardAccessLevel.Private)
            {
                await Clients.Caller.SendAsync("Error", "Write access denied to this board");
                return false;
            }
        }
        else
        {
            // Anonymous user - check if board allows anonymous editing
            if (board.AccessLevel == BoardAccessLevel.Private)
            {
                await Clients.Caller.SendAsync("Error", "Authentication required for this board");
                return false;
            }
            // Public and LinkSharing boards allow anonymous editing
        }

        return true;
    }

    private async Task<(User? user, string displayName)> GetCurrentUserInfoAsync()
    {
        if (Context.User?.Identity?.IsAuthenticated == true)
        {
            var user = await _userService.GetOrCreateUserAsync(Context.User);
            return (user, user.DisplayName);
        }
        else
        {
            // Anonymous user - get display name from session if available
            var session = await _userSessionManager.GetSessionAsync(Context.ConnectionId);
            var displayName = session?.UserName ?? "Anonymous";
            return (null, displayName);
        }
    }

    private async Task UpdateElementData(string boardId, string elementId, object updatedData, ElementType expectedType, string eventName)
    {
        try
        {
            if (!await ValidateBoardAccess(boardId) || !Guid.TryParse(elementId, out var elementGuid))
                return;

            var element = await _elementService.GetElementAsync(elementGuid);
            if (element != null && element.Type == expectedType)
            {
                // Merge new data with existing data to preserve all properties
                var existingData = element.Data?.RootElement.GetRawText() ?? "{}";
                var existingDataObj = JsonSerializer.Deserialize<Dictionary<string, object>>(existingData) ?? new Dictionary<string, object>();
                var updatedDataObj = JsonSerializer.Deserialize<Dictionary<string, object>>(JsonSerializer.Serialize(updatedData)) ?? new Dictionary<string, object>();

                // Merge the properties (updatedData takes precedence)
                foreach (var kvp in updatedDataObj)
                {
                    existingDataObj[kvp.Key] = kvp.Value;
                }

                element.Data = JsonDocument.Parse(JsonSerializer.Serialize(existingDataObj));
                element.ModifiedByUserId = Context.User?.Identity?.IsAuthenticated == true 
                ? (await _userService.GetOrCreateUserAsync(Context.User!)).Id
                : (await _userService.GetAnonymousUserAsync()).Id;
                element.ModifiedAt = DateTime.UtcNow;
                await _elementService.UpdateElementAsync(element);

                // Send back the merged data to all clients
                await Clients.Group($"Board_{boardId}").SendAsync(eventName, elementId, existingDataObj);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating {ElementType} {ElementId} in board {BoardId}", expectedType, elementId, boardId);
            await Clients.Caller.SendAsync("Error", $"Failed to update {expectedType.ToString().ToLower()}");
        }
    }

    private async Task UpdateElementZIndex(string boardId, string elementId, Func<BoardElement, Task<int>> getNewZIndex)
    {
        try
        {
            if (!await ValidateBoardAccess(boardId) || !Guid.TryParse(elementId, out var elementGuid))
                return;

            var element = await _elementService.GetElementAsync(elementGuid);
            if (element != null)
            {
                element.ZIndex = await getNewZIndex(element);
                await _elementService.UpdateElementAsync(element);

                await Clients.Group($"Board_{boardId}").SendAsync("ElementZIndexUpdated", elementId, element.ZIndex);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating z-index for element {ElementId} in board {BoardId}", elementId, boardId);
            await Clients.Caller.SendAsync("Error", "Failed to update element layer");
        }
    }

    private static object CreateElementResponse(BoardElement savedElement, string? tempId)
    {
        // For shapes, return the original shape type instead of "Shape"
        string elementType = savedElement.Type.ToString();
        if (savedElement.Type == ElementType.Shape && savedElement.Data != null)
        {
            try
            {
                var dataDict = JsonSerializer.Deserialize<Dictionary<string, object>>(savedElement.Data.RootElement.GetRawText());
                if (dataDict?.ContainsKey("shapeType") == true)
                {
                    elementType = dataDict["shapeType"]?.ToString() ?? elementType;
                }
            }
            catch
            {
                // Fallback to enum string if parsing fails
            }
        }

        return new
        {
            id = savedElement.Id.ToString(),
            type = elementType,
            x = savedElement.X,
            y = savedElement.Y,
            width = savedElement.Width,
            height = savedElement.Height,
            zIndex = savedElement.ZIndex,
            data = JsonSerializer.Deserialize<object>(savedElement.Data?.RootElement.GetRawText() ?? "{}"),
            createdBy = savedElement.CreatedBy, // Legacy field
            createdByUserId = savedElement.CreatedByUserId,
            modifiedByUserId = savedElement.ModifiedByUserId,
            tempId = tempId
        };
    }

    private static void UpdateLineEndpoints(BoardElement element, double deltaX, double deltaY)
    {
        var existingData = element.Data?.RootElement.GetRawText() ?? "{}";
        var dataObj = JsonSerializer.Deserialize<Dictionary<string, object>>(existingData) ?? new Dictionary<string, object>();

        if (dataObj.TryGetValue("startX", out var startXObj) && double.TryParse(startXObj.ToString(), out var startX) &&
            dataObj.TryGetValue("startY", out var startYObj) && double.TryParse(startYObj.ToString(), out var startY) &&
            dataObj.TryGetValue("endX", out var endXObj) && double.TryParse(endXObj.ToString(), out var endX) &&
            dataObj.TryGetValue("endY", out var endYObj) && double.TryParse(endYObj.ToString(), out var endY))
        {
            dataObj["startX"] = startX + deltaX;
            dataObj["startY"] = startY + deltaY;
            dataObj["endX"] = endX + deltaX;
            dataObj["endY"] = endY + deltaY;

            element.Data = JsonDocument.Parse(JsonSerializer.Serialize(dataObj));
        }
    }

    private static void UpdateDrawingPathCoordinates(BoardElement element, double deltaX, double deltaY)
    {
        var existingData = element.Data?.RootElement.GetRawText() ?? "{}";
        var dataObj = JsonSerializer.Deserialize<Dictionary<string, object>>(existingData) ?? new Dictionary<string, object>();

        // Check if path data exists
        if (dataObj.TryGetValue("path", out var pathObj) && pathObj is JsonElement pathElement && pathElement.ValueKind == JsonValueKind.Array)
        {
            var updatedPath = new List<Dictionary<string, object>>();

            foreach (var pointElement in pathElement.EnumerateArray())
            {
                if (pointElement.ValueKind == JsonValueKind.Object)
                {
                    var pointObj = JsonSerializer.Deserialize<Dictionary<string, object>>(pointElement.GetRawText()) ?? new Dictionary<string, object>();

                    // Update x and y coordinates if they exist
                    if (pointObj.TryGetValue("x", out var xObj) && double.TryParse(xObj.ToString(), out var x))
                    {
                        pointObj["x"] = x + deltaX;
                    }

                    if (pointObj.TryGetValue("y", out var yObj) && double.TryParse(yObj.ToString(), out var y))
                    {
                        pointObj["y"] = y + deltaY;
                    }

                    updatedPath.Add(pointObj);
                }
            }

            // Update the path in the data object
            dataObj["path"] = updatedPath;
            element.Data = JsonDocument.Parse(JsonSerializer.Serialize(dataObj));
        }
    }

    private static bool IsStyleableElement(ElementType type)
    {
        return type == ElementType.Shape || type == ElementType.Drawing || type == ElementType.Line ||
               type == ElementType.Text || type == ElementType.StickyNote || type == ElementType.Image;
    }

    private static bool HasLineCoordinateChanges(Dictionary<string, object> styleData)
    {
        return styleData.ContainsKey("startX") || styleData.ContainsKey("startY") ||
               styleData.ContainsKey("endX") || styleData.ContainsKey("endY");
    }

    private static void UpdateLineBoundingBox(BoardElement element, Dictionary<string, object> dataObj)
    {
        if (dataObj.TryGetValue("startX", out var startXObj) && double.TryParse(startXObj.ToString(), out var startX) &&
            dataObj.TryGetValue("startY", out var startYObj) && double.TryParse(startYObj.ToString(), out var startY) &&
            dataObj.TryGetValue("endX", out var endXObj) && double.TryParse(endXObj.ToString(), out var endX) &&
            dataObj.TryGetValue("endY", out var endYObj) && double.TryParse(endYObj.ToString(), out var endY))
        {
            // Use canonical representation: X/Y = start, Width/Height = delta (preserve line direction)
            element.X = startX;
            element.Y = startY;
            element.Width = endX - startX;
            element.Height = endY - startY;
        }
    }
}
