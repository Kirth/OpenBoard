using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using WhiteboardApp.Services;

namespace WhiteboardApp.Controllers;

[Route("[controller]")]
public class AccountController : Controller
{
    private readonly IUserService _userService;
    private readonly ILogger<AccountController> _logger;

    public AccountController(IUserService userService, ILogger<AccountController> logger)
    {
        _userService = userService;
        _logger = logger;
    }

    [HttpGet("Login")]
    public IActionResult Login(string? returnUrl = null)
    {
        // If user is already authenticated, redirect to return URL or home
        if (User.Identity?.IsAuthenticated == true)
        {
            return Redirect(returnUrl ?? "/");
        }

        // Store the return URL in the authentication properties
        var properties = new AuthenticationProperties
        {
            RedirectUri = returnUrl ?? "/",
        };

        // Challenge with OIDC to start the authentication flow
        return Challenge(properties, OpenIdConnectDefaults.AuthenticationScheme);
    }

    [HttpGet("Logout")]
    [HttpPost("Logout")]
    public async Task<IActionResult> Logout(string? returnUrl = null)
    {
        if (User.Identity?.IsAuthenticated == true)
        {
            _logger.LogInformation("User {UserId} logging out", User.Identity.Name);

            // Sign out from both the local cookie and OIDC
            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            await HttpContext.SignOutAsync(OpenIdConnectDefaults.AuthenticationScheme);
        }

        // Redirect to home page or specified return URL
        return Redirect(returnUrl ?? "/");
    }

    [HttpGet("Profile")]
    [Authorize]
    public async Task<IActionResult> Profile()
    {
        try
        {
            var user = await _userService.GetOrCreateUserAsync(User);
            return Json(new
            {
                Id = user.Id,
                Email = user.Email,
                Name = user.Name,
                DisplayName = user.DisplayName,
                Username = user.Username,
                IsAuthenticated = true
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting user profile");
            return Json(new { IsAuthenticated = false });
        }
    }

    [HttpGet("AccessDenied")]
    public IActionResult AccessDenied()
    {
        return View();
    }
}