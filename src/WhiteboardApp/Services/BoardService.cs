using Microsoft.EntityFrameworkCore;
using WhiteboardApp.Data;
using WhiteboardApp.Models;

namespace WhiteboardApp.Services;

public class BoardService
{
    private readonly WhiteboardContext _context;

    public BoardService(WhiteboardContext context)
    {
        _context = context;
    }

    public async Task<Board?> GetBoardAsync(Guid id)
    {
        return await _context.Boards
            .Include(b => b.Elements)
            .FirstOrDefaultAsync(b => b.Id == id);
    }

    public async Task<Board> CreateBoardAsync(string name)
    {
        var board = new Board { Name = name };
        _context.Boards.Add(board);
        await _context.SaveChangesAsync();
        return board;
    }

    public async Task<Board> CreateBoardAsync(string name, bool isPublic, string? adminPin = null)
    {
        var board = new Board 
        { 
            Name = name,
            IsPublic = isPublic,
            AdminPin = string.IsNullOrWhiteSpace(adminPin) ? null : adminPin
        };
        _context.Boards.Add(board);
        await _context.SaveChangesAsync();
        return board;
    }

    public async Task<List<BoardElement>> GetBoardElementsAsync(Guid boardId)
    {
        return await _context.BoardElements
            .Where(e => e.BoardId == boardId)
            .OrderBy(e => e.ZIndex)
            .ThenBy(e => e.CreatedAt)
            .ToListAsync();
    }

    public async Task<List<Board>> GetPublicBoardsAsync()
    {
        return await _context.Boards
            .Include(b => b.Elements)
            .Where(b => b.IsPublic)
            .OrderByDescending(b => b.UpdatedAt)
            .ToListAsync();
    }
}