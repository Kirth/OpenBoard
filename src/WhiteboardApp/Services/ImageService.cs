using Microsoft.AspNetCore.Hosting;
using SixLabors.ImageSharp;

namespace WhiteboardApp.Services;

public class ImageService
{
    private readonly IWebHostEnvironment _environment;
    private readonly string _uploadsPath;

    public ImageService(IWebHostEnvironment environment)
    {
        _environment = environment;
        _uploadsPath = Path.Combine(_environment.WebRootPath, "uploads");
        
        // Ensure uploads directory exists
        if (!Directory.Exists(_uploadsPath))
        {
            Directory.CreateDirectory(_uploadsPath);
        }
    }

    public async Task<string> SaveImageAsync(IFormFile file)
    {
        if (file == null || file.Length == 0)
            throw new ArgumentException("No file provided");

        // Validate file type
        var allowedTypes = new[] { "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp" };
        if (!allowedTypes.Contains(file.ContentType.ToLower()))
            throw new ArgumentException("Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.");

        // Validate file size (10MB max)
        if (file.Length > 10 * 1024 * 1024)
            throw new ArgumentException("File size too large. Maximum size is 10MB.");

        // Generate unique filename
        var fileExtension = Path.GetExtension(file.FileName);
        var fileName = $"{Guid.NewGuid()}{fileExtension}";
        var filePath = Path.Combine(_uploadsPath, fileName);

        // Save file
        using (var stream = new FileStream(filePath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        // Return relative path for web access
        return $"/uploads/{fileName}";
    }

    public bool DeleteImage(string relativePath)
    {
        try
        {
            if (string.IsNullOrEmpty(relativePath) || !relativePath.StartsWith("/uploads/"))
                return false;

            var fileName = Path.GetFileName(relativePath);
            var filePath = Path.Combine(_uploadsPath, fileName);

            if (File.Exists(filePath))
            {
                File.Delete(filePath);
                return true;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error deleting image: {ex.Message}");
        }

        return false;
    }

    public async Task<(int width, int height)> GetImageDimensionsAsync(string relativePath)
    {
        try
        {
            if (string.IsNullOrEmpty(relativePath) || !relativePath.StartsWith("/uploads/"))
                return (0, 0);

            var fileName = Path.GetFileName(relativePath);
            var filePath = Path.Combine(_uploadsPath, fileName);

            if (!File.Exists(filePath))
                return (0, 0);

            using var image = await Image.LoadAsync(filePath);
            return (image.Width, image.Height);
        }
        catch
        {
            return (0, 0);
        }
    }
}