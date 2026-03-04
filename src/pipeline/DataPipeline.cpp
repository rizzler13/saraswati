#include "pipeline/DataPipeline.hpp"
#include "net/AsyncHttpClient.hpp"
#include "parsers/SourceParsers.hpp"
#include "crawlers/DiscourseCrawlers.hpp"
#include <iostream>
#include <algorithm>
#include <sstream>
#include <regex>
#include <ctime>
#include <iomanip>

extern std::unique_ptr<saraswati::net::AsyncHttpClient> g_http;
extern std::atomic<size_t> g_papers_count;
extern std::atomic<size_t> g_mentions_count;

namespace saraswati::pipeline {

using json = nlohmann::json;

DataPipeline& DataPipeline::instance() {
    static DataPipeline inst;
    return inst;
}

void DataPipeline::start(int poll_interval_seconds) {
    if (running_) return;
    poll_interval_ = poll_interval_seconds;
    running_ = true;
    poll_thread_ = std::make_unique<std::thread>(&DataPipeline::poll_loop, this);
    std::cout << "[Pipeline] Started with " << poll_interval_ << "s interval\n";
}

void DataPipeline::stop() {
    running_ = false;
    if (poll_thread_ && poll_thread_->joinable()) {
        poll_thread_->join();
    }
    std::cout << "[Pipeline] Stopped\n";
}

void DataPipeline::poll_loop() {
    fetch_now();

    while (running_) {
        // Sleep in 1-second increments so we can check running_
        for (int i = 0; i < poll_interval_ && running_; ++i) {
            std::this_thread::sleep_for(std::chrono::seconds(1));
        }
        if (running_) {
            fetch_now();
        }
    }
}

void DataPipeline::fetch_now() {
    std::cout << "[Pipeline] Fetching from all sources...\n";

    fetch_arxiv();
    fetch_huggingface();
    fetch_reddit();
    fetch_nitter();
    fetch_hackernews();
    extract_topics();
    rebuild_graph_cache();

    g_papers_count = paper_count();
    g_mentions_count = mention_count();

    last_fetch_epoch_ = std::chrono::duration_cast<std::chrono::seconds>(
        std::chrono::system_clock::now().time_since_epoch()
    ).count();

    std::cout << "[Pipeline] Done. Papers: " << paper_count()
              << ", Mentions: " << mention_count()
              << ", Topics: " << trending_topics_.size() << "\n";
}
void DataPipeline::fetch_arxiv() {
    if (!g_http || !g_http->is_running()) return;

    std::vector<std::string> categories = {
        "cs.AI", "cs.LG", "cs.CL", "cs.CV", "cs.NE",
        "cs.MA", "cs.RO", "cs.IR", "stat.ML"
    };

    std::vector<CachedPaper> new_papers;

    for (const auto& cat : categories) {
        std::string url = parsers::ArxivParser::build_rss_url(cat);
        auto resp = g_http->get_sync(url);

        if (!resp.success || resp.body.empty()) {
            std::cerr << "[Pipeline] ArXiv fetch failed for " << cat
                      << ": " << resp.error_message << "\n";
            continue;
        }

        auto parsed = parsers::ArxivParser::parse_rss(resp.body);
        std::cout << "[Pipeline] ArXiv " << cat << ": " << parsed.size() << " papers\n";

        for (auto& p : parsed) {
            CachedPaper cp;
            cp.id = p.arxiv_id;
            cp.title = p.title;
            cp.abstract = p.abstract;
            cp.authors = p.authors;
            cp.date = p.published_date;
            cp.source = "arxiv";
            cp.category = cat;
            cp.url = "https://arxiv.org/abs/" + p.arxiv_id;
            // Score = number of authors * 5 + abstract length weight
            cp.score = static_cast<int>(p.authors.size() * 5 + (p.abstract.size() / 100));
            new_papers.push_back(std::move(cp));
        }
    }

    std::unordered_map<std::string, CachedPaper> deduped;
    for (auto& p : new_papers) {
        if (!p.id.empty()) {
            deduped[p.id] = std::move(p);
        }
    }

    {
        std::unique_lock lock(data_mutex_);
        // Remove old arxiv papers and add new ones
        papers_.erase(
            std::remove_if(papers_.begin(), papers_.end(),
                [](const CachedPaper& p) { return p.source == "arxiv"; }),
            papers_.end()
        );
        for (auto& [id, p] : deduped) {
            papers_.push_back(std::move(p));
        }
        arxiv_count_ = deduped.size();
    }
}
void DataPipeline::fetch_huggingface() {
    if (!g_http || !g_http->is_running()) return;

    std::string url = "https://huggingface.co/api/daily_papers";
    auto resp = g_http->get_sync(url);

    if (!resp.success || resp.body.empty()) {
        std::cerr << "[Pipeline] HuggingFace fetch failed: " << resp.error_message << "\n";
        return;
    }

    auto parsed = parsers::HuggingFaceParser::parse_api_response(resp.body);
    std::cout << "[Pipeline] HuggingFace: " << parsed.size() << " papers\n";

    std::vector<CachedPaper> new_papers;
    for (auto& p : parsed) {
        CachedPaper cp;
        cp.id = p.arxiv_id.empty() ? p.hf_id : p.arxiv_id;
        cp.title = p.title;
        cp.abstract = p.summary;
        cp.authors = p.authors;
        cp.date = p.published_date;
        cp.source = "huggingface";
        cp.score = p.upvotes * 3;  // HF upvotes are strong signals
        cp.url = p.arxiv_id.empty()
            ? "https://huggingface.co/papers/" + p.hf_id
            : "https://arxiv.org/abs/" + p.arxiv_id;
        new_papers.push_back(std::move(cp));
    }

    {
        std::unique_lock lock(data_mutex_);
        papers_.erase(
            std::remove_if(papers_.begin(), papers_.end(),
                [](const CachedPaper& p) { return p.source == "huggingface"; }),
            papers_.end()
        );
        for (auto& p : new_papers) {
            papers_.push_back(std::move(p));
        }
        hf_count_ = new_papers.size();
    }
}
void DataPipeline::fetch_reddit() {
    if (!g_http || !g_http->is_running()) return;

    auto subreddits = crawlers::RedditCrawler::default_subreddits();
    std::vector<crawlers::DiscoursePost> new_posts;

    for (const auto& sub : subreddits) {
        std::string url = crawlers::RedditCrawler::build_url(sub, "hot");
        auto resp = g_http->get_sync(url);

        if (!resp.success || resp.body.empty()) {
            std::cerr << "[Pipeline] Reddit r/" << sub << " failed: " << resp.error_message << "\n";
            continue;
        }

        auto posts = crawlers::RedditCrawler::parse_listing(resp.body);
        std::cout << "[Pipeline] Reddit r/" << sub << ": " << posts.size() << " posts\n";

        for (auto& p : posts) {
            new_posts.push_back(std::move(p));
        }
    }

    {
        std::unique_lock lock(data_mutex_);
        discourse_.erase(
            std::remove_if(discourse_.begin(), discourse_.end(),
                [](const crawlers::DiscoursePost& p) { return p.platform == "reddit"; }),
            discourse_.end()
        );
        for (auto& p : new_posts) {
            discourse_.push_back(std::move(p));
        }
        reddit_count_ = new_posts.size();
    }
}
void DataPipeline::fetch_nitter() {
    if (!g_http || !g_http->is_running()) return;

    auto instances = crawlers::NitterCrawler::default_instances();
    auto influencers = crawlers::NitterCrawler::default_influencers();
    std::vector<crawlers::DiscoursePost> new_posts;

    for (const auto& instance : instances) {
        bool instance_works = false;

        for (const auto& user : influencers) {
            std::string url = crawlers::NitterCrawler::build_user_url(instance, user);
            auto resp = g_http->get_sync(url);

            if (!resp.success || resp.body.empty()) continue;
            instance_works = true;

            auto posts = crawlers::NitterCrawler::parse_timeline(resp.body);
            for (auto& p : posts) {
                p.author = user;
                p.is_influencer = true;
                new_posts.push_back(std::move(p));
            }
        }

        // Also search for AI research topics
        std::vector<std::string> queries = {
            "arxiv machine learning",
            "new AI paper",
            "LLM breakthrough",
            "transformer architecture"
        };

        for (const auto& q : queries) {
            std::string url = crawlers::NitterCrawler::build_search_url(instance, q);
            auto resp = g_http->get_sync(url);

            if (!resp.success || resp.body.empty()) continue;

            auto posts = crawlers::NitterCrawler::parse_search(resp.body);
            for (auto& p : posts) {
                new_posts.push_back(std::move(p));
            }
        }

        if (instance_works) {
            std::cout << "[Pipeline] Nitter (" << instance << "): " << new_posts.size() << " tweets\n";
            break;  // Found working instance
        }
    }

    {
        std::unique_lock lock(data_mutex_);
        discourse_.erase(
            std::remove_if(discourse_.begin(), discourse_.end(),
                [](const crawlers::DiscoursePost& p) { return p.platform == "twitter"; }),
            discourse_.end()
        );
        for (auto& p : new_posts) {
            discourse_.push_back(std::move(p));
        }
        twitter_count_ = new_posts.size();
    }
}
void DataPipeline::fetch_hackernews() {
    if (!g_http || !g_http->is_running()) return;

    std::vector<crawlers::DiscoursePost> new_posts;

    // Search for ML/AI papers on HN
    std::vector<std::string> queries = {
        "machine learning",
        "artificial intelligence",
        "LLM",
        "transformer",
        "arxiv"
    };

    for (const auto& q : queries) {
        std::string url = crawlers::HackerNewsCrawler::build_search_url(q, 30);
        auto resp = g_http->get_sync(url);

        if (!resp.success || resp.body.empty()) continue;

        auto posts = crawlers::HackerNewsCrawler::parse_algolia(resp.body);
        for (auto& p : posts) {
            new_posts.push_back(std::move(p));
        }
    }

    {
        std::string url = crawlers::HackerNewsCrawler::front_page_url();
        auto resp = g_http->get_sync(url);
        if (resp.success && !resp.body.empty()) {
            auto posts = crawlers::HackerNewsCrawler::parse_algolia(resp.body);
            for (auto& p : posts) {
                // Only keep AI-related front page stories
                std::string combined = p.title + " " + p.content;
                std::transform(combined.begin(), combined.end(), combined.begin(), ::tolower);
                bool ai_related = false;
                for (const auto& kw : {"ai", "ml", "llm", "gpt", "transformer", "neural",
                                        "deep learning", "machine learning", "arxiv", "model"}) {
                    if (combined.find(kw) != std::string::npos) {
                        ai_related = true;
                        break;
                    }
                }
                if (ai_related) {
                    new_posts.push_back(std::move(p));
                }
            }
        }
    }

    std::unordered_map<std::string, crawlers::DiscoursePost> deduped;
    for (auto& p : new_posts) {
        if (!p.id.empty()) {
            deduped[p.id] = std::move(p);
        }
    }

    {
        std::unique_lock lock(data_mutex_);
        discourse_.erase(
            std::remove_if(discourse_.begin(), discourse_.end(),
                [](const crawlers::DiscoursePost& p) { return p.platform == "hackernews"; }),
            discourse_.end()
        );
        for (auto& [id, p] : deduped) {
            discourse_.push_back(std::move(p));
        }
        hn_count_ = deduped.size();
    }
}
void DataPipeline::extract_topics() {
    static const std::vector<std::pair<std::string, std::string>> topic_keywords = {
        {"LLM", "large language model|llm|language model"},
        {"Transformers", "transformer|attention mechanism|self-attention"},
        {"Diffusion Models", "diffusion model|stable diffusion|ddpm|denoising"},
        {"Reinforcement Learning", "reinforcement learning|rlhf|ppo|reward model"},
        {"Computer Vision", "computer vision|image recognition|object detection|yolo"},
        {"NLP", "natural language|text generation|sentiment|named entity"},
        {"RAG", "retrieval augmented|retrieval-augmented|rag"},
        {"Agents", "ai agent|autonomous agent|tool use|function calling"},
        {"Fine-Tuning", "fine-tuning|fine tuning|lora|qlora|adapter"},
        {"Multimodal", "multimodal|vision-language|image-text|clip"},
        {"Reasoning", "reasoning|chain-of-thought|cot|logic|mathematical"},
        {"Code Generation", "code generation|codegen|programming|copilot"},
        {"Safety & Alignment", "alignment|safety|constitutional ai|red team"},
        {"Mixture of Experts", "mixture of experts|moe|sparse expert"},
        {"Quantization", "quantization|pruning|distillation|compression"},
        {"Robotics", "robotics|embodied ai|manipulation|locomotion"},
        {"Speech & Audio", "speech recognition|text-to-speech|audio|whisper"},
        {"Graph Neural Networks", "graph neural|gnn|knowledge graph"},
        {"Federated Learning", "federated learning|privacy|differential privacy"},
        {"Neural Architecture", "architecture search|nas|scaling law"},
        {"World Models", "world model|simulator|environment model"},
        {"Interpretability", "interpretability|mechanistic|explainability|probing"},
        {"Embeddings", "embedding|vector database|semantic search|retrieval"},
        {"Optimization", "optimizer|adam|sgd|learning rate|training"},
        {"Synthetic Data", "synthetic data|data augmentation|self-play"},
    };

    std::unordered_map<std::string, int> counts;
    std::shared_lock lock(data_mutex_);

    for (const auto& paper : papers_) {
        std::string combined = paper.title + " " + paper.abstract;
        std::transform(combined.begin(), combined.end(), combined.begin(), ::tolower);

        for (const auto& [topic, pattern] : topic_keywords) {
            try {
                std::regex re(pattern, std::regex::icase);
                if (std::regex_search(combined, re)) {
                    counts[topic]++;
                }
            } catch (...) {
                // Regex might fail, just skip
            }
        }
    }

    lock.unlock();

    std::vector<std::pair<std::string, int>> sorted(counts.begin(), counts.end());
    std::sort(sorted.begin(), sorted.end(),
        [](const auto& a, const auto& b) { return a.second > b.second; });

    std::vector<std::string> topics;
    std::unordered_map<std::string, int> final_counts;
    for (size_t i = 0; i < std::min(sorted.size(), size_t(20)); ++i) {
        topics.push_back(sorted[i].first);
        final_counts[sorted[i].first] = sorted[i].second;
    }

    {
        std::unique_lock wlock(data_mutex_);
        trending_topics_ = std::move(topics);
        topic_counts_ = std::move(final_counts);
    }
}
size_t DataPipeline::paper_count() const {
    std::shared_lock lock(data_mutex_);
    return papers_.size();
}

size_t DataPipeline::mention_count() const {
    std::shared_lock lock(data_mutex_);
    return discourse_.size();
}

std::string DataPipeline::last_fetch_time() const {
    auto epoch = last_fetch_epoch_.load();
    if (epoch == 0) return "never";
    std::time_t t = static_cast<std::time_t>(epoch);
    std::ostringstream oss;
    oss << std::put_time(std::gmtime(&t), "%Y-%m-%dT%H:%M:%SZ");
    return oss.str();
}

json DataPipeline::get_trending_papers(size_t limit) const {
    std::shared_lock lock(data_mutex_);

    auto sorted = papers_;
    std::sort(sorted.begin(), sorted.end(),
        [](const CachedPaper& a, const CachedPaper& b) { return a.score > b.score; });

    json result = json::array();
    for (size_t i = 0; i < std::min(sorted.size(), limit); ++i) {
        const auto& p = sorted[i];
        result.push_back({
            {"id", p.id},
            {"title", p.title},
            {"abstract", p.abstract},
            {"authors", p.authors},
            {"date", p.date},
            {"score", p.score},
            {"source", p.source},
            {"category", p.category},
            {"url", p.url}
        });
    }
    return result;
}

json DataPipeline::get_discourse(size_t limit) const {
    std::shared_lock lock(data_mutex_);

    auto sorted = discourse_;
    std::sort(sorted.begin(), sorted.end(),
        [](const crawlers::DiscoursePost& a, const crawlers::DiscoursePost& b) {
            return a.score > b.score;
        });

    json result = json::array();
    for (size_t i = 0; i < std::min(sorted.size(), limit); ++i) {
        const auto& p = sorted[i];
        result.push_back({
            {"id", p.id},
            {"platform", p.platform},
            {"author", p.author},
            {"title", p.title},
            {"content", p.content.substr(0, 300)},  // Truncate content
            {"url", p.url},
            {"arxiv_id", p.arxiv_id},
            {"score", p.score},
            {"comments", p.comment_count},
            {"subreddit", p.subreddit},
            {"influencer", p.is_influencer},
            {"created_at", p.created_at}
        });
    }
    return result;
}

json DataPipeline::get_stats() const {
    std::shared_lock lock(data_mutex_);

    json topics = json::array();
    for (const auto& t : trending_topics_) {
        topics.push_back(t);
    }

    return {
        {"papers_total", papers_.size()},
        {"mentions_total", discourse_.size()},
        {"concepts_total", topic_counts_.size()},
        {"authors_total", [&]() {
            std::unordered_map<std::string, bool> unique_authors;
            for (const auto& p : papers_) {
                for (const auto& a : p.authors) {
                    unique_authors[a] = true;
                }
            }
            return unique_authors.size();
        }()},
        {"papers_today", [&]() {
            // Count papers from today (approximate via date string)
            auto now = std::chrono::system_clock::now();
            std::time_t t = std::chrono::system_clock::to_time_t(now);
            std::ostringstream oss;
            oss << std::put_time(std::gmtime(&t), "%Y-%m-%d");
            std::string today = oss.str();
            size_t count = 0;
            for (const auto& p : papers_) {
                if (p.date.find(today) == 0) count++;
            }
            return count;
        }()},
        {"trending_topics", topics},
        {"last_fetch", last_fetch_time()},
        {"sources", {
            {"arxiv", arxiv_count_.load()},
            {"huggingface", hf_count_.load()},
            {"reddit", reddit_count_.load()},
            {"twitter", twitter_count_.load()},
            {"hackernews", hn_count_.load()}
        }}
    };
}

json DataPipeline::get_stats_detail(const std::string& type) const {
    std::shared_lock lock(data_mutex_);

    if (type == "papers") {
        // Breakdown by source and category
        std::unordered_map<std::string, int> by_source;
        std::unordered_map<std::string, int> by_category;
        for (const auto& p : papers_) {
            by_source[p.source]++;
            if (!p.category.empty()) by_category[p.category]++;
        }

        json sources = json::array();
        for (const auto& [k, v] : by_source) {
            sources.push_back({{"name", k}, {"count", v}});
        }

        json categories = json::array();
        for (const auto& [k, v] : by_category) {
            categories.push_back({{"name", k}, {"count", v}});
        }

        return {{"type", "papers"}, {"total", papers_.size()},
                {"by_source", sources}, {"by_category", categories}};
    }

    if (type == "mentions") {
        std::unordered_map<std::string, int> by_platform;
        int with_arxiv = 0;
        for (const auto& p : discourse_) {
            by_platform[p.platform]++;
            if (!p.arxiv_id.empty()) with_arxiv++;
        }

        json platforms = json::array();
        for (const auto& [k, v] : by_platform) {
            platforms.push_back({{"name", k}, {"count", v}});
        }

        return {{"type", "mentions"}, {"total", discourse_.size()},
                {"by_platform", platforms}, {"with_paper_links", with_arxiv}};
    }

    if (type == "topics") {
        json topics = json::array();
        for (const auto& t : trending_topics_) {
            auto it = topic_counts_.find(t);
            int count = (it != topic_counts_.end()) ? it->second : 0;
            topics.push_back({{"name", t}, {"count", count}});
        }
        return {{"type", "topics"}, {"total", trending_topics_.size()}, {"topics", topics}};
    }

    return {{"error", "unknown type"}};
}

json DataPipeline::get_graph_data() const {
    std::shared_lock lock(data_mutex_);
    return cached_graph_;
}

void DataPipeline::rebuild_graph_cache() {
    std::shared_lock rlock(data_mutex_);

    json nodes = json::array();
    json edges = json::array();

    int topic_idx = 0;
    for (const auto& topic : trending_topics_) {
        auto it = topic_counts_.find(topic);
        int count = (it != topic_counts_.end()) ? it->second : 1;
        nodes.push_back({
            {"id", "topic_" + std::to_string(topic_idx)},
            {"type", "Concept"},
            {"label", topic},
            {"size", std::max(20, std::min(60, count * 3))}
        });
        topic_idx++;
    }

    auto sorted = papers_;
    std::sort(sorted.begin(), sorted.end(),
        [](const CachedPaper& a, const CachedPaper& b) { return a.score > b.score; });

    size_t paper_limit = std::min(sorted.size(), size_t(30));
    for (size_t i = 0; i < paper_limit; ++i) {
        const auto& p = sorted[i];
        std::string node_id = "paper_" + std::to_string(i);
        
        // Truncate title for label
        std::string label = p.title;
        if (label.size() > 40) label = label.substr(0, 37) + "...";

        nodes.push_back({
            {"id", node_id},
            {"type", "Paper"},
            {"label", label},
            {"size", std::max(10, std::min(30, p.score / 5))},
            {"paperId", p.id}
        });

        // Connect to matching topics
        std::string combined = p.title + " " + p.abstract;
        std::transform(combined.begin(), combined.end(), combined.begin(), ::tolower);

        // Simple keyword match to topics
        static const std::vector<std::pair<std::string, std::string>> topic_keywords = {
            {"LLM", "large language model|llm|language model"},
            {"Transformers", "transformer|attention"},
            {"Diffusion Models", "diffusion"},
            {"Reinforcement Learning", "reinforcement|rlhf|ppo"},
            {"Computer Vision", "vision|image|object detection"},
            {"NLP", "natural language|text generation|sentiment"},
            {"RAG", "retrieval augmented|rag"},
            {"Agents", "agent|tool use"},
            {"Fine-Tuning", "fine-tuning|lora|qlora"},
            {"Multimodal", "multimodal|vision-language"},
            {"Reasoning", "reasoning|chain-of-thought"},
            {"Code Generation", "code generation|codegen"},
            {"Safety & Alignment", "alignment|safety"},
            {"Mixture of Experts", "mixture of experts|moe"},
            {"Interpretability", "interpretability|mechanistic"},
        };

        for (size_t t = 0; t < trending_topics_.size() && t < size_t(topic_idx); ++t) {
            for (const auto& [tname, pat] : topic_keywords) {
                if (tname == trending_topics_[t]) {
                    try {
                        std::regex re(pat, std::regex::icase);
                        if (std::regex_search(combined, re)) {
                            edges.push_back({
                                {"source", node_id},
                                {"target", "topic_" + std::to_string(t)},
                                {"type", "BELONGS_TO"}
                            });
                        }
                    } catch (...) {}
                    break;
                }
            }
        }
    }

    json result = {{"nodes", nodes}, {"edges", edges}};
    rlock.unlock();

    std::unique_lock wlock(data_mutex_);
    cached_graph_ = std::move(result);
}

json DataPipeline::get_trending_topics() const {
    std::shared_lock lock(data_mutex_);
    json result = json::array();
    for (const auto& t : trending_topics_) {
        auto it = topic_counts_.find(t);
        result.push_back({
            {"name", t},
            {"count", (it != topic_counts_.end()) ? it->second : 0}
        });
    }
    return result;
}

}
