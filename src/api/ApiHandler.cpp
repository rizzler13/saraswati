#include "api/ApiHandler.hpp"

namespace saraswati::api {

void ApiHandler::triggerCrawler(const drogon::HttpRequestPtr& req,
                               std::function<void(const drogon::HttpResponsePtr&)>&& callback,
                               std::string type) {
    Json::Value json;
    json["status"] = "triggered";
    json["target"] = type;
    json["message"] = "Crawler started for " + type;
    auto resp = drogon::HttpResponse::newHttpJsonResponse(json);
    callback(resp);
}

void ApiHandler::getStatus(const drogon::HttpRequestPtr& req,
                          std::function<void(const drogon::HttpResponsePtr&)>&& callback) {
    Json::Value json;
    json["active"] = true;
    json["papers_indexed"] = 124; 
    json["memory_usage"] = "12MB";
    auto resp = drogon::HttpResponse::newHttpJsonResponse(json);
    callback(resp);
}

void ApiHandler::getTrending(const drogon::HttpRequestPtr& req,
                             std::function<void(const drogon::HttpResponsePtr&)>&& callback) {
    Json::Value json;
    Json::Value papers(Json::arrayValue);
    
    Json::Value p1;
    p1["title"] = "Self-Evolving Neural Networks";
    p1["authors"] = "K. He, et al.";
    p1["hype_score"] = 98;
    papers.append(p1);

    json["papers"] = papers;
    auto resp = drogon::HttpResponse::newHttpJsonResponse(json);
    callback(resp);
}

}