using WhiteboardApp.Models;

namespace WhiteboardApp.Services;

public interface IUserSessionManager
{
    Task<UserSession> CreateSessionAsync(string connectionId, Guid boardId, string userName);
    Task<UserSession?> GetSessionAsync(string connectionId);
    Task<IEnumerable<UserSession>> GetBoardSessionsAsync(Guid boardId);
    Task UpdateCursorPositionAsync(string connectionId, double x, double y);
    Task RemoveSessionAsync(string connectionId);
    Task<bool> IsUserInBoardAsync(string connectionId, Guid boardId);
}