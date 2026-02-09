#include "db/MemgraphClient.hpp"

#include <iostream>
#include <sstream>
#include <chrono>

namespace saraswati::db {

MemgraphClient::MemgraphClient(
    const std::string& host,
    uint16_t port,
    const std::string& username,
    const std::string& password,
    size_t pool_size,
    size_t memory_limit_mb
)
    : host_(host)
    , port_(port)
    , username_(username)
    , password_(password)
    , pool_size_(pool_size)
    , memory_limit_mb_(memory_limit_mb)
{
    pool_.reserve(pool_size_);
}

MemgraphClient::~MemgraphClient() {
    stop_memory_monitor();
    disconnect();
}

MemgraphClient::MemgraphClient(MemgraphClient&& other) noexcept
    : host_(std::move(other.host_))
    , port_(other.port_)
    , username_(std::move(other.username_))
    , password_(std::move(other.password_))
    , pool_size_(other.pool_size_)
    , memory_limit_mb_(other.memory_limit_mb_)
    , pool_(std::move(other.pool_))
    , connected_(other.connected_.load())
{
    other.connected_ = false;
}

MemgraphClient& MemgraphClient::operator=(MemgraphClient&& other) noexcept {
    if (this != &other) {
        stop_memory_monitor();
        disconnect();
        
        host_ = std::move(other.host_);
        port_ = other.port_;
        username_ = std::move(other.username_);
        password_ = std::move(other.password_);
        pool_size_ = other.pool_size_;
        memory_limit_mb_ = other.memory_limit_mb_;
        pool_ = std::move(other.pool_);
        connected_ = other.connected_.load();
        other.connected_ = false;
    }
    return *this;
}

bool MemgraphClient::connect() {
#ifdef HAVE_MGCLIENT
    std::lock_guard<std::mutex> lock(pool_mutex_);
    
    mg_init();
    
    for (size_t i = 0; i < pool_size_; ++i) {
        auto conn = std::make_unique<PooledConnection>();
        
        mg_session_params* params = mg_session_params_make();
        if (!params) {
            std::cerr << "Failed to create session params\n";
            continue;
        }
        
        mg_session_params_set_host(params, host_.c_str());
        mg_session_params_set_port(params, port_);
        
        if (!username_.empty()) {
            mg_session_params_set_username(params, username_.c_str());
            mg_session_params_set_password(params, password_.c_str());
        }
        
        int status = mg_connect(params, &conn->session);
        mg_session_params_destroy(params);
        
        if (status != 0) {
            std::cerr << "Failed to connect to Memgraph: " 
                      << mg_session_error(conn->session) << "\n";
            continue;
        }
        
        conn->in_use = false;
        conn->last_used = std::chrono::steady_clock::now();
        pool_.push_back(std::move(conn));
    }
    
    connected_ = !pool_.empty();
    return connected_;
#else
    std::cerr << "Memgraph support not compiled in (HAVE_MGCLIENT not defined)\n";
    return false;
#endif
}

void MemgraphClient::disconnect() {
#ifdef HAVE_MGCLIENT
    std::lock_guard<std::mutex> lock(pool_mutex_);
    
    for (auto& conn : pool_) {
        if (conn->session) {
            mg_session_destroy(conn->session);
            conn->session = nullptr;
        }
    }
    pool_.clear();
    connected_ = false;
    
    mg_finalize();
#endif
}

bool MemgraphClient::is_connected() const {
    return connected_.load();
}

PooledConnection* MemgraphClient::acquire_connection() {
    std::unique_lock<std::mutex> lock(pool_mutex_);
    
    pool_cv_.wait(lock, [this] {
        for (auto& conn : pool_) {
            if (!conn->in_use) return true;
        }
        return false;
    });
    
    for (auto& conn : pool_) {
        if (!conn->in_use) {
            conn->in_use = true;
            return conn.get();
        }
    }
    
    return nullptr;
}

void MemgraphClient::release_connection(PooledConnection* conn) {
    std::lock_guard<std::mutex> lock(pool_mutex_);
    conn->in_use = false;
    conn->last_used = std::chrono::steady_clock::now();
    pool_cv_.notify_one();
}

QueryResult MemgraphClient::execute(
    const std::string& query,
    const std::unordered_map<std::string, Value>& params
) {
    QueryResult result;
    result.success = false;
    
#ifdef HAVE_MGCLIENT
    if (!connected_) {
        result.error_message = "Not connected to Memgraph";
        return result;
    }
    
    // Check memory before executing
    if (memory_exceeded_) {
        result.error_message = "Memory limit exceeded, ingestion paused";
        return result;
    }
    
    auto* conn = acquire_connection();
    if (!conn) {
        result.error_message = "No available connections";
        return result;
    }
    
    auto start = std::chrono::high_resolution_clock::now();
    result = execute_on_session(conn->session, query, params);
    auto end = std::chrono::high_resolution_clock::now();
    
    result.execution_time_ms = std::chrono::duration<double, std::milli>(end - start).count();
    
    release_connection(conn);
#else
    result.error_message = "Memgraph support not compiled in";
#endif
    
    return result;
}

#ifdef HAVE_MGCLIENT
QueryResult MemgraphClient::execute_on_session(
    mg_session* session,
    const std::string& query,
    const std::unordered_map<std::string, Value>& params
) {
    QueryResult result;
    result.success = false;
    
    // Build parameter map
    mg_map* mg_params = mg_map_make_empty(params.size());
    
    for (const auto& [key, val] : params) {
        mg_value* mg_val = nullptr;
        
        switch (val.type()) {
            case Value::Type::Null:
                mg_val = mg_value_make_null();
                break;
            case Value::Type::Bool:
                mg_val = mg_value_make_bool(val.as_bool());
                break;
            case Value::Type::Int:
                mg_val = mg_value_make_integer(val.as_int());
                break;
            case Value::Type::Double:
                mg_val = mg_value_make_float(val.as_double());
                break;
            case Value::Type::String:
                mg_val = mg_value_make_string(val.as_string().c_str());
                break;
            default:
                // Lists and maps would need recursive handling
                mg_val = mg_value_make_null();
                break;
        }
        
        if (mg_val) {
            mg_map_insert(mg_params, key.c_str(), mg_val);
        }
    }
    
    // Execute query
    int status = mg_session_run(session, query.c_str(), mg_params, nullptr, nullptr, nullptr);
    mg_map_destroy(mg_params);
    
    if (status != 0) {
        result.error_message = mg_session_error(session);
        return result;
    }
    
    // Pull results
    mg_result* mg_res = nullptr;
    
    // Get columns from first pull
    status = mg_session_pull(session, nullptr);
    if (status != 0) {
        result.error_message = mg_session_error(session);
        return result;
    }
    
    // Fetch all results
    while ((status = mg_session_fetch(session, &mg_res)) == 1) {
        const mg_list* row = mg_result_row(mg_res);
        if (!row) continue;
        
        // Get columns on first row
        if (result.columns.empty()) {
            const mg_list* cols = mg_result_columns(mg_res);
            if (cols) {
                for (uint32_t i = 0; i < mg_list_size(cols); ++i) {
                    const mg_value* col_val = mg_list_at(cols, i);
                    if (mg_value_get_type(col_val) == MG_VALUE_TYPE_STRING) {
                        result.columns.push_back(mg_string_data(mg_value_string(col_val)));
                    }
                }
            }
        }
        
        // Convert row
        std::vector<Value> row_values;
        for (uint32_t i = 0; i < mg_list_size(row); ++i) {
            row_values.push_back(convert_mg_value(mg_list_at(row, i)));
        }
        result.rows.push_back(std::move(row_values));
    }
    
    if (status < 0) {
        result.error_message = mg_session_error(session);
        return result;
    }
    
    result.success = true;
    result.rows_affected = result.rows.size();
    return result;
}

Value MemgraphClient::convert_mg_value(const mg_value* val) {
    if (!val) return Value();
    
    switch (mg_value_get_type(val)) {
        case MG_VALUE_TYPE_NULL:
            return Value();
        case MG_VALUE_TYPE_BOOL:
            return Value(mg_value_bool(val) != 0);
        case MG_VALUE_TYPE_INTEGER:
            return Value(mg_value_integer(val));
        case MG_VALUE_TYPE_FLOAT:
            return Value(mg_value_float(val));
        case MG_VALUE_TYPE_STRING: {
            const mg_string* str = mg_value_string(val);
            return Value(std::string(mg_string_data(str), mg_string_size(str)));
        }
        case MG_VALUE_TYPE_LIST: {
            const mg_list* list = mg_value_list(val);
            std::vector<Value> items;
            for (uint32_t i = 0; i < mg_list_size(list); ++i) {
                items.push_back(convert_mg_value(mg_list_at(list, i)));
            }
            return Value(std::move(items));
        }
        case MG_VALUE_TYPE_MAP: {
            const mg_map* map = mg_value_map(val);
            std::unordered_map<std::string, Value> items;
            for (uint32_t i = 0; i < mg_map_size(map); ++i) {
                const mg_string* key = mg_map_key_at(map, i);
                items[std::string(mg_string_data(key), mg_string_size(key))] = 
                    convert_mg_value(mg_map_value_at(map, i));
            }
            return Value(std::move(items));
        }
        default:
            return Value();
    }
}
#endif

std::optional<Value> MemgraphClient::execute_scalar(
    const std::string& query,
    const std::unordered_map<std::string, Value>& params
) {
    auto result = execute(query, params);
    if (!result.success || result.rows.empty() || result.rows[0].empty()) {
        return std::nullopt;
    }
    return result.rows[0][0];
}

bool MemgraphClient::begin_transaction() {
    auto result = execute("BEGIN");
    return result.success;
}

bool MemgraphClient::commit() {
    auto result = execute("COMMIT");
    return result.success;
}

bool MemgraphClient::rollback() {
    auto result = execute("ROLLBACK");
    return result.success;
}

MemoryStats MemgraphClient::get_memory_stats() {
    MemoryStats stats;
    
    auto result = execute(
        "CALL libmemgraph.memory() YIELD peak_allocated_bytes, allocated_bytes"
    );
    
    if (result.success && !result.rows.empty()) {
        if (result.rows[0].size() >= 2) {
            stats.peak_bytes = static_cast<size_t>(result.rows[0][0].as_int());
            stats.allocated_bytes = static_cast<size_t>(result.rows[0][1].as_int());
            stats.used_bytes = stats.allocated_bytes;
            
            size_t limit_bytes = memory_limit_mb_ * 1024 * 1024;
            stats.usage_percent = (static_cast<double>(stats.used_bytes) / limit_bytes) * 100.0;
        }
    }
    
    return stats;
}

bool MemgraphClient::is_memory_safe() const {
    return !memory_exceeded_.load();
}

void MemgraphClient::set_pause_callback(PauseCallback callback) {
    std::lock_guard<std::mutex> lock(callback_mutex_);
    pause_callback_ = std::move(callback);
}

void MemgraphClient::start_memory_monitor() {
    if (monitor_running_) return;
    
    monitor_running_ = true;
    monitor_thread_ = std::make_unique<std::thread>(&MemgraphClient::monitor_loop, this);
}

void MemgraphClient::stop_memory_monitor() {
    monitor_running_ = false;
    if (monitor_thread_ && monitor_thread_->joinable()) {
        monitor_thread_->join();
    }
    monitor_thread_.reset();
}

void MemgraphClient::monitor_loop() {
    while (monitor_running_) {
        auto stats = get_memory_stats();
        
        size_t limit_bytes = memory_limit_mb_ * 1024 * 1024;
        bool exceeded = stats.used_bytes > limit_bytes;
        
        if (exceeded != memory_exceeded_.load()) {
            memory_exceeded_ = exceeded;
            
            std::lock_guard<std::mutex> lock(callback_mutex_);
            if (pause_callback_) {
                pause_callback_(exceeded);
            }
            
            if (exceeded) {
                std::cerr << "[MemgraphClient] WARNING: Memory limit exceeded! "
                          << "Used: " << (stats.used_bytes / 1024 / 1024) << "MB, "
                          << "Limit: " << memory_limit_mb_ << "MB\n";
            } else {
                std::cerr << "[MemgraphClient] Memory usage back to safe levels\n";
            }
        }
        
        // Check every 5 seconds
        std::this_thread::sleep_for(std::chrono::seconds(5));
    }
}

} // namespace saraswati::db
