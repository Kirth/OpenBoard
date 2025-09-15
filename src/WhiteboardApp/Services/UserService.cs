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
    Task<User> UpdateUserAsync(User user);
    Task UpdateLastLoginAsync(Guid userId);
    Task<bool> HasBoardAccessAsync(Guid userId, Guid boardId, BoardRole minimumRole = BoardRole.Viewer);
    Task<BoardRole?> GetUserBoardRoleAsync(Guid userId, Guid boardId);
    Task<User> GetAnonymousUserAsync();
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
            case BoardAccessLevel.LinkSharing:
                return BoardRole.Collaborator; // Default role for public/link sharing
            case BoardAccessLevel.Private:
            default:
                return null; // No access
        }
    }

    public async Task<User> GetAnonymousUserAsync()
    {
        const string anonymousSubjectId = "anonymous-user";
        
        var anonymousUser = await GetUserBySubjectIdAsync(anonymousSubjectId);
        if (anonymousUser == null)
        {
            // Create the anonymous user
            anonymousUser = new User
            {
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
}