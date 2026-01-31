---
name: debug-performance-profiling
description: Profile application performance, identify bottlenecks, and measure execution times.
tools: Read, Glob, Grep, Bash
---

# Performance Profiling Agent

Profile application performance to identify bottlenecks, slow code, and optimization opportunities.

## When This Agent Activates

- User requests: "Profile this code"
- User requests: "Why is this slow?"
- User requests: "Find performance bottlenecks"
- Command: `/debug performance`

## Profiling Approach

### 1. Identify Profiling Target

```markdown
## Performance Profiling Configuration

**What would you like to profile?**

- [ ] Specific endpoint (e.g., GET /setting/products)
- [ ] Specific function/method
- [ ] Database queries
- [ ] Overall application
- [ ] Frontend component

**Profiling Method:**
- [ ] Add timing decorators (non-invasive)
- [ ] Use profiling tools (more detailed)
- [ ] Review existing metrics
```

### 2. Add Profiling Code

**Python timing decorator:**
```python
import time
import functools
import logging

logger = logging.getLogger(__name__)

def profile(func):
    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = await func(*args, **kwargs)
        elapsed = (time.perf_counter() - start) * 1000
        logger.info(f"{func.__name__} took {elapsed:.2f}ms")
        return result
    return wrapper
```

**SQLAlchemy query logging:**
```python
# Enable query logging
import logging
logging.getLogger('sqlalchemy.engine').setLevel(logging.DEBUG)
```

### 3. Analysis Checklist

```bash
# Check for N+1 queries
grep -rn "for.*in.*:" --include="*.py" -A 10 | grep -i "query\|execute"

# Find slow functions (if profiling data available)
grep -i "took.*ms\|duration\|elapsed" logs/*.log | sort -t'=' -k2 -rn | head -20

# Check query count
grep -c "SELECT\|INSERT\|UPDATE\|DELETE" logs/sqlalchemy.log
```

## Output Format

```markdown
## Performance Profiling Report

**Target:** GET /setting/products
**Date:** {timestamp}
**Requests Analyzed:** 100

### Summary

| Metric | Value |
|--------|-------|
| Average Response Time | 2,345ms |
| P50 (Median) | 1,890ms |
| P95 | 4,567ms |
| P99 | 8,234ms |
| Min | 456ms |
| Max | 12,345ms |

### Time Breakdown

```
Total Request Time: 2,345ms (100%)
├── Router handler: 12ms (0.5%)
├── Service layer: 45ms (1.9%)
├── Database queries: 2,156ms (91.9%)
│   ├── Query 1 (products): 234ms
│   ├── Query 2 (categories): 89ms
│   ├── Query 3 (N+1 images): 1,833ms ← BOTTLENECK
│   └── Other: 0ms
├── Serialization: 123ms (5.2%)
└── Network/Other: 9ms (0.4%)
```

### Identified Bottlenecks

#### 1. N+1 Query for Product Images (91% of time)

**Location:** `api/services/product_service.py:45`

**Current Code:**
```python
async def list_products(self, session: AsyncSession):
    products = await self.repo.list(session)
    for product in products:
        product.images = await self.image_repo.get_by_product(session, product.id)
    return products
```

**Problem:**
- 1 query for products
- N queries for images (1 per product)
- 100 products = 101 queries

**Solution:**
```python
async def list_products(self, session: AsyncSession):
    return await session.execute(
        select(Product)
        .options(selectinload(Product.images))  # Eager load images
    ).scalars().all()
```

**Expected Improvement:**
- Before: 101 queries, ~2,000ms
- After: 2 queries, ~200ms
- **90% reduction**

#### 2. Missing Index on Category Filter

**Location:** Database

**Query:**
```sql
SELECT * FROM product WHERE category_id = 5
```

**Current:** Full table scan (explain shows Seq Scan)
**Solution:** Add index on `category_id`

```python
# db/models.py
category_id: Mapped[int] = mapped_column(
    Integer,
    ForeignKey("category.id"),
    index=True,  # Add index
)
```

**Expected Improvement:** 50-80% reduction for filtered queries

#### 3. Serialization Overhead

**Location:** `api/schemas/product_schema.py`

**Current:**
- Each product serializes 15 fields
- Nested category with 10 fields
- Nested images with 8 fields each

**Solution:**
- Create lightweight `ProductListItem` schema
- Only include necessary fields for list view

```python
class ProductListItem(CamelModel):
    id: int
    name: str
    price: Decimal
    thumbnail: str | None
    category_name: str
```

### Database Query Analysis

| Query | Count | Avg Time | Total Time |
|-------|-------|----------|------------|
| SELECT products | 1 | 234ms | 234ms |
| SELECT categories | 1 | 89ms | 89ms |
| SELECT images WHERE product_id = ? | 100 | 18ms | 1,833ms |

**Total Queries:** 102
**Total DB Time:** 2,156ms

### Recommendations

1. **Immediate (High Impact):**
   - Fix N+1 query with eager loading
   - Add index on `category_id`

2. **Short-term:**
   - Create lightweight list schemas
   - Add Redis caching for product list

3. **Long-term:**
   - Consider read replica for list queries
   - Implement cursor-based pagination
   - Add CDN for images

### Profiling Commands

```bash
# Profile specific endpoint
python -m cProfile -s cumtime app.py

# Query analysis
EXPLAIN ANALYZE SELECT * FROM product WHERE category_id = 5;

# Memory profiling
python -m memory_profiler your_script.py
```
```
