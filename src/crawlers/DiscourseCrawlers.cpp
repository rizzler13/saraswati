#include "crawlers/DiscourseCrawlers.hpp"
#include "parsers/SourceParsers.hpp"
#include "parser/HtmlParser.hpp"
#include <nlohmann/json.hpp>
#include <regex>
#include <algorithm>
#include <iostream>

namespace saraswati::crawlers {

using json = nlohmann::json;

// Helper to extract arxiv ID from any URL
static std::string extract_arxiv(const std::string& text) {
    std::regex arxiv_regex(R"(arxiv\.org/(?:abs|pdf)/(\d{4}\.\d{4,5}))");
    std::smatch m;
    if (std::regex_search(text, m, arxiv_regex)) return m[1].str();
    return "";
}
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
std::vector<std::string> NitterCrawler::default_instances() {
    // Twitter syndication API - returns timeline HTML with JSON in __NEXT_DATA__
    return {"syndication.twitter.com"};
}

std::vector<std::string> NitterCrawler::default_influencers() {
    return {"karpathy", "ylecun", "AndrewYNg", "sama", "ilyasut", "_jasonwei", "gaborb"};
}

std::string NitterCrawler::build_search_url(const std::string& instance, const std::string& query) {
    // syndication.twitter.com doesn't support search, return empty
    return "";
}

std::string NitterCrawler::build_user_url(const std::string& instance, const std::string& username) {
    // Twitter syndication embed timeline endpoint
    return "https://" + instance + "/srv/timeline-profile/screen-name/" + username;
}

std::vector<DiscoursePost> NitterCrawler::parse_timeline(std::string_view response_body) {
    std::vector<DiscoursePost> posts;
    
    // Extract __NEXT_DATA__ JSON from syndication.twitter.com response
    std::string body_str(response_body);
    const std::string marker = "__NEXT_DATA__";
    auto marker_pos = body_str.find(marker);
    if (marker_pos == std::string::npos) return posts;
    
    // Find the JSON content between > and </script>
    auto json_start = body_str.find('>', marker_pos);
    if (json_start == std::string::npos) return posts;
    json_start++; // skip '>'
    
    auto json_end = body_str.find("</script>", json_start);
    if (json_end == std::string::npos) return posts;
    
    std::string json_str = body_str.substr(json_start, json_end - json_start);
    
    try {
        auto j = json::parse(json_str);
        
        // Navigate: props.pageProps.timeline.entries[]
        if (!j.contains("props") || !j["props"].contains("pageProps")) return posts;
        auto& page = j["props"]["pageProps"];
        if (!page.contains("timeline") || !page["timeline"].contains("entries")) return posts;
        
        auto& entries = page["timeline"]["entries"];
        for (const auto& entry : entries) {
            if (!entry.contains("content") || !entry["content"].contains("tweet")) continue;
            auto& tweet = entry["content"]["tweet"];
            
            DiscoursePost post;
            post.platform = "twitter";
            post.id = tweet.value("id_str", "");
            post.content = tweet.value("full_text", tweet.value("text", ""));
            post.title = post.content.substr(0, std::min(post.content.size(), size_t(120)));
            post.score = tweet.value("favorite_count", 0) + tweet.value("retweet_count", 0);
            post.created_at = tweet.value("created_at", "");
            
            // Extract author from user object
            if (tweet.contains("user")) {
                post.author = tweet["user"].value("screen_name", "");
            }
            
            // Build URL from permalink
            std::string permalink = tweet.value("permalink", "");
            if (!permalink.empty()) {
                post.url = "https://x.com" + permalink;
            }
            
            post.arxiv_id = extract_arxiv(post.content);
            if (!post.arxiv_id.empty()) {
                post.paper_url = "https://arxiv.org/abs/" + post.arxiv_id;
            }
            
            if (!post.content.empty()) {
                posts.push_back(std::move(post));
            }
        }
    } catch (const std::exception& e) {
        std::cerr << "[NitterCrawler] JSON parse error: " << e.what() << "\n";
    }
    
    return posts;
}

std::vector<DiscoursePost> NitterCrawler::parse_search(std::string_view data) {
    return parse_timeline(data);
}
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

}
