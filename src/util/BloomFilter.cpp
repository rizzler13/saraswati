#include "util/BloomFilter.hpp"
#include <cmath>
#include <cstring>
#include <fstream>
#include <sstream>
#include <iostream>

namespace saraswati::util {

namespace hash {
inline uint64_t rotl64(uint64_t x, int8_t r) { return (x << r) | (x >> (64 - r)); }
inline uint64_t fmix64(uint64_t k) {
    k ^= k >> 33; k *= 0xff51afd7ed558ccdULL;
    k ^= k >> 33; k *= 0xc4ceb9fe1a85ec53ULL;
    k ^= k >> 33; return k;
}

uint64_t murmur3_64(const void* key, size_t len, uint64_t seed) {
    const uint8_t* data = static_cast<const uint8_t*>(key);
    const size_t nblocks = len / 16;
    uint64_t h1 = seed, h2 = seed;
    const uint64_t c1 = 0x87c37b91114253d5ULL, c2 = 0x4cf5ad432745937fULL;
    
    const uint64_t* blocks = reinterpret_cast<const uint64_t*>(data);
    for (size_t i = 0; i < nblocks; i++) {
        uint64_t k1 = blocks[i*2], k2 = blocks[i*2+1];
        k1 *= c1; k1 = rotl64(k1,31); k1 *= c2; h1 ^= k1;
        h1 = rotl64(h1,27); h1 += h2; h1 = h1*5+0x52dce729;
        k2 *= c2; k2 = rotl64(k2,33); k2 *= c1; h2 ^= k2;
        h2 = rotl64(h2,31); h2 += h1; h2 = h2*5+0x38495ab5;
    }
    h1 ^= len; h2 ^= len; h1 += h2; h2 += h1;
    return fmix64(h1) + fmix64(h2);
}
} // namespace hash

size_t BloomFilter::calculate_num_bits(size_t n, double p) {
    double ln2 = std::log(2.0);
    return static_cast<size_t>(-static_cast<double>(n) * std::log(p) / (ln2 * ln2));
}

size_t BloomFilter::calculate_num_hashes(size_t m, size_t n) {
    return static_cast<size_t>(static_cast<double>(m) / static_cast<double>(n) * std::log(2.0));
}

BloomFilter::BloomFilter(size_t expected_items, double false_positive_rate)
    : item_count_(0), expected_items_(expected_items), target_false_positive_rate_(false_positive_rate) {
    num_bits_ = std::max(calculate_num_bits(expected_items, false_positive_rate), size_t(64));
    num_hashes_ = std::clamp(calculate_num_hashes(num_bits_, expected_items), size_t(1), size_t(16));
    bits_.resize((num_bits_ + 63) / 64, 0);
}

void BloomFilter::add(std::string_view item) {
    std::vector<size_t> indices; get_hash_indices(item, indices);
    for (size_t idx : indices) set_bit(idx);
    ++item_count_;
}

void BloomFilter::add_batch(const std::vector<std::string>& items) {
    for (const auto& item : items) add(item);
}

bool BloomFilter::possibly_contains(std::string_view item) const {
    std::vector<size_t> indices; get_hash_indices(item, indices);
    for (size_t idx : indices) if (!get_bit(idx)) return false;
    return true;
}

bool BloomFilter::check_and_add(std::string_view item) {
    std::vector<size_t> indices; get_hash_indices(item, indices);
    bool was_present = true;
    for (size_t idx : indices) if (!get_bit(idx)) was_present = false;
    for (size_t idx : indices) set_bit(idx);
    if (!was_present) ++item_count_;
    return was_present;
}

size_t BloomFilter::size_bytes() const { return bits_.size() * sizeof(uint64_t); }
size_t BloomFilter::item_count() const { return item_count_; }
double BloomFilter::estimated_false_positive_rate() const {
    double ratio = static_cast<double>(num_hashes_ * item_count_) / static_cast<double>(num_bits_);
    return std::pow(1.0 - std::exp(-ratio), static_cast<double>(num_hashes_));
}
double BloomFilter::fill_ratio() const { return static_cast<double>(count_set_bits()) / static_cast<double>(num_bits_); }
void BloomFilter::clear() { std::fill(bits_.begin(), bits_.end(), 0); item_count_ = 0; }

bool BloomFilter::save(const std::string& path) const {
    std::ofstream file(path, std::ios::binary);
    if (!file) return false;
    file.write(reinterpret_cast<const char*>(&FILE_MAGIC), sizeof(FILE_MAGIC));
    file.write(reinterpret_cast<const char*>(&FILE_VERSION), sizeof(FILE_VERSION));
    file.write(reinterpret_cast<const char*>(&num_bits_), sizeof(num_bits_));
    file.write(reinterpret_cast<const char*>(&num_hashes_), sizeof(num_hashes_));
    file.write(reinterpret_cast<const char*>(&item_count_), sizeof(item_count_));
    size_t num_words = bits_.size();
    file.write(reinterpret_cast<const char*>(&num_words), sizeof(num_words));
    file.write(reinterpret_cast<const char*>(bits_.data()), bits_.size() * sizeof(uint64_t));
    return file.good();
}

bool BloomFilter::load(const std::string& path) {
    std::ifstream file(path, std::ios::binary);
    if (!file) return false;
    uint32_t magic, version;
    file.read(reinterpret_cast<char*>(&magic), sizeof(magic));
    file.read(reinterpret_cast<char*>(&version), sizeof(version));
    if (magic != FILE_MAGIC || version != FILE_VERSION) return false;
    file.read(reinterpret_cast<char*>(&num_bits_), sizeof(num_bits_));
    file.read(reinterpret_cast<char*>(&num_hashes_), sizeof(num_hashes_));
    file.read(reinterpret_cast<char*>(&item_count_), sizeof(item_count_));
    size_t num_words;
    file.read(reinterpret_cast<char*>(&num_words), sizeof(num_words));
    bits_.resize(num_words);
    file.read(reinterpret_cast<char*>(bits_.data()), num_words * sizeof(uint64_t));
    return file.good();
}

std::unique_ptr<BloomFilter> BloomFilter::from_file(const std::string& path, size_t expected_items, double fpr) {
    auto filter = std::make_unique<BloomFilter>(expected_items, fpr);
    std::ifstream file(path);
    if (file.good()) { file.close(); filter->load(path); }
    return filter;
}

std::string BloomFilter::stats() const {
    std::ostringstream ss;
    ss << "BloomFilter: " << item_count_ << " items, " << (size_bytes()/1024) << "KB, "
       << (fill_ratio()*100) << "% fill, " << (estimated_false_positive_rate()*100) << "% FP";
    return ss.str();
}

void BloomFilter::get_hash_indices(std::string_view item, std::vector<size_t>& indices) const {
    indices.clear(); indices.reserve(num_hashes_);
    uint64_t h1 = hash1(item), h2 = hash2(item);
    for (size_t i = 0; i < num_hashes_; ++i) indices.push_back((h1 + i * h2) % num_bits_);
}

uint64_t BloomFilter::hash1(std::string_view item) const { return hash::murmur3_64(item, 0x9E3779B97F4A7C15ULL); }
uint64_t BloomFilter::hash2(std::string_view item) const { return hash::murmur3_64(item, 0xC6A4A7935BD1E995ULL); }
void BloomFilter::set_bit(size_t idx) { bits_[idx/64] |= (1ULL << (idx%64)); }
bool BloomFilter::get_bit(size_t idx) const { return (bits_[idx/64] & (1ULL << (idx%64))) != 0; }
size_t BloomFilter::count_set_bits() const { size_t c=0; for(auto w:bits_) c+=__builtin_popcountll(w); return c; }

} // namespace saraswati::util
