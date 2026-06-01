#pragma once
#include <drogon/HttpController.h>

namespace saraswati::controllers {

class GraphController : public drogon::HttpController<GraphController> {
public:
    METHOD_LIST_BEGIN
    ADD_METHOD_TO(GraphController::getTrending, "/api/papers/trending", drogon::Get);
    ADD_METHOD_TO(GraphController::getClusters, "/api/clusters", drogon::Get);
    ADD_METHOD_TO(GraphController::getGraph, "/api/graph", drogon::Get);
    ADD_METHOD_TO(GraphController::getPaper, "/api/papers/{arxiv_id}", drogon::Get);
    ADD_METHOD_TO(GraphController::search, "/api/search", drogon::Get);
    ADD_METHOD_TO(GraphController::getDiscourse, "/api/discourse", drogon::Get);
    METHOD_LIST_END

    void getTrending(const drogon::HttpRequestPtr& req,
                     std::function<void(const drogon::HttpResponsePtr&)>&& callback);
    void getClusters(const drogon::HttpRequestPtr& req,
                     std::function<void(const drogon::HttpResponsePtr&)>&& callback);
    void getGraph(const drogon::HttpRequestPtr& req,
                  std::function<void(const drogon::HttpResponsePtr&)>&& callback);
    void getPaper(const drogon::HttpRequestPtr& req,
                  std::function<void(const drogon::HttpResponsePtr&)>&& callback,
                  const std::string& arxiv_id);
    void search(const drogon::HttpRequestPtr& req,
                std::function<void(const drogon::HttpResponsePtr&)>&& callback);
    void getDiscourse(const drogon::HttpRequestPtr& req,
                      std::function<void(const drogon::HttpResponsePtr&)>&& callback);
};

class CrawlerController : public drogon::HttpController<CrawlerController> {
public:
    METHOD_LIST_BEGIN
    ADD_METHOD_TO(CrawlerController::getStatus, "/api/crawler/status", drogon::Get);
    ADD_METHOD_TO(CrawlerController::pause, "/api/crawler/pause", drogon::Post);
    ADD_METHOD_TO(CrawlerController::resume, "/api/crawler/resume", drogon::Post);
    ADD_METHOD_TO(CrawlerController::trigger, "/api/crawler/trigger", drogon::Post);
    METHOD_LIST_END

    void getStatus(const drogon::HttpRequestPtr& req,
                   std::function<void(const drogon::HttpResponsePtr&)>&& callback);
    void pause(const drogon::HttpRequestPtr& req,
               std::function<void(const drogon::HttpResponsePtr&)>&& callback);
    void resume(const drogon::HttpRequestPtr& req,
                std::function<void(const drogon::HttpResponsePtr&)>&& callback);
    void trigger(const drogon::HttpRequestPtr& req,
                 std::function<void(const drogon::HttpResponsePtr&)>&& callback);
};

class HealthController : public drogon::HttpController<HealthController> {
public:
    METHOD_LIST_BEGIN
    ADD_METHOD_TO(HealthController::health, "/api/health", drogon::Get);
    ADD_METHOD_TO(HealthController::stats, "/api/stats", drogon::Get);
    ADD_METHOD_TO(HealthController::statsDetail, "/api/stats/detail", drogon::Get);
    METHOD_LIST_END

    void health(const drogon::HttpRequestPtr& req,
                std::function<void(const drogon::HttpResponsePtr&)>&& callback);
    void stats(const drogon::HttpRequestPtr& req,
               std::function<void(const drogon::HttpResponsePtr&)>&& callback);
    void statsDetail(const drogon::HttpRequestPtr& req,
                     std::function<void(const drogon::HttpResponsePtr&)>&& callback);
};

class ResearchController : public drogon::HttpController<ResearchController> {
public:
    METHOD_LIST_BEGIN
    ADD_METHOD_TO(ResearchController::chat, "/api/research", drogon::Post);
    METHOD_LIST_END

    void chat(const drogon::HttpRequestPtr& req,
              std::function<void(const drogon::HttpResponsePtr&)>&& callback);
};

}
