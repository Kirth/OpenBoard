using Microsoft.AspNetCore.SignalR;
using WhiteboardApp.Models;
using WhiteboardApp.Services;
using System.Text.Json;

namespace WhiteboardApp.Hubs;

public class CollaborationHub : Hub
{
    private readonly ElementService _elementService;
    private readonly BoardService _boardService;
    private readonly IUserSessionManager _userSessionManager;
    private readonly ILogger<CollaborationHub> _logger;

    public CollaborationHub(
        ElementService elementService, 
        BoardService boardService,
        IUserSessionManager userSessionManager,
        ILogger<CollaborationHub> logger)
    {
        _elementService = elementService;
        _boardService = boardService;
        _userSessionManager = userSessionManager;
        _logger = logger;
    }

    public async Task JoinBoard(string boardId, string userName)
    {
        try
        {
            if (!Guid.TryParse(boardId, out var boardGuid))
            {
                await Clients.Caller.SendAsync("Error", "Invalid board ID format");
                return;
            }

            // Verify board exists
            var board = await _boardService.GetBoardAsync(boardGuid);
            if (board == null)
            {
                await Clients.Caller.SendAsync("Error", "Board not found");
                return;
            }

            await Groups.AddToGroupAsync(Context.ConnectionId, $"Board_{boardId}");
            
            // Create user session
            var userSession = await _userSessionManager.CreateSessionAsync(Context.ConnectionId, boardGuid, userName);
            
            // Get all active users for this board
            var activeUsers = await _userSessionManager.GetBoardSessionsAsync(boardGuid);
            var activeUserList = activeUsers
                .Where(u => u.IsActive)
                .Select(u => new { 
                    connectionId = u.ConnectionId, 
                    userName = u.UserName, 
                    cursorX = u.CursorX, 
                    cursorY = u.CursorY 
                })
                .ToList();
            
            // Notify others that user joined and send current user list to new user
            await Clients.Group($"Board_{boardId}").SendAsync("UserJoined", 
                new { connectionId = Context.ConnectionId, userName = userName });
            await Clients.Caller.SendAsync("ActiveUsersUpdated", activeUserList);

            _logger.LogInformation("User {UserName} joined board {BoardId}", userName, boardId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error joining board {BoardId} for user {UserName}", boardId, userName);
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
                CreatedBy = Context.UserIdentifier ?? "Anonymous"
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
                _ => ElementType.Drawing
            };

            var element = new BoardElement
            {
                BoardId = Guid.Parse(boardId),
                Type = type,
                X = x,
                Y = y,
                Width = width,
                Height = height,
                Data = JsonDocument.Parse(data.GetRawText()),
                CreatedBy = Context.UserIdentifier ?? "Anonymous"
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
            await Clients.OthersInGroup($"Board_{boardId}").SendAsync("CursorUpdated", Context.ConnectionId, x, y);
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
            
            // For lines, also update endpoint coordinates in the data
            if (element.Type == ElementType.Line && element.Data != null)
            {
                UpdateLineEndpoints(element, deltaX, deltaY);
            }
            
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

    public async Task SelectElement(string boardId, string elementId)
    {
        try
        {
            var userSession = await _userSessionManager.GetSessionAsync(Context.ConnectionId);
            if (userSession != null)
            {
                await Clients.OthersInGroup($"Board_{boardId}").SendAsync("ElementSelected", 
                    elementId, userSession.UserName, Context.ConnectionId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error selecting element {ElementId} in board {BoardId}", elementId, boardId);
        }
    }

    public async Task DeselectElement(string boardId, string elementId)
    {
        try
        {
            await Clients.OthersInGroup($"Board_{boardId}").SendAsync("ElementDeselected", elementId, Context.ConnectionId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deselecting element {ElementId} in board {BoardId}", elementId, boardId);
        }
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
    private async Task<bool> ValidateBoardAccess(string boardId)
    {
        if (!Guid.TryParse(boardId, out var boardGuid))
        {
            await Clients.Caller.SendAsync("Error", "Invalid board ID format");
            return false;
        }

        if (!await _userSessionManager.IsUserInBoardAsync(Context.ConnectionId, boardGuid))
        {
            await Clients.Caller.SendAsync("Error", "User not joined to this board");
            return false;
        }

        return true;
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
                element.Data = JsonDocument.Parse(JsonSerializer.Serialize(updatedData));
                await _elementService.UpdateElementAsync(element);
                
                await Clients.Group($"Board_{boardId}").SendAsync(eventName, elementId, updatedData);
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
        return new
        {
            id = savedElement.Id.ToString(),
            type = savedElement.Type.ToString(),
            x = savedElement.X,
            y = savedElement.Y,
            width = savedElement.Width,
            height = savedElement.Height,
            zIndex = savedElement.ZIndex,
            data = JsonSerializer.Deserialize<object>(savedElement.Data?.RootElement.GetRawText() ?? "{}"),
            createdBy = savedElement.CreatedBy,
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

    private static bool IsStyleableElement(ElementType type)
    {
        return type == ElementType.Shape || type == ElementType.Drawing || type == ElementType.Line;
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
            element.X = Math.Min(startX, endX);
            element.Y = Math.Min(startY, endY);
            element.Width = Math.Abs(endX - startX);
            element.Height = Math.Abs(endY - startY);
        }
    }
}