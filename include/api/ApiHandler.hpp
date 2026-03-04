#pragma once
#include <drogon/HttpController.h>

namespace saraswati::api {

class ApiHandler : public drogon::HttpController<ApiHandler> {
public:
    METHOD_LIST_BEGIN
        ADD_METHOD_TO(ApiHandler::triggerCrawler, "/api/crawler/trigger/{type}", drogon::Post);
        ADD_METHOD_TO(ApiHandler::getStatus, "/api/crawler/status", drogon::Get);
        ADD_METHOD_TO(ApiHandler::getTrending, "/api/papers/trending", drogon::Get);
    METHOD_LIST_END

    void triggerCrawler(const drogon::HttpRequestPtr& req,
                       std::function<void(const drogon::HttpResponsePtr&)>&& callback,
                       std::string type);

    void getStatus(const drogon::HttpRequestPtr& req,
                   std::function<void(const drogon::HttpResponsePtr&)>&& callback);

    void getTrending(const drogon::HttpRequestPtr& req,
                     std::function<void(const drogon::HttpResponsePtr&)>&& callback);
};

}