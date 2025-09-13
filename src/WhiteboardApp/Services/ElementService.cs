using Microsoft.EntityFrameworkCore;
using WhiteboardApp.Data;
using WhiteboardApp.Models;

namespace WhiteboardApp.Services;

public class ElementService
{
    private readonly WhiteboardContext _context;

    public ElementService(WhiteboardContext context)
    {
        _context = context;
    }

    public async Task<BoardElement> AddElementAsync(BoardElement element)
    {
        _context.BoardElements.Add(element);
        await _context.SaveChangesAsync();
        return element;
    }

    public async Task<BoardElement?> GetElementAsync(Guid elementId)
    {
        return await _context.BoardElements.FindAsync(elementId);
    }

    public async Task<BoardElement?> UpdateElementAsync(Guid elementId, BoardElement updatedElement)
    {
        var element = await _context.BoardElements.FindAsync(elementId);
        if (element == null) return null;

        element.X = updatedElement.X;
        element.Y = updatedElement.Y;
        element.Width = updatedElement.Width;
        element.Height = updatedElement.Height;
        element.ZIndex = updatedElement.ZIndex;
        element.Data = updatedElement.Data;

        await _context.SaveChangesAsync();
        return element;
    }

    public async Task<BoardElement?> UpdateElementAsync(BoardElement element)
    {
        _context.BoardElements.Update(element);
        await _context.SaveChangesAsync();
        return element;
    }

    public async Task<bool> DeleteElementAsync(Guid elementId)
    {
        var element = await _context.BoardElements.FindAsync(elementId);
        if (element == null) return false;

        _context.BoardElements.Remove(element);
        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<int> GetMaxZIndexAsync(Guid boardId)
    {
        var maxZIndex = await _context.BoardElements
            .Where(e => e.BoardId == boardId)
            .MaxAsync(e => (int?)e.ZIndex);
        
        return maxZIndex ?? 0;
    }

    public async Task<int> GetMinZIndexAsync(Guid boardId)
    {
        var minZIndex = await _context.BoardElements
            .Where(e => e.BoardId == boardId)
            .MinAsync(e => (int?)e.ZIndex);
        
        return minZIndex ?? 0;
    }

    // Group Management Methods
    public async Task<Guid> CreateGroupAsync(Guid boardId, List<Guid> elementIds, string? createdBy = null)
    {
        var groupId = Guid.NewGuid();
        
        var elements = await _context.BoardElements
            .Where(e => elementIds.Contains(e.Id) && e.BoardId == boardId)
            .ToListAsync();
        
        if (elements.Count != elementIds.Count)
        {
            throw new ArgumentException("One or more elements not found or belong to different board");
        }

        for (int i = 0; i < elements.Count; i++)
        {
            elements[i].GroupId = groupId;
            elements[i].GroupOrder = i;
        }

        await _context.SaveChangesAsync();
        return groupId;
    }

    public async Task<bool> UngroupElementsAsync(Guid groupId)
    {
        var elements = await _context.BoardElements
            .Where(e => e.GroupId == groupId)
            .ToListAsync();

        if (elements.Count == 0) return false;

        foreach (var element in elements)
        {
            element.GroupId = null;
            element.GroupOrder = null;
        }

        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<List<BoardElement>> GetGroupElementsAsync(Guid groupId)
    {
        return await _context.BoardElements
            .Where(e => e.GroupId == groupId)
            .OrderBy(e => e.GroupOrder)
            .ToListAsync();
    }

    public async Task<bool> AddElementToGroupAsync(Guid elementId, Guid groupId)
    {
        var element = await _context.BoardElements.FindAsync(elementId);
        if (element == null) return false;

        var maxOrder = await _context.BoardElements
            .Where(e => e.GroupId == groupId)
            .MaxAsync(e => (int?)e.GroupOrder) ?? -1;

        element.GroupId = groupId;
        element.GroupOrder = maxOrder + 1;

        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<bool> RemoveElementFromGroupAsync(Guid elementId)
    {
        var element = await _context.BoardElements.FindAsync(elementId);
        if (element == null || element.GroupId == null) return false;

        element.GroupId = null;
        element.GroupOrder = null;

        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<bool> MoveGroupAsync(Guid groupId, double deltaX, double deltaY)
    {
        var elements = await _context.BoardElements
            .Where(e => e.GroupId == groupId)
            .ToListAsync();

        if (elements.Count == 0) return false;

        foreach (var element in elements)
        {
            element.X += deltaX;
            element.Y += deltaY;
        }

        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<bool> DeleteGroupAsync(Guid groupId)
    {
        var elements = await _context.BoardElements
            .Where(e => e.GroupId == groupId)
            .ToListAsync();

        if (elements.Count == 0) return false;

        _context.BoardElements.RemoveRange(elements);
        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<bool> SetGroupZIndexAsync(Guid groupId, int baseZIndex)
    {
        var elements = await _context.BoardElements
            .Where(e => e.GroupId == groupId)
            .OrderBy(e => e.GroupOrder)
            .ToListAsync();

        if (elements.Count == 0) return false;

        for (int i = 0; i < elements.Count; i++)
        {
            elements[i].ZIndex = baseZIndex + i;
        }

        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<Dictionary<Guid, List<BoardElement>>> GetBoardGroupsAsync(Guid boardId)
    {
        var groupedElements = await _context.BoardElements
            .Where(e => e.BoardId == boardId && e.GroupId != null)
            .GroupBy(e => e.GroupId!.Value)
            .ToDictionaryAsync(
                g => g.Key,
                g => g.OrderBy(e => e.GroupOrder).ToList()
            );

        return groupedElements;
    }

    public async Task<bool> IsElementInGroupAsync(Guid elementId)
    {
        var element = await _context.BoardElements.FindAsync(elementId);
        return element?.GroupId != null;
    }

    public async Task<Guid?> GetElementGroupIdAsync(Guid elementId)
    {
        var element = await _context.BoardElements.FindAsync(elementId);
        return element?.GroupId;
    }
}