#include "net/AsyncHttpClient.hpp"
#pragma once
#include <memory>
#include <string>
#include <vector>
#include <functional>
#include <thread>  // <--- ADD THIS LINE (It was missing)
#include <mutex>
// ... rest of imports
#include <iostream>
#include <sstream>
#include <regex>
#include <cstring>

namespace saraswati::net {

AsyncHttpClient::AsyncHttpClient(size_t max_connections, long rate_limit_ms)
    : max_connections_(max_connections)
    , default_rate_limit_ms_(rate_limit_ms)
{
}

AsyncHttpClient::~AsyncHttpClient() {
    stop();
}

bool AsyncHttpClient::start() {
    if (running_) return true;
    
    // Initialize curl globally (thread-safe)
    curl_global_init(CURL_GLOBAL_ALL);
    
    // Create multi handle
    multi_handle_ = curl_multi_init();
    if (!multi_handle_) {
        std::cerr << "Failed to create curl multi handle\n";
        return false;
    }
    
    // Configure multi handle
    curl_multi_setopt(multi_handle_, CURLMOPT_MAXCONNECTS, static_cast<long>(max_connections_));
    curl_multi_setopt(multi_handle_, CURLMOPT_MAX_TOTAL_CONNECTIONS, static_cast<long>(max_connections_));
    
    // Start event loop
    running_ = true;
    event_thread_ = std::make_unique<std::thread>(&AsyncHttpClient::event_loop, this);
    
    return true;
}

void AsyncHttpClient::stop() {
    running_ = false;
    
    if (event_thread_ && event_thread_->joinable()) {
        event_thread_->join();
    }
    event_thread_.reset();
    
    // Cleanup active transfers
    {
        std::lock_guard<std::mutex> lock(transfers_mutex_);
        for (auto& [handle, transfer] : active_transfers_) {
            if (transfer->request_headers) {
                curl_slist_free_all(transfer->request_headers);
            }
            curl_multi_remove_handle(multi_handle_, handle);
            curl_easy_cleanup(handle);
        }
        active_transfers_.clear();
    }
    
    if (multi_handle_) {
        curl_multi_cleanup(multi_handle_);
        multi_handle_ = nullptr;
    }
    
    curl_global_cleanup();
}

bool AsyncHttpClient::is_running() const {
    return running_.load();
}

void AsyncHttpClient::get(
    const std::string& url,
    HttpCallback callback,
    const std::unordered_map<std::string, std::string>& headers
) {
    HttpRequest req;
    req.url = url;
    req.method = "GET";
    req.headers = headers;
    request(std::move(req), std::move(callback));
}

void AsyncHttpClient::post(
    const std::string& url,
    const std::string& body,
    HttpCallback callback,
    const std::unordered_map<std::string, std::string>& headers
) {
    HttpRequest req;
    req.url = url;
    req.method = "POST";
    req.body = body;
    req.headers = headers;
    request(std::move(req), std::move(callback));
}

void AsyncHttpClient::request(HttpRequest req, HttpCallback callback) {
    QueuedRequest queued;
    queued.request = std::move(req);
    queued.callback = std::move(callback);
    queued.queued_at = std::chrono::steady_clock::now();
    
    std::lock_guard<std::mutex> lock(queue_mutex_);
    request_queue_.push(std::move(queued));
}

HttpResponse AsyncHttpClient::get_sync(
    const std::string& url,
    const std::unordered_map<std::string, std::string>& headers
) {
    HttpResponse response;
    std::mutex mtx;
    std::condition_variable cv;
    bool done = false;
    
    get(url, [&](HttpResponse resp) {
        std::lock_guard<std::mutex> lock(mtx);
        response = std::move(resp);
        done = true;
        cv.notify_one();
    }, headers);
    
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, [&] { return done; });
    
    return response;
}

HttpResponse AsyncHttpClient::post_sync(
    const std::string& url,
    const std::string& body,
    const std::unordered_map<std::string, std::string>& headers
) {
    HttpResponse response;
    std::mutex mtx;
    std::condition_variable cv;
    bool done = false;
    
    post(url, body, [&](HttpResponse resp) {
        std::lock_guard<std::mutex> lock(mtx);
        response = std::move(resp);
        done = true;
        cv.notify_one();
    }, headers);
    
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, [&] { return done; });
    
    return response;
}

size_t AsyncHttpClient::pending_count() const {
    std::lock_guard<std::mutex> lock(const_cast<std::mutex&>(queue_mutex_));
    return request_queue_.size();
}

size_t AsyncHttpClient::active_count() const {
    std::lock_guard<std::mutex> lock(const_cast<std::mutex&>(transfers_mutex_));
    return active_transfers_.size();
}

void AsyncHttpClient::set_rate_limit(long rate_limit_ms) {
    default_rate_limit_ms_ = rate_limit_ms;
}

void AsyncHttpClient::set_domain_rate_limit(const std::string& domain, long rate_limit_ms) {
    std::lock_guard<std::mutex> lock(rate_limit_mutex_);
    domain_rate_limits_[domain] = rate_limit_ms;
}

void AsyncHttpClient::event_loop() {
    while (running_) {
        // Process queued requests
        process_queue();
        
        // Perform curl transfers
        int still_running = 0;
        curl_multi_perform(multi_handle_, &still_running);
        
        // Check for completed transfers
        CURLMsg* msg;
        int msgs_left;
        while ((msg = curl_multi_info_read(multi_handle_, &msgs_left))) {
            if (msg->msg == CURLMSG_DONE) {
                handle_completed(msg->easy_handle, msg->data.result);
            }
        }
        
        // Wait for activity with timeout
        int numfds;
        curl_multi_wait(multi_handle_, nullptr, 0, 100, &numfds);
    }
}

void AsyncHttpClient::process_queue() {
    std::lock_guard<std::mutex> lock(queue_mutex_);
    
    while (!request_queue_.empty()) {
        // Check if we can start more transfers
        size_t active;
        {
            std::lock_guard<std::mutex> tlock(transfers_mutex_);
            active = active_transfers_.size();
        }
        
        if (active >= max_connections_) break;
        
        auto& queued = request_queue_.front();
        std::string domain = extract_domain(queued.request.url);
        
        // Check rate limit
        if (!can_request_domain(domain)) {
            break; // Wait for rate limit
        }
        
        // Start the transfer
        start_transfer(std::move(queued));
        request_queue_.pop();
        
        // Update domain time
        update_domain_time(domain);
    }
}

void AsyncHttpClient::start_transfer(QueuedRequest&& req) {
    CURL* handle = curl_easy_init();
    if (!handle) {
        if (req.callback) {
            HttpResponse resp;
            resp.error_message = "Failed to create curl handle";
            req.callback(std::move(resp));
        }
        return;
    }
    
    auto transfer = std::make_unique<ActiveTransfer>();
    transfer->handle = handle;
    transfer->request = std::move(req.request);
    transfer->callback = std::move(req.callback);
    
    // Set URL
    curl_easy_setopt(handle, CURLOPT_URL, transfer->request.url.c_str());
    
    // Set method
    if (transfer->request.method == "POST") {
        curl_easy_setopt(handle, CURLOPT_POST, 1L);
        curl_easy_setopt(handle, CURLOPT_POSTFIELDS, transfer->request.body.c_str());
        curl_easy_setopt(handle, CURLOPT_POSTFIELDSIZE, static_cast<long>(transfer->request.body.size()));
    }
    
    // Set headers
    for (const auto& [key, value] : transfer->request.headers) {
        std::string header = key + ": " + value;
        transfer->request_headers = curl_slist_append(transfer->request_headers, header.c_str());
    }
    if (transfer->request_headers) {
        curl_easy_setopt(handle, CURLOPT_HTTPHEADER, transfer->request_headers);
    }
    
    // Set User-Agent
    curl_easy_setopt(handle, CURLOPT_USERAGENT, transfer->request.user_agent.c_str());
    
    // Set timeouts
    curl_easy_setopt(handle, CURLOPT_TIMEOUT_MS, transfer->request.timeout_ms);
    curl_easy_setopt(handle, CURLOPT_CONNECTTIMEOUT_MS, 10000L);
    
    // Follow redirects
    if (transfer->request.follow_redirects) {
        curl_easy_setopt(handle, CURLOPT_FOLLOWLOCATION, 1L);
        curl_easy_setopt(handle, CURLOPT_MAXREDIRS, static_cast<long>(transfer->request.max_redirects));
    }
    
    // Set callbacks
    curl_easy_setopt(handle, CURLOPT_WRITEFUNCTION, write_callback);
    curl_easy_setopt(handle, CURLOPT_WRITEDATA, transfer.get());
    curl_easy_setopt(handle, CURLOPT_HEADERFUNCTION, header_callback);
    curl_easy_setopt(handle, CURLOPT_HEADERDATA, transfer.get());
    
    // SSL options
    curl_easy_setopt(handle, CURLOPT_SSL_VERIFYPEER, 1L);
    curl_easy_setopt(handle, CURLOPT_SSL_VERIFYHOST, 2L);
    
    // Add to multi handle
    curl_multi_add_handle(multi_handle_, handle);
    
    // Store transfer
    {
        std::lock_guard<std::mutex> lock(transfers_mutex_);
        active_transfers_[handle] = std::move(transfer);
    }
}

void AsyncHttpClient::handle_completed(CURL* handle, CURLcode result) {
    std::unique_ptr<ActiveTransfer> transfer;
    
    {
        std::lock_guard<std::mutex> lock(transfers_mutex_);
        auto it = active_transfers_.find(handle);
        if (it == active_transfers_.end()) return;
        
        transfer = std::move(it->second);
        active_transfers_.erase(it);
    }
    
    // Build response
    HttpResponse response;
    
    if (result == CURLE_OK) {
        curl_easy_getinfo(handle, CURLINFO_RESPONSE_CODE, &response.status_code);
        response.body = std::move(transfer->response_body);
        response.headers = std::move(transfer->response_headers);
        response.success = (response.status_code >= 200 && response.status_code < 300);
        
        double total_time;
        curl_easy_getinfo(handle, CURLINFO_TOTAL_TIME, &total_time);
        response.total_time_ms = total_time * 1000.0;
    } else {
        response.error_message = curl_easy_strerror(result);
    }
    
    // Check for retry
    if (should_retry(response.status_code, transfer->retry_count)) {
        transfer->retry_count++;
        long backoff = calculate_backoff(transfer->retry_count);
        
        std::cerr << "[HTTP] Retrying " << transfer->request.url 
                  << " (attempt " << transfer->retry_count << ") after " << backoff << "ms\n";
        
        // Re-queue with delay (simplified: just queue immediately)
        QueuedRequest queued;
        queued.request = std::move(transfer->request);
        queued.callback = std::move(transfer->callback);
        queued.queued_at = std::chrono::steady_clock::now();
        
        // Cleanup
        if (transfer->request_headers) {
            curl_slist_free_all(transfer->request_headers);
        }
        curl_multi_remove_handle(multi_handle_, handle);
        curl_easy_cleanup(handle);
        
        {
            std::lock_guard<std::mutex> lock(queue_mutex_);
            request_queue_.push(std::move(queued));
        }
        return;
    }
    
    // Cleanup
    if (transfer->request_headers) {
        curl_slist_free_all(transfer->request_headers);
    }
    curl_multi_remove_handle(multi_handle_, handle);
    curl_easy_cleanup(handle);
    
    // Invoke callback
    if (transfer->callback) {
        transfer->callback(std::move(response));
    }
}

std::string AsyncHttpClient::extract_domain(const std::string& url) {
    // Simple regex to extract domain
    std::regex domain_regex(R"(https?://([^/:]+))");
    std::smatch match;
    if (std::regex_search(url, match, domain_regex)) {
        return match[1].str();
    }
    return "";
}

bool AsyncHttpClient::can_request_domain(const std::string& domain) {
    std::lock_guard<std::mutex> lock(rate_limit_mutex_);
    
    auto it = last_request_time_.find(domain);
    if (it == last_request_time_.end()) return true;
    
    // Get rate limit for this domain
    long rate_limit = default_rate_limit_ms_;
    auto rl_it = domain_rate_limits_.find(domain);
    if (rl_it != domain_rate_limits_.end()) {
        rate_limit = rl_it->second;
    }
    
    auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - it->second
    ).count();
    
    return elapsed >= rate_limit;
}

void AsyncHttpClient::update_domain_time(const std::string& domain) {
    std::lock_guard<std::mutex> lock(rate_limit_mutex_);
    last_request_time_[domain] = std::chrono::steady_clock::now();
}

bool AsyncHttpClient::should_retry(long status_code, int retry_count) {
    if (retry_count >= 3) return false;
    return status_code == 429 || status_code == 503 || status_code == 502;
}

long AsyncHttpClient::calculate_backoff(int retry_count) {
    // Exponential backoff: 1s, 2s, 4s
    return 1000L * (1L << (retry_count - 1));
}

size_t AsyncHttpClient::write_callback(char* ptr, size_t size, size_t nmemb, void* userdata) {
    auto* transfer = static_cast<ActiveTransfer*>(userdata);
    size_t bytes = size * nmemb;
    transfer->response_body.append(ptr, bytes);
    return bytes;
}

size_t AsyncHttpClient::header_callback(char* ptr, size_t size, size_t nmemb, void* userdata) {
    auto* transfer = static_cast<ActiveTransfer*>(userdata);
    size_t bytes = size * nmemb;
    
    std::string header(ptr, bytes);
    
    // Find colon
    size_t colon = header.find(':');
    if (colon != std::string::npos) {
        std::string key = header.substr(0, colon);
        std::string value = header.substr(colon + 1);
        
        // Trim whitespace
        while (!key.empty() && std::isspace(key.back())) key.pop_back();
        while (!value.empty() && std::isspace(value.front())) value.erase(0, 1);
        while (!value.empty() && std::isspace(value.back())) value.pop_back();
        
        transfer->response_headers[key] = value;
    }
    
    return bytes;
}

}
