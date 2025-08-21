using Microsoft.AspNetCore.SignalR;
using WhiteboardApp.Models;
using WhiteboardApp.Services;
using System.Text.Json;
using System.Collections.Concurrent;

namespace WhiteboardApp.Hubs;

public class CollaborationHub : Hub
{
    private readonly ElementService _elementService;
    private readonly BoardService _boardService;
    private static readonly ConcurrentDictionary<string, UserSession> _userSessions = new();

    public CollaborationHub(ElementService elementService, BoardService boardService)
    {
        _elementService = elementService;
        _boardService = boardService;
    }

    public async Task JoinBoard(string boardId, string userName)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"Board_{boardId}");
        
        // Add user session
        var userSession = new UserSession
        {
            ConnectionId = Context.ConnectionId,
            BoardId = Guid.Parse(boardId),
            UserName = userName,
            CursorX = 0,
            CursorY = 0,
            IsActive = true
        };
        _userSessions[Context.ConnectionId] = userSession;
        
        // Get all active users for this board
        var activeUsers = _userSessions.Values
            .Where(u => u.BoardId.ToString() == boardId && u.IsActive)
            .Select(u => new { connectionId = u.ConnectionId, userName = u.UserName, cursorX = u.CursorX, cursorY = u.CursorY })
            .ToList();
        
        // Notify others that user joined and send current user list to new user
        await Clients.Group($"Board_{boardId}").SendAsync("UserJoined", new { connectionId = Context.ConnectionId, userName = userName });
        await Clients.Caller.SendAsync("ActiveUsersUpdated", activeUsers);
    }

    public async Task LeaveBoard(string boardId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"Board_{boardId}");
        
        // Remove user session and notify others
        if (_userSessions.TryRemove(Context.ConnectionId, out var userSession))
        {
            await Clients.Group($"Board_{boardId}").SendAsync("UserLeft", new { connectionId = Context.ConnectionId, userName = userSession.UserName });
        }
    }

    public async Task AddDrawingPath(string boardId, object pathData)
    {
        try
        {
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
            await Clients.Group($"Board_{boardId}").SendAsync("ElementAdded", new
            {
                id = savedElement.Id.ToString(),
                type = savedElement.Type.ToString(),
                x = savedElement.X,
                y = savedElement.Y,
                width = savedElement.Width,
                height = savedElement.Height,
                zIndex = savedElement.ZIndex,
                data = JsonSerializer.Deserialize<object>(savedElement.Data?.RootElement.GetRawText() ?? "{}"),
                createdBy = savedElement.CreatedBy
            });
        }
        catch (Exception ex)
        {
            await Clients.Caller.SendAsync("Error", $"Failed to add drawing: {ex.Message}");
        }
    }

    public async Task AddElement(string boardId, object elementData)
    {
        try
        {
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
            await Clients.Group($"Board_{boardId}").SendAsync("ElementAdded", new
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
                tempId = tempId // Include tempId for client correlation
            });
        }
        catch (Exception ex)
        {
            await Clients.Caller.SendAsync("Error", $"Failed to add element: {ex.Message}");
        }
    }

    public async Task UpdateCursor(string boardId, double x, double y)
    {
        // Update user session cursor position
        if (_userSessions.TryGetValue(Context.ConnectionId, out var userSession))
        {
            userSession.CursorX = x;
            userSession.CursorY = y;
        }
        
        await Clients.OthersInGroup($"Board_{boardId}").SendAsync("CursorUpdated", Context.ConnectionId, x, y);
    }

    public async Task MoveElement(string boardId, string elementId, double newX, double newY)
    {
        try
        {
            if (Guid.TryParse(elementId, out var elementGuid))
            {
                // Update element position in database
                var element = await _elementService.GetElementAsync(elementGuid);
                if (element != null)
                {
                    element.X = newX;
                    element.Y = newY;
                    await _elementService.UpdateElementAsync(element);
                    
                    // Broadcast to all users in the board
                    await Clients.Group($"Board_{boardId}").SendAsync("ElementMoved", elementId, newX, newY);
                }
            }
        }
        catch (Exception ex)
        {
            await Clients.Caller.SendAsync("Error", $"Failed to move element: {ex.Message}");
        }
    }

    public async Task UpdateStickyNote(string boardId, string elementId, object updatedData)
    {
        Console.WriteLine($"UpdateStickyNote called: boardId={boardId}, elementId={elementId}, data={JsonSerializer.Serialize(updatedData)}");
        try
        {
            if (Guid.TryParse(elementId, out var elementGuid))
            {
                // Update sticky note content in database
                var element = await _elementService.GetElementAsync(elementGuid);
                if (element != null && element.Type == ElementType.StickyNote)
                {
                    element.Data = JsonDocument.Parse(JsonSerializer.Serialize(updatedData));
                    await _elementService.UpdateElementAsync(element);
                    
                    // Broadcast to all users in the board
                    await Clients.Group($"Board_{boardId}").SendAsync("StickyNoteUpdated", elementId, updatedData);
                }
            }
        }
        catch (Exception ex)
        {
            await Clients.Caller.SendAsync("Error", $"Failed to update sticky note: {ex.Message}");
        }
    }

    public async Task UpdateTextElement(string boardId, string elementId, object updatedData)
    {
        Console.WriteLine($"UpdateTextElement called: boardId={boardId}, elementId={elementId}, data={JsonSerializer.Serialize(updatedData)}");
        try
        {
            if (Guid.TryParse(elementId, out var elementGuid))
            {
                // Update text element content in database
                var element = await _elementService.GetElementAsync(elementGuid);
                if (element != null && element.Type == ElementType.Text)
                {
                    element.Data = JsonDocument.Parse(JsonSerializer.Serialize(updatedData));
                    await _elementService.UpdateElementAsync(element);
                    
                    // Broadcast to all users in the board
                    await Clients.Group($"Board_{boardId}").SendAsync("TextElementUpdated", elementId, updatedData);
                }
            }
        }
        catch (Exception ex)
        {
            await Clients.Caller.SendAsync("Error", $"Failed to update text element: {ex.Message}");
        }
    }

    public async Task ClearBoard(string boardId)
    {
        // Notify all users in the board that it was cleared
        await Clients.Group($"Board_{boardId}").SendAsync("BoardCleared");
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        // Remove user session and notify others
        if (_userSessions.TryRemove(Context.ConnectionId, out var userSession))
        {
            await Clients.Group($"Board_{userSession.BoardId}").SendAsync("UserLeft", new { connectionId = Context.ConnectionId, userName = userSession.UserName });
        }
        
        await base.OnDisconnectedAsync(exception);
    }

    public async Task SelectElement(string boardId, string elementId)
    {
        if (_userSessions.TryGetValue(Context.ConnectionId, out var userSession))
        {
            await Clients.OthersInGroup($"Board_{boardId}").SendAsync("ElementSelected", elementId, userSession.UserName, Context.ConnectionId);
        }
    }

    public async Task DeselectElement(string boardId, string elementId)
    {
        await Clients.OthersInGroup($"Board_{boardId}").SendAsync("ElementDeselected", elementId, Context.ConnectionId);
    }

    public async Task BringToFront(string boardId, string elementId)
    {
        try
        {
            if (Guid.TryParse(elementId, out var elementGuid))
            {
                var element = await _elementService.GetElementAsync(elementGuid);
                if (element != null)
                {
                    // Get the highest z-index in this board
                    var maxZIndex = await _elementService.GetMaxZIndexAsync(element.BoardId);
                    element.ZIndex = maxZIndex + 1;
                    await _elementService.UpdateElementAsync(element);
                    
                    await Clients.Group($"Board_{boardId}").SendAsync("ElementZIndexUpdated", elementId, element.ZIndex);
                }
            }
        }
        catch (Exception ex)
        {
            await Clients.Caller.SendAsync("Error", $"Failed to bring element to front: {ex.Message}");
        }
    }

    public async Task SendToBack(string boardId, string elementId)
    {
        try
        {
            if (Guid.TryParse(elementId, out var elementGuid))
            {
                var element = await _elementService.GetElementAsync(elementGuid);
                if (element != null)
                {
                    // Get the lowest z-index in this board
                    var minZIndex = await _elementService.GetMinZIndexAsync(element.BoardId);
                    element.ZIndex = minZIndex - 1;
                    await _elementService.UpdateElementAsync(element);
                    
                    await Clients.Group($"Board_{boardId}").SendAsync("ElementZIndexUpdated", elementId, element.ZIndex);
                }
            }
        }
        catch (Exception ex)
        {
            await Clients.Caller.SendAsync("Error", $"Failed to send element to back: {ex.Message}");
        }
    }

    public async Task DeleteElement(string boardId, string elementId)
    {
        try
        {
            if (Guid.TryParse(elementId, out var elementGuid))
            {
                var success = await _elementService.DeleteElementAsync(elementGuid);
                if (success)
                {
                    await Clients.Group($"Board_{boardId}").SendAsync("ElementDeleted", elementId);
                }
                else
                {
                    await Clients.Caller.SendAsync("Error", "Element not found or could not be deleted");
                }
            }
        }
        catch (Exception ex)
        {
            await Clients.Caller.SendAsync("Error", $"Failed to delete element: {ex.Message}");
        }
    }

    public async Task ResizeElement(string boardId, string elementId, double x, double y, double width, double height)
    {
        try
        {
            if (Guid.TryParse(elementId, out var elementGuid))
            {
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
        }
        catch (Exception ex)
        {
            await Clients.Caller.SendAsync("Error", $"Failed to resize element: {ex.Message}");
        }
    }

    public async Task UpdateElementStyle(string boardId, string elementId, object styleData)
    {
        Console.WriteLine($"UpdateElementStyle called: boardId={boardId}, elementId={elementId}, data={JsonSerializer.Serialize(styleData)}");
        try
        {
            if (Guid.TryParse(elementId, out var elementGuid))
            {
                var element = await _elementService.GetElementAsync(elementGuid);
                if (element != null && (element.Type == ElementType.Shape || element.Type == ElementType.Drawing))
                {
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
                    await _elementService.UpdateElementAsync(element);
                    
                    // Broadcast to all users in the board
                    await Clients.Group($"Board_{boardId}").SendAsync("ElementStyleUpdated", elementId, styleData);
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error in UpdateElementStyle: {ex}");
            await Clients.Caller.SendAsync("Error", $"Failed to update element style: {ex.Message}");
        }
    }
}