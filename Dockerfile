FROM python:3.11-slim

WORKDIR /app

# Install system dependencies if any are needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy dependencies list and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy Python codebase
COPY research/ ./research/

# Expose port (Render sets $PORT dynamically, but EXPOSE is good practice)
EXPOSE 8080

# Run FastAPI via uvicorn, reading $PORT environment variable set by Render, default to 8080
CMD ["sh", "-c", "python -m uvicorn research.server:app --host 0.0.0.0 --port ${PORT:-8080}"]
