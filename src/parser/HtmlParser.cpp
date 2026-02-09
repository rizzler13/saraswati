#include "parser/HtmlParser.hpp"
#include <sstream>
#include <regex>
#include <algorithm>
#include <fstream>

namespace saraswati::parser {

bool HtmlElement::has_class(std::string_view cls) const {
    return std::find(classes.begin(), classes.end(), cls) != classes.end();
}

std::optional<std::string> HtmlElement::get_attribute(std::string_view name) const {
    auto it = attributes.find(std::string(name));
    if (it != attributes.end()) return it->second;
    return std::nullopt;
}

std::string HtmlElement::get_text() const {
    std::string result = text_content;
    for (const auto& child : children) result += child.get_text();
    return result;
}

HtmlParser::HtmlParser() = default;
HtmlParser::~HtmlParser() { clear(); }
HtmlParser::HtmlParser(HtmlParser&& other) noexcept = default;
HtmlParser& HtmlParser::operator=(HtmlParser&& other) noexcept = default;

bool HtmlParser::parse(std::string_view html) {
#ifdef HAVE_GUMBO
    clear();
    cached_html_ = std::string(html);
    output_ = gumbo_parse(cached_html_.c_str());
    return output_ != nullptr;
#else
    cached_html_ = std::string(html);
    return true;
#endif
}

bool HtmlParser::parse_file(const std::string& path) {
    std::ifstream file(path);
    if (!file) return false;
    std::ostringstream ss;
    ss << file.rdbuf();
    return parse(ss.str());
}

bool HtmlParser::is_parsed() const {
#ifdef HAVE_GUMBO
    return output_ != nullptr;
#else
    return !cached_html_.empty();
#endif
}

void HtmlParser::clear() {
#ifdef HAVE_GUMBO
    if (output_) { gumbo_destroy_output(&kGumboDefaultOptions, output_); output_ = nullptr; }
#endif
    cached_html_.clear();
}

#ifdef HAVE_GUMBO
HtmlParser::ParsedSelector HtmlParser::parse_selector(std::string_view selector) const {
    ParsedSelector sel;
    std::string s(selector);
    
    // Parse #id
    if (auto pos = s.find('#'); pos != std::string::npos) {
        auto end = s.find_first_of(".[ ", pos + 1);
        sel.id = s.substr(pos + 1, end == std::string::npos ? end : end - pos - 1);
        s.erase(pos, end == std::string::npos ? std::string::npos : end - pos);
    }
    
    // Parse .class
    while (auto pos = s.find('.'); pos != std::string::npos) {
        auto end = s.find_first_of(".#[ ", pos + 1);
        sel.classes.push_back(s.substr(pos + 1, end == std::string::npos ? end : end - pos - 1));
        s.erase(pos, end == std::string::npos ? std::string::npos : end - pos);
    }
    
    // Parse [attr] or [attr=value]
    if (auto pos = s.find('['); pos != std::string::npos) {
        auto end = s.find(']', pos);
        std::string attr_part = s.substr(pos + 1, end - pos - 1);
        if (auto eq = attr_part.find('='); eq != std::string::npos) {
            sel.attr_name = attr_part.substr(0, eq);
            sel.attr_value = attr_part.substr(eq + 1);
            sel.has_attr_match = true;
        } else {
            sel.attr_name = attr_part;
        }
        s.erase(pos);
    }
    
    // Remaining is tag
    sel.tag = s;
    return sel;
}

bool HtmlParser::node_matches_selector(const GumboNode* node, const ParsedSelector& sel) const {
    if (node->type != GUMBO_NODE_ELEMENT) return false;
    
    if (!sel.tag.empty() && gumbo_normalized_tagname(node->v.element.tag) != sel.tag) return false;
    
    GumboAttribute* id_attr = gumbo_get_attribute(&node->v.element.attributes, "id");
    if (!sel.id.empty() && (!id_attr || sel.id != id_attr->value)) return false;
    
    if (!sel.classes.empty()) {
        GumboAttribute* class_attr = gumbo_get_attribute(&node->v.element.attributes, "class");
        std::string class_str = class_attr ? class_attr->value : "";
        for (const auto& cls : sel.classes) {
            if (class_str.find(cls) == std::string::npos) return false;
        }
    }
    
    if (!sel.attr_name.empty()) {
        GumboAttribute* attr = gumbo_get_attribute(&node->v.element.attributes, sel.attr_name.c_str());
        if (!attr) return false;
        if (sel.has_attr_match && sel.attr_value != attr->value) return false;
    }
    
    return true;
}

HtmlElement HtmlParser::convert_node(const GumboNode* node) const {
    HtmlElement el;
    if (node->type != GUMBO_NODE_ELEMENT) return el;
    
    el.tag = gumbo_normalized_tagname(node->v.element.tag);
    
    for (unsigned i = 0; i < node->v.element.attributes.length; ++i) {
        auto* attr = static_cast<GumboAttribute*>(node->v.element.attributes.data[i]);
        el.attributes[attr->name] = attr->value;
        if (std::string(attr->name) == "id") el.id = attr->value;
        if (std::string(attr->name) == "class") {
            std::istringstream iss(attr->value);
            std::string cls;
            while (iss >> cls) el.classes.push_back(cls);
        }
    }
    
    el.text_content = get_node_text(node);
    return el;
}

std::string HtmlParser::get_node_text(const GumboNode* node) const {
    if (node->type == GUMBO_NODE_TEXT) return node->v.text.text;
    if (node->type != GUMBO_NODE_ELEMENT) return "";
    
    std::string text;
    for (unsigned i = 0; i < node->v.element.children.length; ++i) {
        text += get_node_text(static_cast<GumboNode*>(node->v.element.children.data[i]));
    }
    return text;
}

void HtmlParser::collect_matching(const GumboNode* node, const std::function<bool(const GumboNode*)>& matcher, std::vector<HtmlElement>& results) const {
    if (!node) return;
    if (matcher(node)) results.push_back(convert_node(node));
    if (node->type == GUMBO_NODE_ELEMENT) {
        for (unsigned i = 0; i < node->v.element.children.length; ++i) {
            collect_matching(static_cast<GumboNode*>(node->v.element.children.data[i]), matcher, results);
        }
    }
}
#endif

SelectorResult HtmlParser::select_all(std::string_view selector) const {
    SelectorResult result;
#ifdef HAVE_GUMBO
    if (!output_) { result.error_message = "No document parsed"; return result; }
    
    auto sel = parse_selector(selector);
    collect_matching(output_->root, [&](const GumboNode* n) { return node_matches_selector(n, sel); }, result.elements);
    result.success = true;
#else
    result.error_message = "Gumbo not available";
#endif
    return result;
}

std::optional<HtmlElement> HtmlParser::select_first(std::string_view selector) const {
    auto result = select_all(selector);
    if (!result.empty()) return result[0];
    return std::nullopt;
}

std::optional<std::string> HtmlParser::select_text(std::string_view selector) const {
    if (auto el = select_first(selector)) return el->get_text();
    return std::nullopt;
}

std::optional<std::string> HtmlParser::select_attribute(std::string_view selector, std::string_view attribute) const {
    if (auto el = select_first(selector)) return el->get_attribute(attribute);
    return std::nullopt;
}

std::string HtmlParser::get_all_text() const {
#ifdef HAVE_GUMBO
    if (!output_) return "";
    return get_node_text(output_->root);
#else
    return "";
#endif
}

std::optional<std::string> HtmlParser::get_title() const { return select_text("title"); }

std::vector<std::string> HtmlParser::get_links() const {
    std::vector<std::string> links;
    auto result = select_all("a[href]");
    for (const auto& el : result) {
        if (auto href = el.get_attribute("href")) links.push_back(*href);
    }
    return links;
}

std::optional<std::string> HtmlParser::get_meta(std::string_view name) const {
    auto result = select_all("meta");
    for (const auto& el : result) {
        if (auto n = el.get_attribute("name"); n && *n == name) return el.get_attribute("content");
    }
    return std::nullopt;
}

std::optional<HtmlElement> HtmlParser::root() const {
#ifdef HAVE_GUMBO
    if (!output_) return std::nullopt;
    return convert_node(output_->root);
#else
    return std::nullopt;
#endif
}

// XmlParser implementation (simplified)
std::optional<XmlParser::XmlElement> XmlParser::XmlElement::find_child(std::string_view tag) const {
    for (const auto& c : children) if (c.tag == tag) return c;
    return std::nullopt;
}

std::vector<XmlParser::XmlElement> XmlParser::XmlElement::find_all_children(std::string_view tag) const {
    std::vector<XmlElement> result;
    for (const auto& c : children) if (c.tag == tag) result.push_back(c);
    return result;
}

std::optional<std::string> XmlParser::XmlElement::get_child_text(std::string_view tag) const {
    if (auto c = find_child(tag)) return c->text;
    return std::nullopt;
}

std::vector<XmlParser::RssItem> XmlParser::parse_rss(std::string_view xml) {
    std::vector<RssItem> items;
    std::string content(xml);
    
    std::regex item_regex("<item[^>]*>(.*?)</item>", std::regex::icase);
    std::regex title_regex("<title[^>]*>(.*?)</title>", std::regex::icase);
    std::regex link_regex("<link[^>]*>(.*?)</link>", std::regex::icase);
    std::regex desc_regex("<description[^>]*><!\\[CDATA\\[(.*?)\\]\\]></description>|<description[^>]*>(.*?)</description>", std::regex::icase);
    std::regex date_regex("<pubDate[^>]*>(.*?)</pubDate>", std::regex::icase);
    
    auto items_begin = std::sregex_iterator(content.begin(), content.end(), item_regex);
    auto items_end = std::sregex_iterator();
    
    for (auto it = items_begin; it != items_end; ++it) {
        RssItem item;
        std::string item_content = (*it)[1].str();
        
        std::smatch m;
        if (std::regex_search(item_content, m, title_regex)) item.title = m[1].str();
        if (std::regex_search(item_content, m, link_regex)) item.link = m[1].str();
        if (std::regex_search(item_content, m, desc_regex)) item.description = m[1].matched ? m[1].str() : m[2].str();
        if (std::regex_search(item_content, m, date_regex)) item.pub_date = m[1].str();
        
        items.push_back(std::move(item));
    }
    
    return items;
}

} // namespace saraswati::parser
