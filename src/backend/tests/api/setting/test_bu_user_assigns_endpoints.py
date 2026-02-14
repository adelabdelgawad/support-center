"""Tests for business unit user assigns endpoints."""

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import BusinessUnit, BusinessUnitUserAssign, User


class TestBUUserAssignsEndpoints:
    """Test suite for /api/setting/business-unit-user-assigns/ endpoints."""

    @pytest.mark.asyncio
    async def test_get_bu_user_assigns_empty_db(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/business-unit-user-assigns/ with empty database."""
        response = await client.get("/api/setting/business-unit-user-assigns/")
        assert response.status_code == 200

        data = response.json()
        assert "businessUnitUserAssigns" in data
        assert "total" in data
        assert isinstance(data["businessUnitUserAssigns"], list)
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_get_bu_user_assigns_with_data(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/business-unit-user-assigns/ with existing assigns."""
        bu = BusinessUnit(name="IT Department", code="IT", is_active=True)
        user = User(
            username="testuser",
            email="testuser@example.com",
            first_name="Test",
            last_name="User",
            hashed_password="hashedpassword",
            is_active=True,
        )
        db_session.add_all([bu, user])
        await db_session.commit()
        await db_session.refresh(bu)
        await db_session.refresh(user)

        assign1 = BusinessUnitUserAssign(
            business_unit_id=bu.id,
            user_id=user.id,
            is_active=True,
        )
        assign2 = BusinessUnitUserAssign(
            business_unit_id=bu.id,
            user_id=user.id,
            is_active=False,
        )
        db_session.add_all([assign1, assign2])
        await db_session.commit()

        response = await client.get("/api/setting/business-unit-user-assigns/")
        assert response.status_code == 200

        data = response.json()
        assert len(data["businessUnitUserAssigns"]) == 2
        assert data["total"] == 2

        # Verify camelCase fields
        assert "isActive" in data["businessUnitUserAssigns"][0]
        assert "businessUnitId" in data["businessUnitUserAssigns"][0]
        assert "userId" in data["businessUnitUserAssigns"][0]

    @pytest.mark.asyncio
    async def test_get_bu_user_assigns_pagination(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/business-unit-user-assigns/ pagination."""
        bu = BusinessUnit(name="IT Department", code="IT", is_active=True)
        db_session.add(bu)
        await db_session.commit()
        await db_session.refresh(bu)

        for i in range(5):
            user = User(
                username=f"user{i}",
                email=f"user{i}@example.com",
                first_name="Test",
                last_name=f"User{i}",
                hashed_password="hashedpassword",
                is_active=True,
            )
            db_session.add(user)
            await db_session.commit()
            await db_session.refresh(user)

            assign = BusinessUnitUserAssign(
                business_unit_id=bu.id,
                user_id=user.id,
                is_active=True,
            )
            db_session.add(assign)
        await db_session.commit()

        response = await client.get("/api/setting/business-unit-user-assigns/?limit=2&skip=0")
        assert response.status_code == 200
        data = response.json()
        assert len(data["businessUnitUserAssigns"]) == 2
        assert data["total"] == 5

    @pytest.mark.asyncio
    async def test_get_bu_user_assigns_filter_by_status(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/business-unit-user-assigns/ with is_active filter."""
        bu = BusinessUnit(name="IT Department", code="IT", is_active=True)
        user = User(
            username="testuser",
            email="testuser@example.com",
            first_name="Test",
            last_name="User",
            hashed_password="hashedpassword",
            is_active=True,
        )
        db_session.add_all([bu, user])
        await db_session.commit()
        await db_session.refresh(bu)
        await db_session.refresh(user)

        assign1 = BusinessUnitUserAssign(business_unit_id=bu.id, user_id=user.id, is_active=True)
        assign2 = BusinessUnitUserAssign(business_unit_id=bu.id, user_id=user.id, is_active=False)
        db_session.add_all([assign1, assign2])
        await db_session.commit()

        response = await client.get("/api/setting/business-unit-user-assigns/?is_active=true")
        assert response.status_code == 200
        data = response.json()
        assert len(data["businessUnitUserAssigns"]) == 1
        assert data["businessUnitUserAssigns"][0]["isActive"] is True

    @pytest.mark.asyncio
    async def test_get_bu_user_assigns_filter_by_business_unit(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/business-unit-user-assigns/ with business_unit_id filter."""
        bu1 = BusinessUnit(name="IT Department", code="IT", is_active=True)
        bu2 = BusinessUnit(name="HR Department", code="HR", is_active=True)
        user = User(
            username="testuser",
            email="testuser@example.com",
            first_name="Test",
            last_name="User",
            hashed_password="hashedpassword",
            is_active=True,
        )
        db_session.add_all([bu1, bu2, user])
        await db_session.commit()
        await db_session.refresh(bu1)
        await db_session.refresh(bu2)
        await db_session.refresh(user)

        assign1 = BusinessUnitUserAssign(business_unit_id=bu1.id, user_id=user.id, is_active=True)
        assign2 = BusinessUnitUserAssign(business_unit_id=bu2.id, user_id=user.id, is_active=True)
        db_session.add_all([assign1, assign2])
        await db_session.commit()

        response = await client.get(f"/api/setting/business-unit-user-assigns/?business_unit_id={bu1.id}")
        assert response.status_code == 200
        data = response.json()
        assert len(data["businessUnitUserAssigns"]) == 1
        assert data["businessUnitUserAssigns"][0]["businessUnitId"] == bu1.id

    @pytest.mark.asyncio
    async def test_get_bu_user_assign_by_id(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/business-unit-user-assigns/{assign_id}."""
        bu = BusinessUnit(name="IT Department", code="IT", is_active=True)
        user = User(
            username="testuser",
            email="testuser@example.com",
            first_name="Test",
            last_name="User",
            hashed_password="hashedpassword",
            is_active=True,
        )
        db_session.add_all([bu, user])
        await db_session.commit()
        await db_session.refresh(bu)
        await db_session.refresh(user)

        assign = BusinessUnitUserAssign(business_unit_id=bu.id, user_id=user.id, is_active=True)
        db_session.add(assign)
        await db_session.commit()
        await db_session.refresh(assign)

        response = await client.get(f"/api/setting/business-unit-user-assigns/{assign.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["id"] == assign.id
        assert data["businessUnitId"] == bu.id
        assert data["userId"] == str(user.id)

    @pytest.mark.asyncio
    async def test_get_bu_user_assign_by_id_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/business-unit-user-assigns/{assign_id} with non-existent ID."""
        response = await client.get("/api/setting/business-unit-user-assigns/99999")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_create_bu_user_assign(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test POST /api/setting/business-unit-user-assigns/."""
        bu = BusinessUnit(name="IT Department", code="IT", is_active=True)
        user = User(
            username="testuser",
            email="testuser@example.com",
            first_name="Test",
            last_name="User",
            hashed_password="hashedpassword",
            is_active=True,
        )
        db_session.add_all([bu, user])
        await db_session.commit()
        await db_session.refresh(bu)
        await db_session.refresh(user)

        assign_data = {
            "businessUnitId": bu.id,
            "userId": str(user.id),
            "isActive": True,
        }

        response = await client.post("/api/setting/business-unit-user-assigns/", json=assign_data)
        assert response.status_code == 200

        data = response.json()
        assert data["businessUnitId"] == bu.id
        assert data["userId"] == str(user.id)
        assert data["isActive"] is True
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_bu_user_assign_validation_error(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/business-unit-user-assigns/ with invalid data."""
        assign_data = {"businessUnitId": 1}

        response = await client.post("/api/setting/business-unit-user-assigns/", json=assign_data)
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_update_bu_user_assign(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test PUT /api/setting/business-unit-user-assigns/{assign_id}."""
        bu = BusinessUnit(name="IT Department", code="IT", is_active=True)
        user = User(
            username="testuser",
            email="testuser@example.com",
            first_name="Test",
            last_name="User",
            hashed_password="hashedpassword",
            is_active=True,
        )
        db_session.add_all([bu, user])
        await db_session.commit()
        await db_session.refresh(bu)
        await db_session.refresh(user)

        assign = BusinessUnitUserAssign(business_unit_id=bu.id, user_id=user.id, is_active=True)
        db_session.add(assign)
        await db_session.commit()
        await db_session.refresh(assign)

        update_data = {"isActive": False}

        response = await client.put(
            f"/api/setting/business-unit-user-assigns/{assign.id}", json=update_data
        )
        assert response.status_code == 200

        data = response.json()
        assert data["isActive"] is False

    @pytest.mark.asyncio
    async def test_update_bu_user_assign_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test PUT /api/setting/business-unit-user-assigns/{assign_id} with non-existent ID."""
        update_data = {"isActive": False}

        response = await client.put("/api/setting/business-unit-user-assigns/99999", json=update_data)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_bu_user_assign(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test DELETE /api/setting/business-unit-user-assigns/{assign_id}."""
        bu = BusinessUnit(name="IT Department", code="IT", is_active=True)
        user = User(
            username="testuser",
            email="testuser@example.com",
            first_name="Test",
            last_name="User",
            hashed_password="hashedpassword",
            is_active=True,
        )
        db_session.add_all([bu, user])
        await db_session.commit()
        await db_session.refresh(bu)
        await db_session.refresh(user)

        assign = BusinessUnitUserAssign(business_unit_id=bu.id, user_id=user.id, is_active=True)
        db_session.add(assign)
        await db_session.commit()
        await db_session.refresh(assign)

        response = await client.delete(f"/api/setting/business-unit-user-assigns/{assign.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["message"] == "Business unit user assign deleted successfully"

    @pytest.mark.asyncio
    async def test_delete_bu_user_assign_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test DELETE /api/setting/business-unit-user-assigns/{assign_id} with non-existent ID."""
        response = await client.delete("/api/setting/business-unit-user-assigns/99999")
        assert response.status_code == 404
