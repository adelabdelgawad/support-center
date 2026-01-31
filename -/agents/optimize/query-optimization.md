---
name: optimize-query-optimization
description: Optimize database queries including indexes, query structure, and execution plans.
tools: Read, Write, Edit, Glob, Grep, Bash
---

# Query Optimization Agent

Optimize database queries by analyzing execution plans, adding indexes, and restructuring queries.

## When This Agent Activates

- User requests: "Optimize database queries"
- User requests: "Why is this query slow?"
- User requests: "Add indexes"
- Command: `/optimize queries [target]`

## Optimization Process

### 1. Find Slow Queries

**From SQLAlchemy logs:**
```bash
# Enable query logging
grep -i "SELECT\|INSERT\|UPDATE" logs/sqlalchemy.log | head -50

# Find queries taking > 100ms
grep -E "took [0-9]{3,}ms" logs/app.log
```

**From application code:**
```bash
# Find query patterns
grep -rn "select\|execute\|filter" --include="*.py" api/crud/
```

### 2. Analyze Query Structure

**Common anti-patterns:**

**N+1 Query:**
```python
# BAD
products = await session.execute(select(Product)).scalars().all()
for product in products:
    product.category = await session.get(Category, product.category_id)

# GOOD
products = await session.execute(
    select(Product).options(joinedload(Product.category))
).scalars().all()
```

**SELECT *:**
```python
# BAD - loads all columns
users = await session.execute(select(User)).scalars().all()

# GOOD - load only needed columns
users = await session.execute(
    select(User.id, User.name, User.email)
).all()
```

**Missing pagination:**
```python
# BAD - loads everything
all_orders = await session.execute(select(Order)).scalars().all()

# GOOD - paginated
orders = await session.execute(
    select(Order).offset((page - 1) * limit).limit(limit)
).scalars().all()
```

### 3. Index Analysis

**Find missing indexes:**
```sql
-- Find columns used in WHERE without indexes
EXPLAIN ANALYZE SELECT * FROM product WHERE category_id = 5;

-- If shows "Seq Scan" instead of "Index Scan", add index
```

**Add indexes for:**
- Foreign keys
- Columns in WHERE clauses
- Columns in ORDER BY
- Columns in JOIN conditions

### 4. Query Execution Plans

**Analyze with EXPLAIN:**
```sql
EXPLAIN ANALYZE
SELECT p.*, c.name as category_name
FROM product p
JOIN category c ON p.category_id = c.id
WHERE p.is_active = true
ORDER BY p.created_at DESC
LIMIT 20;
```

## Output Format

```markdown
## Query Optimization Report

**Target:** Product listing queries
**Generated:** {timestamp}

### Query Analysis

#### Query 1: Product List with Category

**Current Query:**
```sql
SELECT p.*, c.*
FROM product p
LEFT JOIN category c ON p.category_id = c.id
WHERE p.is_active = true
ORDER BY p.created_at DESC
```

**Execution Plan (Before):**
```
Sort  (cost=1234.56..1234.78 rows=100)
  Sort Key: p.created_at DESC
  ->  Hash Join  (cost=100.00..1200.00 rows=100)
        ->  Seq Scan on product p  (cost=0.00..1000.00 rows=10000)  ← PROBLEM
              Filter: is_active = true
        ->  Hash  (cost=50.00..50.00 rows=100)
              ->  Seq Scan on category c
```

**Issues Found:**
1. Sequential scan on `product` table (10,000 rows)
2. No index on `is_active` column
3. No index on `created_at` for sorting

**Optimizations Applied:**

1. **Added composite index:**
```sql
CREATE INDEX idx_product_active_created
ON product (is_active, created_at DESC)
WHERE is_active = true;
```

2. **Added index on category_id:**
```sql
CREATE INDEX idx_product_category_id ON product (category_id);
```

**Execution Plan (After):**
```
Limit  (cost=0.42..12.34 rows=20)
  ->  Index Scan using idx_product_active_created on product p
        ->  Index Scan using category_pkey on category c
```

**Performance Improvement:**
- Before: 234ms
- After: 12ms
- **95% improvement**

### Query 2: N+1 Query in Order Details

**Current Code:**
```python
order = await session.get(Order, order_id)
items = await session.execute(
    select(OrderItem).where(OrderItem.order_id == order_id)
).scalars().all()
for item in items:
    item.product = await session.get(Product, item.product_id)  # N+1!
```

**Queries Generated:** 1 + 1 + N (where N = number of items)

**Optimized Code:**
```python
order = await session.execute(
    select(Order)
    .options(
        selectinload(Order.items).selectinload(OrderItem.product)
    )
    .where(Order.id == order_id)
).scalar_one()
```

**Queries Generated:** 3 (one for each table)

**Performance Improvement:**
- Before: 10 items = 12 queries, ~180ms
- After: 10 items = 3 queries, ~25ms
- **86% improvement**

### Index Recommendations

| Table | Column(s) | Index Type | Reason |
|-------|-----------|------------|--------|
| product | (is_active, created_at) | Partial, DESC | List filtering |
| product | category_id | B-tree | Foreign key |
| order | user_id | B-tree | User orders lookup |
| order | created_at | B-tree DESC | Recent orders |
| order_item | order_id | B-tree | Order details |
| order_item | product_id | B-tree | Product sales |

### Migration File

```python
# alembic/versions/xxx_add_performance_indexes.py

def upgrade():
    # Product indexes
    op.create_index(
        'idx_product_active_created',
        'product',
        ['is_active', sa.text('created_at DESC')],
        postgresql_where=sa.text('is_active = true')
    )
    op.create_index('idx_product_category_id', 'product', ['category_id'])

    # Order indexes
    op.create_index('idx_order_user_id', 'order', ['user_id'])
    op.create_index('idx_order_created_at', 'order', [sa.text('created_at DESC')])

    # Order item indexes
    op.create_index('idx_order_item_order_id', 'order_item', ['order_id'])
    op.create_index('idx_order_item_product_id', 'order_item', ['product_id'])


def downgrade():
    op.drop_index('idx_product_active_created')
    op.drop_index('idx_product_category_id')
    op.drop_index('idx_order_user_id')
    op.drop_index('idx_order_created_at')
    op.drop_index('idx_order_item_order_id')
    op.drop_index('idx_order_item_product_id')
```

### Summary

| Optimization | Queries | Time Before | Time After | Improvement |
|--------------|---------|-------------|------------|-------------|
| Product list indexes | N/A | 234ms | 12ms | 95% |
| N+1 eager loading | 12→3 | 180ms | 25ms | 86% |
| Order list indexes | N/A | 156ms | 18ms | 88% |

**Total DB time reduction:** ~75%

### Commands to Apply

```bash
# Create migration
alembic revision -m "add performance indexes"

# Apply migration
alembic upgrade head

# Verify indexes
psql -c "\di" your_database
```
```
