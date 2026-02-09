#include "clients/ApiClients.hpp"
#include <nlohmann/json.hpp>
#include <regex>

namespace saraswati::clients {

using json = nlohmann::json;

// ============ SemanticScholarClient ============

std::string SemanticScholarClient::build_url(const std::string& arxiv_id) {
    return "https://api.semanticscholar.org/graph/v1/paper/arXiv:" + arxiv_id +
           "?fields=citationCount,influentialCitationCount,referenceCount,title,year,fieldsOfStudy";
}

std::optional<CitationData> SemanticScholarClient::parse_response(std::string_view json_str) {
    try {
        auto j = json::parse(json_str);
        
        CitationData data;
        data.paper_id = j.value("paperId", "");
        data.title = j.value("title", "");
        data.citation_count = j.value("citationCount", 0);
        data.influential_citation_count = j.value("influentialCitationCount", 0);
        data.reference_count = j.value("referenceCount", 0);
        data.year = j.value("year", 0);
        
        if (j.contains("fieldsOfStudy") && j["fieldsOfStudy"].is_array()) {
            for (const auto& f : j["fieldsOfStudy"]) {
                if (f.is_string()) data.fields_of_study.push_back(f.get<std::string>());
            }
        }
        
        // Extract arxiv ID from externalIds if available
        if (j.contains("externalIds") && j["externalIds"].contains("ArXiv")) {
            data.arxiv_id = j["externalIds"]["ArXiv"].get<std::string>();
        }
        
        return data;
    } catch (const std::exception&) {
        return std::nullopt;
    }
}

// ============ GeminiClient ============

GeminiClient::GeminiClient(const std::string& api_key, const std::string& model)
    : api_key_(api_key), model_(model) {}

std::string GeminiClient::build_url() const {
    return "https://generativelanguage.googleapis.com/v1beta/models/" + model_ + 
           ":generateContent?key=" + api_key_;
}

ConceptExtraction GeminiClient::parse_extraction(std::string_view json_str) {
    ConceptExtraction result;
    
    try {
        auto j = json::parse(json_str);
        
        // Navigate Gemini response structure
        if (j.contains("candidates") && !j["candidates"].empty()) {
            auto& content = j["candidates"][0]["content"]["parts"][0]["text"];
            std::string text = content.get<std::string>();
            
            // Try to parse as JSON if the model returned JSON
            try {
                auto parsed = json::parse(text);
                if (parsed.contains("concepts")) {
                    for (const auto& c : parsed["concepts"]) result.concepts.push_back(c.get<std::string>());
                }
                if (parsed.contains("entities")) {
                    for (const auto& e : parsed["entities"]) result.entities.push_back(e.get<std::string>());
                }
                if (parsed.contains("methods")) {
                    for (const auto& m : parsed["methods"]) result.methods.push_back(m.get<std::string>());
                }
                if (parsed.contains("summary")) {
                    result.summary = parsed["summary"].get<std::string>();
                }
            } catch (...) {
                // If not JSON, extract concepts from plain text
                std::regex concept_regex(R"(\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b)");
                auto begin = std::sregex_iterator(text.begin(), text.end(), concept_regex);
                auto end = std::sregex_iterator();
                for (auto it = begin; it != end && result.concepts.size() < 5; ++it) {
                    result.concepts.push_back((*it)[0].str());
                }
            }
        }
    } catch (const std::exception&) {}
    
    return result;
}

} // namespace saraswati::clients
