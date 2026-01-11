# Prometheus & Grafana Monitoring Setup

Complete production-ready monitoring stack for the IT Support Center FastAPI backend.

## 🎯 Overview

This monitoring setup provides:
- **Automatic HTTP metrics** - All API endpoints tracked automatically
- **Custom business metrics** - Tickets, authentication, file uploads
- **WebSocket metrics** - Real-time connection and message tracking
- **Database metrics** - Connection pool and query performance
- **System metrics** - CPU, memory, process stats
- **Alert rules** - Proactive notifications for issues
- **Pre-built dashboards** - Visualize all metrics

## 📊 Architecture

```
FastAPI Backend (port 8000)
  ├─> /metrics endpoint
  │
Prometheus (port 9090)
  ├─> Scrapes /metrics every 15s
  ├─> Evaluates alert rules
  ├─> Stores metrics (30 days retention)
  │
Grafana (port 3030)
  ├─> Queries Prometheus
  └─> Displays dashboards
```

## 🚀 Quick Start

### 1. Start Monitoring Stack

```bash
# Start all services including Prometheus and Grafana
docker compose -f docker-compose.prod.yml up -d prometheus grafana

# Or start everything
docker compose -f docker-compose.prod.yml up -d
```

### 2. Access Services

- **Prometheus**: http://localhost:9090
  - View targets: http://localhost:9090/targets
  - View alerts: http://localhost:9090/alerts
  - Query metrics: http://localhost:9090/graph

- **Grafana**: http://localhost:3030
  - Default credentials: `admin` / `admin` (change on first login)
  - Datasource auto-configured
  - Dashboards auto-loaded

- **Backend Metrics**: http://localhost:8000/metrics
  - Raw Prometheus format
  - All metrics exposed here

### 3. Verify Setup

```bash
# Check Prometheus is scraping backend
curl http://localhost:9090/api/v1/targets

# Check backend metrics endpoint
curl http://localhost:8000/metrics | grep http_requests_total

# Check Grafana health
curl http://localhost:3030/api/health
```

## 📈 Available Metrics

### HTTP Metrics (Automatic)

Provided by `prometheus-fastapi-instrumentator`:

```
# Request count
http_requests_total{handler="/api/v1/requests",method="POST",status="2xx"}

# Request duration
http_request_duration_seconds{handler="/api/v1/requests",method="GET"}

# Request size
http_request_size_bytes{handler="/api/v1/auth/login"}

# Response size
http_response_size_bytes{handler="/api/v1/users"}

# In-flight requests
http_requests_inprogress{handler="/api/v1/tickets",method="GET"}
```

### Business Metrics (Custom)

#### Ticket Lifecycle
```
ticket_created_total{category="hardware",priority="high",created_by_role="employee"}
ticket_assigned_total{category="software",priority="medium"}
ticket_status_changed_total{from_status="open",to_status="in_progress"}
ticket_solved_total{category="network",resolution_time_bucket="1-4h"}
ticket_resolution_time_seconds{category="hardware",priority="high"}
tickets_open_by_status{status="open"}
tickets_open_by_priority{priority="high"}
```

#### Authentication
```
auth_attempts_total{method="AD",status="success"}
auth_duration_ms{method="password"}
active_user_sessions{role="agent"}
session_duration_seconds{role="employee"}
```

#### File Operations
```
file_uploads_total{file_type="pdf",size_bucket="1-5MB"}
file_upload_duration_ms{file_type="image"}
file_upload_size_bytes{file_type="document"}
minio_operations_total{operation="upload",status="success"}
minio_operation_duration_ms{operation="download"}
```

### Database Metrics (Custom)

```
db_pool_size - Total pool size
db_pool_checked_out - Connections in use
db_pool_overflow - Overflow connections
db_pool_checkouts_total - Total checkouts
db_query_duration_ms{query_type="SELECT",table="requests"}
db_transaction_duration_ms{transaction_type="INSERT"}
db_queries_total{query_type="UPDATE",status="success"}
db_transactions_total{status="commit"}
db_deadlocks_total - Deadlock counter
```

### Cache Metrics (Custom)

```
cache_operations_total{operation="get",status="hit"}
cache_operation_duration_ms{operation="set"}
cache_hit_ratio - 0.0 to 1.0
cache_size_bytes - Estimated cache size
cache_keys_total - Total keys
```

### WebSocket Metrics (Custom)

```
websocket_active_connections{endpoint="/chat",client_type="requester_app"}
websocket_connections_total{endpoint="/ws/notifications",status="success"}
websocket_messages_sent_total{message_type="chat_message",endpoint="/chat"}
websocket_initial_load_duration_ms{endpoint="/chat"}
websocket_heartbeat_rtt_ms{endpoint="/chat"}
websocket_sequence_gaps_detected_total{endpoint="/chat",gap_size="1"}
```

### System Metrics (Automatic)

Provided by `prometheus-client`:

```
process_cpu_seconds_total - CPU time
process_resident_memory_bytes - RSS memory
process_virtual_memory_bytes - Virtual memory
process_open_fds - Open file descriptors
process_start_time_seconds - Process start time
```

## 🔔 Alert Rules

Located in `prometheus/alerts/backend_alerts.yml`:

### Critical Alerts

| Alert | Condition | Duration | Action |
|-------|-----------|----------|--------|
| BackendServiceDown | Backend unreachable | 2 minutes | Check backend container |
| HighErrorRate | >5% HTTP 5xx errors | 5 minutes | Check logs and database |
| VeryHighLatencyCritical | P95 > 5s | 5 minutes | Immediate investigation |
| DatabasePoolExhausted | >90% pool used | 2 minutes | Increase pool or fix leaks |

### Warning Alerts

| Alert | Condition | Duration | Action |
|-------|-----------|----------|--------|
| HighLatencyWarning | P95 > 1s | 10 minutes | Check database performance |
| MemoryLeakSuspected | Memory growing >10MB/s | 30 minutes | Review code changes |
| HighCPUUsage | CPU > 80% | 10 minutes | Check for inefficient queries |
| HighWebSocketErrors | >10 errors/sec | 5 minutes | Check WebSocket logs |
| LowCacheHitRatio | <70% hit ratio | 15 minutes | Review cache strategy |

### Info Alerts

| Alert | Condition | Duration | Notes |
|-------|-----------|----------|-------|
| NoTicketsCreated | No tickets in 1 hour | 1 hour | May indicate frontend issue |
| HighAuthFailureRate | >20% auth failures | 10 minutes | Check for brute force |

## 📊 Dashboards

### Creating Custom Dashboards

1. **Access Grafana**: http://localhost:3030
2. **Login**: `admin` / `admin` (change password)
3. **Create Dashboard**: Click "+" → "New Dashboard"
4. **Add Panel**: Click "Add visualization"
5. **Select Datasource**: Prometheus (default)
6. **Enter Query**: Use metrics from above
7. **Configure Visualization**: Choose graph type
8. **Save Dashboard**: Click "Save" icon

### Example Queries

**Request rate per endpoint:**
```promql
sum by (handler) (rate(http_requests_total[5m]))
```

**Error percentage:**
```promql
sum(rate(http_requests_total{status=~"5.."}[5m]))
/
sum(rate(http_requests_total[5m])) * 100
```

**P95 latency:**
```promql
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le, handler)
)
```

**Active WebSocket connections:**
```promql
sum by (endpoint) (websocket_active_connections)
```

**Tickets created per hour:**
```promql
sum(rate(ticket_created_total[1h])) * 3600
```

**Database pool utilization:**
```promql
(db_pool_checked_out / db_pool_size) * 100
```

## 🛠️ Configuration

### Environment Variables

Add to `docker/env/.env.backend`:

```env
# Monitoring
ENABLE_METRICS=True
MONITORING_ENABLE_METRICS=True
MONITORING_METRICS_PORT=9090
```

Add to root `.env` or docker-compose override:

```env
# Prometheus
PROMETHEUS_PORT=9090

# Grafana
GRAFANA_PORT=3030
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=your-secure-password
```

### Prometheus Configuration

Edit `docker/monitoring/prometheus/prometheus.yml`:

- **Scrape interval**: How often to collect metrics (default: 15s)
- **Retention time**: How long to keep data (default: 30 days)
- **Retention size**: Maximum storage (default: 10GB)

### Alert Customization

Edit `docker/monitoring/prometheus/alerts/backend_alerts.yml`:

- Add new alert rules
- Modify thresholds
- Change alert durations
- Add custom annotations

## 🔍 Troubleshooting

### Prometheus not scraping backend

```bash
# Check backend metrics endpoint
curl http://localhost:8000/metrics

# Check Prometheus targets
curl http://localhost:9090/api/v1/targets | jq

# Check Prometheus logs
docker logs servicecatalog_prometheus
```

### Grafana not showing data

```bash
# Check datasource connection
curl http://localhost:3030/api/datasources

# Check Prometheus queries work
curl 'http://localhost:9090/api/v1/query?query=up'

# Check Grafana logs
docker logs servicecatalog_grafana
```

### No metrics appearing

```bash
# Verify backend is instrumenting requests
curl http://localhost:8000/health
curl http://localhost:8000/metrics | grep http_requests_total

# Make some API calls to generate metrics
curl http://localhost:8000/api/v1/users

# Check metrics appear in Prometheus
curl 'http://localhost:9090/api/v1/query?query=http_requests_total'
```

### Alerts not firing

```bash
# Check alert rules are loaded
curl http://localhost:9090/api/v1/rules

# Check alert evaluation
curl http://localhost:9090/api/v1/alerts

# Manually trigger alert condition to test
# (e.g., stop backend to trigger BackendServiceDown alert)
```

## 📚 Additional Resources

- **Prometheus Documentation**: https://prometheus.io/docs/
- **Grafana Documentation**: https://grafana.com/docs/
- **PromQL Tutorial**: https://prometheus.io/docs/prometheus/latest/querying/basics/
- **Grafana Dashboard Library**: https://grafana.com/grafana/dashboards/

## 🔐 Security Notes

1. **Change default Grafana password** on first login
2. **Secure Prometheus**: Consider adding authentication
3. **Firewall rules**: Restrict access to monitoring ports
4. **HTTPS**: Use reverse proxy for production (Nginx)
5. **Secrets**: Use strong passwords in .env files

## 📝 Maintenance

### Backing up Grafana dashboards

```bash
# Export dashboard JSON from Grafana UI
# Or backup Grafana data volume
docker run --rm -v it_support_center_grafana_data:/data -v $(pwd):/backup \
  ubuntu tar czf /backup/grafana_backup.tar.gz /data
```

### Cleaning up old metrics

```bash
# Prometheus automatically manages retention
# Check current storage usage
du -sh /var/lib/docker/volumes/it_support_center_prometheus_data

# If needed, reduce retention time in prometheus.yml
# and reload Prometheus config
curl -X POST http://localhost:9090/-/reload
```

### Updating Prometheus/Grafana

```bash
# Update image versions in docker-compose.prod.yml
# Pull new images
docker compose -f docker-compose.prod.yml pull prometheus grafana

# Restart services
docker compose -f docker-compose.prod.yml up -d prometheus grafana
```

---

**Last Updated**: 2025-12-13  
**Version**: 1.0.0  
**Maintainer**: Platform Team
