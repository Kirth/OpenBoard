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
        
        _logger.LogDebug("Stored board sessions cache with type {Type} for board {BoardId}", 
            boardSessions.GetType().Name, boardId);

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
        _logger.LogDebug("Getting board sessions for board {BoardId}", boardId);
        
        var boardSessions = GetBoardSessionsFromCache(boardId);
        
        _logger.LogDebug("Retrieved {TotalSessions} sessions from cache for board {BoardId}", 
            boardSessions.Count, boardId);
        
        // Filter out expired sessions
        var activeSessions = boardSessions.Values
            .Where(s => s.IsActive && DateTime.UtcNow - s.JoinedAt < TimeSpan.FromMinutes(SessionExpirationMinutes))
            .ToList();

        _logger.LogDebug("Found {ActiveSessions} active sessions after filtering for board {BoardId}", 
            activeSessions.Count, boardId);

        // Clean up expired sessions from cache
        if (activeSessions.Count != boardSessions.Count)
        {
            var expiredCount = boardSessions.Count - activeSessions.Count;
            _logger.LogInformation("Cleaned up {ExpiredCount} expired sessions for board {BoardId}", 
                expiredCount, boardId);
                
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

    public async Task UpdateSelectionAsync(string connectionId, string[] elementIds)
    {
        var session = await GetSessionAsync(connectionId);
        if (session != null)
        {
            session.SelectedElementIds = elementIds?.ToList() ?? new List<string>();
            session.LastSelectionUpdate = DateTime.UtcNow;
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

            _logger.LogDebug("Updated selection for user {UserName}: {ElementCount} elements", 
                session.UserName, session.SelectedElementIds.Count);
        }
    }

    public async Task ClearSelectionAsync(string connectionId)
    {
        await UpdateSelectionAsync(connectionId, Array.Empty<string>());
    }

    public async Task<IEnumerable<UserSession>> GetBoardSessionsWithSelectionsAsync(Guid boardId)
    {
        var sessions = await GetBoardSessionsAsync(boardId);
        return sessions.Where(s => s.SelectedElementIds.Any()).ToList();
    }

    private string GetSessionKey(string connectionId) => $"{SessionKeyPrefix}{connectionId}";
    
    private string GetBoardSessionsKey(Guid boardId) => $"{BoardSessionsKey}{boardId}";

    private ConcurrentDictionary<string, UserSession> GetBoardSessionsFromCache(Guid boardId)
    {
        var boardSessionsKey = GetBoardSessionsKey(boardId);
        var cached = _cache.Get(boardSessionsKey);
        
        if (cached == null)
        {
            var newDict = new ConcurrentDictionary<string, UserSession>();
            _cache.Set(boardSessionsKey, newDict, TimeSpan.FromMinutes(SessionExpirationMinutes));
            return newDict;
        }
        
        // Handle both Dictionary and ConcurrentDictionary types
        if (cached is ConcurrentDictionary<string, UserSession> concurrentDict)
        {
            return concurrentDict;
        }
        else if (cached is Dictionary<string, UserSession> regularDict)
        {
            // Convert Dictionary to ConcurrentDictionary
            var newConcurrentDict = new ConcurrentDictionary<string, UserSession>(regularDict);
            _cache.Set(boardSessionsKey, newConcurrentDict, TimeSpan.FromMinutes(SessionExpirationMinutes));
            return newConcurrentDict;
        }
        else if (cached is IDictionary<string, UserSession> genericDict)
        {
            // Handle any other IDictionary implementation
            var newConcurrentDict = new ConcurrentDictionary<string, UserSession>(genericDict);
            _cache.Set(boardSessionsKey, newConcurrentDict, TimeSpan.FromMinutes(SessionExpirationMinutes));
            return newConcurrentDict;
        }
        
        _logger.LogWarning("Unexpected type in cache for board sessions: {Type}. Creating new ConcurrentDictionary.", cached.GetType().Name);
        var fallbackDict = new ConcurrentDictionary<string, UserSession>();
        _cache.Set(boardSessionsKey, fallbackDict, TimeSpan.FromMinutes(SessionExpirationMinutes));
        return fallbackDict;
    }
}