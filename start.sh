#!/usr/bin/env bash
# start.sh - One-click launch for Project Saraswati local environment

echo "🚀 Starting Project Saraswati..."

# Create data directory if not exists
mkdir -p data

# Check if python virtualenv exists
if [ ! -d "research/.venv" ]; then
    echo "📦 Creating Python virtual environment..."
    python3 -m venv research/.venv
fi

# Activate virtualenv and install dependencies
echo "📦 Installing Python dependencies..."
source research/.venv/bin/activate
pip install fastapi "uvicorn[standard]" litellm langgraph langchain-core pymupdf httpx pydantic python-dotenv

# Run backend server in background
echo "🟢 Starting Backend Server on http://localhost:8081..."
python -m uvicorn research.server:app --host 0.0.0.0 --port 8081 > data/backend.log 2>&1 &
BACKEND_PID=$!

# Install ui dependencies if needed
if [ ! -d "ui/node_modules" ]; then
    echo "📦 Installing Frontend dependencies..."
    cd ui && npm install && cd ..
fi

# Run frontend in background
echo "🟢 Starting Frontend Dashboard on http://localhost:5173..."
cd ui && npm run dev > ../data/frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

# Cleanup function to kill background processes on exit
cleanup() {
    echo ""
    echo "🛑 Stopping servers..."
    kill $BACKEND_PID
    kill $FRONTEND_PID
    exit
}

trap cleanup SIGINT SIGTERM

echo ""
echo "✅ Saraswati is running!"
echo "🌐 Dashboard:    http://localhost:5173"
echo "🌐 API Endpoint: http://localhost:8081"
echo ""
echo "📝 Logs are saved to data/backend.log and data/frontend.log"
echo "📝 Press Ctrl+C to stop all servers."
echo ""

# Automatically try to open the browser if on macOS or Linux
if command -v open > /dev/null; then
    open http://localhost:5173
elif command -v xdg-open > /dev/null; then
    xdg-open http://localhost:5173
fi

# Keep script running to hold PIDs and allow clean Ctrl+C
wait
