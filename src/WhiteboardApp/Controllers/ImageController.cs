using Microsoft.AspNetCore.Mvc;
using WhiteboardApp.Services;

namespace WhiteboardApp.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ImageController : ControllerBase
{
    private readonly ImageService _imageService;

    public ImageController(ImageService imageService)
    {
        _imageService = imageService;
    }

    [HttpPost("upload")]
    public async Task<IActionResult> UploadImage(IFormFile file)
    {
        try
        {
            if (file == null || file.Length == 0)
                return BadRequest("No file provided");

            var relativePath = await _imageService.SaveImageAsync(file);
            var (width, height) = await _imageService.GetImageDimensionsAsync(relativePath);

            return Ok(new
            {
                src = relativePath,
                originalWidth = width,
                originalHeight = height,
                fileName = file.FileName
            });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Image upload error: {ex.Message}");
            return StatusCode(500, "Failed to upload image");
        }
    }

    [HttpDelete("{fileName}")]
    public IActionResult DeleteImage(string fileName)
    {
        try
        {
            var relativePath = $"/uploads/{fileName}";
            var success = _imageService.DeleteImage(relativePath);
            
            if (success)
                return Ok();
            else
                return NotFound("Image not found");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Image deletion error: {ex.Message}");
            return StatusCode(500, "Failed to delete image");
        }
    }
}