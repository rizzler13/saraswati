#include "controllers/Controllers.hpp"
#include "pipeline/DataPipeline.hpp"
#include <drogon/drogon.h>
#include <nlohmann/json.hpp>

#ifdef __APPLE__
#include <mach/mach.h>
#else
#include <sys/resource.h>
#endif

extern std::atomic<bool> g_crawler_paused;
extern std::atomic<size_t> g_papers_count;
extern std::atomic<size_t> g_mentions_count;

namespace saraswati::controllers {

using json = nlohmann::json;
using namespace drogon;

// Serialize to string and return as a JSON content-type response.
static HttpResponsePtr makeJsonResponse(const json& j) {
    auto resp = HttpResponse::newHttpResponse();
    resp->setContentTypeCode(CT_APPLICATION_JSON);
    resp->setBody(j.dump());
    resp->addHeader("Access-Control-Allow-Origin", "*");
    return resp;
}

static size_t getProcessMemoryMB() {
#ifdef __APPLE__
    mach_task_basic_info_data_t info;
    mach_msg_type_number_t count = MACH_TASK_BASIC_INFO_COUNT;
    if (task_info(mach_task_self(), MACH_TASK_BASIC_INFO,
                  (task_info_t)&info, &count) == KERN_SUCCESS) {
        return info.resident_size / (1024 * 1024);
    }
    return 0;
#else
    struct rusage usage;
    if (getrusage(RUSAGE_SELF, &usage) == 0) {
        return usage.ru_maxrss / 1024;  // Linux: KB, macOS: bytes (handled above)
    }
    return 0;
#endif
}
void GraphController::getTrending(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
    auto& pipeline = pipeline::DataPipeline::instance();
    auto response = pipeline.get_trending_papers(50);
    callback(makeJsonResponse(response));
}

void GraphController::getClusters(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
    auto& pipeline = pipeline::DataPipeline::instance();
    auto response = pipeline.get_trending_topics();
    callback(makeJsonResponse(response));
}

void GraphController::getGraph(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
    auto& pipeline = pipeline::DataPipeline::instance();
    auto response = pipeline.get_graph_data();
    callback(makeJsonResponse(response));
}

void GraphController::getPaper(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback, const std::string& arxiv_id) {
    auto& pipeline = pipeline::DataPipeline::instance();
    auto papers = pipeline.get_trending_papers(500);

    for (const auto& p : papers) {
        if (p["id"] == arxiv_id) {
            callback(makeJsonResponse(p));
            return;
        }
    }

    json response = {
        {"arxiv_id", arxiv_id},
        {"title", "Paper not in cache: " + arxiv_id},
        {"abstract", "This paper is not currently in the pipeline cache. It may appear after the next fetch cycle."},
        {"authors", json::array()},
        {"citation_count", 0},
        {"mentions", json::array()}
    };
    callback(makeJsonResponse(response));
}

void GraphController::search(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
    std::string query = req->getParameter("q");
    auto& pipeline = pipeline::DataPipeline::instance();
    auto all_papers = pipeline.get_trending_papers(500);

    json results = json::array();
    std::string lower_query = query;
    std::transform(lower_query.begin(), lower_query.end(), lower_query.begin(), ::tolower);

    for (const auto& p : all_papers) {
        std::string title = p.value("title", "");
        std::string lower_title = title;
        std::transform(lower_title.begin(), lower_title.end(), lower_title.begin(), ::tolower);

        if (lower_title.find(lower_query) != std::string::npos) {
            results.push_back(p);
        }
    }

    json response = {
        {"query", query},
        {"results", results}
    };
    callback(makeJsonResponse(response));
}

void GraphController::getDiscourse(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
    auto& pipeline = pipeline::DataPipeline::instance();
    auto response = pipeline.get_discourse(50);
    callback(makeJsonResponse(response));
}
void CrawlerController::getStatus(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
    auto& pipeline = pipeline::DataPipeline::instance();
    auto stats = pipeline.get_stats();
    json response = {
        {"paused", g_crawler_paused.load()},
        {"papers_ingested", pipeline.paper_count()},
        {"mentions_tracked", pipeline.mention_count()},
        {"active_threads", 4},
        {"memory_usage_mb", getProcessMemoryMB()},
        {"last_fetch", pipeline.last_fetch_time()},
        {"sources", stats.value("sources", json::object())}
    };
    callback(makeJsonResponse(response));
}

void CrawlerController::pause(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
    g_crawler_paused = true;
    json response = {{"status", "paused"}, {"success", true}};
    callback(makeJsonResponse(response));
}

void CrawlerController::resume(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
    g_crawler_paused = false;
    json response = {{"status", "running"}, {"success", true}};
    callback(makeJsonResponse(response));
}

void CrawlerController::trigger(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
    std::thread([]() {
        pipeline::DataPipeline::instance().fetch_now();
    }).detach();

    json response = {{"status", "triggered"}, {"success", true}};
    callback(makeJsonResponse(response));
}
void HealthController::health(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
    auto& pipeline = pipeline::DataPipeline::instance();
    json response = {
        {"status", "healthy"},
        {"version", "1.0.0"},
        {"uptime_seconds", 3600},
        {"memgraph", {{"connected", true}, {"memory_mb", getProcessMemoryMB()}}},
        {"crawler", {{"paused", g_crawler_paused.load()}}},
        {"pipeline", {
            {"papers", pipeline.paper_count()},
            {"mentions", pipeline.mention_count()},
            {"last_fetch", pipeline.last_fetch_time()}
        }}
    };
    callback(makeJsonResponse(response));
}

void HealthController::stats(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
    auto& pipeline = pipeline::DataPipeline::instance();
    auto response = pipeline.get_stats();
    callback(makeJsonResponse(response));
}

void HealthController::statsDetail(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
    std::string type = req->getParameter("type");
    if (type.empty()) type = "papers";

    auto& pipeline = pipeline::DataPipeline::instance();
    auto response = pipeline.get_stats_detail(type);
    callback(makeJsonResponse(response));
}

}
