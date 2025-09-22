using System.Security.Cryptography;
using System.Text;

namespace WhiteboardApp.Services;

/// <summary>
/// Service for managing anonymous user identification using browser fingerprinting
/// </summary>
public static class AnonymousUserService
{
    /// <summary>
    /// Anonymous user GUID prefix - ensures separation from authenticated users
    /// </summary>
    public const string AnonymousPrefix = "a0000000";
    
    /// <summary>
    /// Reserved GUID for legacy anonymous users
    /// </summary>
    public static readonly Guid LegacyAnonymousGuid = Guid.Parse("00000000-0000-0000-0000-000000000000");

    /// <summary>
    /// Generate anonymous GUID from fingerprint hash
    /// Uses first 128 bits of SHA-256 hash with a0000000 prefix
    /// </summary>
    /// <param name="fingerprint">Browser fingerprint hash (SHA-256)</param>
    /// <returns>GUID with a0000000 prefix</returns>
    public static Guid GenerateAnonymousGuid(string fingerprint)
    {
        if (string.IsNullOrEmpty(fingerprint))
        {
            throw new ArgumentException("Fingerprint cannot be null or empty", nameof(fingerprint));
        }

        // Generate SHA-256 hash of fingerprint for additional entropy
        var fingerprintBytes = SHA256.HashData(Encoding.UTF8.GetBytes(fingerprint));
        
        // Take first 16 bytes for GUID
        var guidBytes = new byte[16];
        Array.Copy(fingerprintBytes, 0, guidBytes, 0, 16);
        
        // Force a0000000 prefix to ensure anonymous user namespace
        guidBytes[0] = 0xa0;
        guidBytes[1] = 0x00;
        guidBytes[2] = 0x00;
        guidBytes[3] = 0x00;
        
        return new Guid(guidBytes);
    }

    /// <summary>
    /// Generate a random anonymous GUID for session-only use
    /// Used when fingerprinting is not available or consent is not given
    /// </summary>
    /// <returns>Random GUID with a0000000 prefix</returns>
    public static Guid GenerateSessionAnonymousGuid()
    {
        var guidBytes = Guid.NewGuid().ToByteArray();
        
        // Force a0000000 prefix
        guidBytes[0] = 0xa0;
        guidBytes[1] = 0x00;
        guidBytes[2] = 0x00;
        guidBytes[3] = 0x00;
        
        return new Guid(guidBytes);
    }

    /// <summary>
    /// Check if a GUID belongs to an anonymous user
    /// </summary>
    /// <param name="guid">GUID to check</param>
    /// <returns>True if the GUID is for an anonymous user</returns>
    public static bool IsAnonymousGuid(Guid guid)
    {
        if (guid == LegacyAnonymousGuid)
        {
            return true;
        }
        
        return guid.ToString().StartsWith(AnonymousPrefix, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Check if a GUID is the legacy anonymous user GUID
    /// </summary>
    /// <param name="guid">GUID to check</param>
    /// <returns>True if this is the legacy anonymous GUID</returns>
    public static bool IsLegacyAnonymousGuid(Guid guid)
    {
        return guid == LegacyAnonymousGuid;
    }

    /// <summary>
    /// Generate display name for anonymous user
    /// </summary>
    /// <param name="guid">Anonymous user GUID</param>
    /// <returns>Human-friendly display name</returns>
    public static string GenerateAnonymousDisplayName(Guid guid)
    {
        if (IsLegacyAnonymousGuid(guid))
        {
            return "Guest";
        }
        
        if (IsAnonymousGuid(guid))
        {
            // Use last 4 characters of GUID for unique identifier
            var guidString = guid.ToString("N");
            var suffix = guidString.Substring(guidString.Length - 4).ToUpper();
            return $"Guest-{suffix}";
        }
        
        throw new ArgumentException("GUID is not an anonymous user GUID", nameof(guid));
    }

    /// <summary>
    /// Validate fingerprint format
    /// </summary>
    /// <param name="fingerprint">Fingerprint to validate</param>
    /// <returns>True if fingerprint appears to be a valid SHA-256 hash</returns>
    public static bool IsValidFingerprint(string fingerprint)
    {
        if (string.IsNullOrEmpty(fingerprint))
        {
            return false;
        }
        
        // SHA-256 hash should be 64 hex characters
        if (fingerprint.Length != 64)
        {
            return false;
        }
        
        // Check if all characters are valid hex
        return fingerprint.All(c => char.IsDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'));
    }

    /// <summary>
    /// Get anonymous user statistics for monitoring
    /// </summary>
    /// <param name="userGuids">Collection of user GUIDs</param>
    /// <returns>Statistics about anonymous users</returns>
    public static AnonymousUserStats GetAnonymousUserStats(IEnumerable<Guid> userGuids)
    {
        var stats = new AnonymousUserStats();
        
        foreach (var guid in userGuids)
        {
            if (IsLegacyAnonymousGuid(guid))
            {
                stats.LegacyAnonymousUsers++;
            }
            else if (IsAnonymousGuid(guid))
            {
                stats.FingerprintAnonymousUsers++;
            }
            else
            {
                stats.AuthenticatedUsers++;
            }
        }
        
        return stats;
    }
}

/// <summary>
/// Statistics about anonymous user distribution
/// </summary>
public class AnonymousUserStats
{
    public int LegacyAnonymousUsers { get; set; }
    public int FingerprintAnonymousUsers { get; set; }
    public int AuthenticatedUsers { get; set; }
    
    public int TotalAnonymousUsers => LegacyAnonymousUsers + FingerprintAnonymousUsers;
    public int TotalUsers => LegacyAnonymousUsers + FingerprintAnonymousUsers + AuthenticatedUsers;
    
    public double AnonymousUserPercentage => TotalUsers > 0 ? (double)TotalAnonymousUsers / TotalUsers * 100 : 0;
}