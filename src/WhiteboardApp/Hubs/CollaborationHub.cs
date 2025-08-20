using Microsoft.AspNetCore.SignalR;
using WhiteboardApp.Models;
using WhiteboardApp.Services;
using System.Text.Json;

namespace WhiteboardApp.Hubs;

public class CollaborationHub : Hub
{
    private readonly ElementService _elementService;
    private readonly BoardService _boardService;

    public CollaborationHub(ElementService elementService, BoardService boardService)
    {
        _elementService = elementService;
        _boardService = boardService;
    }

    public async Task JoinBoard(string boardId, string userName)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"Board_{boardId}");
        
        // Notify others that user joined
        await Clients.Group($"Board_{boardId}").SendAsync("UserJoined", userName);
    }

    public async Task LeaveBoard(string boardId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"Board_{boardId}");
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

            var type = elementType switch
            {
                "Text" => ElementType.Text,
                "Shape" => ElementType.Shape,
                "StickyNote" => ElementType.StickyNote,
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
                createdBy = savedElement.CreatedBy
            });
        }
        catch (Exception ex)
        {
            await Clients.Caller.SendAsync("Error", $"Failed to add element: {ex.Message}");
        }
    }

    public async Task UpdateCursor(string boardId, double x, double y)
    {
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
        // Clean up any group memberships if needed
        await base.OnDisconnectedAsync(exception);
    }
}