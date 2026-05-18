# Stage 1: Build environment
FROM ubuntu:22.04 AS builder

# Prevent tzdata prompts
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    cmake \
    ninja-build \
    git \
    curl \
    pkg-config \
    zip \
    unzip \
    tar \
    libssl-dev \
    uuid-dev \
    zlib1g-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install vcpkg for dependencies (drogon, curl, nlohmann-json, openssl, gumbo)
WORKDIR /opt
RUN git clone https://github.com/microsoft/vcpkg.git
WORKDIR /opt/vcpkg
RUN ./bootstrap-vcpkg.sh
ENV VCPKG_ROOT=/opt/vcpkg

# Install mgclient (Memgraph C Client)
WORKDIR /tmp
RUN git clone https://github.com/memgraph/mgclient.git \
    && cd mgclient \
    && mkdir build \
    && cd build \
    && cmake .. \
    && make -j$(nproc) \
    && make install

# Copy application source
WORKDIR /app
COPY . .

ENV CC=gcc
ENV CXX=g++

# Build saraswati backend via vcpkg toolchain
RUN mkdir build && cd build && \
    cmake .. -G Ninja \
    -DCMAKE_TOOLCHAIN_FILE="/opt/vcpkg/scripts/buildsystems/vcpkg.cmake" \
    -DCMAKE_BUILD_TYPE=Release \
    && ninja

# Collect all mgclient shared libraries to a known location
RUN mkdir -p /export-libs && find /usr/lib /usr/local/lib -name "libmgclient.so*" -exec cp -a {} /export-libs/ \;

# Stage 2: Runtime environment
FROM ubuntu:22.04

# Prevent tzdata prompts
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

RUN apt-get update && apt-get install -y --no-install-recommends \
    libssl3 \
    libuuid1 \
    zlib1g \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy built binary and memgraph client libraries
COPY --from=builder /app/build/saraswati /usr/local/bin/saraswati
COPY --from=builder /export-libs/* /usr/local/lib/
COPY --from=builder /app/config/config.example.json /etc/saraswati/config.json

# Update library cache for libmgclient
RUN ldconfig

WORKDIR /usr/local/bin
EXPOSE 8080

CMD ["saraswati", "--config", "/etc/saraswati/config.json"]
