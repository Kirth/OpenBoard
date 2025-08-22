using Microsoft.Extensions.Caching.Memory;
using WhiteboardApp.Models;
using System.Collections.Concurrent;

namespace WhiteboardApp.Services;

public class UserSessionManager : IUserSessionManager
{
    private readonly IMemoryCache _cache;
    private readonly ILogger<UserSessionManager> _logger;
    private const string SessionKeyPrefix = "user_session_";
    private const string BoardSessionsKey = "board_sessions_";
    private const int SessionExpirationMinutes = 60;

    public UserSessionManager(IMemoryCache cache, ILogger<UserSessionManager> logger)
    {
        _cache = cache;
        _logger = logger;
    }

    public async Task<UserSession> CreateSessionAsync(string connectionId, Guid boardId, string userName)
    {
        var session = new UserSession
        {
            ConnectionId = connectionId,
            BoardId = boardId,
            UserName = userName,
            CursorX = 0,
            CursorY = 0,
            IsActive = true,
            JoinedAt = DateTime.UtcNow
        };

        var sessionKey = GetSessionKey(connectionId);
        var boardSessionsKey = GetBoardSessionsKey(boardId);

        // Store individual session
        _cache.Set(sessionKey, session, TimeSpan.FromMinutes(SessionExpirationMinutes));

        // Update board sessions list
        var boardSessions = GetBoardSessionsFromCache(boardId);
        boardSessions[connectionId] = session;
        _cache.Set(boardSessionsKey, boardSessions, TimeSpan.FromMinutes(SessionExpirationMinutes));

        _logger.LogInformation("Created session for user {UserName} in board {BoardId}", userName, boardId);
        
        return session;
    }

    public async Task<UserSession?> GetSessionAsync(string connectionId)
    {
        var sessionKey = GetSessionKey(connectionId);
        return _cache.Get<UserSession>(sessionKey);
    }

    public async Task<IEnumerable<UserSession>> GetBoardSessionsAsync(Guid boardId)
    {
        var boardSessions = GetBoardSessionsFromCache(boardId);
        
        // Filter out expired sessions
        var activeSessions = boardSessions.Values
            .Where(s => s.IsActive && DateTime.UtcNow - s.JoinedAt < TimeSpan.FromMinutes(SessionExpirationMinutes))
            .ToList();

        // Clean up expired sessions from cache
        if (activeSessions.Count != boardSessions.Count)
        {
            var cleanedSessions = activeSessions.ToDictionary(s => s.ConnectionId, s => s);
            var boardSessionsKey = GetBoardSessionsKey(boardId);
            _cache.Set(boardSessionsKey, cleanedSessions, TimeSpan.FromMinutes(SessionExpirationMinutes));
        }

        return activeSessions;
    }

    public async Task UpdateCursorPositionAsync(string connectionId, double x, double y)
    {
        var session = await GetSessionAsync(connectionId);
        if (session != null)
        {
            session.CursorX = x;
            session.CursorY = y;
            session.LastActivity = DateTime.UtcNow;

            // Update both individual session and board sessions
            var sessionKey = GetSessionKey(connectionId);
            _cache.Set(sessionKey, session, TimeSpan.FromMinutes(SessionExpirationMinutes));

            var boardSessions = GetBoardSessionsFromCache(session.BoardId);
            if (boardSessions.ContainsKey(connectionId))
            {
                boardSessions[connectionId] = session;
                var boardSessionsKey = GetBoardSessionsKey(session.BoardId);
                _cache.Set(boardSessionsKey, boardSessions, TimeSpan.FromMinutes(SessionExpirationMinutes));
            }
        }
    }

    public async Task RemoveSessionAsync(string connectionId)
    {
        var session = await GetSessionAsync(connectionId);
        if (session != null)
        {
            var sessionKey = GetSessionKey(connectionId);
            var boardSessionsKey = GetBoardSessionsKey(session.BoardId);

            // Remove from individual cache
            _cache.Remove(sessionKey);

            // Remove from board sessions
            var boardSessions = GetBoardSessionsFromCache(session.BoardId);
            boardSessions.Remove(connectionId, out _);
            _cache.Set(boardSessionsKey, boardSessions, TimeSpan.FromMinutes(SessionExpirationMinutes));

            _logger.LogInformation("Removed session for user {UserName} from board {BoardId}", 
                session.UserName, session.BoardId);
        }
    }

    public async Task<bool> IsUserInBoardAsync(string connectionId, Guid boardId)
    {
        var session = await GetSessionAsync(connectionId);
        return session?.BoardId == boardId && session.IsActive;
    }

    private string GetSessionKey(string connectionId) => $"{SessionKeyPrefix}{connectionId}";
    
    private string GetBoardSessionsKey(Guid boardId) => $"{BoardSessionsKey}{boardId}";

    private ConcurrentDictionary<string, UserSession> GetBoardSessionsFromCache(Guid boardId)
    {
        var boardSessionsKey = GetBoardSessionsKey(boardId);
        return _cache.GetOrCreate(boardSessionsKey, _ => new ConcurrentDictionary<string, UserSession>()) 
               ?? new ConcurrentDictionary<string, UserSession>();
    }
}