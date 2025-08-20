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
}