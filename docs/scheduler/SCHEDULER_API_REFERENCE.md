# Scheduler API Reference

## Overview

All scheduler endpoints are under `/api/v1/scheduler/`. Authentication is required for all endpoints.

**Base URL:** `http://localhost:8000/api/v1/scheduler`

---

## Task Functions

### List Task Functions

Get all available task functions that can be scheduled.

```http
GET /scheduler/task-functions
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `is_active` | string | No | Filter by active status ("true" or "false") |
| `page` | int | No | Page number (default: 1) |
| `per_page` | int | No | Items per page (default: 50, max: 100) |

**Response:**

```json
{
  "taskFunctions": [
    {
      "id": 1,
      "name": "sync_domain_users",
      "displayName": "Domain User Sync",
      "description": "Synchronize users from Active Directory",
      "handlerPath": "tasks.ad_sync_tasks.sync_domain_users_task",
      "handlerType": "celery_task",
      "queue": "ad_queue",
      "defaultTimeoutSeconds": 600,
      "isActive": true,
      "isSystem": true,
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ],
  "total": 6
}
```

---

## Job Types

### List Job Types

Get all available job schedule types.

```http
GET /scheduler/job-types
```

**Response:**

```json
[
  {
    "id": 1,
    "name": "interval",
    "displayName": "Interval",
    "description": "Run at fixed time intervals"
  },
  {
    "id": 2,
    "name": "cron",
    "displayName": "Cron",
    "description": "Run on cron schedule"
  }
]
```

---

## Scheduled Jobs

### List Scheduled Jobs

Get all scheduled jobs with filtering and pagination.

```http
GET /scheduler/jobs
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | No | Filter by job name (partial match) |
| `is_enabled` | string | No | Filter by enabled status ("true" or "false") |
| `task_function_id` | int | No | Filter by task function |
| `page` | int | No | Page number (default: 1) |
| `per_page` | int | No | Items per page (default: 20, max: 100) |

**Response:**

```json
{
  "jobs": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Domain User Sync (Hourly)",
      "description": "Synchronize domain users from Active Directory every hour",
      "taskFunctionId": 1,
      "jobTypeId": 1,
      "scheduleConfig": {
        "hours": 1,
        "minutes": 0,
        "seconds": 0
      },
      "taskArgs": null,
      "maxInstances": 1,
      "timeoutSeconds": 600,
      "retryCount": 3,
      "retryDelaySeconds": 60,
      "isEnabled": true,
      "isPaused": false,
      "nextRunTime": "2024-01-15T12:00:00Z",
      "lastRunTime": "2024-01-15T11:00:00Z",
      "lastStatus": "success",
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-15T11:00:05Z",
      "createdBy": null,
      "updatedBy": null
    }
  ],
  "total": 4,
  "enabledCount": 4,
  "disabledCount": 0,
  "runningCount": 0
}
```

---

### Create Scheduled Job

Create a new scheduled job.

```http
POST /scheduler/jobs
```

**Request Body:**

```json
{
  "name": "Custom Cleanup Job",
  "description": "Run custom cleanup every 6 hours",
  "taskFunctionId": 5,
  "jobTypeId": 1,
  "scheduleConfig": {
    "hours": 6,
    "minutes": 0,
    "seconds": 0
  },
  "taskArgs": {
    "retention_days": 30
  },
  "maxInstances": 1,
  "timeoutSeconds": 300,
  "retryCount": 3,
  "retryDelaySeconds": 60,
  "isEnabled": true
}
```

**Response:** `201 Created`

```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "name": "Custom Cleanup Job",
  "description": "Run custom cleanup every 6 hours",
  "taskFunctionId": 5,
  "jobTypeId": 1,
  "scheduleConfig": {
    "hours": 6,
    "minutes": 0,
    "seconds": 0
  },
  "taskArgs": {
    "retention_days": 30
  },
  "maxInstances": 1,
  "timeoutSeconds": 300,
  "retryCount": 3,
  "retryDelaySeconds": 60,
  "isEnabled": true,
  "isPaused": false,
  "nextRunTime": "2024-01-15T16:00:00Z",
  "lastRunTime": null,
  "lastStatus": null,
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T10:00:00Z",
  "createdBy": "user-uuid",
  "updatedBy": "user-uuid"
}
```

---

### Get Scheduled Job

Get a single scheduled job with full details.

```http
GET /scheduler/jobs/{job_id}
```

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `job_id` | UUID | Job ID |

**Response:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Domain User Sync (Hourly)",
  "description": "Synchronize domain users from Active Directory every hour",
  "taskFunctionId": 1,
  "jobTypeId": 1,
  "scheduleConfig": {
    "hours": 1,
    "minutes": 0,
    "seconds": 0
  },
  "taskArgs": null,
  "maxInstances": 1,
  "timeoutSeconds": 600,
  "retryCount": 3,
  "retryDelaySeconds": 60,
  "isEnabled": true,
  "isPaused": false,
  "nextRunTime": "2024-01-15T12:00:00Z",
  "lastRunTime": "2024-01-15T11:00:00Z",
  "lastStatus": "success",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-15T11:00:05Z",
  "createdBy": null,
  "updatedBy": null,
  "taskFunction": {
    "id": 1,
    "name": "sync_domain_users",
    "displayName": "Domain User Sync",
    "description": "Synchronize users from Active Directory",
    "handlerPath": "tasks.ad_sync_tasks.sync_domain_users_task",
    "handlerType": "celery_task",
    "queue": "ad_queue",
    "defaultTimeoutSeconds": 600,
    "isActive": true,
    "isSystem": true,
    "createdAt": "2024-01-01T00:00:00Z"
  },
  "jobType": {
    "id": 1,
    "name": "interval",
    "displayName": "Interval",
    "description": "Run at fixed time intervals"
  },
  "recentExecutions": [
    {
      "id": "exec-uuid-1",
      "jobId": "550e8400-e29b-41d4-a716-446655440000",
      "celeryTaskId": "celery-task-id",
      "status": "success",
      "startedAt": "2024-01-15T11:00:00Z",
      "completedAt": "2024-01-15T11:00:05Z",
      "durationSeconds": 5.2,
      "result": {"synced_count": 150},
      "errorMessage": null,
      "triggeredBy": "scheduler",
      "triggeredByUserId": null
    }
  ]
}
```

---

### Update Scheduled Job

Update an existing scheduled job. All fields are optional.

```http
PUT /scheduler/jobs/{job_id}
```

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `job_id` | UUID | Job ID |

**Request Body:**

```json
{
  "name": "Updated Job Name",
  "scheduleConfig": {
    "hours": 2,
    "minutes": 0,
    "seconds": 0
  },
  "isEnabled": false
}
```

**Response:** `200 OK`

Returns the updated job object (same format as GET).

---

### Delete Scheduled Job

Delete a scheduled job.

```http
DELETE /scheduler/jobs/{job_id}
```

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `job_id` | UUID | Job ID |

**Response:** `204 No Content`

**Note:** System jobs (is_system=True on task function) may be protected from deletion.

---

## Job Actions

### Toggle Job Status

Enable or disable a scheduled job.

```http
PUT /scheduler/jobs/{job_id}/status
```

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `job_id` | UUID | Job ID |

**Request Body:**

```json
{
  "isEnabled": false
}
```

**Response:** `200 OK`

Returns the updated job object.

---

### Trigger Job Manually

Manually trigger a job execution.

```http
POST /scheduler/jobs/{job_id}/trigger
```

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `job_id` | UUID | Job ID |

**Response:** `200 OK`

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "executionId": "exec-uuid-new",
  "celeryTaskId": "celery-task-id-new",
  "message": "Job triggered successfully"
}
```

**Notes:**
- Job must be enabled to be triggered
- Creates an execution record with `triggered_by: "manual"`
- Records the user who triggered the job

---

## Executions

### List All Executions

Get execution history across all jobs.

```http
GET /scheduler/executions
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `job_id` | UUID | No | Filter by job ID |
| `status` | string | No | Filter by status (pending, running, success, failed, timeout) |
| `page` | int | No | Page number (default: 1) |
| `per_page` | int | No | Items per page (default: 50, max: 100) |

**Response:**

```json
{
  "executions": [
    {
      "id": "exec-uuid-1",
      "jobId": "550e8400-e29b-41d4-a716-446655440000",
      "celeryTaskId": "celery-task-id",
      "status": "success",
      "startedAt": "2024-01-15T11:00:00Z",
      "completedAt": "2024-01-15T11:00:05Z",
      "durationSeconds": 5.2,
      "result": {"synced_count": 150},
      "errorMessage": null,
      "triggeredBy": "scheduler",
      "triggeredByUserId": null
    }
  ],
  "total": 100
}
```

---

### List Job Executions

Get execution history for a specific job.

```http
GET /scheduler/jobs/{job_id}/executions
```

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `job_id` | UUID | Job ID |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | No | Filter by status |
| `page` | int | No | Page number (default: 1) |
| `per_page` | int | No | Items per page (default: 50, max: 100) |

**Response:** Same format as List All Executions.

---

## Scheduler Status

### Get Scheduler Status

Get overall scheduler status including leader instance and job counts.

```http
GET /scheduler/status
```

**Response:**

```json
{
  "isRunning": true,
  "leaderInstance": {
    "id": "instance-uuid",
    "hostname": "server-01",
    "pid": 12345,
    "isLeader": true,
    "leaderSince": "2024-01-15T10:00:00Z",
    "lastHeartbeat": "2024-01-15T11:59:30Z",
    "startedAt": "2024-01-15T10:00:00Z",
    "version": "1.0.0"
  },
  "totalJobs": 4,
  "enabledJobs": 4,
  "runningJobs": 0,
  "nextScheduledJob": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Domain User Sync (Hourly)",
    "nextRunTime": "2024-01-15T12:00:00Z"
  },
  "instances": [
    {
      "id": "instance-uuid",
      "hostname": "server-01",
      "pid": 12345,
      "isLeader": true,
      "leaderSince": "2024-01-15T10:00:00Z",
      "lastHeartbeat": "2024-01-15T11:59:30Z",
      "startedAt": "2024-01-15T10:00:00Z",
      "version": "1.0.0"
    }
  ]
}
```

---

## Error Responses

### Common Error Codes

| Status | Description |
|--------|-------------|
| 400 | Bad Request - Invalid parameters or request body |
| 401 | Unauthorized - Missing or invalid authentication |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource does not exist |
| 409 | Conflict - Operation conflicts with current state |
| 422 | Unprocessable Entity - Validation error |
| 500 | Internal Server Error |

### Error Response Format

```json
{
  "detail": "Error message describing what went wrong"
}
```

### Validation Error Format

```json
{
  "detail": [
    {
      "loc": ["body", "scheduleConfig", "hours"],
      "msg": "value is not a valid integer",
      "type": "type_error.integer"
    }
  ]
}
```

---

## Schedule Configuration Examples

### Interval Examples

Every 30 seconds:
```json
{"hours": 0, "minutes": 0, "seconds": 30}
```

Every 5 minutes:
```json
{"hours": 0, "minutes": 5, "seconds": 0}
```

Every 2 hours:
```json
{"hours": 2, "minutes": 0, "seconds": 0}
```

Every 24 hours (daily):
```json
{"hours": 24, "minutes": 0, "seconds": 0}
```

### Cron Examples

Every day at midnight:
```json
{"hour": "0", "minute": "0"}
```

Every day at 9 AM:
```json
{"hour": "9", "minute": "0"}
```

Every hour at minute 30:
```json
{"hour": "*", "minute": "30"}
```

Every Monday at 8 AM:
```json
{"hour": "8", "minute": "0", "day_of_week": "mon"}
```

First day of every month at midnight:
```json
{"hour": "0", "minute": "0", "day": "1"}
```

---

## Next.js API Routes

The frontend uses Next.js API routes as a proxy to the backend. These routes are located in `/app/api/setting/scheduler/`.

| Next.js Route | Backend Endpoint |
|---------------|------------------|
| `GET /api/setting/scheduler/jobs` | `GET /scheduler/jobs` |
| `POST /api/setting/scheduler/jobs` | `POST /scheduler/jobs` |
| `GET /api/setting/scheduler/jobs/[id]` | `GET /scheduler/jobs/{id}` |
| `PUT /api/setting/scheduler/jobs/[id]` | `PUT /scheduler/jobs/{id}` |
| `DELETE /api/setting/scheduler/jobs/[id]` | `DELETE /scheduler/jobs/{id}` |
| `PUT /api/setting/scheduler/jobs/[id]/status` | `PUT /scheduler/jobs/{id}/status` |
| `POST /api/setting/scheduler/jobs/[id]/trigger` | `POST /scheduler/jobs/{id}/trigger` |
| `GET /api/setting/scheduler/executions` | `GET /scheduler/executions` |
| `GET /api/setting/scheduler/status` | `GET /scheduler/status` |
| `GET /api/setting/scheduler/task-functions` | `GET /scheduler/task-functions` |
| `GET /api/setting/scheduler/job-types` | `GET /scheduler/job-types` |
