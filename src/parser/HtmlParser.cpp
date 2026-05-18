#include "parser/HtmlParser.hpp"
#include <fstream>
#include <sstream>
#include <iostream>
#include <algorithm>
#include <stack>
#include <regex> 

// Gumbo is a C library, ensure clean linkage
#ifdef HAVE_GUMBO
#include <gumbo.h>
#endif

namespace saraswati::parser {

// HtmlElement Implementation

bool HtmlElement::has_class(std::string_view cls) const {
    return std::find(classes.begin(), classes.end(), cls) != classes.end();
}

std::optional<std::string> HtmlElement::get_attribute(std::string_view name) const {
    if (auto it = attributes.find(std::string(name)); it != attributes.end()) {
        return it->second;
    }
    return std::nullopt;
}

std::string HtmlElement::get_text() const {
    return text_content;
}

// HtmlParser Implementation

HtmlParser::HtmlParser() {
#ifdef HAVE_GUMBO
    output_ = nullptr;
#endif
}

HtmlParser::~HtmlParser() {
    clear();
}

HtmlParser::HtmlParser(HtmlParser&& other) noexcept 
    : cached_html_(std::move(other.cached_html_)) {
#ifdef HAVE_GUMBO
    output_ = other.output_;
    other.output_ = nullptr;
#endif
}

HtmlParser& HtmlParser::operator=(HtmlParser&& other) noexcept {
    if (this != &other) {
        clear();
#ifdef HAVE_GUMBO
        output_ = other.output_;
        other.output_ = nullptr;
#endif
        cached_html_ = std::move(other.cached_html_);
    }
    return *this;
}

void HtmlParser::clear() {
#ifdef HAVE_GUMBO
    if (output_) {
        gumbo_destroy_output(&kGumboDefaultOptions, output_);
        output_ = nullptr;
    }
#endif
    cached_html_.clear();
}

bool HtmlParser::parse(std::string_view html) {
    clear();
    cached_html_ = std::string(html);
    
#ifdef HAVE_GUMBO
    output_ = gumbo_parse(cached_html_.c_str());
    return output_ != nullptr;
#else
    std::cerr << "[Parser] Error: Gumbo not enabled in build!" << std::endl;
    return false;
#endif
}

bool HtmlParser::parse_file(const std::string& path) {
    std::ifstream f(path);
    if (!f.is_open()) return false;
    
    std::stringstream buffer;
    buffer << f.rdbuf();
    return parse(buffer.str());
}

bool HtmlParser::is_parsed() const {
#ifdef HAVE_GUMBO
    return output_ != nullptr;
#else
    return false;
#endif
}

// --- Helpers ---

#ifdef HAVE_GUMBO
std::string HtmlParser::get_node_text(const GumboNode* node) const {
    if (node->type == GUMBO_NODE_TEXT) {
        return std::string(node->v.text.text);
    } 
    if (node->type == GUMBO_NODE_ELEMENT && 
        node->v.element.tag != GUMBO_TAG_SCRIPT && 
        node->v.element.tag != GUMBO_TAG_STYLE) {
        
        std::string contents = "";
        const GumboVector* children = &node->v.element.children;
        for (unsigned int i = 0; i < children->length; ++i) {
            const std::string text = get_node_text(static_cast<GumboNode*>(children->data[i]));
            if (i != 0 && !text.empty()) contents.append(" ");
            contents.append(text);
        }
        return contents;
    }
    return "";
}

HtmlElement HtmlParser::convert_node(const GumboNode* node) const {
    HtmlElement el;
    if (node->type != GUMBO_NODE_ELEMENT) return el;
    
    el.tag = gumbo_normalized_tagname(node->v.element.tag);
    
    const GumboVector* attrs = &node->v.element.attributes;
    for (unsigned int i = 0; i < attrs->length; ++i) {
        GumboAttribute* attr = static_cast<GumboAttribute*>(attrs->data[i]);
        el.attributes[attr->name] = attr->value;
        
        if (std::string(attr->name) == "class") {
            std::string cls_str = attr->value;
            size_t pos = 0;
            while ((pos = cls_str.find(' ')) != std::string::npos) {
                if (pos > 0) el.classes.push_back(cls_str.substr(0, pos));
                cls_str.erase(0, pos + 1);
            }
            if (!cls_str.empty()) el.classes.push_back(cls_str);
        }
        if (std::string(attr->name) == "id") {
            el.id = attr->value;
        }
    }
    
    el.text_content = get_node_text(node);
    return el;
}
#endif

// --- Selectors ---

std::optional<HtmlElement> HtmlParser::select_first(std::string_view selector) const {
    auto results = select_all(selector);
    if (!results.empty()) return results[0];
    return std::nullopt;
}

std::optional<std::string> HtmlParser::select_text(std::string_view selector) const {
    auto el = select_first(selector);
    if (el) return el->get_text();
    return std::nullopt;
}

std::optional<std::string> HtmlParser::select_attribute(std::string_view selector, std::string_view attribute) const {
    auto el = select_first(selector);
    if (el) return el->get_attribute(attribute);
    return std::nullopt;
}

#ifdef HAVE_GUMBO
void HtmlParser::collect_matching(
    const GumboNode* node,
    const std::function<bool(const GumboNode*)>& matcher,
    std::vector<HtmlElement>& results
) const {
    if (node->type != GUMBO_NODE_ELEMENT) return;
    
    if (matcher(node)) {
        results.push_back(convert_node(node));
    }
    
    const GumboVector* children = &node->v.element.children;
    for (unsigned int i = 0; i < children->length; ++i) {
        collect_matching(static_cast<GumboNode*>(children->data[i]), matcher, results);
    }
}

// CORRECT SELECTOR PARSING LOGIC
HtmlParser::ParsedSelector HtmlParser::parse_selector(std::string_view selector_view) const {
    ParsedSelector sel;
    std::string s(selector_view);
    
    // 1. Extract Attributes [attr=val]
    auto bracket_start = s.find('[');
    if (bracket_start != std::string::npos) {
        auto bracket_end = s.find(']');
        if (bracket_end != std::string::npos) {
            std::string attr_content = s.substr(bracket_start + 1, bracket_end - bracket_start - 1);
            auto eq = attr_content.find('=');
            if (eq != std::string::npos) {
                sel.attr_name = attr_content.substr(0, eq);
                sel.attr_value = attr_content.substr(eq + 1);
            } else {
                sel.attr_name = attr_content;
            }
            sel.has_attr_match = true;
            s.erase(bracket_start, bracket_end - bracket_start + 1);
        }
    }
    
    // 2. Extract ID
    auto hash_pos = s.find('#');
    if (hash_pos != std::string::npos) {
        size_t end = s.find_first_of(".", hash_pos + 1);
        size_t len = (end == std::string::npos) ? std::string::npos : end - hash_pos - 1;
        sel.id = s.substr(hash_pos + 1, len);
        size_t erase_len = (end == std::string::npos) ? std::string::npos : end - hash_pos;
        s.erase(hash_pos, erase_len);
    }
    
    // 3. Extract Classes
    auto pos = s.find('.');
    while (pos != std::string::npos) {
        auto end = s.find_first_of(".", pos + 1);
        size_t len = (end == std::string::npos) ? std::string::npos : end - pos - 1;
        
        std::string cls = s.substr(pos + 1, len);
        if (!cls.empty()) sel.classes.push_back(cls);
        
        size_t erase_len = (end == std::string::npos) ? std::string::npos : end - pos;
        s.erase(pos, erase_len);
        
        // Find next dot! (This was missing in your version)
        pos = s.find('.');
    }
    
    if (!s.empty()) sel.tag = s;
    return sel;
}

bool HtmlParser::node_matches_selector(const GumboNode* node, const ParsedSelector& sel) const {
    if (node->type != GUMBO_NODE_ELEMENT) return false;
    
    if (!sel.tag.empty()) {
        std::string node_tag = gumbo_normalized_tagname(node->v.element.tag);
        if (node_tag != sel.tag) return false;
    }
    
    if (!sel.id.empty()) {
        GumboAttribute* id_attr = gumbo_get_attribute(&node->v.element.attributes, "id");
        if (!id_attr || std::string(id_attr->value) != sel.id) return false;
    }
    
    if (!sel.classes.empty()) {
        GumboAttribute* cls_attr = gumbo_get_attribute(&node->v.element.attributes, "class");
        if (!cls_attr) return false;
        std::string cls_str = cls_attr->value;
        for (const auto& req_cls : sel.classes) {
            if (cls_str.find(req_cls) == std::string::npos) return false;
        }
    }
    
    if (sel.has_attr_match) {
        GumboAttribute* attr = gumbo_get_attribute(&node->v.element.attributes, sel.attr_name.c_str());
        if (!attr) return false;
        if (!sel.attr_value.empty() && std::string(attr->value) != sel.attr_value) return false;
    }
    
    return true;
}
#endif

SelectorResult HtmlParser::select_all(std::string_view selector) const {
    SelectorResult result;
#ifdef HAVE_GUMBO
    if (!output_) {
        result.error_message = "Parser not initialized";
        return result;
    }
    
    auto parsed_sel = parse_selector(selector);
    auto matcher = [&](const GumboNode* node) -> bool {
        return node_matches_selector(node, parsed_sel);
    };
    
    collect_matching(output_->root, matcher, result.elements);
    result.success = true;
#endif
    return result;
}

// XmlParser (RSS/Atom) Implementation

std::vector<XmlParser::RssItem> XmlParser::parse_rss(std::string_view xml) {
    std::vector<RssItem> items;
    std::string content(xml);
    
    // Manual parsing since std::regex can't handle multiline content reliably
    size_t pos = 0;
    while (true) {
        // Find next <item> tag
        size_t item_start = content.find("<item>", pos);
        if (item_start == std::string::npos) break;
        
        size_t item_end = content.find("</item>", item_start);
        if (item_end == std::string::npos) break;
        
        std::string item_content = content.substr(item_start, item_end - item_start + 7);
        pos = item_end + 7;
        
        RssItem item;
        
        // Extract <title>
        auto extract_tag = [&](const std::string& src, const std::string& tag) -> std::string {
            std::string open = "<" + tag;
            size_t s = src.find(open);
            if (s == std::string::npos) return "";
            s = src.find(">", s);
            if (s == std::string::npos) return "";
            s++;
            size_t e = src.find("</" + tag + ">", s);
            if (e == std::string::npos) return "";
            return src.substr(s, e - s);
        };
        
        item.title = extract_tag(item_content, "title");
        item.link = extract_tag(item_content, "link");
        item.pub_date = extract_tag(item_content, "pubDate");
        item.guid = extract_tag(item_content, "guid");
        
        // Description may contain CDATA or not
        std::string desc = extract_tag(item_content, "description");
        // Strip CDATA wrapper if present
        if (desc.find("<![CDATA[") == 0) {
            desc = desc.substr(9);
            auto cdata_end = desc.rfind("]]>");
            if (cdata_end != std::string::npos) desc = desc.substr(0, cdata_end);
        }
        // ArXiv prepends "arXiv:XXXX.XXXXvN Announce Type: ...\nAbstract: "
        auto abs_pos = desc.find("Abstract: ");
        if (abs_pos != std::string::npos) {
            item.description = desc.substr(abs_pos + 10);
        } else {
            item.description = desc;
        }
        
        // Categories
        size_t cat_pos = 0;
        while (true) {
            size_t cs = item_content.find("<category>", cat_pos);
            if (cs == std::string::npos) break;
            cs += 10;
            size_t ce = item_content.find("</category>", cs);
            if (ce == std::string::npos) break;
            item.categories.push_back(item_content.substr(cs, ce - cs));
            cat_pos = ce + 11;
        }
        
        // Dublin Core fields (dc:creator, dc:rights, etc.)
        for (const auto& dc_tag : {"creator", "rights", "date", "subject"}) {
            std::string dc_val = extract_tag(item_content, std::string("dc:") + dc_tag);
            if (!dc_val.empty()) {
                item.dc_fields[dc_tag] = dc_val;
            }
        }
        
        items.push_back(std::move(item));
    }
    
    return items;
}
// Stub for interface compliance
std::optional<std::string> HtmlParser::get_title() const { return select_text("title"); }
std::vector<std::string> HtmlParser::get_links() const { return {}; }
std::optional<std::string> HtmlParser::get_meta(std::string_view name) const { return std::nullopt; }
std::optional<HtmlElement> HtmlParser::root() const { return std::nullopt; }

}