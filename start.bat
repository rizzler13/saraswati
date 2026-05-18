@echo off
:: start.bat - One-click launch for Project Saraswati Dashboard
echo 🚀 Starting Project Saraswati...
echo 📦 Building and launching Docker containers...

:: Launch the docker compose stack in detached mode
docker compose up --build -d

echo.
echo ✅ Backend ^& Database are spinning up in the background.
echo ✅ Frontend should be available shortly.
echo.
echo 🌐 Dashboard:    http://localhost:5173
echo 🌐 API Endpoint: http://localhost:8080
echo 🌐 Memgraph Lab: http://localhost:3000
echo.
echo 📝 To view live backend logs, run: docker compose logs -f backend
echo 🛑 To stop the project, run:       docker compose down

:: Automatically open the browser
start http://localhost:5173
