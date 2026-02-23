"""Tests for SLA configs endpoints."""

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import Priority, RequestType, SLAConfig, User


class TestSLAConfigsEndpoints:
    """Test suite for /api/setting/sla-configs/ endpoints."""

    @pytest.mark.asyncio
    async def test_get_sla_configs_empty_db(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/sla-configs/ with empty database."""
        response = await client.get("/backend/sla-configs/")
        assert response.status_code == 200

        data = response.json()
        assert "slaConfigs" in data
        assert "total" in data
        assert isinstance(data["slaConfigs"], list)
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_get_sla_configs_with_data(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/sla-configs/ with existing SLA configs."""
        priority = Priority(name="High", level=1, is_active=True)
        req_type = RequestType(name="Incident", is_active=True)
        db_session.add_all([priority, req_type])
        await db_session.commit()
        await db_session.refresh(priority)
        await db_session.refresh(req_type)

        sla1 = SLAConfig(
            priority_id=priority.id,
            request_type_id=req_type.id,
            response_time_minutes=60,
            resolution_time_minutes=240,
            is_active=True,
        )
        sla2 = SLAConfig(
            priority_id=priority.id,
            request_type_id=req_type.id,
            response_time_minutes=120,
            resolution_time_minutes=480,
            is_active=False,
        )
        db_session.add_all([sla1, sla2])
        await db_session.commit()

        response = await client.get("/backend/sla-configs/")
        assert response.status_code == 200

        data = response.json()
        assert len(data["slaConfigs"]) == 2
        assert data["total"] == 2

        # Verify camelCase fields
        assert "isActive" in data["slaConfigs"][0]
        assert "priorityId" in data["slaConfigs"][0]
        assert "requestTypeId" in data["slaConfigs"][0]
        assert "responseTimeMinutes" in data["slaConfigs"][0]
        assert "resolutionTimeMinutes" in data["slaConfigs"][0]

    @pytest.mark.asyncio
    async def test_get_sla_configs_pagination(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/sla-configs/ pagination."""
        priority = Priority(name="High", level=1, is_active=True)
        req_type = RequestType(name="Incident", is_active=True)
        db_session.add_all([priority, req_type])
        await db_session.commit()
        await db_session.refresh(priority)
        await db_session.refresh(req_type)

        for i in range(5):
            sla = SLAConfig(
                priority_id=priority.id,
                request_type_id=req_type.id,
                response_time_minutes=60 * i,
                resolution_time_minutes=240 * i,
                is_active=True,
            )
            db_session.add(sla)
        await db_session.commit()

        response = await client.get("/backend/sla-configs/?limit=2&skip=0")
        assert response.status_code == 200
        data = response.json()
        assert len(data["slaConfigs"]) == 2
        assert data["total"] == 5

    @pytest.mark.asyncio
    async def test_get_sla_configs_filter_by_status(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/sla-configs/ with is_active filter."""
        priority = Priority(name="High", level=1, is_active=True)
        req_type = RequestType(name="Incident", is_active=True)
        db_session.add_all([priority, req_type])
        await db_session.commit()
        await db_session.refresh(priority)
        await db_session.refresh(req_type)

        sla1 = SLAConfig(
            priority_id=priority.id,
            request_type_id=req_type.id,
            response_time_minutes=60,
            resolution_time_minutes=240,
            is_active=True,
        )
        sla2 = SLAConfig(
            priority_id=priority.id,
            request_type_id=req_type.id,
            response_time_minutes=120,
            resolution_time_minutes=480,
            is_active=False,
        )
        db_session.add_all([sla1, sla2])
        await db_session.commit()

        response = await client.get("/backend/sla-configs/?is_active=true")
        assert response.status_code == 200
        data = response.json()
        assert len(data["slaConfigs"]) == 1
        assert data["slaConfigs"][0]["isActive"] is True

    @pytest.mark.asyncio
    async def test_get_sla_config_by_id(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/sla-configs/{sla_id}."""
        priority = Priority(name="High", level=1, is_active=True)
        req_type = RequestType(name="Incident", is_active=True)
        db_session.add_all([priority, req_type])
        await db_session.commit()
        await db_session.refresh(priority)
        await db_session.refresh(req_type)

        sla = SLAConfig(
            priority_id=priority.id,
            request_type_id=req_type.id,
            response_time_minutes=60,
            resolution_time_minutes=240,
            is_active=True,
        )
        db_session.add(sla)
        await db_session.commit()
        await db_session.refresh(sla)

        response = await client.get(f"/backend/sla-configs/{sla.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["id"] == sla.id
        assert data["responseTimeMinutes"] == 60
        assert data["resolutionTimeMinutes"] == 240

    @pytest.mark.asyncio
    async def test_get_sla_config_by_id_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/sla-configs/{sla_id} with non-existent ID."""
        response = await client.get("/backend/sla-configs/99999")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_create_sla_config(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test POST /api/setting/sla-configs/."""
        priority = Priority(name="High", level=1, is_active=True)
        req_type = RequestType(name="Incident", is_active=True)
        db_session.add_all([priority, req_type])
        await db_session.commit()
        await db_session.refresh(priority)
        await db_session.refresh(req_type)

        sla_data = {
            "priorityId": priority.id,
            "requestTypeId": req_type.id,
            "responseTimeMinutes": 60,
            "resolutionTimeMinutes": 240,
            "isActive": True,
        }

        response = await client.post("/backend/sla-configs/", json=sla_data)
        assert response.status_code == 200

        data = response.json()
        assert data["priorityId"] == priority.id
        assert data["requestTypeId"] == req_type.id
        assert data["responseTimeMinutes"] == 60
        assert data["resolutionTimeMinutes"] == 240
        assert data["isActive"] is True
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_sla_config_validation_error(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/sla-configs/ with invalid data."""
        sla_data = {"responseTimeMinutes": 60}

        response = await client.post("/backend/sla-configs/", json=sla_data)
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_update_sla_config(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test PUT /api/setting/sla-configs/{sla_id}."""
        priority = Priority(name="High", level=1, is_active=True)
        req_type = RequestType(name="Incident", is_active=True)
        db_session.add_all([priority, req_type])
        await db_session.commit()
        await db_session.refresh(priority)
        await db_session.refresh(req_type)

        sla = SLAConfig(
            priority_id=priority.id,
            request_type_id=req_type.id,
            response_time_minutes=60,
            resolution_time_minutes=240,
            is_active=True,
        )
        db_session.add(sla)
        await db_session.commit()
        await db_session.refresh(sla)

        update_data = {
            "responseTimeMinutes": 120,
            "resolutionTimeMinutes": 480,
            "isActive": False,
        }

        response = await client.put(f"/backend/sla-configs/{sla.id}", json=update_data)
        assert response.status_code == 200

        data = response.json()
        assert data["responseTimeMinutes"] == 120
        assert data["resolutionTimeMinutes"] == 480
        assert data["isActive"] is False

    @pytest.mark.asyncio
    async def test_update_sla_config_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test PUT /api/setting/sla-configs/{sla_id} with non-existent ID."""
        update_data = {"responseTimeMinutes": 120}

        response = await client.put("/backend/sla-configs/99999", json=update_data)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_sla_config(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test DELETE /api/setting/sla-configs/{sla_id}."""
        priority = Priority(name="High", level=1, is_active=True)
        req_type = RequestType(name="Incident", is_active=True)
        db_session.add_all([priority, req_type])
        await db_session.commit()
        await db_session.refresh(priority)
        await db_session.refresh(req_type)

        sla = SLAConfig(
            priority_id=priority.id,
            request_type_id=req_type.id,
            response_time_minutes=60,
            resolution_time_minutes=240,
            is_active=True,
        )
        db_session.add(sla)
        await db_session.commit()
        await db_session.refresh(sla)

        response = await client.delete(f"/backend/sla-configs/{sla.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["message"] == "SLA config deleted successfully"

    @pytest.mark.asyncio
    async def test_delete_sla_config_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test DELETE /api/setting/sla-configs/{sla_id} with non-existent ID."""
        response = await client.delete("/backend/sla-configs/99999")
        assert response.status_code == 404
