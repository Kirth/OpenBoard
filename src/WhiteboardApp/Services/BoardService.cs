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

    public async Task<BoardStats> GetBoardStatsAsync(Guid boardId)
    {
        var board = await GetBoardAsync(boardId);
        if (board == null)
        {
            throw new ArgumentException($"Board with ID {boardId} not found.");
        }

        var elementsByType = board.Elements
            .GroupBy(e => e.Type)
            .ToDictionary(g => g.Key.ToString(), g => g.Count());

        return new BoardStats
        {
            BoardId = board.Id,
            BoardName = board.Name,
            CreatedAt = board.CreatedAt,
            UpdatedAt = board.UpdatedAt,
            IsPublic = board.IsPublic,
            HasAdminPin = !string.IsNullOrEmpty(board.AdminPin),
            TotalElements = board.Elements.Count,
            ElementsByType = elementsByType
        };
    }

    public async Task<Board> DuplicateBoardAsync(Guid sourceBoardId, string newBoardName)
    {
        var sourceBoard = await GetBoardAsync(sourceBoardId);
        if (sourceBoard == null)
        {
            throw new ArgumentException($"Source board with ID {sourceBoardId} not found.");
        }

        // Create new board with same settings as source
        var newBoard = new Board
        {
            Id = Guid.NewGuid(),
            Name = newBoardName,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            IsPublic = sourceBoard.IsPublic,
            AdminPin = sourceBoard.AdminPin
        };

        _context.Boards.Add(newBoard);
        await _context.SaveChangesAsync();

        // Duplicate all elements
        if (sourceBoard.Elements.Any())
        {
            var duplicatedElements = sourceBoard.Elements.Select(element => new BoardElement
            {
                Id = Guid.NewGuid(),
                BoardId = newBoard.Id,
                Type = element.Type,
                X = element.X,
                Y = element.Y,
                Width = element.Width,
                Height = element.Height,
                ZIndex = element.ZIndex,
                CreatedBy = element.CreatedBy,
                CreatedAt = DateTime.UtcNow,
                Data = element.Data != null ? 
                    System.Text.Json.JsonDocument.Parse(element.Data.RootElement.GetRawText()) : 
                    null
            }).ToList();

            _context.BoardElements.AddRange(duplicatedElements);
            await _context.SaveChangesAsync();
        }

        return newBoard;
    }
}

public class BoardStats
{
    public Guid BoardId { get; set; }
    public string BoardName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public bool IsPublic { get; set; }
    public bool HasAdminPin { get; set; }
    public int TotalElements { get; set; }
    public Dictionary<string, int> ElementsByType { get; set; } = new();
}