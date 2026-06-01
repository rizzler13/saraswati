@echo off
:: start.bat - One-click launch for Project Saraswati local environment
echo 🚀 Starting Project Saraswati...

if not exist data mkdir data

if not exist "research\.venv" (
    echo 📦 Creating Python virtual environment...
    python -m venv research\.venv
)

echo 📦 Installing Python dependencies...
call research\.venv\Scripts\activate.bat
pip install fastapi "uvicorn[standard]" litellm langgraph langchain-core pymupdf httpx pydantic python-dotenv

echo 🟢 Starting Backend Server on http://localhost:8081...
start /B python -m uvicorn research.server:app --host 0.0.0.0 --port 8081 > data\backend.log 2>&1

if not exist "ui\node_modules" (
    echo 📦 Installing Frontend dependencies...
    cd ui
    call npm install
    cd ..
)

echo 🟢 Starting Frontend Dashboard on http://localhost:5173...
cd ui
start /B npm run dev > ..\data\frontend.log 2>&1
cd ..

echo.
echo ✅ Saraswati is running!
echo 🌐 Dashboard:    http://localhost:5173
echo 🌐 API Endpoint: http://localhost:8081
echo.
echo 📝 Logs are saved to data\backend.log and data\frontend.log
echo 📝 Close this command prompt window to stop the servers.
echo.

start http://localhost:5173
