#include "crawlers/DiscourseCrawlers.hpp"
#include "parsers/SourceParsers.hpp"
#include "parser/HtmlParser.hpp"
#include <nlohmann/json.hpp>
#include <regex>
#include <algorithm>

namespace saraswati::crawlers {

using json = nlohmann::json;

// Helper to extract arxiv ID from any URL
static std::string extract_arxiv(const std::string& text) {
    std::regex arxiv_regex(R"(arxiv\.org/(?:abs|pdf)/(\d{4}\.\d{4,5}))");
    std::smatch m;
    if (std::regex_search(text, m, arxiv_regex)) return m[1].str();
    return "";
}

// ============ RedditCrawler ============

std::vector<std::string> RedditCrawler::default_subreddits() {
    return {"MachineLearning", "LocalLLaMA", "science", "artificial", "deeplearning"};
}

std::string RedditCrawler::build_url(const std::string& subreddit, const std::string& sort) {
    return "https://www.reddit.com/r/" + subreddit + "/" + sort + ".json?limit=100";
}

std::vector<DiscoursePost> RedditCrawler::parse_listing(std::string_view json_str) {
    std::vector<DiscoursePost> posts;
    
    try {
        auto j = json::parse(json_str);
        if (!j.contains("data") || !j["data"].contains("children")) return posts;
        
        for (const auto& child : j["data"]["children"]) {
            if (!child.contains("data")) continue;
            const auto& data = child["data"];
            
            DiscoursePost post;
            post.platform = "reddit";
            post.id = data.value("id", "");
            post.author = data.value("author", "");
            post.title = data.value("title", "");
            post.content = data.value("selftext", "");
            post.url = "https://reddit.com" + data.value("permalink", "");
            post.subreddit = data.value("subreddit", "");
            post.score = data.value("score", 0);
            post.comment_count = data.value("num_comments", 0);
            
            // Check for paper links in URL and content
            std::string link_url = data.value("url", "");
            post.arxiv_id = extract_arxiv(link_url);
            if (post.arxiv_id.empty()) post.arxiv_id = extract_arxiv(post.title + " " + post.content);
            if (!post.arxiv_id.empty()) post.paper_url = "https://arxiv.org/abs/" + post.arxiv_id;
            
            // Timestamp
            double created = data.value("created_utc", 0.0);
            post.created_at = std::to_string(static_cast<int64_t>(created));
            
            posts.push_back(std::move(post));
        }
    } catch (const std::exception&) {}
    
    return posts;
}

std::vector<DiscoursePost> RedditCrawler::filter_paper_links(const std::vector<DiscoursePost>& posts) {
    std::vector<DiscoursePost> filtered;
    for (const auto& p : posts) {
        if (!p.arxiv_id.empty()) filtered.push_back(p);
    }
    return filtered;
}

// ============ NitterCrawler ============

std::vector<std::string> NitterCrawler::default_instances() {
    return {"nitter.net", "nitter.it", "nitter.privacydev.net", "nitter.poast.org"};
}

std::vector<std::string> NitterCrawler::default_influencers() {
    return {"karpathy", "ylecun", "AndrewYNg", "goodaborb", "sama", "ilyasut"};
}

std::string NitterCrawler::build_search_url(const std::string& instance, const std::string& query) {
    std::string encoded_query = query;
    // Simple URL encoding for spaces
    size_t pos = 0;
    while ((pos = encoded_query.find(' ', pos)) != std::string::npos) {
        encoded_query.replace(pos, 1, "%20");
        pos += 3;
    }
    return "https://" + instance + "/search?f=tweets&q=" + encoded_query;
}

std::string NitterCrawler::build_user_url(const std::string& instance, const std::string& username) {
    return "https://" + instance + "/" + username;
}

std::vector<DiscoursePost> NitterCrawler::parse_timeline(std::string_view html) {
    std::vector<DiscoursePost> posts;
    
    parser::HtmlParser parser;
    if (!parser.parse(html)) return posts;
    
    auto tweets = parser.select_all(".timeline-item");
    
    for (const auto& tweet : tweets) {
        DiscoursePost post;
        post.platform = "twitter";
        
        std::string text = tweet.get_text();
        post.content = text;
        post.arxiv_id = extract_arxiv(text);
        
        if (!post.arxiv_id.empty()) {
            post.paper_url = "https://arxiv.org/abs/" + post.arxiv_id;
            posts.push_back(std::move(post));
        }
    }
    
    return posts;
}

std::vector<DiscoursePost> NitterCrawler::parse_search(std::string_view html) {
    return parse_timeline(html);  // Same structure
}

// ============ HackerNewsCrawler ============

std::string HackerNewsCrawler::build_search_url(const std::string& query, int hits) {
    std::string encoded = query;
    size_t pos = 0;
    while ((pos = encoded.find(' ', pos)) != std::string::npos) {
        encoded.replace(pos, 1, "%20");
        pos += 3;
    }
    return "https://hn.algolia.com/api/v1/search?query=" + encoded + 
           "&tags=story&hitsPerPage=" + std::to_string(hits);
}

std::string HackerNewsCrawler::front_page_url() {
    return "https://hn.algolia.com/api/v1/search?tags=front_page";
}

std::vector<DiscoursePost> HackerNewsCrawler::parse_algolia(std::string_view json_str) {
    std::vector<DiscoursePost> posts;
    
    try {
        auto j = json::parse(json_str);
        if (!j.contains("hits")) return posts;
        
        for (const auto& hit : j["hits"]) {
            DiscoursePost post;
            post.platform = "hackernews";
            post.id = hit.value("objectID", "");
            post.author = hit.value("author", "");
            post.title = hit.value("title", "");
            post.url = hit.value("url", "");
            post.score = hit.value("points", 0);
            post.comment_count = hit.value("num_comments", 0);
            post.created_at = hit.value("created_at", "");
            
            // Check for arxiv links
            post.arxiv_id = extract_arxiv(post.url);
            if (post.arxiv_id.empty()) post.arxiv_id = extract_arxiv(post.title);
            if (!post.arxiv_id.empty()) post.paper_url = "https://arxiv.org/abs/" + post.arxiv_id;
            
            posts.push_back(std::move(post));
        }
    } catch (const std::exception&) {}
    
    return posts;
}

} // namespace saraswati::crawlers
