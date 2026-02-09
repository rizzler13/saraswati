#pragma once

#include <memory>
#include <string>
#include <string_view>
#include <vector>
#include <optional>
#include <functional>

#ifdef HAVE_GUMBO
#include <gumbo.h>
#endif

namespace saraswati::parser {

/**
 * @brief Represents an HTML element in the parsed DOM
 */
struct HtmlElement {
    std::string tag;
    std::string id;
    std::vector<std::string> classes;
    std::unordered_map<std::string, std::string> attributes;
    std::string text_content;
    std::string inner_html;
    std::vector<HtmlElement> children;
    
    // Convenience accessors
    bool has_class(std::string_view cls) const;
    std::optional<std::string> get_attribute(std::string_view name) const;
    std::string get_text() const; // Recursive text content
};

/**
 * @brief CSS selector result
 */
struct SelectorResult {
    std::vector<HtmlElement> elements;
    bool success = false;
    std::string error_message;
    
    bool empty() const { return elements.empty(); }
    size_t size() const { return elements.size(); }
    
    HtmlElement& operator[](size_t i) { return elements[i]; }
    const HtmlElement& operator[](size_t i) const { return elements[i]; }
    
    auto begin() { return elements.begin(); }
    auto end() { return elements.end(); }
    auto begin() const { return elements.begin(); }
    auto end() const { return elements.end(); }
};

/**
 * @brief Low-memory HTML parser using Google Gumbo
 * 
 * Design constraints (8GB M1 MacBook):
 * - Streaming-friendly: parse partial HTML
 * - Memory-efficient: reuse output buffer
 * - Simple CSS selector support
 */
class HtmlParser {
public:
    HtmlParser();
    ~HtmlParser();
    
    // Non-copyable, movable
    HtmlParser(const HtmlParser&) = delete;
    HtmlParser& operator=(const HtmlParser&) = delete;
    HtmlParser(HtmlParser&&) noexcept;
    HtmlParser& operator=(HtmlParser&&) noexcept;
    
    /**
     * @brief Parse HTML string
     * @param html HTML content to parse
     * @return true if parsed successfully
     */
    bool parse(std::string_view html);
    
    /**
     * @brief Parse HTML from file
     */
    bool parse_file(const std::string& path);
    
    /**
     * @brief Check if HTML is currently parsed
     */
    bool is_parsed() const;
    
    /**
     * @brief Clear parsed content and free memory
     */
    void clear();
    
    /**
     * @brief Select all elements matching a simple CSS selector
     * 
     * Supported selectors:
     * - tag: "div", "a", "p"
     * - .class: ".article", ".title"
     * - #id: "#main", "#content"
     * - tag.class: "div.container"
     * - tag[attr]: "a[href]"
     * - tag[attr=value]: "a[rel=author]"
     * 
     * @param selector CSS selector string
     * @return Matching elements
     */
    SelectorResult select_all(std::string_view selector) const;
    
    /**
     * @brief Select first element matching selector
     */
    std::optional<HtmlElement> select_first(std::string_view selector) const;
    
    /**
     * @brief Get text content of first matching element
     */
    std::optional<std::string> select_text(std::string_view selector) const;
    
    /**
     * @brief Get attribute value of first matching element
     */
    std::optional<std::string> select_attribute(
        std::string_view selector,
        std::string_view attribute
    ) const;
    
    /**
     * @brief Get all text content from document
     */
    std::string get_all_text() const;
    
    /**
     * @brief Get document title
     */
    std::optional<std::string> get_title() const;
    
    /**
     * @brief Get all links (href values)
     */
    std::vector<std::string> get_links() const;
    
    /**
     * @brief Get meta content by name
     */
    std::optional<std::string> get_meta(std::string_view name) const;
    
    /**
     * @brief Get root element
     */
    std::optional<HtmlElement> root() const;

private:
#ifdef HAVE_GUMBO
    GumboOutput* output_ = nullptr;
    
    // Internal traversal helpers
    HtmlElement convert_node(const GumboNode* node) const;
    void collect_matching(
        const GumboNode* node,
        const std::function<bool(const GumboNode*)>& matcher,
        std::vector<HtmlElement>& results
    ) const;
    std::string get_node_text(const GumboNode* node) const;
    
    // Selector parsing
    struct ParsedSelector {
        std::string tag;
        std::string id;
        std::vector<std::string> classes;
        std::string attr_name;
        std::string attr_value;
        bool has_attr_match = false;
    };
    ParsedSelector parse_selector(std::string_view selector) const;
    bool node_matches_selector(const GumboNode* node, const ParsedSelector& sel) const;
#endif
    
    std::string cached_html_; // Keep source for complex operations
};

/**
 * @brief XML/RSS parser (subset for ArXiv feeds)
 */
class XmlParser {
public:
    struct XmlElement {
        std::string tag;
        std::string text;
        std::unordered_map<std::string, std::string> attributes;
        std::vector<XmlElement> children;
        
        std::optional<XmlElement> find_child(std::string_view tag) const;
        std::vector<XmlElement> find_all_children(std::string_view tag) const;
        std::optional<std::string> get_child_text(std::string_view tag) const;
    };
    
    /**
     * @brief Parse XML/RSS content
     */
    static std::optional<XmlElement> parse(std::string_view xml);
    
    /**
     * @brief Parse RSS feed and extract items
     */
    struct RssItem {
        std::string title;
        std::string link;
        std::string description;
        std::string pub_date;
        std::string guid;
        std::vector<std::string> categories;
        std::unordered_map<std::string, std::string> dc_fields; // Dublin Core
    };
    
    static std::vector<RssItem> parse_rss(std::string_view xml);
};

} // namespace saraswati::parser
