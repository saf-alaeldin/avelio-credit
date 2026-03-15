import logger from './logger';

/**
 * Simple in-memory cache with TTL (Time To Live)
 */
class Cache {
  constructor() {
    this.store = new Map();
  }

  /**
   * Set a value in cache with optional TTL in milliseconds
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in milliseconds (default: 5 minutes)
   */
  set(key, value, ttl = 5 * 60 * 1000) {
    const expiresAt = Date.now() + ttl;
    this.store.set(key, { value, expiresAt });
    logger.debug(`Cache SET: ${key} (TTL: ${ttl}ms)`);
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {any|null} - Cached value or null if not found/expired
   */
  get(key) {
    const item = this.store.get(key);

    if (!item) {
      logger.debug(`Cache MISS: ${key}`);
      return null;
    }

    // Check if expired
    if (Date.now() > item.expiresAt) {
      logger.debug(`Cache EXPIRED: ${key}`);
      this.store.delete(key);
      return null;
    }

    logger.debug(`Cache HIT: ${key}`);
    return item.value;
  }

  /**
   * Check if a key exists and is not expired
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Delete a specific key from cache
   * @param {string} key - Cache key
   */
  delete(key) {
    const deleted = this.store.delete(key);
    if (deleted) {
      logger.debug(`Cache DELETE: ${key}`);
    }
    return deleted;
  }

  /**
   * Clear all cache
   */
  clear() {
    const size = this.store.size;
    this.store.clear();
    logger.debug(`Cache CLEAR: ${size} items removed`);
  }

  /**
   * Get or fetch pattern - get from cache, or fetch and cache if not found
   * @param {string} key - Cache key
   * @param {Function} fetchFn - Function to fetch data if not cached
   * @param {number} ttl - Time to live in milliseconds
   * @returns {Promise<any>}
   */
  async getOrFetch(key, fetchFn, ttl = 5 * 60 * 1000) {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    logger.debug(`Cache FETCH: ${key}`);
    const value = await fetchFn();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * Invalidate cache keys matching a pattern
   * @param {RegExp|string} pattern - Pattern to match keys
   */
  invalidatePattern(pattern) {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    let count = 0;

    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
        count++;
      }
    }

    logger.debug(`Cache INVALIDATE PATTERN: ${pattern} (${count} items removed)`);
    return count;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    let active = 0;
    let expired = 0;

    for (const [, item] of this.store.entries()) {
      if (now > item.expiresAt) {
        expired++;
      } else {
        active++;
      }
    }

    return {
      total: this.store.size,
      active,
      expired
    };
  }
}

// Create and export singleton instance
const cache = new Cache();

// Cache keys constants
export const CACHE_KEYS = {
  AGENCIES: 'agencies',
  DASHBOARD_STATS: 'dashboard_stats',
  TODAY_STATS: 'today_stats',
  RECEIPTS: (filters) => `receipts_${JSON.stringify(filters)}`,
  RECEIPT: (id) => `receipt_${id}`
};

// Cache TTL constants (in milliseconds)
export const CACHE_TTL = {
  AGENCIES: 30 * 60 * 1000,        // 30 minutes (changes infrequently)
  DASHBOARD_STATS: 2 * 60 * 1000,   // 2 minutes
  TODAY_STATS: 1 * 60 * 1000,       // 1 minute
  RECEIPTS: 30 * 1000,              // 30 seconds
  RECEIPT: 5 * 60 * 1000            // 5 minutes
};

export default cache;
