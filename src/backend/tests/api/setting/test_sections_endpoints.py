"""Tests for sections endpoints."""

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import Section, User


class TestSectionsEndpoints:
    """Test suite for /api/setting/sections/ endpoints."""

    @pytest.mark.asyncio
    async def test_get_sections_empty_db(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/sections/ with empty database."""
        response = await client.get("/api/setting/sections/")
        assert response.status_code == 200

        data = response.json()
        assert "sections" in data
        assert "total" in data
        assert isinstance(data["sections"], list)
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_get_sections_with_data(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/sections/ with existing sections."""
        s1 = Section(name="Hardware", is_active=True)
        s2 = Section(name="Software", is_active=False)
        db_session.add_all([s1, s2])
        await db_session.commit()

        response = await client.get("/api/setting/sections/")
        assert response.status_code == 200

        data = response.json()
        assert len(data["sections"]) == 2
        assert data["total"] == 2

        # Verify camelCase fields
        assert "isActive" in data["sections"][0]

    @pytest.mark.asyncio
    async def test_get_sections_pagination(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/sections/ pagination."""
        for i in range(5):
            s = Section(name=f"Section {i}", is_active=True)
            db_session.add(s)
        await db_session.commit()

        response = await client.get("/api/setting/sections/?limit=2&skip=0")
        assert response.status_code == 200
        data = response.json()
        assert len(data["sections"]) == 2
        assert data["total"] == 5

    @pytest.mark.asyncio
    async def test_get_sections_filter_by_status(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/sections/ with is_active filter."""
        s1 = Section(name="Active Section", is_active=True)
        s2 = Section(name="Inactive Section", is_active=False)
        db_session.add_all([s1, s2])
        await db_session.commit()

        response = await client.get("/api/setting/sections/?is_active=true")
        assert response.status_code == 200
        data = response.json()
        assert len(data["sections"]) == 1
        assert data["sections"][0]["isActive"] is True

    @pytest.mark.asyncio
    async def test_get_sections_search(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/sections/ with search."""
        s1 = Section(name="Hardware Support", is_active=True)
        s2 = Section(name="Software Support", is_active=True)
        db_session.add_all([s1, s2])
        await db_session.commit()

        response = await client.get("/api/setting/sections/?search=hardware")
        assert response.status_code == 200
        data = response.json()
        assert len(data["sections"]) == 1
        assert "hardware" in data["sections"][0]["name"].lower()

    @pytest.mark.asyncio
    async def test_get_section_by_id(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/sections/{section_id}."""
        s = Section(name="Test Section", is_active=True, description="Test desc")
        db_session.add(s)
        await db_session.commit()
        await db_session.refresh(s)

        response = await client.get(f"/api/setting/sections/{s.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["id"] == s.id
        assert data["name"] == "Test Section"
        assert data["description"] == "Test desc"

    @pytest.mark.asyncio
    async def test_get_section_by_id_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/sections/{section_id} with non-existent ID."""
        response = await client.get("/api/setting/sections/99999")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_create_section(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/sections/."""
        section_data = {
            "name": "New Section",
            "description": "Test description",
            "isActive": True,
        }

        response = await client.post("/api/setting/sections/", json=section_data)
        assert response.status_code == 200

        data = response.json()
        assert data["name"] == "New Section"
        assert data["description"] == "Test description"
        assert data["isActive"] is True
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_section_validation_error(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/sections/ with invalid data."""
        section_data = {"description": "Missing name"}

        response = await client.post("/api/setting/sections/", json=section_data)
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_update_section(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test PUT /api/setting/sections/{section_id}."""
        s = Section(name="Old Name", is_active=True)
        db_session.add(s)
        await db_session.commit()
        await db_session.refresh(s)

        update_data = {"name": "Updated Name", "isActive": False}

        response = await client.put(f"/api/setting/sections/{s.id}", json=update_data)
        assert response.status_code == 200

        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["isActive"] is False

    @pytest.mark.asyncio
    async def test_update_section_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test PUT /api/setting/sections/{section_id} with non-existent ID."""
        update_data = {"name": "Updated"}

        response = await client.put("/api/setting/sections/99999", json=update_data)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_section(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test DELETE /api/setting/sections/{section_id}."""
        s = Section(name="To Delete", is_active=True)
        db_session.add(s)
        await db_session.commit()
        await db_session.refresh(s)

        response = await client.delete(f"/api/setting/sections/{s.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["message"] == "Section deleted successfully"

    @pytest.mark.asyncio
    async def test_delete_section_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test DELETE /api/setting/sections/{section_id} with non-existent ID."""
        response = await client.delete("/api/setting/sections/99999")
        assert response.status_code == 404
