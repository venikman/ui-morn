FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY apps/a2a-agent/A2A.Agent.csproj apps/a2a-agent/
RUN dotnet restore apps/a2a-agent/A2A.Agent.csproj

COPY apps/a2a-agent/ apps/a2a-agent/
RUN dotnet publish apps/a2a-agent/A2A.Agent.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_URLS=http://0.0.0.0:8080
EXPOSE 8080
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "A2A.Agent.dll"]
