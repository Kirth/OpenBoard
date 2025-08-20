FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /app

# Copy solution and project files
COPY WhiteboardApp.sln ./
COPY src/WhiteboardApp/WhiteboardApp.csproj ./src/WhiteboardApp/

# Restore dependencies
RUN dotnet restore

# Copy source code
COPY src/ ./src/

# Build the application
RUN dotnet build src/WhiteboardApp/WhiteboardApp.csproj -c Release -o /app/build

# Publish the application
RUN dotnet publish src/WhiteboardApp/WhiteboardApp.csproj -c Release -o /app/publish

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app/publish .
EXPOSE 80
ENTRYPOINT ["dotnet", "WhiteboardApp.dll"]