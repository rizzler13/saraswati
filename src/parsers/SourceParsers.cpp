#include "parsers/SourceParsers.hpp"
#include "parser/HtmlParser.hpp"
#include <regex>
#include <sstream>
#include <algorithm>
#include <nlohmann/json.hpp>

namespace saraswati::parsers {

using json = nlohmann::json;

// ============ ArxivParser ============

std::vector<std::string> ArxivParser::default_categories() {
    return {"cs.AI", "cs.LG", "cs.CL"};
}

std::string ArxivParser::build_rss_url(const std::string& category) {
    return "http://export.arxiv.org/rss/" + category;
}

std::string ArxivParser::extract_arxiv_id(const std::string& url) {
    std::regex id_regex(R"(arxiv\.org/abs/(\d{4}\.\d{4,5})(v\d+)?|arxiv\.org/pdf/(\d{4}\.\d{4,5}))");
    std::smatch match;
    if (std::regex_search(url, match, id_regex)) {
        return match[1].matched ? match[1].str() : match[3].str();
    }
    return "";
}

std::vector<ArxivPaper> ArxivParser::parse_rss(std::string_view rss_content) {
    std::vector<ArxivPaper> papers;
    auto items = parser::XmlParser::parse_rss(rss_content);
    
    for (const auto& item : items) {
        ArxivPaper paper;
        paper.title = item.title;
        paper.abs_url = item.link;
        paper.arxiv_id = extract_arxiv_id(item.link);
        paper.abstract = item.description;
        paper.published_date = item.pub_date;
        
        // Extract authors from dc:creator if available
        if (auto it = item.dc_fields.find("creator"); it != item.dc_fields.end()) {
            std::istringstream iss(it->second);
            std::string author;
            while (std::getline(iss, author, ',')) {
                while (!author.empty() && std::isspace(author.front())) author.erase(0, 1);
                while (!author.empty() && std::isspace(author.back())) author.pop_back();
                if (!author.empty()) paper.authors.push_back(author);
            }
        }
        
        // Clean title (remove newlines)
        std::replace(paper.title.begin(), paper.title.end(), '\n', ' ');
        
        // Generate PDF URL
        if (!paper.arxiv_id.empty()) {
            paper.pdf_url = "https://arxiv.org/pdf/" + paper.arxiv_id + ".pdf";
        }
        
        papers.push_back(std::move(paper));
    }
    
    return papers;
}

// ============ BiorxivParser ============

std::vector<std::string> BiorxivParser::default_keywords() {
    return {"CRISPR", "mRNA", "Longevity", "gene therapy", "immunotherapy"};
}

std::string BiorxivParser::build_api_url(const std::string& server, const std::string& interval) {
    // API: https://api.biorxiv.org/details/[server]/[interval]/[cursor]
    // interval format: YYYY-MM-DD/YYYY-MM-DD
    return "https://api.biorxiv.org/details/" + server + "/" + interval + "/0";
}

std::vector<BiorxivPaper> BiorxivParser::parse_api_response(std::string_view json_str) {
    std::vector<BiorxivPaper> papers;
    
    try {
        auto j = json::parse(json_str);
        if (!j.contains("collection")) return papers;
        
        for (const auto& item : j["collection"]) {
            BiorxivPaper paper;
            paper.doi = item.value("doi", "");
            paper.biorxiv_id = item.value("biorxiv_doi", "");
            paper.title = item.value("title", "");
            paper.abstract = item.value("abstract", "");
            paper.published_date = item.value("date", "");
            paper.category = item.value("category", "");
            paper.server = item.value("server", "biorxiv");
            
            // Authors come as a single string
            std::string authors_str = item.value("authors", "");
            std::istringstream iss(authors_str);
            std::string author;
            while (std::getline(iss, author, ';')) {
                while (!author.empty() && std::isspace(author.front())) author.erase(0, 1);
                while (!author.empty() && std::isspace(author.back())) author.pop_back();
                if (!author.empty()) paper.authors.push_back(author);
            }
            
            papers.push_back(std::move(paper));
        }
    } catch (const std::exception& e) {
        // Log error but continue
    }
    
    return papers;
}

std::vector<BiorxivPaper> BiorxivParser::filter_by_keywords(
    const std::vector<BiorxivPaper>& papers,
    const std::vector<std::string>& keywords
) {
    std::vector<BiorxivPaper> filtered;
    
    for (const auto& paper : papers) {
        std::string combined = paper.title + " " + paper.abstract;
        std::transform(combined.begin(), combined.end(), combined.begin(), ::tolower);
        
        for (const auto& kw : keywords) {
            std::string lower_kw = kw;
            std::transform(lower_kw.begin(), lower_kw.end(), lower_kw.begin(), ::tolower);
            
            if (combined.find(lower_kw) != std::string::npos) {
                filtered.push_back(paper);
                break;
            }
        }
    }
    
    return filtered;
}

// ============ HuggingFaceParser ============

std::string HuggingFaceParser::papers_url() {
    return "https://huggingface.co/papers";
}

std::vector<HuggingFacePaper> HuggingFaceParser::parse_papers_page(std::string_view html) {
    std::vector<HuggingFacePaper> papers;
    
    parser::HtmlParser parser;
    if (!parser.parse(html)) return papers;
    
    // Look for paper cards
    auto cards = parser.select_all("article");
    
    for (const auto& card : cards) {
        HuggingFacePaper paper;
        
        // Extract title from h3 or first link
        if (auto title_el = card.get_attribute("data-title")) {
            paper.title = *title_el;
        }
        
        // Try to find arxiv link
        for (const auto& [name, val] : card.attributes) {
            if (val.find("arxiv.org") != std::string::npos) {
                paper.arxiv_id = ArxivParser::extract_arxiv_id(val);
            }
        }
        
        // Extract upvotes if available
        auto text = card.get_text();
        std::regex vote_regex(R"((\d+)\s*(upvote|like))");
        std::smatch m;
        if (std::regex_search(text, m, vote_regex)) {
            paper.upvotes = std::stoi(m[1].str());
        }
        
        if (!paper.title.empty() || !paper.arxiv_id.empty()) {
            papers.push_back(std::move(paper));
        }
    }
    
    return papers;
}

std::vector<HuggingFacePaper> HuggingFaceParser::parse_api_response(std::string_view json_str) {
    std::vector<HuggingFacePaper> papers;
    
    try {
        auto j = json::parse(json_str);
        
        for (const auto& item : j) {
            HuggingFacePaper paper;
            paper.hf_id = item.value("id", "");
            paper.title = item.value("title", "");
            paper.summary = item.value("summary", "");
            paper.upvotes = item.value("upvotes", 0);
            paper.published_date = item.value("publishedAt", "");
            
            if (item.contains("paper") && item["paper"].contains("id")) {
                paper.arxiv_id = item["paper"]["id"].get<std::string>();
            }
            
            if (item.contains("authors")) {
                for (const auto& author : item["authors"]) {
                    paper.authors.push_back(author.value("name", ""));
                }
            }
            
            papers.push_back(std::move(paper));
        }
    } catch (const std::exception& e) {
        // Log error but continue
    }
    
    return papers;
}

} // namespace saraswati::parsers
