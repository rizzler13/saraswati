#pragma once

#include <cstdint>
#include <cstddef>
#include <string>
#include <string_view>
#include <vector>
#include <memory>
#include <fstream>
#include <functional>

namespace saraswati::util {

/**
 * @brief Space-efficient Bloom filter for URL deduplication
 * 
 * Design constraints (8GB M1 MacBook):
 * - 10MB filter = ~1 million URLs with ~1% false positive rate
 * - Persistence to disk on shutdown
 * - Uses multiple hash functions (Murmur3-based)
 * 
 * Memory formula: m = -n * ln(p) / (ln(2)^2)
 * Where: n = expected items, p = false positive rate
 * 
 * For 1M URLs with 1% FP: m ≈ 9.6 million bits ≈ 1.2 MB
 * For 10M URLs with 1% FP: m ≈ 12 MB
 */
class BloomFilter {
public:
    /**
     * @brief Construct a Bloom filter
     * @param expected_items Expected number of items to insert
     * @param false_positive_rate Desired false positive rate (0.0 to 1.0)
     */
    explicit BloomFilter(
        size_t expected_items = 1000000,
        double false_positive_rate = 0.01
    );
    
    ~BloomFilter() = default;
    
    // Movable, non-copyable (data can be large)
    BloomFilter(const BloomFilter&) = delete;
    BloomFilter& operator=(const BloomFilter&) = delete;
    BloomFilter(BloomFilter&&) noexcept = default;
    BloomFilter& operator=(BloomFilter&&) noexcept = default;
    
    /**
     * @brief Add an item to the filter
     * @param item Item to add (typically a URL)
     */
    void add(std::string_view item);
    
    /**
     * @brief Add multiple items efficiently
     */
    void add_batch(const std::vector<std::string>& items);
    
    /**
     * @brief Check if an item might be in the filter
     * @param item Item to check
     * @return true if possibly present (may be false positive), false if definitely not present
     */
    bool possibly_contains(std::string_view item) const;
    
    /**
     * @brief Check and add atomically (returns true if was already possibly present)
     */
    bool check_and_add(std::string_view item);
    
    /**
     * @brief Get current size in bytes
     */
    size_t size_bytes() const;
    
    /**
     * @brief Get number of items added
     */
    size_t item_count() const;
    
    /**
     * @brief Get estimated false positive rate based on current fill
     */
    double estimated_false_positive_rate() const;
    
    /**
     * @brief Get fill ratio (0.0 to 1.0)
     */
    double fill_ratio() const;
    
    /**
     * @brief Clear all entries
     */
    void clear();
    
    /**
     * @brief Save filter to file
     * @param path File path (typically .bloom extension)
     * @return true if saved successfully
     */
    bool save(const std::string& path) const;
    
    /**
     * @brief Load filter from file
     * @param path File path
     * @return true if loaded successfully
     */
    bool load(const std::string& path);
    
    /**
     * @brief Create from file (factory method)
     * @param path File path
     * @param expected_items Fallback if file doesn't exist
     * @param false_positive_rate Fallback if file doesn't exist
     */
    static std::unique_ptr<BloomFilter> from_file(
        const std::string& path,
        size_t expected_items = 1000000,
        double false_positive_rate = 0.01
    );
    
    /**
     * @brief Get statistics as string
     */
    std::string stats() const;

private:
    // Filter data
    std::vector<uint64_t> bits_;
    size_t num_bits_;
    size_t num_hashes_;
    size_t item_count_;
    
    // Configuration
    size_t expected_items_;
    double target_false_positive_rate_;
    
    // File format version
    static constexpr uint32_t FILE_MAGIC = 0x424C4F4D; // "BLOM"
    static constexpr uint32_t FILE_VERSION = 1;
    
    // Hash functions
    void get_hash_indices(std::string_view item, std::vector<size_t>& indices) const;
    uint64_t hash1(std::string_view item) const;
    uint64_t hash2(std::string_view item) const;
    
    // Bit operations
    void set_bit(size_t index);
    bool get_bit(size_t index) const;
    size_t count_set_bits() const;
    
    // Calculate optimal parameters
    static size_t calculate_num_bits(size_t n, double p);
    static size_t calculate_num_hashes(size_t m, size_t n);
};

/**
 * @brief MurmurHash3 implementation for Bloom filter
 */
namespace hash {
    uint64_t murmur3_64(const void* key, size_t len, uint64_t seed);
    
    inline uint64_t murmur3_64(std::string_view sv, uint64_t seed) {
        return murmur3_64(sv.data(), sv.size(), seed);
    }
}

} // namespace saraswati::util
