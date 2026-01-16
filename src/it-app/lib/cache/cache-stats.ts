/**
 * Cache Statistics Tracker
 *
 * Singleton service for tracking cache performance metrics.
 * Tracks hits, misses, and calculates hit rate for monitoring cache effectiveness.
 *
 * @module cache-stats
 * @version 1.0.0
 */

export interface CacheStats {
  hits: number;
  misses: number;
  totalReads: number;
  totalWrites: number;
  evictions: number;
  syncs: number;
  syncErrors: number;
  totalMessageBytes: number;
}

class CacheStatsService {
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    totalReads: 0,
    totalWrites: 0,
    evictions: 0,
    syncs: 0,
    syncErrors: 0,
    totalMessageBytes: 0,
  };

  private resetTimestamp = Date.now();

  /**
   * Record a cache hit
   */
  recordHit(messageCount: number = 1): void {
    this.stats.hits++;
    this.stats.totalReads++;
    this.logUpdate('hit', { messageCount });
  }

  /**
   * Record a cache miss
   */
  recordMiss(): void {
    this.stats.misses++;
    this.stats.totalReads++;
    this.logUpdate('miss');
  }

  /**
   * Record a write operation
   */
  recordWrite(messageCount: number = 1, bytes: number = 0): void {
    this.stats.totalWrites++;
    this.stats.totalMessageBytes += bytes;
    this.logUpdate('write', { messageCount, bytes });
  }

  /**
   * Record a batch write
   */
  recordBatchWrite(messageCount: number, bytes: number = 0): void {
    this.stats.totalWrites++;
    this.stats.totalMessageBytes += bytes;
    this.logUpdate('batch_write', { messageCount, bytes });
  }

  /**
   * Record an eviction
   */
  recordEviction(bytesFreed: number, messageCount: number): void {
    this.stats.evictions++;
    this.stats.totalMessageBytes -= bytesFreed;
    this.logUpdate('eviction', { bytesFreed, messageCount });
  }

  /**
   * Record a sync operation
   */
  recordSync(messageCount: number = 0, duration: number = 0): void {
    this.stats.syncs++;
    this.logUpdate('sync', { messageCount, duration });
  }

  /**
   * Record a sync error
   */
  recordSyncError(): void {
    this.stats.syncErrors++;
    this.logUpdate('sync_error');
  }

  /**
   * Get current statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get cache hit rate as percentage
   */
  getHitRate(): number {
    const totalRequests = this.stats.hits + this.stats.misses;
    if (totalRequests === 0) return 0;
    return (this.stats.hits / totalRequests) * 100;
  }

  /**
   * Get detailed statistics
   */
  getDetailedStats(): {
    stats: CacheStats;
    hitRate: number;
    avgMessagesPerRead: number;
    avgMessagesPerWrite: number;
    resetAt: Date;
    uptimeSeconds: number;
  } {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;
    const avgMessagesPerRead = this.stats.totalReads > 0 ? totalRequests / this.stats.totalReads : 0;
    const avgMessagesPerWrite = this.stats.totalWrites > 0 ? totalRequests / this.stats.totalWrites : 0;
    const uptimeSeconds = (Date.now() - this.resetTimestamp) / 1000;

    return {
      stats: { ...this.stats },
      hitRate,
      avgMessagesPerRead,
      avgMessagesPerWrite,
      resetAt: new Date(this.resetTimestamp),
      uptimeSeconds,
    };
  }

  /**
   * Get formatted statistics string
   */
  getFormattedStats(): string {
    const detailed = this.getDetailedStats();
    const hitRate = detailed.hitRate.toFixed(2);
    const uptime = (detailed.uptimeSeconds / 60).toFixed(1);

    return `
Cache Statistics (Uptime: ${uptime}min)
====================================
Hits: ${detailed.stats.hits}
Misses: ${detailed.stats.misses}
Hit Rate: ${hitRate}%
Total Reads: ${detailed.stats.totalReads}
Total Writes: ${detailed.stats.totalWrites}
Evictions: ${detailed.stats.evictions}
Syncs: ${detailed.stats.syncs}
Sync Errors: ${detailed.stats.syncErrors}
Total Bytes: ${(detailed.stats.totalMessageBytes / 1024 / 1024).toFixed(2)} MB
    `.trim();
  }

  /**
   * Reset all statistics
   */
  reset(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      totalReads: 0,
      totalWrites: 0,
      evictions: 0,
      syncs: 0,
      syncErrors: 0,
      totalMessageBytes: 0,
    };
    this.resetTimestamp = Date.now();
    console.log('[CacheStats] Statistics reset');
  }

  /**
   * Log statistics update (development only)
   */
  private logUpdate(type: string, metadata?: Record<string, number>): void {
    if (process.env.NODE_ENV === 'development') {
      const meta = metadata ? ` ${JSON.stringify(metadata)}` : '';
      console.log(`[CacheStats] ${type}${meta}`);
    }
  }
}

// Singleton instance
export const cacheStats = new CacheStatsService();

export default cacheStats;
