using Microsoft.JSInterop;
using WhiteboardApp.Models;

namespace WhiteboardApp.Services;

public class ExportService
{
    private readonly IJSRuntime _jsRuntime;
    private readonly BoardService _boardService;

    public ExportService(IJSRuntime jsRuntime, BoardService boardService)
    {
        _jsRuntime = jsRuntime;
        _boardService = boardService;
    }

    public async Task<string> ExportBoardAsPngAsync(Guid boardId, string filename = null)
    {
        try
        {
            // Get board info for filename if not provided
            if (string.IsNullOrEmpty(filename))
            {
                var board = await _boardService.GetBoardAsync(boardId);
                filename = $"{board?.Name ?? "Board"}_{DateTime.Now:yyyyMMdd_HHmmss}.png";
            }

            // Call JavaScript to export canvas as PNG
            var result = await _jsRuntime.InvokeAsync<string>("exportCanvasAsPng", filename);
            return result;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error exporting PNG: {ex.Message}");
            throw new Exception($"Failed to export board as PNG: {ex.Message}");
        }
    }

    public async Task<string> ExportBoardAsPdfAsync(Guid boardId, string filename = null)
    {
        try
        {
            // Get board info for filename if not provided
            if (string.IsNullOrEmpty(filename))
            {
                var board = await _boardService.GetBoardAsync(boardId);
                filename = $"{board?.Name ?? "Board"}_{DateTime.Now:yyyyMMdd_HHmmss}.pdf";
            }

            // Call JavaScript to export canvas as PDF
            var result = await _jsRuntime.InvokeAsync<string>("exportCanvasAsPdf", filename);
            return result;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error exporting PDF: {ex.Message}");
            throw new Exception($"Failed to export board as PDF: {ex.Message}");
        }
    }

    public async Task<ExportInfo> GetExportInfoAsync(Guid boardId)
    {
        try
        {
            var board = await _boardService.GetBoardAsync(boardId);
            if (board == null)
            {
                throw new ArgumentException($"Board with ID {boardId} not found.");
            }

            // Get canvas dimensions from JavaScript
            var canvasInfo = await _jsRuntime.InvokeAsync<CanvasInfo>("getCanvasInfo");

            return new ExportInfo
            {
                BoardId = boardId,
                BoardName = board.Name,
                CanvasWidth = canvasInfo.Width,
                CanvasHeight = canvasInfo.Height,
                ElementCount = board.Elements.Count,
                SuggestedFilename = $"{board.Name}_{DateTime.Now:yyyyMMdd_HHmmss}"
            };
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error getting export info: {ex.Message}");
            throw;
        }
    }
}

public class ExportInfo
{
    public Guid BoardId { get; set; }
    public string BoardName { get; set; } = string.Empty;
    public int CanvasWidth { get; set; }
    public int CanvasHeight { get; set; }
    public int ElementCount { get; set; }
    public string SuggestedFilename { get; set; } = string.Empty;
}

public class CanvasInfo
{
    public int Width { get; set; }
    public int Height { get; set; }
    public double Scale { get; set; }
}