#!/usr/bin/env bash
# start.sh - One-click launch for Project Saraswati Dashboard

echo "🚀 Starting Project Saraswati..."
echo "📦 Building and launching Docker containers..."

# Launch the docker compose stack in detached mode
docker compose up --build -d

echo ""
echo "✅ Backend & Database are spinning up in the background."
echo "✅ Frontend should be available shortly."
echo ""
echo "🌐 Dashboard:    http://localhost:5173"
echo "🌐 API Endpoint: http://localhost:8080"
echo "🌐 Memgraph Lab: http://localhost:3000"
echo ""
echo "📝 To view live backend logs, run: docker compose logs -f backend"
echo "🛑 To stop the project, run:       docker compose down"

# Automatically try to open the browser if on macOS or Linux
if command -v open > /dev/null; then
    open http://localhost:5173
elif command -v xdg-open > /dev/null; then
    xdg-open http://localhost:5173
fi
