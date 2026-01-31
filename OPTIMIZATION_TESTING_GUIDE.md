# Performance Optimization Testing Guide

## Overview

This guide provides comprehensive testing instructions for the technician views endpoint optimization.

---

## Pre-Testing Checklist

- [ ] Backend service is running
- [ ] Redis is running and accessible
- [ ] PostgreSQL database is accessible
- [ ] Test user credentials are available
- [ ] Testing tools installed (curl, httpie, ab, or similar)

---

## Test 1: Cache Miss (First Request)

**Purpose:** Verify parallel query execution works correctly

### Test Steps:

1. **Clear cache:**
   ```bash
   redis-cli -h localhost -p 6380
   KEYS technician_views:*
   # Note the count
   FLUSHDB  # WARNING: Clears all cache data
   ```

2. **Make first request:**
   ```bash
   # Get auth token first
   TOKEN=$(curl -X POST http://localhost:8000/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username": "your_username"}' \
     | jq -r '.access_token')

   # Make request and measure time
   time curl -X GET \
     "http://localhost:8000/api/v1/requests/technician-views?view=all_unsolved&page=1&perPage=20" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Accept: application/json" \
     -o /tmp/response1.json
   ```

3. **Verify response:**
   ```bash
   # Check response structure
   jq 'keys' /tmp/response1.json
   # Should show: ["data", "counts", "filter_counts", "total", "page", "per_page"]

   # Check data array
   jq '.data | length' /tmp/response1.json
   # Should show number of requests (up to 20)

   # Check counts
   jq '.counts' /tmp/response1.json
   # Should show all view counts
   ```

4. **Check logs:**
   ```bash
   tail -n 20 src/backend/logs/app.log | grep "Cache MISS"
   # Should see: "Cache MISS for technician_views: ..."
   ```

### Expected Results:

- ✅ Response time: 1.5-2.5 seconds
- ✅ Log shows "Cache MISS"
- ✅ Response contains all required fields
- ✅ Data array has correct number of items

---

## Test 2: Cache Hit (Subsequent Request)

**Purpose:** Verify caching works correctly

### Test Steps:

1. **Make second request (within 30 seconds):**
   ```bash
   time curl -X GET \
     "http://localhost:8000/api/v1/requests/technician-views?view=all_unsolved&page=1&perPage=20" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Accept: application/json" \
     -o /tmp/response2.json
   ```

2. **Verify responses are identical:**
   ```bash
   diff /tmp/response1.json /tmp/response2.json
   # Should show no differences (or only timestamp differences if any)
   ```

3. **Check logs:**
   ```bash
   tail -n 20 src/backend/logs/app.log | grep "Cache HIT"
   # Should see: "Cache HIT for technician_views: ..."
   ```

4. **Verify Redis cache entry:**
   ```bash
   redis-cli -h localhost -p 6380
   KEYS technician_views:*
   # Should show cache keys
   TTL technician_views:1:all_unsolved:1:20:all
   # Should show remaining TTL (0-30 seconds)
   ```

### Expected Results:

- ✅ Response time: <100ms (vs 1.5-2.5s for cache miss)
- ✅ Log shows "Cache HIT"
- ✅ Responses are identical
- ✅ Redis shows cache entry with correct TTL

---

## Test 3: Cache Invalidation on Request Update

**Purpose:** Verify cache invalidation works correctly

### Test Steps:

1. **Make initial request (cache miss):**
   ```bash
   curl -X GET \
     "http://localhost:8000/api/v1/requests/technician-views?view=all_unsolved&page=1&perPage=20" \
     -H "Authorization: Bearer $TOKEN" \
     -o /tmp/before_update.json
   ```

2. **Update a request (e.g., change status):**
   ```bash
   REQUEST_ID=$(jq -r '.data[0].id' /tmp/before_update.json)

   curl -X PATCH \
     "http://localhost:8000/api/v1/requests/$REQUEST_ID" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"status_id": 3}'
   ```

3. **Check cache invalidation logs:**
   ```bash
   tail -n 50 src/backend/logs/app.log | grep "Invalidated"
   # Should see: "Invalidated X cache entries for user Y"
   ```

4. **Make request again (should be cache miss):**
   ```bash
   time curl -X GET \
     "http://localhost:8000/api/v1/requests/technician-views?view=all_unsolved&page=1&perPage=20" \
     -H "Authorization: Bearer $TOKEN" \
     -o /tmp/after_update.json
   ```

5. **Verify data changed:**
   ```bash
   # Check if updated request has new status
   jq '.data[] | select(.id == "'$REQUEST_ID'") | .status' /tmp/after_update.json
   ```

### Expected Results:

- ✅ First request: Cache HIT (if within 30s)
- ✅ After update: Cache invalidation logged
- ✅ Next request: Cache MISS (fresh data)
- ✅ Updated data reflects changes

---

## Test 4: Counts-Only Endpoint

**Purpose:** Verify new lightweight endpoint works

### Test Steps:

1. **Clear cache:**
   ```bash
   redis-cli -h localhost -p 6380 FLUSHDB
   ```

2. **Test counts-only endpoint:**
   ```bash
   time curl -X GET \
     "http://localhost:8000/api/v1/requests/technician-views/counts?view=all_unsolved" \
     -H "Authorization: Bearer $TOKEN" \
     -o /tmp/counts_response.json
   ```

3. **Verify response structure:**
   ```bash
   jq 'keys' /tmp/counts_response.json
   # Should show: ["counts", "filter_counts"]

   jq '.counts' /tmp/counts_response.json
   # Should show all view counts

   jq '.filter_counts' /tmp/counts_response.json
   # Should show: {"all": X, "parents": Y, "subtasks": Z}
   ```

4. **Compare with full endpoint counts:**
   ```bash
   curl -X GET \
     "http://localhost:8000/api/v1/requests/technician-views?view=all_unsolved&page=1&perPage=1" \
     -H "Authorization: Bearer $TOKEN" \
     -o /tmp/full_response.json

   # Compare counts
   diff <(jq '.counts' /tmp/counts_response.json) <(jq '.counts' /tmp/full_response.json)
   # Should be identical
   ```

### Expected Results:

- ✅ Response time: 200-400ms (vs 1.5-2.5s for full endpoint)
- ✅ Response contains only counts (no data array)
- ✅ Counts match full endpoint counts
- ✅ Payload size: ~200 bytes (vs ~50KB+ for full endpoint)

---

## Test 5: Parallel Query Execution

**Purpose:** Verify queries run in parallel (not sequential)

### Test Steps:

1. **Enable database query logging:**
   ```sql
   -- In PostgreSQL
   ALTER SYSTEM SET log_min_duration_statement = 0;
   SELECT pg_reload_conf();
   ```

2. **Clear cache and make request:**
   ```bash
   redis-cli -h localhost -p 6380 FLUSHDB

   curl -X GET \
     "http://localhost:8000/api/v1/requests/technician-views?view=all_unsolved&page=1&perPage=20" \
     -H "Authorization: Bearer $TOKEN"
   ```

3. **Check PostgreSQL logs:**
   ```bash
   sudo tail -n 100 /var/log/postgresql/postgresql-*.log | grep "duration:"
   ```

4. **Analyze query timing:**
   - Look for 5-6 queries with overlapping timestamps
   - Verify total time ≠ sum of individual query times (indicates parallelism)

### Expected Results:

- ✅ 6 queries logged (1 + 5 parallel)
- ✅ Timestamps show overlapping execution
- ✅ Total time ≈ time of slowest query (not sum of all queries)

---

## Test 6: Load Testing

**Purpose:** Verify performance under load

### Test Steps:

1. **Install Apache Bench (if not installed):**
   ```bash
   sudo apt-get install apache2-utils
   ```

2. **Run load test (cold cache):**
   ```bash
   # Clear cache first
   redis-cli -h localhost -p 6380 FLUSHDB

   # 100 requests, 10 concurrent
   ab -n 100 -c 10 \
     -H "Authorization: Bearer $TOKEN" \
     "http://localhost:8000/api/v1/requests/technician-views?view=all_unsolved&page=1&perPage=20"
   ```

3. **Run load test (warm cache):**
   ```bash
   # Warm up cache
   curl -X GET \
     "http://localhost:8000/api/v1/requests/technician-views?view=all_unsolved&page=1&perPage=20" \
     -H "Authorization: Bearer $TOKEN" > /dev/null

   # 1000 requests, 50 concurrent
   ab -n 1000 -c 50 \
     -H "Authorization: Bearer $TOKEN" \
     "http://localhost:8000/api/v1/requests/technician-views?view=all_unsolved&page=1&perPage=20"
   ```

4. **Analyze results:**
   ```text
   Key metrics to check:
   - Requests per second (should be higher with cache)
   - Time per request (mean)
   - Time per request (median)
   - Failed requests (should be 0)
   ```

### Expected Results:

**Cold Cache:**
- ✅ Requests per second: 5-10 req/sec
- ✅ Mean response time: 1500-2500ms
- ✅ No failed requests

**Warm Cache:**
- ✅ Requests per second: 500-1000+ req/sec
- ✅ Mean response time: <50ms
- ✅ No failed requests

---

## Test 7: Cache TTL Expiration

**Purpose:** Verify cache expires after 30 seconds

### Test Steps:

1. **Make first request:**
   ```bash
   redis-cli -h localhost -p 6380 FLUSHDB

   curl -X GET \
     "http://localhost:8000/api/v1/requests/technician-views?view=all_unsolved&page=1&perPage=20" \
     -H "Authorization: Bearer $TOKEN" > /dev/null
   ```

2. **Check TTL immediately:**
   ```bash
   redis-cli -h localhost -p 6380 TTL "technician_views:1:all_unsolved:1:20:all"
   # Should show ~30 seconds
   ```

3. **Wait 15 seconds and check again:**
   ```bash
   sleep 15
   redis-cli -h localhost -p 6380 TTL "technician_views:1:all_unsolved:1:20:all"
   # Should show ~15 seconds
   ```

4. **Wait another 20 seconds (total 35s) and check:**
   ```bash
   sleep 20
   redis-cli -h localhost -p 6380 TTL "technician_views:1:all_unsolved:1:20:all"
   # Should show -2 (key expired and deleted)
   ```

5. **Make request again:**
   ```bash
   time curl -X GET \
     "http://localhost:8000/api/v1/requests/technician-views?view=all_unsolved&page=1&perPage=20" \
     -H "Authorization: Bearer $TOKEN" > /dev/null

   tail -n 5 src/backend/logs/app.log | grep "Cache"
   # Should see "Cache MISS"
   ```

### Expected Results:

- ✅ TTL counts down from 30 to 0
- ✅ Key expires after 30 seconds
- ✅ Next request after expiration is cache miss

---

## Test 8: Multiple Users (Isolation)

**Purpose:** Verify cache isolation between users

### Test Steps:

1. **Get tokens for 2 different users:**
   ```bash
   TOKEN_USER1=$(curl -X POST http://localhost:8000/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username": "user1"}' \
     | jq -r '.access_token')

   TOKEN_USER2=$(curl -X POST http://localhost:8000/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username": "user2"}' \
     | jq -r '.access_token')
   ```

2. **Clear cache:**
   ```bash
   redis-cli -h localhost -p 6380 FLUSHDB
   ```

3. **Make requests from both users:**
   ```bash
   curl -X GET \
     "http://localhost:8000/api/v1/requests/technician-views?view=all_unsolved&page=1&perPage=20" \
     -H "Authorization: Bearer $TOKEN_USER1" \
     -o /tmp/user1_response.json

   curl -X GET \
     "http://localhost:8000/api/v1/requests/technician-views?view=all_unsolved&page=1&perPage=20" \
     -H "Authorization: Bearer $TOKEN_USER2" \
     -o /tmp/user2_response.json
   ```

4. **Verify separate cache entries:**
   ```bash
   redis-cli -h localhost -p 6380 KEYS "technician_views:*"
   # Should show 2 separate keys (one per user)
   ```

5. **Verify different data (if users have different permissions):**
   ```bash
   diff /tmp/user1_response.json /tmp/user2_response.json
   # May show differences based on user permissions
   ```

### Expected Results:

- ✅ Separate cache entries for each user
- ✅ Users see only their authorized data
- ✅ Cache invalidation for one user doesn't affect others

---

## Test 9: Error Handling

**Purpose:** Verify graceful degradation on errors

### Test Steps:

1. **Stop Redis:**
   ```bash
   docker-compose stop redis
   ```

2. **Make request (should still work without cache):**
   ```bash
   time curl -X GET \
     "http://localhost:8000/api/v1/requests/technician-views?view=all_unsolved&page=1&perPage=20" \
     -H "Authorization: Bearer $TOKEN" \
     -o /tmp/no_cache_response.json
   ```

3. **Check logs for cache warnings:**
   ```bash
   tail -n 20 src/backend/logs/app.log | grep -i "redis\|cache"
   # Should show warnings about cache failure
   ```

4. **Verify response is still correct:**
   ```bash
   jq 'keys' /tmp/no_cache_response.json
   # Should still show correct response structure
   ```

5. **Restart Redis:**
   ```bash
   docker-compose start redis
   ```

### Expected Results:

- ✅ Endpoint still works without Redis
- ✅ Logs show cache warnings (not errors)
- ✅ Response data is correct
- ✅ No HTTP errors returned to client

---

## Test 10: Memory Usage

**Purpose:** Monitor Redis memory consumption

### Test Steps:

1. **Check Redis memory before test:**
   ```bash
   redis-cli -h localhost -p 6380 INFO memory | grep used_memory_human
   ```

2. **Simulate high load:**
   ```bash
   # Create cache entries for 100 different queries
   for view in unassigned all_unsolved my_unsolved; do
     for page in {1..10}; do
       for perpage in 20 50; do
         curl -X GET \
           "http://localhost:8000/api/v1/requests/technician-views?view=$view&page=$page&perPage=$perpage" \
           -H "Authorization: Bearer $TOKEN" > /dev/null
       done
     done
   done
   ```

3. **Check Redis memory after test:**
   ```bash
   redis-cli -h localhost -p 6380 INFO memory | grep used_memory_human
   ```

4. **Count cache entries:**
   ```bash
   redis-cli -h localhost -p 6380 DBSIZE
   ```

5. **Check average entry size:**
   ```bash
   # Memory increase / number of entries
   ```

### Expected Results:

- ✅ Memory increase: ~3-5 MB (for 60 entries × 50KB each)
- ✅ No memory leaks (stable after entries expire)
- ✅ Redis memory stays within limits (< 512MB configured max)

---

## Performance Benchmarks

### Target Metrics

| Metric | Target | Measured | Status |
|--------|--------|----------|--------|
| **Cache Miss Response** | < 2500ms | ___ms | ⬜ |
| **Cache Hit Response** | < 100ms | ___ms | ⬜ |
| **Counts-Only Response** | < 400ms | ___ms | ⬜ |
| **Cache Hit Rate** | > 70% | __% | ⬜ |
| **Concurrent Users** | 500+ | ___ | ⬜ |
| **Requests per Second** | 100+ (cold) | ___ | ⬜ |
| **Requests per Second** | 500+ (warm) | ___ | ⬜ |
| **Failed Requests** | 0% | __% | ⬜ |
| **Redis Memory** | < 50MB | ___MB | ⬜ |
| **Cache Invalidation** | < 50ms | ___ms | ⬜ |

---

## Troubleshooting

### Issue: Cache always MISS

**Possible causes:**
- TTL too short (30s)
- Cache key not matching
- Redis connection issues

**Debug:**
```bash
# Check Redis connection
redis-cli -h localhost -p 6380 PING
# Should return: PONG

# Check cache keys
redis-cli -h localhost -p 6380 KEYS "technician_views:*"

# Check logs
tail -f src/backend/logs/app.log | grep Cache
```

### Issue: Stale data after update

**Possible causes:**
- Cache invalidation not working
- Invalidation not called on all update paths

**Debug:**
```bash
# Check invalidation logs
grep "Invalidated" src/backend/logs/app.log

# Manually clear cache
redis-cli -h localhost -p 6380 DEL "technician_views:*"
```

### Issue: Redis memory high

**Possible causes:**
- Too many cache entries
- TTL not expiring
- Large payload sizes

**Debug:**
```bash
# Check memory usage
redis-cli -h localhost -p 6380 INFO memory

# Count keys
redis-cli -h localhost -p 6380 DBSIZE

# Check TTL on keys
redis-cli -h localhost -p 6380 SCAN 0 MATCH "technician_views:*" | xargs -I {} redis-cli -h localhost -p 6380 TTL {}
```

---

## Reporting Results

After completing tests, report results in this format:

```markdown
## Test Results Summary

**Date:** YYYY-MM-DD
**Tester:** Your Name
**Environment:** Development / Staging / Production

### Performance Metrics

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Cache Miss | < 2500ms | 1800ms | ✅ PASS |
| Cache Hit | < 100ms | 12ms | ✅ PASS |
| Counts-Only | < 400ms | 250ms | ✅ PASS |
| Load Test (cold) | 5-10 req/sec | 8 req/sec | ✅ PASS |
| Load Test (warm) | 500+ req/sec | 750 req/sec | ✅ PASS |

### Functional Tests

- ✅ Cache invalidation works correctly
- ✅ User isolation works correctly
- ✅ Graceful degradation without Redis
- ✅ TTL expires correctly
- ✅ Data accuracy maintained

### Issues Found

1. None

### Recommendations

1. Deploy to staging for further testing
2. Monitor cache hit rate in production
3. Fine-tune TTL based on usage patterns
```

---

**Testing Checklist:**

- [ ] Test 1: Cache Miss ✅
- [ ] Test 2: Cache Hit ✅
- [ ] Test 3: Cache Invalidation ✅
- [ ] Test 4: Counts-Only Endpoint ✅
- [ ] Test 5: Parallel Queries ✅
- [ ] Test 6: Load Testing ✅
- [ ] Test 7: TTL Expiration ✅
- [ ] Test 8: User Isolation ✅
- [ ] Test 9: Error Handling ✅
- [ ] Test 10: Memory Usage ✅

**Status:** Ready for Testing
