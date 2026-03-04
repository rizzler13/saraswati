#pragma once
#include <string>
#include <vector>
#include <optional>
#include <chrono>

namespace saraswati::parsers {

struct ArxivPaper {
    std::string arxiv_id;       // e.g., "2401.12345"
    std::string title;
    std::string abstract;
    std::vector<std::string> authors;
    std::string published_date;
    std::string updated_date;
    std::string primary_category;
    std::vector<std::string> categories;
    std::string pdf_url;
    std::string abs_url;
};

struct BiorxivPaper {
    std::string doi;
    std::string biorxiv_id;
    std::string title;
    std::string abstract;
    std::vector<std::string> authors;
    std::string published_date;
    std::string category;
    std::string server;  // "biorxiv" or "medrxiv"
};

struct HuggingFacePaper {
    std::string hf_id;
    std::string title;
    std::string arxiv_id;
    std::string summary;
    int upvotes = 0;
    std::string published_date;
    std::vector<std::string> authors;
};

class ArxivParser {
public:
    static std::vector<ArxivPaper> parse_rss(std::string_view rss_content);
    static std::optional<ArxivPaper> parse_atom_entry(std::string_view entry_xml);
    static std::string extract_arxiv_id(const std::string& url);
    static std::string build_rss_url(const std::string& category);
    static std::vector<std::string> default_categories();
};

class BiorxivParser {
public:
    static std::vector<BiorxivPaper> parse_api_response(std::string_view json);
    static std::vector<BiorxivPaper> filter_by_keywords(
        const std::vector<BiorxivPaper>& papers,
        const std::vector<std::string>& keywords
    );
    static std::string build_api_url(const std::string& server, const std::string& interval);
    static std::vector<std::string> default_keywords();
};

class HuggingFaceParser {
public:
    static std::vector<HuggingFacePaper> parse_papers_page(std::string_view html);
    static std::vector<HuggingFacePaper> parse_api_response(std::string_view json);
    static std::string papers_url();
};

}
