using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using WhiteboardApp.Data;
using WhiteboardApp.Models;

namespace WhiteboardApp.Services;

public interface IUserService
{
    Task<User> GetOrCreateUserAsync(ClaimsPrincipal principal);
    Task<User?> GetUserByIdAsync(Guid userId);
    Task<User?> GetUserBySubjectIdAsync(string subjectId);
    Task<User?> GetUserByDisplayNameAsync(string displayName);
    Task<User?> GetUserByEmailAsync(string email);
    Task<User> UpdateUserAsync(User user);
    Task UpdateLastLoginAsync(Guid userId);
    Task<bool> HasBoardAccessAsync(Guid userId, Guid boardId, BoardRole minimumRole = BoardRole.Viewer);
    Task<BoardRole?> GetUserBoardRoleAsync(Guid userId, Guid boardId);
    Task<User> GetAnonymousUserAsync();
    Task<User> GetOrCreateAnonymousUserAsync(string? fingerprint = null);
    Task<UserStatistics> GetUserStatisticsAsync(Guid userId);
    Task<List<Board>> GetUserRecentBoardsAsync(Guid userId, int limit = 10);
}

public class UserService : IUserService
{
    private readonly WhiteboardContext _context;

    public UserService(WhiteboardContext context)
    {
        _context = context;
    }

    public async Task<User> GetOrCreateUserAsync(ClaimsPrincipal principal)
    {
        var subjectId = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value
                       ?? principal.FindFirst("sub")?.Value;
        
        if (string.IsNullOrEmpty(subjectId))
        {
            throw new ArgumentException("No subject ID found in claims", nameof(principal));
        }

        var user = await GetUserBySubjectIdAsync(subjectId);
        
        if (user == null)
        {
            // Create new user from OIDC claims
            user = new User
            {
                SubjectId = subjectId,
                Username = principal.FindFirst("preferred_username")?.Value,
                Email = principal.FindFirst(ClaimTypes.Email)?.Value
                       ?? principal.FindFirst("email")?.Value,
                Name = principal.FindFirst(ClaimTypes.Name)?.Value
                      ?? principal.FindFirst("name")?.Value,
                CreatedAt = DateTime.UtcNow,
                LastLoginAt = DateTime.UtcNow
            };

            // Set display name with fallback logic
            user.DisplayName = !string.IsNullOrEmpty(user.Name) ? user.Name :
                              !string.IsNullOrEmpty(user.Username) ? user.Username :
                              !string.IsNullOrEmpty(user.Email) ? user.Email.Split('@')[0] :
                              "User";

            _context.Users.Add(user);
            await _context.SaveChangesAsync();
        }
        else
        {
            // Update user information from current claims
            var updated = false;
            
            var currentUsername = principal.FindFirst("preferred_username")?.Value;
            if (!string.IsNullOrEmpty(currentUsername) && user.Username != currentUsername)
            {
                user.Username = currentUsername;
                updated = true;
            }

            var currentEmail = principal.FindFirst(ClaimTypes.Email)?.Value
                              ?? principal.FindFirst("email")?.Value;
            if (!string.IsNullOrEmpty(currentEmail) && user.Email != currentEmail)
            {
                user.Email = currentEmail;
                updated = true;
            }

            var currentName = principal.FindFirst(ClaimTypes.Name)?.Value
                             ?? principal.FindFirst("name")?.Value;
            if (!string.IsNullOrEmpty(currentName) && user.Name != currentName)
            {
                user.Name = currentName;
                updated = true;
            }

            // Update last login
            user.LastLoginAt = DateTime.UtcNow;
            updated = true;

            if (updated)
            {
                _context.Users.Update(user);
                await _context.SaveChangesAsync();
            }
        }

        return user;
    }

    public async Task<User?> GetUserByIdAsync(Guid userId)
    {
        return await _context.Users
            .Include(u => u.OwnedBoards)
            .Include(u => u.BoardCollaborations)
                .ThenInclude(bc => bc.Board)
            .FirstOrDefaultAsync(u => u.Id == userId && u.IsActive);
    }

    public async Task<User?> GetUserBySubjectIdAsync(string subjectId)
    {
        return await _context.Users
            .FirstOrDefaultAsync(u => u.SubjectId == subjectId && u.IsActive);
    }

    public async Task<User> UpdateUserAsync(User user)
    {
        _context.Users.Update(user);
        await _context.SaveChangesAsync();
        return user;
    }

    public async Task UpdateLastLoginAsync(Guid userId)
    {
        var user = await _context.Users.FindAsync(userId);
        if (user != null)
        {
            user.LastLoginAt = DateTime.UtcNow;
            _context.Users.Update(user);
            await _context.SaveChangesAsync();
        }
    }

    public async Task<bool> HasBoardAccessAsync(Guid userId, Guid boardId, BoardRole minimumRole = BoardRole.Viewer)
    {
        var role = await GetUserBoardRoleAsync(userId, boardId);
        return role.HasValue && role.Value >= minimumRole;
    }

    public async Task<BoardRole?> GetUserBoardRoleAsync(Guid userId, Guid boardId)
    {
        var board = await _context.Boards
            .Include(b => b.Collaborators)
            .FirstOrDefaultAsync(b => b.Id == boardId);

        if (board == null) return null;

        // Check if user is the owner
        if (board.OwnerId == userId)
            return BoardRole.Owner;

        // Check if user is a collaborator
        var collaboration = board.Collaborators
            .FirstOrDefault(c => c.UserId == userId);
        
        if (collaboration != null)
            return collaboration.Role;

        // Check board access level for non-collaborators
        switch (board.AccessLevel)
        {
            case BoardAccessLevel.Public:
            case BoardAccessLevel.Unlisted:
                return BoardRole.Collaborator; // Default role for public/link sharing
            case BoardAccessLevel.Private:
            default:
                return null; // No access
        }
    }

    public async Task<User> GetAnonymousUserAsync()
    {
        // This method now returns the legacy anonymous user for backward compatibility
        const string anonymousSubjectId = "anonymous-user";
        
        var anonymousUser = await GetUserBySubjectIdAsync(anonymousSubjectId);
        if (anonymousUser == null)
        {
            // Create the legacy anonymous user with the reserved GUID
            anonymousUser = new User
            {
                Id = AnonymousUserService.LegacyAnonymousGuid,
                SubjectId = anonymousSubjectId,
                Username = "anonymous",
                Email = null,
                Name = "Anonymous User",
                DisplayName = "Anonymous",
                CreatedAt = DateTime.UtcNow,
                LastLoginAt = DateTime.UtcNow,
                IsActive = true
            };

            _context.Users.Add(anonymousUser);
            await _context.SaveChangesAsync();
        }

        return anonymousUser;
    }

    public async Task<User> GetOrCreateAnonymousUserAsync(string? fingerprint = null)
    {
        Guid anonymousGuid;
        string displayName;

        if (!string.IsNullOrEmpty(fingerprint) && AnonymousUserService.IsValidFingerprint(fingerprint))
        {
            // Generate deterministic GUID from fingerprint
            anonymousGuid = AnonymousUserService.GenerateAnonymousGuid(fingerprint);
            displayName = AnonymousUserService.GenerateAnonymousDisplayName(anonymousGuid);
        }
        else
        {
            // Fallback to session-only anonymous GUID
            anonymousGuid = AnonymousUserService.GenerateSessionAnonymousGuid();
            displayName = AnonymousUserService.GenerateAnonymousDisplayName(anonymousGuid);
        }

        // Check if this anonymous user already exists
        var existingUser = await GetUserByIdAsync(anonymousGuid);
        if (existingUser != null)
        {
            // Update last login for existing anonymous user
            existingUser.LastLoginAt = DateTime.UtcNow;
            await UpdateUserAsync(existingUser);
            return existingUser;
        }

        // Create new anonymous user
        var anonymousUser = new User
        {
            Id = anonymousGuid,
            SubjectId = $"anonymous-{anonymousGuid:N}",
            Username = null,
            Email = null,
            Name = displayName,
            DisplayName = displayName,
            CreatedAt = DateTime.UtcNow,
            LastLoginAt = DateTime.UtcNow,
            IsActive = true
        };

        _context.Users.Add(anonymousUser);
        await _context.SaveChangesAsync();

        return anonymousUser;
    }

    public async Task<User?> GetUserByDisplayNameAsync(string displayName)
    {
        return await _context.Users
            .FirstOrDefaultAsync(u => u.DisplayName == displayName && u.IsActive);
    }

    public async Task<UserStatistics> GetUserStatisticsAsync(Guid userId)
    {
        var user = await _context.Users
            .Include(u => u.OwnedBoards)
            .Include(u => u.BoardCollaborations)
            .Include(u => u.CreatedElements)
            .FirstOrDefaultAsync(u => u.Id == userId && u.IsActive);

        if (user == null)
        {
            return new UserStatistics();
        }

        var ownedBoardsCount = user.OwnedBoards?.Count ?? 0;
        var collaborationsCount = user.BoardCollaborations?.Count ?? 0;
        var elementsCreatedCount = user.CreatedElements?.Count ?? 0;

        // Get recent activity (boards updated in last 30 days that user owns or collaborates on)
        var thirtyDaysAgo = DateTime.UtcNow.AddDays(-30);
        var recentOwnedBoards = user.OwnedBoards?.Where(b => b.UpdatedAt >= thirtyDaysAgo).Count() ?? 0;
        var recentCollaborationBoards = user.BoardCollaborations?
            .Where(bc => bc.Board.UpdatedAt >= thirtyDaysAgo).Count() ?? 0;

        return new UserStatistics
        {
            OwnedBoardsCount = ownedBoardsCount,
            CollaborationsCount = collaborationsCount,
            ElementsCreatedCount = elementsCreatedCount,
            RecentActivityCount = recentOwnedBoards + recentCollaborationBoards,
            AccountAge = DateTime.UtcNow - user.CreatedAt,
            LastLoginDaysAgo = (int)(DateTime.UtcNow - user.LastLoginAt).TotalDays
        };
    }

    public async Task<List<Board>> GetUserRecentBoardsAsync(Guid userId, int limit = 10)
    {
        try
        {
            // Get boards based on actual user access tracking (simplified query to avoid concurrency issues)
            var userAccesses = await _context.UserBoardAccesses
                .Where(ua => ua.UserId == userId)
                .OrderByDescending(ua => ua.LastAccessedAt)
                .Take(limit)
                .Select(ua => ua.BoardId)
                .ToListAsync();

            var recentBoards = await _context.Boards
                .Where(b => userAccesses.Contains(b.Id))
                .Include(b => b.Owner)
                .Include(b => b.Elements)
                .Include(b => b.Collaborators)
                    .ThenInclude(c => c.User)
                .ToListAsync();

            // Maintain the original order
            recentBoards = userAccesses
                .Select(boardId => recentBoards.First(b => b.Id == boardId))
                .ToList();

            return recentBoards;
        }
        catch (Exception ex)
        {
            // Fallback to old behavior if UserBoardAccesses table doesn't exist yet
            var user = await _context.Users
                .Include(u => u.OwnedBoards)
                .Include(u => u.BoardCollaborations)
                    .ThenInclude(bc => bc.Board)
                .FirstOrDefaultAsync(u => u.Id == userId && u.IsActive);

            if (user == null)
            {
                return new List<Board>();
            }

            // Combine owned boards and collaboration boards, sort by most recent activity
            var ownedBoards = user.OwnedBoards?.AsEnumerable() ?? Enumerable.Empty<Board>();
            var collaborationBoards = user.BoardCollaborations?.Select(bc => bc.Board) ?? Enumerable.Empty<Board>();

            var allBoards = ownedBoards.Concat(collaborationBoards)
                .Where(b => b != null)
                .OrderByDescending(b => b.UpdatedAt)
                .Take(limit)
                .ToList();

            return allBoards;
        }
    }

    public async Task<User?> GetUserByEmailAsync(string email)
    {
        return await _context.Users
            .FirstOrDefaultAsync(u => u.Email == email && u.IsActive);
    }

}

public class UserStatistics
{
    public int OwnedBoardsCount { get; set; }
    public int CollaborationsCount { get; set; }
    public int ElementsCreatedCount { get; set; }
    public int RecentActivityCount { get; set; }
    public TimeSpan AccountAge { get; set; }
    public int LastLoginDaysAgo { get; set; }
}