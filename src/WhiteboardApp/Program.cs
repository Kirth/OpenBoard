using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.AspNetCore.Components.Server.Circuits;
using Microsoft.AspNetCore.Components.Server;
using Microsoft.EntityFrameworkCore;
using WhiteboardApp.Data;
using WhiteboardApp.Hubs;
using WhiteboardApp.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container
builder.Services.AddRazorPages();
builder.Services.AddServerSideBlazor();
builder.Services.AddControllers();

// Add HttpClient for Blazor components
builder.Services.AddHttpClient();

// Add Blazor authentication support  
builder.Services.AddScoped<AuthenticationStateProvider, ServerAuthenticationStateProvider>();

// Add Entity Framework
builder.Services.AddDbContext<WhiteboardContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

// Add application services
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<BoardService>();
builder.Services.AddScoped<ElementService>();
builder.Services.AddScoped<ImageService>();
builder.Services.AddScoped<ExportService>();
builder.Services.AddSingleton<IUserSessionManager, UserSessionManager>();

// Add memory cache for session management
builder.Services.AddMemoryCache();

// Add authentication and authorization
builder.Services.AddAuthentication(options =>
{
    options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = OpenIdConnectDefaults.AuthenticationScheme;
})
.AddCookie(CookieAuthenticationDefaults.AuthenticationScheme, options =>
{
    options.LoginPath = "/Account/Login";
    options.LogoutPath = "/Account/Logout";
    options.SlidingExpiration = true;
    options.ExpireTimeSpan = TimeSpan.FromHours(8);
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
        ? CookieSecurePolicy.SameAsRequest
        : CookieSecurePolicy.Always;
    options.Cookie.SameSite = SameSiteMode.Lax;
})
.AddOpenIdConnect(OpenIdConnectDefaults.AuthenticationScheme, options =>
{
    // Configuration from appsettings.json
    options.Authority = builder.Configuration["Authentication:Oidc:Authority"];
    options.ClientId = builder.Configuration["Authentication:Oidc:ClientId"];
    options.ClientSecret = builder.Configuration["Authentication:Oidc:ClientSecret"];
    options.ResponseType = "code";
    options.SaveTokens = true;
    options.GetClaimsFromUserInfoEndpoint = true;
    options.UseTokenLifetime = false;
    options.RequireHttpsMetadata = !builder.Environment.IsDevelopment();
    options.SignedOutRedirectUri = "/";
    options.RemoteSignOutPath = "/signout-oidc";

    // Override metadata address to use Docker internal hostname for configuration retrieval
    // while keeping issuer as localhost:5556 for browser redirects
    options.MetadataAddress = $"{builder.Configuration["Authentication:Oidc:Authority"]}/.well-known/openid-configuration";

    // Handle issuer validation - Dex returns localhost:5556 but we fetch from dex:5556
    /*options.TokenValidationParameters = new Microsoft.IdentityModel.Tokens.TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidIssuer = "http://localhost:5556", // Accept the issuer that Dex claims to be
        ValidateAudience = true,
        ValidAudience = builder.Configuration["Authentication:Oidc:ClientId"],
        ValidateLifetime = true,
        ClockSkew = TimeSpan.FromMinutes(5)

    };
    */

    // Configure events to handle browser redirects
    options.Events = new Microsoft.AspNetCore.Authentication.OpenIdConnect.OpenIdConnectEvents
    {
        OnRedirectToIdentityProvider = context =>
        {
            // Replace dex:5556 with localhost:5556 in ALL protocol message URLs for browser access
            if (context.ProtocolMessage.IssuerAddress != null)
                context.ProtocolMessage.IssuerAddress = context.ProtocolMessage.IssuerAddress.Replace("dex:5556", "localhost:5556");
            
            if (context.ProtocolMessage.AuthorizationEndpoint != null)
                context.ProtocolMessage.AuthorizationEndpoint = context.ProtocolMessage.AuthorizationEndpoint.Replace("dex:5556", "localhost:5556");
            
            return Task.CompletedTask;
        },
        OnRedirectToIdentityProviderForSignOut = context =>
        {
            // Handle logout redirects similarly - replace dex hostname with localhost for browser access
            if (!string.IsNullOrEmpty(context.Request.Scheme) && !string.IsNullOrEmpty(context.Request.Host.Value))
            {
                // Set the post logout redirect URI to point back to the application
                var postLogoutUri = $"{context.Request.Scheme}://{context.Request.Host}/";
                context.ProtocolMessage.PostLogoutRedirectUri = postLogoutUri;
            }
            
            return Task.CompletedTask;
        }
    };
    // Claims will be mapped automatically from the userinfo endpoint

    // Configure scopes
    options.Scope.Clear();
    options.Scope.Add("openid");
    options.Scope.Add("profile");
    options.Scope.Add("email");
    options.Scope.Add("groups");
});

builder.Services.AddAuthorization(options =>
{
    // No fallback policy - authentication is optional
    // Individual controllers/actions will specify [Authorize] as needed

    // Board admin policy (requires authentication)
    options.AddPolicy("BoardAdmin", policy =>
        policy.RequireAuthenticatedUser()
              .RequireClaim("groups", "board-admins"));

    // Board collaborator policy (requires authentication for private boards)
    options.AddPolicy("BoardCollaborator", policy =>
        policy.RequireAuthenticatedUser());

    // Public board policy (allows anonymous access)
    options.AddPolicy("PublicBoard", policy =>
        policy.RequireAssertion(context => true)); // Always allow
});

// Configure SignalR to require authentication
builder.Services.AddSignalR(options =>
{
    // Configure larger message size limits to handle image data
    options.MaximumReceiveMessageSize = 10 * 1024 * 1024; // 10MB
    options.StreamBufferCapacity = 100;
    options.EnableDetailedErrors = true; // For debugging
    options.KeepAliveInterval = TimeSpan.FromSeconds(15);
    options.ClientTimeoutInterval = TimeSpan.FromSeconds(60);
}).AddHubOptions<CollaborationHub>(options =>
{
    options.EnableDetailedErrors = true;
});

// Enable detailed errors for development
if (builder.Environment.IsDevelopment())
{
    builder.Services.Configure<CircuitOptions>(options =>
    {
        options.DetailedErrors = true;
    });
}

var app = builder.Build();

// Configure the HTTP request pipeline
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();

// Add authentication and authorization middleware
app.UseAuthentication();
app.UseAuthorization();

app.MapRazorPages();
app.MapBlazorHub();
app.MapHub<CollaborationHub>("/collaborationhub");
app.MapControllers();
app.MapFallbackToPage("/_Host");

// Ensure database is created
using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<WhiteboardContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();

    try
    {
        // Ensure the database schema exists
        await context.Database.EnsureCreatedAsync();

        // Create anonymous user if it doesn't exist
        if (!await context.Users.AnyAsync(u => u.SubjectId == "anonymous-user"))
        {
            var anonymousUser = new WhiteboardApp.Models.User
            {
                Id = Guid.Parse("00000000-0000-0000-0000-000000000000"),
                SubjectId = "anonymous-user",
                Username = "anonymous",
                DisplayName = "Anonymous",
                CreatedAt = DateTime.UtcNow,
                LastLoginAt = DateTime.UtcNow,
                IsActive = true
            };
            context.Users.Add(anonymousUser);
            await context.SaveChangesAsync();
            logger.LogInformation("Anonymous user created");
        }

        logger.LogInformation("Database initialization completed successfully");
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Database initialization failed: {Message}", ex.Message);
        // Continue anyway - let the app handle database errors at runtime
    }
}

app.Run();
