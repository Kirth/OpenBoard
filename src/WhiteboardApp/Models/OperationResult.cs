namespace WhiteboardApp.Models;

/// <summary>
/// Result of a SignalR hub operation, including success status, error messages, and optional data
/// </summary>
public class OperationResult
{
    /// <summary>
    /// Whether the operation succeeded
    /// </summary>
    public bool Success { get; set; }

    /// <summary>
    /// Error message if operation failed
    /// </summary>
    public string? Error { get; set; }

    /// <summary>
    /// Optional data returned by the operation (e.g., new element ID)
    /// </summary>
    public object? Data { get; set; }

    /// <summary>
    /// Create a successful operation result
    /// </summary>
    public static OperationResult Ok(object? data = null)
    {
        return new OperationResult
        {
            Success = true,
            Data = data
        };
    }

    /// <summary>
    /// Create a failed operation result
    /// </summary>
    public static OperationResult Failure(string error)
    {
        return new OperationResult
        {
            Success = false,
            Error = error
        };
    }
}
