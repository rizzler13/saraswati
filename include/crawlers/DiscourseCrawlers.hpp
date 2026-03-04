#pragma once
#include <string>
#include <vector>
#include <functional>
#include <chrono>

namespace saraswati::crawlers {

struct DiscoursePost {
    std::string id;
    std::string platform;       // "reddit", "twitter", "hackernews"
    std::string author;
    std::string title;
    std::string content;
    std::string url;
    std::string paper_url;      // Extracted arxiv/paper link
    std::string arxiv_id;
    int score = 0;
    int comment_count = 0;
    std::string created_at;
    std::string subreddit;      // Reddit only
    bool is_influencer = false;
};

using PostCallback = std::function<void(DiscoursePost)>;

class RedditCrawler {
public:
    static std::vector<DiscoursePost> parse_listing(std::string_view json);
    static std::string build_url(const std::string& subreddit, const std::string& sort = "new");
    static std::vector<std::string> default_subreddits();
    static std::vector<DiscoursePost> filter_paper_links(const std::vector<DiscoursePost>& posts);
};

class NitterCrawler {
public:
    static std::vector<DiscoursePost> parse_timeline(std::string_view html);
    static std::vector<DiscoursePost> parse_search(std::string_view html);
    static std::string build_search_url(const std::string& instance, const std::string& query);
    static std::string build_user_url(const std::string& instance, const std::string& username);
    static std::vector<std::string> default_instances();
    static std::vector<std::string> default_influencers();
};

class HackerNewsCrawler {
public:
    static std::vector<DiscoursePost> parse_algolia(std::string_view json);
    static std::string build_search_url(const std::string& query, int hits = 50);
    static std::string front_page_url();
};

}
