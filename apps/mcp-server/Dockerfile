FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY apps/mcp-server/Mcp.Server.csproj apps/mcp-server/
RUN dotnet restore apps/mcp-server/Mcp.Server.csproj

COPY apps/mcp-server/ apps/mcp-server/
RUN dotnet publish apps/mcp-server/Mcp.Server.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_URLS=http://0.0.0.0:8080
EXPOSE 8080
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Mcp.Server.dll"]
