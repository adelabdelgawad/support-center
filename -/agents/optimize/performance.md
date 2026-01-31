---
name: optimize-performance
description: Optimize application performance including queries, caching, and code efficiency.
tools: Read, Write, Edit, Glob, Grep, Bash
---

# Performance Optimization Agent

Optimize application performance by improving queries, adding caching, and enhancing code efficiency.

## When This Agent Activates

- User requests: "Optimize performance"
- User requests: "Make this faster"
- User requests: "Improve performance"
- Command: `/optimize performance [target]`

## Optimization Areas

### 1. Database Query Optimization

**Find N+1 queries:**
```bash
grep -rn "for.*in.*:" --include="*.py" -A 10 | grep -E "query|execute|filter"
```

**Add eager loading:**
```python
# Before (N+1)
products = await session.execute(select(Product)).scalars().all()
for product in products:
    product.category = await session.get(Category, product.category_id)

# After (eager loading)
products = await session.execute(
    select(Product).options(joinedload(Product.category))
).scalars().all()
```

**Add missing indexes:**
```python
# Identify frequently filtered columns
grep -rn "\.filter\(.*==" --include="*.py" | grep -oE "\w+\s*==" | sort | uniq -c | sort -rn
```

### 2. Caching Implementation

**Response caching with Redis:**
```python
from functools import wraps
import json
import redis

redis_client = redis.Redis.from_url(settings.REDIS_URL)

def cache(ttl: int = 300):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            key = f"{func.__name__}:{hash(str(args) + str(kwargs))}"
            cached = redis_client.get(key)
            if cached:
                return json.loads(cached)
            result = await func(*args, **kwargs)
            redis_client.setex(key, ttl, json.dumps(result))
            return result
        return wrapper
    return decorator
```

### 3. Query Optimization

**Limit columns returned:**
```python
# Before
users = await session.execute(select(User)).scalars().all()

# After (only needed columns)
users = await session.execute(
    select(User.id, User.name, User.email)
).all()
```

**Use pagination:**
```python
# Add pagination to all list endpoints
async def list_products(
    session: AsyncSession,
    page: int = 1,
    limit: int = 20
):
    offset = (page - 1) * limit
    query = select(Product).offset(offset).limit(limit)
    return await session.execute(query).scalars().all()
```

## Output Format

```markdown
## Performance Optimization Report

**Target:** {scope}
**Generated:** {timestamp}

### Optimizations Applied

#### 1. Fixed N+1 Query in Product List

**File:** `api/services/product_service.py:45`

**Before:**
```python
products = await self.repo.list(session)
for product in products:
    product.images = await self.image_repo.get_by_product(session, product.id)
```

**After:**
```python
products = await session.execute(
    select(Product)
    .options(selectinload(Product.images))
).scalars().all()
```

**Impact:** 101 queries → 2 queries (~95% reduction in DB time)

#### 2. Added Redis Caching for Category List

**File:** `api/services/category_service.py`

**Added:**
```python
@cache(ttl=3600)  # Cache for 1 hour
async def list_categories(self, session: AsyncSession):
    return await self.repo.list(session)
```

**Impact:** Cached responses, 0ms for repeated requests

#### 3. Added Database Index

**File:** `db/models.py`

**Added:**
```python
class Product(Base):
    category_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("category.id"),
        index=True,  # Added index
    )
```

**Migration:**
```bash
alembic revision --autogenerate -m "add index on product.category_id"
alembic upgrade head
```

**Impact:** 80% faster filtered queries

### Performance Comparison

| Endpoint | Before | After | Improvement |
|----------|--------|-------|-------------|
| GET /products | 2,345ms | 234ms | 90% |
| GET /categories | 456ms | 12ms | 97% |
| GET /products?category_id=5 | 890ms | 178ms | 80% |

### Additional Recommendations

1. **Add connection pooling:**
   ```python
   engine = create_async_engine(
       DATABASE_URL,
       pool_size=20,
       max_overflow=10,
   )
   ```

2. **Use read replicas** for heavy read operations

3. **Implement response compression:**
   ```python
   from fastapi.middleware.gzip import GZipMiddleware
   app.add_middleware(GZipMiddleware, minimum_size=1000)
   ```

4. **Add CDN** for static assets and images
```
