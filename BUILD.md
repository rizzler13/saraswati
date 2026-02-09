# Build Instructions for Project Saraswati

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
# Clone and build mgclient
git clone https://github.com/memgraph/mgclient.git
cd mgclient
mkdir build && cd build
cmake .. -DCMAKE_INSTALL_PREFIX=/opt/homebrew
make -j$(sysctl -n hw.ncpu)
sudo make install
```

### 3. Start Memgraph

```bash
# From project root
docker compose up -d

# Verify it's running
docker ps | grep memgraph

# Initialize schema (first time only)
cat db/schema.cypher | docker exec -i saraswati-memgraph mgconsole
```

---

## Build the Backend

```bash
# Create build directory
mkdir -p build && cd build

# Configure with CMake
cmake .. -G Ninja \
    -DCMAKE_BUILD_TYPE=Release \
    -DOPENSSL_ROOT_DIR=/opt/homebrew/opt/openssl@3

# Build
ninja

# Run
./saraswati --config ../config/config.json
```

### Debug Build

```bash
cmake .. -G Ninja -DCMAKE_BUILD_TYPE=Debug
ninja
```

### With Tests

```bash
cmake .. -G Ninja -DBUILD_TESTS=ON
ninja
ctest --output-on-failure
```

---

## Build the Frontend

```bash
cd frontend

# Install dependencies
npm install

# Development server
npm run dev

# Production build
npm run build
```

---

## Memory Verification

Monitor RAM usage during operation:

```bash
# Terminal 1: Watch system memory
htop

# Terminal 2: Watch Memgraph specifically
docker stats saraswati-memgraph --no-stream

# Expected limits:
# - Memgraph container: < 2GB
# - saraswati process: < 500MB
# - Total system: < 4GB (leaving 4GB for OS)
```

---

## Troubleshooting

### mgclient not found
```bash
# Check if installed
ls /opt/homebrew/lib/libmgclient*

# Add to CMake manually if needed
cmake .. -DMGCLIENT_LIBRARY=/opt/homebrew/lib/libmgclient.dylib \
         -DMGCLIENT_INCLUDE_DIR=/opt/homebrew/include
```

### Drogon not found
```bash
# Ensure pkg-config can find it
export PKG_CONFIG_PATH="/opt/homebrew/lib/pkgconfig:$PKG_CONFIG_PATH"
```

### OpenSSL version conflict
```bash
# Force Homebrew's OpenSSL
cmake .. -DOPENSSL_ROOT_DIR=/opt/homebrew/opt/openssl@3
```
