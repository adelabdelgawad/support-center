"""
Tests for scheduler management endpoints.
Tests api/routers/management/scheduler_router.py endpoints.
"""

import pytest
from uuid import uuid4
from datetime import datetime, timezone
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import Scheduler


@pytest.mark.asyncio
class TestListScheduledJobs:
    """Test GET /management/scheduler/ endpoint."""

    async def test_list_jobs_success(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test listing scheduled jobs successfully."""
        job1 = Scheduler(
            name="backup_job",
            job_type="backup",
            schedule="0 0 * * *",
            status="active",
            last_run=datetime.now(timezone.utc),
        )
        job2 = Scheduler(
            name="cleanup_job",
            job_type="cleanup",
            schedule="0 2 * * *",
            status="paused",
        )
        db_session.add(job1)
        db_session.add(job2)
        await db_session.commit()

        response = await async_client.get(
            "/management/scheduler/",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "jobs" in data or isinstance(data, list)

    async def test_list_jobs_with_pagination(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test listing jobs with pagination."""
        response = await async_client.get(
            "/management/scheduler/?skip=0&limit=10",
            headers=auth_headers,
        )

        assert response.status_code == 200

    async def test_list_jobs_filter_by_status(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test filtering jobs by status."""
        job = Scheduler(
            name="active_job",
            job_type="report",
            schedule="0 1 * * *",
            status="active",
        )
        db_session.add(job)
        await db_session.commit()

        response = await async_client.get(
            "/management/scheduler/?status=active",
            headers=auth_headers,
        )

        assert response.status_code == 200

    async def test_list_jobs_unauthorized(
        self,
        async_client: AsyncClient,
    ):
        """Test listing jobs without authentication."""
        response = await async_client.get("/management/scheduler/")
        assert response.status_code == 401


@pytest.mark.asyncio
class TestGetScheduledJob:
    """Test GET /management/scheduler/{job_id} endpoint."""

    async def test_get_job_success(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test getting a scheduled job successfully."""
        job = Scheduler(
            name="test_job",
            job_type="test",
            schedule="0 0 * * *",
            status="active",
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)

        response = await async_client.get(
            f"/management/scheduler/{job.id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(job.id)
        assert data["name"] == "test_job"

    async def test_get_job_not_found(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting non-existent job."""
        fake_id = uuid4()
        response = await async_client.get(
            f"/management/scheduler/{fake_id}",
            headers=auth_headers,
        )

        assert response.status_code == 404

    async def test_get_job_invalid_id(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting job with invalid ID format."""
        response = await async_client.get(
            "/management/scheduler/invalid-id",
            headers=auth_headers,
        )

        assert response.status_code == 422


@pytest.mark.asyncio
class TestCreateScheduledJob:
    """Test POST /management/scheduler/ endpoint."""

    async def test_create_job_success(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
        mock_scheduler,
    ):
        """Test creating a scheduled job successfully."""
        payload = {
            "name": "new_backup_job",
            "jobType": "backup",
            "schedule": "0 3 * * *",
            "description": "Daily backup at 3 AM",
        }

        response = await async_client.post(
            "/management/scheduler/",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == 200 or response.status_code == 201
        data = response.json()
        assert data["name"] == "new_backup_job"

    async def test_create_job_missing_fields(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test creating job with missing required fields."""
        payload = {
            "name": "incomplete_job",
        }

        response = await async_client.post(
            "/management/scheduler/",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == 422

    async def test_create_job_invalid_schedule(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test creating job with invalid cron schedule."""
        payload = {
            "name": "invalid_schedule_job",
            "jobType": "backup",
            "schedule": "invalid cron",
        }

        response = await async_client.post(
            "/management/scheduler/",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == 422 or response.status_code == 400


@pytest.mark.asyncio
class TestUpdateScheduledJob:
    """Test PUT /management/scheduler/{job_id} endpoint."""

    async def test_update_job_success(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
        mock_scheduler,
    ):
        """Test updating a scheduled job successfully."""
        job = Scheduler(
            name="update_test",
            job_type="backup",
            schedule="0 0 * * *",
            status="active",
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)

        payload = {
            "schedule": "0 4 * * *",
            "description": "Updated backup time",
        }

        response = await async_client.put(
            f"/management/scheduler/{job.id}",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(job.id)

    async def test_update_job_not_found(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test updating non-existent job."""
        fake_id = uuid4()
        payload = {"schedule": "0 5 * * *"}

        response = await async_client.put(
            f"/management/scheduler/{fake_id}",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == 404


@pytest.mark.asyncio
class TestDeleteScheduledJob:
    """Test DELETE /management/scheduler/{job_id} endpoint."""

    async def test_delete_job_success(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
        mock_scheduler,
    ):
        """Test deleting a scheduled job successfully."""
        job = Scheduler(
            name="delete_test",
            job_type="backup",
            schedule="0 0 * * *",
            status="active",
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)

        response = await async_client.delete(
            f"/management/scheduler/{job.id}",
            headers=auth_headers,
        )

        assert response.status_code in [200, 204]

    async def test_delete_job_not_found(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test deleting non-existent job."""
        fake_id = uuid4()
        response = await async_client.delete(
            f"/management/scheduler/{fake_id}",
            headers=auth_headers,
        )

        assert response.status_code == 404


@pytest.mark.asyncio
class TestPauseScheduledJob:
    """Test POST /management/scheduler/{job_id}/pause endpoint."""

    async def test_pause_job_success(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
        mock_scheduler,
    ):
        """Test pausing a scheduled job successfully."""
        job = Scheduler(
            name="pause_test",
            job_type="backup",
            schedule="0 0 * * *",
            status="active",
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)

        response = await async_client.post(
            f"/management/scheduler/{job.id}/pause",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "paused"

    async def test_pause_job_already_paused(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test pausing already paused job."""
        job = Scheduler(
            name="already_paused",
            job_type="backup",
            schedule="0 0 * * *",
            status="paused",
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)

        response = await async_client.post(
            f"/management/scheduler/{job.id}/pause",
            headers=auth_headers,
        )

        assert response.status_code in [200, 400]


@pytest.mark.asyncio
class TestResumeScheduledJob:
    """Test POST /management/scheduler/{job_id}/resume endpoint."""

    async def test_resume_job_success(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
        mock_scheduler,
    ):
        """Test resuming a paused job successfully."""
        job = Scheduler(
            name="resume_test",
            job_type="backup",
            schedule="0 0 * * *",
            status="paused",
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)

        response = await async_client.post(
            f"/management/scheduler/{job.id}/resume",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "active"

    async def test_resume_job_already_active(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test resuming already active job."""
        job = Scheduler(
            name="already_active",
            job_type="backup",
            schedule="0 0 * * *",
            status="active",
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)

        response = await async_client.post(
            f"/management/scheduler/{job.id}/resume",
            headers=auth_headers,
        )

        assert response.status_code in [200, 400]


@pytest.mark.asyncio
class TestRunJobNow:
    """Test POST /management/scheduler/{job_id}/run endpoint."""

    async def test_run_job_now_success(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
        mock_scheduler,
    ):
        """Test running a job immediately."""
        job = Scheduler(
            name="run_now_test",
            job_type="backup",
            schedule="0 0 * * *",
            status="active",
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)

        response = await async_client.post(
            f"/management/scheduler/{job.id}/run",
            headers=auth_headers,
        )

        assert response.status_code in [200, 202]

    async def test_run_paused_job_now(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
        mock_scheduler,
    ):
        """Test running a paused job immediately."""
        job = Scheduler(
            name="paused_run_test",
            job_type="backup",
            schedule="0 0 * * *",
            status="paused",
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)

        response = await async_client.post(
            f"/management/scheduler/{job.id}/run",
            headers=auth_headers,
        )

        assert response.status_code in [200, 202, 400]


@pytest.mark.asyncio
class TestGetJobHistory:
    """Test GET /management/scheduler/{job_id}/history endpoint."""

    async def test_get_job_history(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test getting job execution history."""
        job = Scheduler(
            name="history_test",
            job_type="backup",
            schedule="0 0 * * *",
            status="active",
            last_run=datetime.now(timezone.utc),
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)

        response = await async_client.get(
            f"/management/scheduler/{job.id}/history",
            headers=auth_headers,
        )

        assert response.status_code == 200

    async def test_get_job_history_with_limit(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test getting job history with limit."""
        job = Scheduler(
            name="history_limit_test",
            job_type="backup",
            schedule="0 0 * * *",
            status="active",
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)

        response = await async_client.get(
            f"/management/scheduler/{job.id}/history?limit=10",
            headers=auth_headers,
        )

        assert response.status_code == 200


@pytest.mark.asyncio
class TestGetSchedulerStats:
    """Test GET /management/scheduler/stats endpoint."""

    async def test_get_stats_success(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
        mock_scheduler,
    ):
        """Test getting scheduler statistics."""
        response = await async_client.get(
            "/management/scheduler/stats",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "total" in data or "totalJobs" in data


@pytest.mark.asyncio
class TestGetNextRuns:
    """Test GET /management/scheduler/next-runs endpoint."""

    async def test_get_next_runs(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
        mock_scheduler,
    ):
        """Test getting upcoming job executions."""
        response = await async_client.get(
            "/management/scheduler/next-runs",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list) or "jobs" in data

    async def test_get_next_runs_with_limit(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
        mock_scheduler,
    ):
        """Test getting next runs with limit."""
        response = await async_client.get(
            "/management/scheduler/next-runs?limit=5",
            headers=auth_headers,
        )

        assert response.status_code == 200
