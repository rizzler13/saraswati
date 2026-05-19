# Build & Run: Project Saraswati

## Prerequisites (macOS M1)

### 1. Install Homebrew Dependencies

```bash
# Core build tools
brew install cmake ninja

# Required libraries
brew install curl openssl@3 nlohmann-json

# Gumbo HTML parser
brew install gumbo-parser

# Drogon web framework
brew install drogon
```

### 2. Install mgclient (Memgraph C Client)

```bash
git clone https://github.com/memgraph/mgclient.git
cd mgclient
mkdir build && cd build
cmake .. -DCMAKE_INSTALL_PREFIX=/opt/homebrew
make -j$(sysctl -n hw.ncpu)
sudo make install
```

### 3. Install Frontend Dependencies

```bash
cd frontend
npm install
```

---

## Quick Start (3 steps)

```bash
# 1. Database
docker compose up -d

# 2. Backend  (port 8080)
cd build && ninja && ./saraswati --config ../config/config.example.json

# 3. Frontend (port 5173, in a new terminal)
cd frontend && npm run dev
```



---

## Full Commands

### Build Backend

```bash
mkdir -p build && cd build
cmake .. -G Ninja \
    -DCMAKE_BUILD_TYPE=Release \
    -DOPENSSL_ROOT_DIR=/opt/homebrew/opt/openssl@3
ninja
```

### Start Memgraph

```bash
docker compose up -d

# Verify
docker ps --filter name=saraswati

# Initialize schema (first time only)
cat db/schema.cypher | docker exec -i saraswati-db mgconsole
```

### Run Backend

```bash
cd build
./saraswati --config ../config/config.example.json
```

### Run Frontend

```bash
cd frontend
npm run dev
```

### Stop Everything

```bash
pkill -f './saraswati'      # backend
pkill -f 'vite'             # frontend
docker compose down         # database
```

---

## Agent Workflows

If you're using the Gemini agent, these slash commands are available:

| Command | What it does |
|---|---|
| `/start` | Start full stack (DB → Backend → Frontend) |
| `/build` | Build C++ backend with CMake + Ninja |
| `/rebuild` | Rebuild + restart backend |
| `/stop` | Stop all services |

---

## Debug Build

```bash
cd build
cmake .. -G Ninja -DCMAKE_BUILD_TYPE=Debug
ninja
```

---

## Memory Verification

```bash
# Watch Memgraph memory
docker stats saraswati-db --no-stream

# Expected limits:
# - Memgraph container: < 2GB
# - saraswati process:  < 500MB
# - Total system:       < 4GB (leaving 4GB for OS)
```

---

## Troubleshooting

### mgclient not found
```bash
ls /opt/homebrew/lib/libmgclient*
cmake .. -DMGCLIENT_LIBRARY=/opt/homebrew/lib/libmgclient.dylib \
         -DMGCLIENT_INCLUDE_DIR=/opt/homebrew/include
```

### Drogon not found
```bash
export PKG_CONFIG_PATH="/opt/homebrew/lib/pkgconfig:$PKG_CONFIG_PATH"
```

### OpenSSL version conflict
```bash
cmake .. -DOPENSSL_ROOT_DIR=/opt/homebrew/opt/openssl@3
```

### Port already in use
```bash
lsof -i :8080    # find what's on the backend port
lsof -i :5173    # find what's on the frontend port
```
