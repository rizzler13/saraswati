#pragma once
#include <string>
#include <vector>
#include <optional>
#include <functional>

namespace saraswati::clients {

struct CitationData {
    std::string paper_id;
    std::string arxiv_id;
    int citation_count = 0;
    int influential_citation_count = 0;
    int reference_count = 0;
    std::string title;
    int year = 0;
    std::vector<std::string> fields_of_study;
};

struct ConceptExtraction {
    std::vector<std::string> concepts;
    std::vector<std::string> entities;
    std::vector<std::string> methods;
    std::string summary;
};

class SemanticScholarClient {
public:
    static std::optional<CitationData> fetch_by_arxiv_id(const std::string& arxiv_id);
    static std::optional<CitationData> parse_response(std::string_view json);
    static std::string build_url(const std::string& arxiv_id);
};

class GeminiClient {
public:
    explicit GeminiClient(const std::string& api_key, const std::string& model = "gemini-1.5-flash");
    std::optional<ConceptExtraction> extract_concepts(const std::string& abstract);
    std::optional<std::string> summarize(const std::string& text, int max_words = 50);
    static ConceptExtraction parse_extraction(std::string_view json);
private:
    std::string api_key_;
    std::string model_;
    std::string build_url() const;
};

}
