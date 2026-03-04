#pragma once

#include <memory>
#include <string>
#include <vector>
#include <functional>
#include <optional>
#include <mutex>
#include <condition_variable>
#include <queue>
#include <atomic>
#include <thread>
#include <unordered_map>

#ifdef HAVE_MGCLIENT
#include <mgclient.h>
#endif

namespace saraswati::db {

// Forward declarations
struct QueryResult;
struct Node;
struct Relationship;

/**
Value type for Cypher query parameters and results
 */
class Value {
public:
    enum class Type { Null, Bool, Int, Double, String, List, Map };
    Value() : type_(Type::Null) {}
    Value(bool b) : type_(Type::Bool), bool_val_(b) {}
    Value(int64_t i) : type_(Type::Int), int_val_(i) {}
    Value(double d) : type_(Type::Double), double_val_(d) {}
    Value(const std::string& s) : type_(Type::String), string_val_(s) {}
    Value(std::string&& s) : type_(Type::String), string_val_(std::move(s)) {}
    Value(const char* s) : type_(Type::String), string_val_(s) {}
    Value(std::vector<Value> list) : type_(Type::List), list_val_(std::move(list)) {}
    Value(std::unordered_map<std::string, Value> map) : type_(Type::Map), map_val_(std::move(map)) {}
    Type type() const { return type_; }
    bool is_null() const { return type_ == Type::Null; }
    bool as_bool() const { return bool_val_; }
    int64_t as_int() const { return int_val_; }
    double as_double() const { return double_val_; }
    const std::string& as_string() const { return string_val_; }
    const std::vector<Value>& as_list() const { return list_val_; }
    const std::unordered_map<std::string, Value>& as_map() const { return map_val_; }
private:
    Type type_;
    bool bool_val_ = false;
    int64_t int_val_ = 0;
    double double_val_ = 0.0;
    std::string string_val_;
    std::vector<Value> list_val_;
    std::unordered_map<std::string, Value> map_val_;
};

/**
Represents a graph node
 */
struct Node {
    int64_t id;
    std::vector<std::string> labels;
    std::unordered_map<std::string, Value> properties;
};

/**
Represents a graph relationship
 */
struct Relationship {
    int64_t id;
    int64_t start_node_id;
    int64_t end_node_id;
    std::string type;
    std::unordered_map<std::string, Value> properties;
};

/**
Result of a Cypher query
 */
struct QueryResult {
    std::vector<std::string> columns;
    std::vector<std::vector<Value>> rows;
    int64_t rows_affected = 0;
    double execution_time_ms = 0.0;
    bool success = false;
    std::string error_message;
};

/**
Memory statistics from Memgraph
 */
struct MemoryStats {
    size_t used_bytes = 0;
    size_t allocated_bytes = 0;
    size_t peak_bytes = 0;
    double usage_percent = 0.0;
};

/**
Connection pool entry
 */
struct PooledConnection {
#ifdef HAVE_MGCLIENT
    mg_session* session = nullptr;
#else
    void* session = nullptr;
#endif
    bool in_use = false;
    std::chrono::steady_clock::time_point last_used;
};

/**
Thread-safe Memgraph client with connection pooling and memory monitoring
 * 
 * Design constraints (8GB M1 MacBook):
 * - Connection pool capped at 3 connections
 * - Memory monitoring thread checks every 5 seconds
 * - Auto-pause signal when memory exceeds threshold
 */
class MemgraphClient {
public:
    using PauseCallback = std::function<void(bool should_pause)>;
    /**
    Construct client with connection parameters
    Memgraph host (default: localhost)
    Memgraph port (default: 7687)
    Optional username
    Optional password
    Connection pool size (default: 3)
    Memory limit in MB that triggers pause (default: 1800)
     */
    explicit MemgraphClient(
        const std::string& host = "localhost",
        uint16_t port = 7687,
        const std::string& username = "",
        const std::string& password = "",
        size_t pool_size = 3,
        size_t memory_limit_mb = 1800
    );
    ~MemgraphClient();
    // Non-copyable, movable
    MemgraphClient(const MemgraphClient&) = delete;
    MemgraphClient& operator=(const MemgraphClient&) = delete;
    MemgraphClient(MemgraphClient&&) noexcept;
    MemgraphClient& operator=(MemgraphClient&&) noexcept;
    /**
    Initialize the connection pool
    true if at least one connection was established
     */
    bool connect();
    /**
    Close all connections
     */
    void disconnect();
    /**
    Check if connected
     */
    bool is_connected() const;
    /**
    Execute a Cypher query with parameters
    Cypher query string (use $param for parameters)
    Query parameters (prevents injection)
    Query result
     * 
     * Example:
     *   execute("CREATE (p:Paper {title: $title})", {{"title", "My Paper"}});
     */
    QueryResult execute(
        const std::string& query,
        const std::unordered_map<std::string, Value>& params = {}
    );
    /**
    Execute query and return single value
     */
    std::optional<Value> execute_scalar(
        const std::string& query,
        const std::unordered_map<std::string, Value>& params = {}
    );
    /**
    Begin a transaction
     */
    bool begin_transaction();
    /**
    Commit the current transaction
     */
    bool commit();
    /**
    Rollback the current transaction
     */
    bool rollback();
    /**
    Get current memory statistics
     */
    MemoryStats get_memory_stats();
    /**
    Check if memory is within safe limits
     */
    bool is_memory_safe() const;
    /**
    Register callback for pause/resume signals
     */
    void set_pause_callback(PauseCallback callback);
    /**
    Start the memory monitoring thread
     */
    void start_memory_monitor();
    /**
    Stop the memory monitoring thread
     */
    void stop_memory_monitor();

private:
    // Connection parameters
    std::string host_;
    uint16_t port_;
    std::string username_;
    std::string password_;
    size_t pool_size_;
    size_t memory_limit_mb_;
    // Connection pool
    std::vector<std::unique_ptr<PooledConnection>> pool_;
    std::mutex pool_mutex_;
    std::condition_variable pool_cv_;
    std::atomic<bool> connected_{false};
    // Memory monitoring
    std::unique_ptr<std::thread> monitor_thread_;
    std::atomic<bool> monitor_running_{false};
    std::atomic<bool> memory_exceeded_{false};
    PauseCallback pause_callback_;
    std::mutex callback_mutex_;
    // Internal helpers
    PooledConnection* acquire_connection();
    void release_connection(PooledConnection* conn);
    void monitor_loop();
#ifdef HAVE_MGCLIENT
    QueryResult execute_on_session(
        mg_session* session,
        const std::string& query,
        const std::unordered_map<std::string, Value>& params
    );
    Value convert_mg_value(const mg_value* val);
#endif
};

}
