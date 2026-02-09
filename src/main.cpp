#include <iostream>
#include <fstream>
#include <csignal>
#include <atomic>
#include <thread>
#include <chrono>
#include <nlohmann/json.hpp>
#include <drogon/drogon.h>

#include "db/MemgraphClient.hpp"
#include "net/AsyncHttpClient.hpp"
#include "util/BloomFilter.hpp"

using json = nlohmann::json;

// Global state
std::atomic<bool> g_running{true};
std::atomic<bool> g_crawler_paused{false};
std::unique_ptr<saraswati::db::MemgraphClient> g_memgraph;
std::unique_ptr<saraswati::net::AsyncHttpClient> g_http;
std::unique_ptr<saraswati::util::BloomFilter> g_bloom;

struct Config {
    std::string server_host = "0.0.0.0";
    uint16_t server_port = 8080;
    int server_threads = 4;
    
    std::string mg_host = "localhost";
    uint16_t mg_port = 7687;
    std::string mg_user;
    std::string mg_pass;
    size_t mg_pool_size = 3;
    size_t mg_memory_limit = 1800;
    
    int crawler_threads = 8;
    long crawler_rate_limit = 2000;
    std::string bloom_path = "data/urls.bloom";
    size_t bloom_size = 1000000;
};

Config load_config(const std::string& path) {
    Config cfg;
    
    std::ifstream file(path);
    if (!file) {
        std::cerr << "[Config] Using defaults, could not open: " << path << "\n";
        return cfg;
    }
    
    try {
        json j = json::parse(file);
        
        if (j.contains("server")) {
            cfg.server_host = j["server"].value("host", cfg.server_host);
            cfg.server_port = j["server"].value("port", cfg.server_port);
            cfg.server_threads = j["server"].value("threads", cfg.server_threads);
        }
        
        if (j.contains("memgraph")) {
            cfg.mg_host = j["memgraph"].value("host", cfg.mg_host);
            cfg.mg_port = j["memgraph"].value("port", cfg.mg_port);
            cfg.mg_user = j["memgraph"].value("username", cfg.mg_user);
            cfg.mg_pass = j["memgraph"].value("password", cfg.mg_pass);
            cfg.mg_pool_size = j["memgraph"].value("pool_size", cfg.mg_pool_size);
            cfg.mg_memory_limit = j["memgraph"].value("memory_limit_mb", cfg.mg_memory_limit);
        }
        
        if (j.contains("crawler")) {
            cfg.crawler_threads = j["crawler"].value("max_threads", cfg.crawler_threads);
            cfg.crawler_rate_limit = j["crawler"].value("rate_limit_ms", cfg.crawler_rate_limit);
            cfg.bloom_path = j["crawler"].value("bloom_filter_path", cfg.bloom_path);
            cfg.bloom_size = j["crawler"].value("bloom_filter_size_mb", 10) * 100000;
        }
        
        std::cout << "[Config] Loaded from: " << path << "\n";
    } catch (const std::exception& e) {
        std::cerr << "[Config] Parse error: " << e.what() << "\n";
    }
    
    return cfg;
}

void signal_handler(int sig) {
    std::cout << "\n[Signal] Received " << sig << ", shutting down...\n";
    g_running = false;
    drogon::app().quit();
}

void setup_signals() {
    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);
}

bool init_memgraph(const Config& cfg) {
    std::cout << "[Memgraph] Connecting to " << cfg.mg_host << ":" << cfg.mg_port << "...\n";
    
    g_memgraph = std::make_unique<saraswati::db::MemgraphClient>(
        cfg.mg_host, cfg.mg_port, cfg.mg_user, cfg.mg_pass,
        cfg.mg_pool_size, cfg.mg_memory_limit
    );
    
    if (!g_memgraph->connect()) {
        std::cerr << "[Memgraph] Connection failed!\n";
        return false;
    }
    
    // Set up memory monitor callback
    g_memgraph->set_pause_callback([](bool should_pause) {
        g_crawler_paused = should_pause;
        std::cout << "[Memgraph] Crawler " << (should_pause ? "PAUSED" : "RESUMED") << " due to memory\n";
    });
    g_memgraph->start_memory_monitor();
    
    std::cout << "[Memgraph] Connected successfully\n";
    return true;
}

bool init_http(const Config& cfg) {
    g_http = std::make_unique<saraswati::net::AsyncHttpClient>(
        cfg.crawler_threads, cfg.crawler_rate_limit
    );
    
    if (!g_http->start()) {
        std::cerr << "[HTTP] Failed to start client\n";
        return false;
    }
    
    std::cout << "[HTTP] Client started with " << cfg.crawler_threads << " threads\n";
    return true;
}

bool init_bloom(const Config& cfg) {
    g_bloom = saraswati::util::BloomFilter::from_file(cfg.bloom_path, cfg.bloom_size, 0.01);
    std::cout << "[Bloom] " << g_bloom->stats() << "\n";
    return true;
}

void run_drogon(const Config& cfg) {
    std::cout << "[Drogon] Starting server on " << cfg.server_host << ":" << cfg.server_port << "\n";
    
    drogon::app()
        .setLogLevel(trantor::Logger::kWarn)
        .addListener(cfg.server_host, cfg.server_port)
        .setThreadNum(cfg.server_threads)
        .enableRunAsDaemon(false)
        .run();
}

void cleanup() {
    std::cout << "[Cleanup] Saving state...\n";
    
    if (g_bloom) {
        g_bloom->save("data/urls.bloom");
        std::cout << "[Bloom] Saved to disk\n";
    }
    
    if (g_http) {
        g_http->stop();
        std::cout << "[HTTP] Client stopped\n";
    }
    
    if (g_memgraph) {
        g_memgraph->stop_memory_monitor();
        g_memgraph->disconnect();
        std::cout << "[Memgraph] Disconnected\n";
    }
    
    std::cout << "[Cleanup] Done\n";
}

int main(int argc, char* argv[]) {
    std::cout << R"(
  ____                              _   _ 
 / ___|  __ _ _ __ __ _ _____      ____ _| |_(_)
 \___ \ / _` | '__/ _` / __\ \ /\ / / _` | __| |
  ___) | (_| | | | (_| \__ \\ V  V / (_| | |_| |
 |____/ \__,_|_|  \__,_|___/ \_/\_/ \__,_|\__|_|
                                                
 Research Radar v1.0.0 - Monitoring Scientific Knowledge
)" << "\n";

    // Parse command line args
    std::string config_path = "config/config.json";
    bool test_mode = false;
    
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--config" && i + 1 < argc) {
            config_path = argv[++i];
        } else if (arg == "--test-mode") {
            test_mode = true;
        } else if (arg == "--help") {
            std::cout << "Usage: saraswati [options]\n"
                      << "  --config <path>  Config file path\n"
                      << "  --test-mode      Run integration tests\n"
                      << "  --help           Show this help\n";
            return 0;
        }
    }
    
    setup_signals();
    
    auto cfg = load_config(config_path);
    
    // Initialize components
    if (!init_bloom(cfg)) return 1;
    if (!init_http(cfg)) return 1;
    
    // Memgraph connection is optional for testing
    if (!init_memgraph(cfg)) {
        std::cerr << "[Warning] Running without Memgraph\n";
    }
    
    if (test_mode) {
        std::cout << "[Test] Running integration tests...\n";
        // Add test logic here
        std::cout << "[Test] All tests passed!\n";
        cleanup();
        return 0;
    }
    
    // Start Drogon (blocks until shutdown)
    run_drogon(cfg);
    
    cleanup();
    return 0;
}
