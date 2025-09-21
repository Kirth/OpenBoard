using Microsoft.EntityFrameworkCore;
using WhiteboardApp.Data;
using WhiteboardApp.Models;

namespace WhiteboardApp.Services;

public class BoardService
{
    private readonly WhiteboardContext _context;
    private readonly IUserSessionManager _userSessionManager;

    public BoardService(WhiteboardContext context, IUserSessionManager userSessionManager)
    {
        _context = context;
        _userSessionManager = userSessionManager;
    }

    public async Task<Board?> GetBoardAsync(Guid id)
    {
        return await _context.Boards
            .Include(b => b.Owner)
            .Include(b => b.Elements)
            .Include(b => b.Collaborators)
                .ThenInclude(c => c.User)
            .FirstOrDefaultAsync(b => b.Id == id);
    }

    public async Task<Board?> GetBoardWithAccessCheckAsync(Guid id, User user, BoardRole minimumRole = BoardRole.Viewer)
    {
        var board = await GetBoardAsync(id);
        if (board == null) return null;

        // Check if user has access
        var role = GetUserBoardRole(board, user.Id);
        if (role == null || role < minimumRole)
            return null;

        return board;
    }

    public async Task<Board> CreateBoardAsync(string name, User owner, BoardAccessLevel accessLevel = BoardAccessLevel.Private, string emoji = "📋")
    {
        var board = new Board 
        { 
            Name = name,
            Emoji = emoji,
            OwnerId = owner.Id,
            AccessLevel = accessLevel
        };
        _context.Boards.Add(board);
        await _context.SaveChangesAsync();
        return board;
    }

    [Obsolete("Use CreateBoardAsync(string, User) instead")]
    public async Task<Board> CreateBoardAsync(string name)
    {
        throw new InvalidOperationException("Board creation requires an authenticated user. Use CreateBoardAsync(string, User) instead.");
    }

    public async Task<Board> CreateBoardAsync(string name, User owner, bool isPublic, string? adminPin = null)
    {
        var board = new Board 
        { 
            Name = name,
            OwnerId = owner.Id,
            IsPublic = isPublic, // Legacy field for backward compatibility
            AccessLevel = isPublic ? BoardAccessLevel.Public : BoardAccessLevel.Private,
            AdminPin = string.IsNullOrWhiteSpace(adminPin) ? null : adminPin
        };
        _context.Boards.Add(board);
        await _context.SaveChangesAsync();
        return board;
    }

    [Obsolete("Use CreateBoardAsync(string, User, bool, string?) instead")]
    public async Task<Board> CreateBoardAsync(string name, bool isPublic, string? adminPin = null)
    {
        throw new InvalidOperationException("Board creation requires an authenticated user. Use CreateBoardAsync(string, User, bool, string?) instead.");
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
            .Include(b => b.Owner)
            .Include(b => b.Elements)
            .Where(b => b.AccessLevel == BoardAccessLevel.Public)
            .OrderByDescending(b => b.UpdatedAt)
            .ToListAsync();
    }

    public async Task<List<Board>> GetActiveBoardsAsync()
    {
        // Get all boards (public + unlisted for visibility to unauthenticated users)
        var boards = await _context.Boards
            .Include(b => b.Owner)
            .Include(b => b.Elements)
            .Where(b => b.AccessLevel == BoardAccessLevel.Public || b.AccessLevel == BoardAccessLevel.Unlisted)
            .ToListAsync();

        // Filter boards that have active sessions
        var activeBoardIds = new List<Guid>();
        foreach (var board in boards)
        {
            var sessions = await _userSessionManager.GetBoardSessionsAsync(board.Id);
            if (sessions.Any())
            {
                activeBoardIds.Add(board.Id);
            }
        }

        return boards
            .Where(b => activeBoardIds.Contains(b.Id))
            .OrderByDescending(b => b.UpdatedAt)
            .ToList();
    }

    public async Task<List<Board>> GetUserAccessibleBoardsAsync(User user)
    {
        return await _context.Boards
            .Include(b => b.Owner)
            .Include(b => b.Collaborators)
                .ThenInclude(c => c.User)
            .Where(b => 
                b.OwnerId == user.Id || // User is owner
                b.Collaborators.Any(c => c.UserId == user.Id) || // User is collaborator
                b.AccessLevel == BoardAccessLevel.Public) // Public board
            .OrderByDescending(b => b.UpdatedAt)
            .ToListAsync();
    }

    public async Task<List<Board>> GetUserOwnedBoardsAsync(User user)
    {
        return await _context.Boards
            .Include(b => b.Elements)
            .Where(b => b.OwnerId == user.Id)
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
            IsPublic = board.IsPublic, // Legacy field for backward compatibility
            AccessLevel = board.AccessLevel, // New access level field
            HasAdminPin = !string.IsNullOrEmpty(board.AdminPin),
            TotalElements = board.Elements.Count,
            ElementsByType = elementsByType
        };
    }

    public async Task<Board> DuplicateBoardAsync(Guid sourceBoardId, string newBoardName, User newOwner)
    {
        var sourceBoard = await GetBoardAsync(sourceBoardId);
        if (sourceBoard == null)
        {
            throw new ArgumentException($"Source board with ID {sourceBoardId} not found.");
        }

        // Check if user has access to source board
        var role = GetUserBoardRole(sourceBoard, newOwner.Id);
        if (role == null || role < BoardRole.Viewer)
        {
            throw new UnauthorizedAccessException("Access denied to source board.");
        }

        // Create new board with same settings as source
        var newBoard = new Board
        {
            Id = Guid.NewGuid(),
            Name = newBoardName,
            Emoji = sourceBoard.Emoji,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            OwnerId = newOwner.Id,
            IsPublic = sourceBoard.IsPublic, // Legacy field
            AccessLevel = sourceBoard.AccessLevel,
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
                CreatedBy = element.CreatedBy, // Legacy field
                CreatedByUserId = newOwner.Id, // New owner becomes creator of duplicated elements
                ModifiedByUserId = newOwner.Id,
                CreatedAt = DateTime.UtcNow,
                ModifiedAt = DateTime.UtcNow,
                Data = element.Data != null ? 
                    System.Text.Json.JsonDocument.Parse(element.Data.RootElement.GetRawText()) : 
                    null
            }).ToList();

            _context.BoardElements.AddRange(duplicatedElements);
            await _context.SaveChangesAsync();
        }

        return newBoard;
    }

    [Obsolete("Use DuplicateBoardAsync(Guid, string, User) instead")]
    public async Task<Board> DuplicateBoardAsync(Guid sourceBoardId, string newBoardName)
    {
        throw new InvalidOperationException("Board duplication requires an authenticated user. Use DuplicateBoardAsync(Guid, string, User) instead.");
    }

    // Helper method to determine user's role on a board
    private static BoardRole? GetUserBoardRole(Board board, Guid userId)
    {
        // Check if user is the owner
        if (board.OwnerId == userId)
            return BoardRole.Owner;

        // Check if user is a collaborator
        var collaboration = board.Collaborators?.FirstOrDefault(c => c.UserId == userId);
        if (collaboration != null)
            return collaboration.Role;

        // Check board access level for non-collaborators
        return board.AccessLevel switch
        {
            BoardAccessLevel.Public or BoardAccessLevel.Unlisted => BoardRole.Collaborator,
            BoardAccessLevel.Private => null,
            _ => null
        };
    }

    public async Task DeleteBoardAsync(Guid boardId)
    {
        var board = await _context.Boards
            .Include(b => b.Elements)
            .Include(b => b.Collaborators)
            .FirstOrDefaultAsync(b => b.Id == boardId);

        if (board == null)
        {
            throw new InvalidOperationException("Board not found");
        }

        // Remove all board elements
        if (board.Elements != null && board.Elements.Any())
        {
            _context.BoardElements.RemoveRange(board.Elements);
        }

        // Remove all collaborators
        if (board.Collaborators != null && board.Collaborators.Any())
        {
            _context.BoardCollaborators.RemoveRange(board.Collaborators);
        }

        // Remove the board
        _context.Boards.Remove(board);

        await _context.SaveChangesAsync();
    }

    public async Task UpdateBoardAsync(Board board)
    {
        _context.Boards.Update(board);
        await _context.SaveChangesAsync();
    }

    public async Task AddCollaboratorAsync(Guid boardId, Guid userId, BoardRole role, Guid grantedByUserId)
    {
        var collaboration = new BoardCollaborator
        {
            BoardId = boardId,
            UserId = userId,
            Role = role,
            GrantedAt = DateTime.UtcNow,
            GrantedByUserId = grantedByUserId
        };

        _context.BoardCollaborators.Add(collaboration);
        await _context.SaveChangesAsync();
    }

    public async Task UpdateCollaboratorRoleAsync(Guid boardId, Guid userId, BoardRole role)
    {
        var collaboration = await _context.BoardCollaborators
            .FirstOrDefaultAsync(c => c.BoardId == boardId && c.UserId == userId);

        if (collaboration != null)
        {
            collaboration.Role = role;
            await _context.SaveChangesAsync();
        }
    }

    public async Task RemoveCollaboratorAsync(Guid boardId, Guid userId)
    {
        var collaboration = await _context.BoardCollaborators
            .FirstOrDefaultAsync(c => c.BoardId == boardId && c.UserId == userId);

        if (collaboration != null)
        {
            _context.BoardCollaborators.Remove(collaboration);
            await _context.SaveChangesAsync();
        }
    }

    public async Task TrackBoardAccessAsync(Guid userId, Guid boardId, bool isJoin = true)
    {
        var existingAccess = await _context.UserBoardAccesses
            .FirstOrDefaultAsync(ua => ua.UserId == userId && ua.BoardId == boardId);

        if (existingAccess != null)
        {
            // Update existing access record
            existingAccess.LastAccessedAt = DateTime.UtcNow;
            existingAccess.AccessCount++;
            if (isJoin && !existingAccess.IsJoin)
            {
                existingAccess.IsJoin = true;
            }
        }
        else
        {
            // Create new access record
            var newAccess = new UserBoardAccess
            {
                UserId = userId,
                BoardId = boardId,
                LastAccessedAt = DateTime.UtcNow,
                AccessCount = 1,
                IsJoin = isJoin
            };
            _context.UserBoardAccesses.Add(newAccess);
        }

        await _context.SaveChangesAsync();
    }

    /// <summary>
    /// Search for boards by name, ID, or owner. Returns boards the user can access.
    /// </summary>
    public async Task<List<Board>> SearchBoardsAsync(string query, User? user = null, int limit = 10)
    {
        if (string.IsNullOrWhiteSpace(query))
            return new List<Board>();

        query = query.Trim();
        
        // Start with base query including related data
        var baseQuery = _context.Boards
            .Include(b => b.Owner)
            .Include(b => b.Elements)
            .Include(b => b.Collaborators)
                .ThenInclude(c => c.User)
            .AsQueryable();

        // Apply access filters based on user
        if (user != null)
        {
            // Authenticated user - show boards they can access
            baseQuery = baseQuery.Where(b => 
                b.OwnerId == user.Id || // User is owner
                b.Collaborators.Any(c => c.UserId == user.Id) || // User is collaborator  
                b.AccessLevel == BoardAccessLevel.Public || // Public boards
                b.AccessLevel == BoardAccessLevel.Unlisted); // Unlisted boards (if they know the name/ID)
        }
        else
        {
            // Anonymous user - only public boards
            baseQuery = baseQuery.Where(b => b.AccessLevel == BoardAccessLevel.Public);
        }

        // Check if query looks like a GUID (for partial ID matching)
        var isGuidLike = Guid.TryParse(query, out var exactGuid) || 
                        query.Length >= 8 && query.All(c => char.IsLetterOrDigit(c) || c == '-');

        // Build search conditions with priority order
        var searchResults = await baseQuery
            .Where(b => 
                // Exact name match (highest priority)
                b.Name.ToLower() == query.ToLower() ||
                // Starts with query (high priority)
                b.Name.ToLower().StartsWith(query.ToLower()) ||
                // Contains query (medium priority)
                b.Name.ToLower().Contains(query.ToLower()) ||
                // Owner name contains query
                (b.Owner != null && b.Owner.DisplayName.ToLower().Contains(query.ToLower())) ||
                // Partial GUID match (if query looks like GUID)
                (isGuidLike && b.Id.ToString().ToLower().Contains(query.ToLower()))
            )
            .ToListAsync();

        // Sort results by relevance
        var sortedResults = searchResults
            .OrderByDescending(b => 
                // Exact match gets highest score
                b.Name.Equals(query, StringComparison.OrdinalIgnoreCase) ? 1000 :
                // Starts with gets high score
                b.Name.StartsWith(query, StringComparison.OrdinalIgnoreCase) ? 500 :
                // Recent activity gets bonus
                (DateTime.UtcNow - b.UpdatedAt).TotalDays < 7 ? 100 :
                // Default score for contains match
                50)
            .ThenByDescending(b => b.UpdatedAt) // Then by recent activity
            .Take(limit)
            .ToList();

        return sortedResults;
    }

    /// <summary>
    /// Parse various board identifier formats (URLs, IDs, etc.) and return the board ID
    /// </summary>
    public static string? ParseBoardIdentifier(string input)
    {
        if (string.IsNullOrWhiteSpace(input))
            return null;

        input = input.Trim();

        // Direct GUID check
        if (Guid.TryParse(input, out var directGuid))
            return directGuid.ToString();

        // URL patterns to match
        var urlPatterns = new[]
        {
            @"/board/([a-fA-F0-9-]{36})", // /board/uuid
            @"/board/([a-fA-F0-9-]+)",    // /board/partial-uuid
            @"board=([a-fA-F0-9-]{36})",  // ?board=uuid
            @"board=([a-fA-F0-9-]+)",     // ?board=partial-uuid
            @"id=([a-fA-F0-9-]{36})",     // ?id=uuid
            @"id=([a-fA-F0-9-]+)"         // ?id=partial-uuid
        };

        foreach (var pattern in urlPatterns)
        {
            var match = System.Text.RegularExpressions.Regex.Match(input, pattern, 
                System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (match.Success)
            {
                var extractedId = match.Groups[1].Value;
                // Validate extracted ID is a valid GUID
                if (Guid.TryParse(extractedId, out var parsedGuid))
                    return parsedGuid.ToString();
                // Return partial match for further processing
                return extractedId;
            }
        }

        // Return null if no recognizable pattern found
        return null;
    }
}

public class BoardStats
{
    public Guid BoardId { get; set; }
    public string BoardName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public bool IsPublic { get; set; } // Legacy field for backward compatibility
    public BoardAccessLevel AccessLevel { get; set; } // New access level field
    public bool HasAdminPin { get; set; }
    public int TotalElements { get; set; }
    public Dictionary<string, int> ElementsByType { get; set; } = new();
}