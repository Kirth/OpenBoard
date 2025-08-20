using Microsoft.EntityFrameworkCore;
using WhiteboardApp.Data;
using WhiteboardApp.Hubs;
using WhiteboardApp.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container
builder.Services.AddRazorPages();
builder.Services.AddServerSideBlazor();
builder.Services.AddSignalR();

// Add Entity Framework
builder.Services.AddDbContext<WhiteboardContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

// Add application services
builder.Services.AddScoped<BoardService>();
builder.Services.AddScoped<ElementService>();

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

app.MapRazorPages();
app.MapBlazorHub();
app.MapFallbackToPage("/_Host");
app.MapHub<CollaborationHub>("/collaborationhub");

// Ensure database is created
using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<WhiteboardContext>();
    context.Database.EnsureCreated();
}

app.Run();