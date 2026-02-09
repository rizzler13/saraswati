#include "controllers/Controllers.hpp"
#include <drogon/drogon.h>
#include <nlohmann/json.hpp>

namespace saraswati::controllers {

using json = nlohmann::json;
using namespace drogon;

// Placeholder for global state (in production, use dependency injection)
extern std::atomic<bool> g_crawler_paused;
extern std::atomic<size_t> g_papers_count;
extern std::atomic<size_t> g_mentions_count;

// ============ GraphController ============

void GraphController::getTrending(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
    // Query Memgraph for trending papers
    std::string cypher = R"(
        MATCH (p:Paper)
        OPTIONAL MATCH (p)-[m:MENTIONED_ON]->(:Platform)
        WITH p, count(m) as mentions, coalesce(p.citation_count, 0) as citations
        WITH p, mentions + citations as score
        ORDER BY score DESC
        LIMIT 50
        RETURN p.arxiv_id as id, p.title as title, p.abstract as abstract,
               p.published_date as date, score
    )";
    
    // Mock response for now
    json response = json::array();
    response.push_back({
        {"id", "2401.12345"},
        {"title", "Example Paper Title"},
        {"abstract", "This is an example abstract..."},
        {"date", "2024-01-15"},
        {"score", 42}
    });
    
    auto resp = HttpResponse::newHttpJsonResponse(response);
    resp->addHeader("Access-Control-Allow-Origin", "*");
    callback(resp);
}

void GraphController::getClusters(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
    std::string cypher = R"(
        MATCH (c:Concept)<-[:BELONGS_TO]-(p:Paper)
        WITH c, count(p) as paper_count
        ORDER BY paper_count DESC
        LIMIT 20
        RETURN c.name as concept, paper_count
    )";
    
    json response = json::array();
    response.push_back({{"concept", "Large Language Models"}, {"count", 125}});
    response.push_back({{"concept", "Transformer Architecture"}, {"count", 89}});
    
    auto resp = HttpResponse::newHttpJsonResponse(response);
    resp->addHeader("Access-Control-Allow-Origin", "*");
    callback(resp);
}

void GraphController::getGraph(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
    std::string cypher = R"(
        MATCH (p:Paper)-[r]->(target)
        WHERE p.hype_score > 0 OR p.citation_count > 0
        RETURN p, r, target
        LIMIT 500
    )";
    
    json response = {
        {"nodes", json::array()},
        {"edges", json::array()}
    };
    
    // Mock nodes
    response["nodes"].push_back({
        {"id", "paper_1"}, {"type", "Paper"}, {"label", "GPT-4"}, {"size", 30}
    });
    response["nodes"].push_back({
        {"id", "concept_1"}, {"type", "Concept"}, {"label", "LLM"}, {"size", 50}
    });
    
    // Mock edges
    response["edges"].push_back({
        {"source", "paper_1"}, {"target", "concept_1"}, {"type", "BELONGS_TO"}
    });
    
    auto resp = HttpResponse::newHttpJsonResponse(response);
    resp->addHeader("Access-Control-Allow-Origin", "*");
    callback(resp);
}

void GraphController::getPaper(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback, const std::string& arxiv_id) {
    json response = {
        {"arxiv_id", arxiv_id},
        {"title", "Paper Title for " + arxiv_id},
        {"abstract", "Abstract content..."},
        {"authors", json::array({"Author 1", "Author 2"})},
        {"citation_count", 15},
        {"mentions", json::array()}
    };
    
    auto resp = HttpResponse::newHttpJsonResponse(response);
    resp->addHeader("Access-Control-Allow-Origin", "*");
    callback(resp);
}

void GraphController::search(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
    std::string query = req->getParameter("q");
    
    json response = {
        {"query", query},
        {"results", json::array()}
    };
    
    auto resp = HttpResponse::newHttpJsonResponse(response);
    resp->addHeader("Access-Control-Allow-Origin", "*");
    callback(resp);
}

// ============ CrawlerController ============

std::atomic<bool> g_crawler_paused{false};
std::atomic<size_t> g_papers_count{0};
std::atomic<size_t> g_mentions_count{0};

void CrawlerController::getStatus(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
    json response = {
        {"paused", g_crawler_paused.load()},
        {"papers_ingested", g_papers_count.load()},
        {"mentions_tracked", g_mentions_count.load()},
        {"active_threads", 4},
        {"memory_usage_mb", 512}
    };
    
    auto resp = HttpResponse::newHttpJsonResponse(response);
    resp->addHeader("Access-Control-Allow-Origin", "*");
    callback(resp);
}

void CrawlerController::pause(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
    g_crawler_paused = true;
    json response = {{"status", "paused"}, {"success", true}};
    auto resp = HttpResponse::newHttpJsonResponse(response);
    resp->addHeader("Access-Control-Allow-Origin", "*");
    callback(resp);
}

void CrawlerController::resume(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
    g_crawler_paused = false;
    json response = {{"status", "running"}, {"success", true}};
    auto resp = HttpResponse::newHttpJsonResponse(response);
    resp->addHeader("Access-Control-Allow-Origin", "*");
    callback(resp);
}

void CrawlerController::trigger(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
    // Trigger immediate crawl
    json response = {{"status", "triggered"}, {"success", true}};
    auto resp = HttpResponse::newHttpJsonResponse(response);
    resp->addHeader("Access-Control-Allow-Origin", "*");
    callback(resp);
}

// ============ HealthController ============

void HealthController::health(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
    json response = {
        {"status", "healthy"},
        {"version", "1.0.0"},
        {"uptime_seconds", 3600},
        {"memgraph", {{"connected", true}, {"memory_mb", 512}}},
        {"crawler", {{"paused", g_crawler_paused.load()}}}
    };
    
    auto resp = HttpResponse::newHttpJsonResponse(response);
    resp->addHeader("Access-Control-Allow-Origin", "*");
    callback(resp);
}

void HealthController::stats(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
    json response = {
        {"papers_total", g_papers_count.load()},
        {"mentions_total", g_mentions_count.load()},
        {"concepts_total", 150},
        {"authors_total", 500},
        {"papers_today", 42},
        {"trending_topics", json::array({"LLM", "RLHF", "Diffusion"})}
    };
    
    auto resp = HttpResponse::newHttpJsonResponse(response);
    resp->addHeader("Access-Control-Allow-Origin", "*");
    callback(resp);
}

} // namespace saraswati::controllers
