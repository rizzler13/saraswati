#pragma once
#include <vector>
#include <string>
#include <mutex>
#include <shared_mutex>
#include <atomic>
#include <thread>
#include <chrono>
#include <unordered_map>
#include <nlohmann/json.hpp>

#include "parsers/SourceParsers.hpp"
#include "crawlers/DiscourseCrawlers.hpp"
#include "util/BloomFilter.hpp"

namespace saraswati::pipeline {

using json = nlohmann::json;

struct CachedPaper {
    std::string id;           // arxiv_id or hf_id
    std::string title;
    std::string abstract;
    std::vector<std::string> authors;
    std::string date;
    std::string source;       // "arxiv", "huggingface"
    std::string category;     // primary category
    int score = 0;            // computed hype score
    std::string url;
};

class DataPipeline {
public:
    static DataPipeline& instance();

    DataPipeline(const DataPipeline&) = delete;
    DataPipeline& operator=(const DataPipeline&) = delete;

    void start(int poll_interval_seconds = 300);
    void stop();
    void fetch_now();

    json get_trending_papers(size_t limit = 50) const;
    json get_discourse(size_t limit = 50) const;
    json get_stats() const;
    json get_stats_detail(const std::string& type) const;
    json get_graph_data() const;
    json get_trending_topics() const;
    size_t paper_count() const;
    size_t mention_count() const;
    std::string last_fetch_time() const;

private:
    DataPipeline() = default;

    std::unique_ptr<std::thread> poll_thread_;
    std::atomic<bool> running_{false};
    int poll_interval_ = 300;
    void poll_loop();

    void fetch_arxiv();
    void fetch_huggingface();
    void fetch_reddit();
    void fetch_nitter();
    void fetch_hackernews();
    void extract_topics();
    void rebuild_graph_cache();

    mutable std::shared_mutex data_mutex_;
    std::vector<CachedPaper> papers_;
    std::vector<crawlers::DiscoursePost> discourse_;
    std::unordered_map<std::string, int> topic_counts_;
    std::vector<std::string> trending_topics_;
    json cached_graph_;

    std::atomic<size_t> arxiv_count_{0};
    std::atomic<size_t> hf_count_{0};
    std::atomic<size_t> reddit_count_{0};
    std::atomic<size_t> twitter_count_{0};
    std::atomic<size_t> hn_count_{0};

    std::atomic<int64_t> last_fetch_epoch_{0};
};

}
