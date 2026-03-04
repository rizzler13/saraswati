#pragma once
#include <thread>
#include <memory>
#include <string>
#include <vector>
#include <functional>
#include <optional>
#include <mutex>
#include <atomic>
#include <chrono>
#include <unordered_map>
#include <queue>

#include <curl/curl.h>

namespace saraswati::net {

/**
HTTP response from a request
 */
struct HttpResponse {
    long status_code = 0;
    std::string body;
    std::unordered_map<std::string, std::string> headers;
    double total_time_ms = 0.0;
    std::string error_message;
    bool success = false;
};

/**
HTTP request configuration
 */
struct HttpRequest {
    std::string url;
    std::string method = "GET";
    std::unordered_map<std::string, std::string> headers;
    std::string body;
    long timeout_ms = 30000;
    bool follow_redirects = true;
    int max_redirects = 5;
    std::string user_agent = "Saraswati/1.0 (Research Radar)";
};

/**
Callback type for async requests
 */
using HttpCallback = std::function<void(HttpResponse)>;

/**
Request in the queue
 */
struct QueuedRequest {
    HttpRequest request;
    HttpCallback callback;
    std::chrono::steady_clock::time_point queued_at;
};

/**
Async HTTP client using libcurl multi interface
 * 
 * Design constraints (8GB M1 MacBook):
 * - Max 8 concurrent connections
 * - Rate limiting per domain
 * - Exponential backoff on 429/503
 * - Connection reuse via libcurl
 */
class AsyncHttpClient {
public:
    /**
    Construct client with configuration
    Maximum concurrent connections (default: 8)
    Minimum time between requests to same domain (default: 2000)
     */
    explicit AsyncHttpClient(
        size_t max_connections = 8,
        long rate_limit_ms = 2000
    );
    ~AsyncHttpClient();
    // Non-copyable
    AsyncHttpClient(const AsyncHttpClient&) = delete;
    AsyncHttpClient& operator=(const AsyncHttpClient&) = delete;
    /**
    Initialize curl and start the event loop
     */
    bool start();
    /**
    Stop the event loop and cleanup
     */
    void stop();
    /**
    Check if client is running
     */
    bool is_running() const;
    /**
    Make an async GET request
    URL to fetch
    Called with response when complete
    Optional headers
     */
    void get(
        const std::string& url,
        HttpCallback callback,
        const std::unordered_map<std::string, std::string>& headers = {}
    );
    /**
    Make an async POST request
    URL to post to
    Request body
    Called with response when complete
    Optional headers
     */
    void post(
        const std::string& url,
        const std::string& body,
        HttpCallback callback,
        const std::unordered_map<std::string, std::string>& headers = {}
    );
    /**
    Make an async request with full configuration
     */
    void request(HttpRequest req, HttpCallback callback);
    /**
    Synchronous GET (blocks until complete)
     */
    HttpResponse get_sync(
        const std::string& url,
        const std::unordered_map<std::string, std::string>& headers = {}
    );
    /**
    Synchronous POST (blocks until complete)
     */
    HttpResponse post_sync(
        const std::string& url,
        const std::string& body,
        const std::unordered_map<std::string, std::string>& headers = {}
    );
    /**
    Get number of pending requests
     */
    size_t pending_count() const;
    /**
    Get number of active connections
     */
    size_t active_count() const;
    /**
    Set global rate limit
     */
    void set_rate_limit(long rate_limit_ms);
    /**
    Set rate limit for specific domain
     */
    void set_domain_rate_limit(const std::string& domain, long rate_limit_ms);

private:
    // Configuration
    size_t max_connections_;
    long default_rate_limit_ms_;
    // Curl handles
    CURLM* multi_handle_ = nullptr;
    std::vector<CURL*> easy_handles_;
    // Request queue
    std::queue<QueuedRequest> request_queue_;
    std::mutex queue_mutex_;
    // Rate limiting per domain
    std::unordered_map<std::string, std::chrono::steady_clock::time_point> last_request_time_;
    std::unordered_map<std::string, long> domain_rate_limits_;
    std::mutex rate_limit_mutex_;
    // Active transfers
    struct ActiveTransfer {
        CURL* handle;
        HttpRequest request;
        HttpCallback callback;
        std::string response_body;
        std::unordered_map<std::string, std::string> response_headers;
        struct curl_slist* request_headers = nullptr;
        int retry_count = 0;
    };
    std::unordered_map<CURL*, std::unique_ptr<ActiveTransfer>> active_transfers_;
    std::mutex transfers_mutex_;
    // Event loop
    std::unique_ptr<std::thread> event_thread_;
    std::atomic<bool> running_{false};
    // Internal helpers
    void event_loop();
    void process_queue();
    void start_transfer(QueuedRequest&& req);
    void handle_completed(CURL* handle, CURLcode result);
    std::string extract_domain(const std::string& url);
    bool can_request_domain(const std::string& domain);
    void update_domain_time(const std::string& domain);
    bool should_retry(long status_code, int retry_count);
    long calculate_backoff(int retry_count);
    // Curl callbacks
    static size_t write_callback(char* ptr, size_t size, size_t nmemb, void* userdata);
    static size_t header_callback(char* ptr, size_t size, size_t nmemb, void* userdata);
};

}
