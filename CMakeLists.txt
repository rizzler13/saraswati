cmake_minimum_required(VERSION 3.20)
project(saraswati VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

if(APPLE)
    set(CMAKE_OSX_ARCHITECTURES "arm64")
endif()

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

set(CMAKE_CXX_FLAGS_DEBUG "-g -O0 -DDEBUG")
set(CMAKE_CXX_FLAGS_RELEASE "-O3 -DNDEBUG")

find_package(Drogon REQUIRED)
find_package(CURL REQUIRED)
find_package(nlohmann_json 3.11 REQUIRED)
find_package(Threads REQUIRED)
find_package(OpenSSL REQUIRED)

find_library(MGCLIENT_LIBRARY NAMES mgclient PATHS /usr/local/lib /opt/homebrew/lib)
find_path(MGCLIENT_INCLUDE_DIR NAMES mgclient.h PATHS /usr/local/include /opt/homebrew/include)

if(NOT MGCLIENT_LIBRARY OR NOT MGCLIENT_INCLUDE_DIR)
    message(WARNING "mgclient not found. Will build without Memgraph support.")
    set(HAVE_MGCLIENT OFF)
else()
    set(HAVE_MGCLIENT ON)
    message(STATUS "Found mgclient: ${MGCLIENT_LIBRARY}")
endif()

find_library(GUMBO_LIBRARY NAMES gumbo)
find_path(GUMBO_INCLUDE_DIR NAMES gumbo.h)

if(NOT GUMBO_LIBRARY OR NOT GUMBO_INCLUDE_DIR)
    message(WARNING "Gumbo not found. HTML parsing will be disabled.")
    set(HAVE_GUMBO OFF)
else()
    set(HAVE_GUMBO ON)
    message(STATUS "Found Gumbo: ${GUMBO_LIBRARY}")
endif()

set(SARASWATI_SOURCES
    src/main.cpp
    src/db/MemgraphClient.cpp
    src/net/AsyncHttpClient.cpp
    src/util/BloomFilter.cpp
    src/parser/HtmlParser.cpp
    src/parsers/SourceParsers.cpp
    src/crawlers/DiscourseCrawlers.cpp
    src/controllers/Controllers.cpp
    src/pipeline/DataPipeline.cpp
)

add_executable(${PROJECT_NAME} ${SARASWATI_SOURCES})

target_include_directories(${PROJECT_NAME} PRIVATE
    ${CMAKE_SOURCE_DIR}/include
    ${CURL_INCLUDE_DIRS}
)

if(HAVE_MGCLIENT)
    target_include_directories(${PROJECT_NAME} PRIVATE ${MGCLIENT_INCLUDE_DIR})
    target_compile_definitions(${PROJECT_NAME} PRIVATE HAVE_MGCLIENT=1)
endif()

if(HAVE_GUMBO)
    target_include_directories(${PROJECT_NAME} PRIVATE ${GUMBO_INCLUDE_DIR})
    target_compile_definitions(${PROJECT_NAME} PRIVATE HAVE_GUMBO=1)
endif()

target_link_libraries(${PROJECT_NAME} PRIVATE
    Drogon::Drogon
    CURL::libcurl
    nlohmann_json::nlohmann_json
    Threads::Threads
    OpenSSL::SSL
    OpenSSL::Crypto
)

if(HAVE_MGCLIENT)
    target_link_libraries(${PROJECT_NAME} PRIVATE ${MGCLIENT_LIBRARY})
endif()

if(HAVE_GUMBO)
    target_link_libraries(${PROJECT_NAME} PRIVATE ${GUMBO_LIBRARY})
endif()

install(TARGETS ${PROJECT_NAME} DESTINATION bin)
install(DIRECTORY ${CMAKE_SOURCE_DIR}/config/ DESTINATION etc/saraswati)

option(BUILD_TESTS "Build unit tests" OFF)

if(BUILD_TESTS)
    enable_testing()
    find_package(GTest REQUIRED)

    add_executable(saraswati_tests
        tests/test_bloom_filter.cpp
        tests/test_parsers.cpp
    )

    target_link_libraries(saraswati_tests PRIVATE
        GTest::gtest_main
        nlohmann_json::nlohmann_json
    )

    include(GoogleTest)
    gtest_discover_tests(saraswati_tests)
endif()
