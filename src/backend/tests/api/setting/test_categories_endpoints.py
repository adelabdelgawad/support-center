"""Tests for categories endpoints."""

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import Category, Section, User


class TestCategoriesEndpoints:
    """Test suite for /api/setting/categories/ endpoints."""

    @pytest.mark.asyncio
    async def test_get_categories_empty_db(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/categories/ with empty database."""
        response = await client.get("/api/setting/categories/")
        assert response.status_code == 200

        data = response.json()
        assert "categories" in data
        assert "total" in data
        assert isinstance(data["categories"], list)
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_get_categories_with_data(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/categories/ with existing categories."""
        section = Section(name="Test Section", is_active=True)
        db_session.add(section)
        await db_session.commit()
        await db_session.refresh(section)

        cat1 = Category(name="Hardware", section_id=section.id, is_active=True)
        cat2 = Category(name="Software", section_id=section.id, is_active=False)
        db_session.add_all([cat1, cat2])
        await db_session.commit()

        response = await client.get("/api/setting/categories/")
        assert response.status_code == 200

        data = response.json()
        assert len(data["categories"]) == 2
        assert data["total"] == 2

        # Verify camelCase fields
        assert "isActive" in data["categories"][0]
        assert "sectionId" in data["categories"][0]

    @pytest.mark.asyncio
    async def test_get_categories_pagination(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/categories/ pagination."""
        section = Section(name="Test Section", is_active=True)
        db_session.add(section)
        await db_session.commit()
        await db_session.refresh(section)

        for i in range(5):
            cat = Category(name=f"Category {i}", section_id=section.id, is_active=True)
            db_session.add(cat)
        await db_session.commit()

        response = await client.get("/api/setting/categories/?limit=2&skip=0")
        assert response.status_code == 200
        data = response.json()
        assert len(data["categories"]) == 2
        assert data["total"] == 5

    @pytest.mark.asyncio
    async def test_get_categories_filter_by_status(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/categories/ with is_active filter."""
        section = Section(name="Test Section", is_active=True)
        db_session.add(section)
        await db_session.commit()
        await db_session.refresh(section)

        cat1 = Category(name="Active Cat", section_id=section.id, is_active=True)
        cat2 = Category(name="Inactive Cat", section_id=section.id, is_active=False)
        db_session.add_all([cat1, cat2])
        await db_session.commit()

        response = await client.get("/api/setting/categories/?is_active=true")
        assert response.status_code == 200
        data = response.json()
        assert len(data["categories"]) == 1
        assert data["categories"][0]["isActive"] is True

    @pytest.mark.asyncio
    async def test_get_categories_filter_by_section(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/categories/ with section_id filter."""
        section1 = Section(name="Section 1", is_active=True)
        section2 = Section(name="Section 2", is_active=True)
        db_session.add_all([section1, section2])
        await db_session.commit()
        await db_session.refresh(section1)
        await db_session.refresh(section2)

        cat1 = Category(name="Cat 1", section_id=section1.id, is_active=True)
        cat2 = Category(name="Cat 2", section_id=section2.id, is_active=True)
        db_session.add_all([cat1, cat2])
        await db_session.commit()

        response = await client.get(f"/api/setting/categories/?section_id={section1.id}")
        assert response.status_code == 200
        data = response.json()
        assert len(data["categories"]) == 1
        assert data["categories"][0]["sectionId"] == section1.id

    @pytest.mark.asyncio
    async def test_get_categories_search(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/categories/ with search."""
        section = Section(name="Test Section", is_active=True)
        db_session.add(section)
        await db_session.commit()
        await db_session.refresh(section)

        cat1 = Category(name="Hardware Issues", section_id=section.id, is_active=True)
        cat2 = Category(name="Software Issues", section_id=section.id, is_active=True)
        db_session.add_all([cat1, cat2])
        await db_session.commit()

        response = await client.get("/api/setting/categories/?search=hardware")
        assert response.status_code == 200
        data = response.json()
        assert len(data["categories"]) == 1
        assert "hardware" in data["categories"][0]["name"].lower()

    @pytest.mark.asyncio
    async def test_get_category_by_id(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/categories/{category_id}."""
        section = Section(name="Test Section", is_active=True)
        db_session.add(section)
        await db_session.commit()
        await db_session.refresh(section)

        cat = Category(name="Test Category", section_id=section.id, is_active=True)
        db_session.add(cat)
        await db_session.commit()
        await db_session.refresh(cat)

        response = await client.get(f"/api/setting/categories/{cat.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["id"] == cat.id
        assert data["name"] == "Test Category"
        assert data["sectionId"] == section.id

    @pytest.mark.asyncio
    async def test_get_category_by_id_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/categories/{category_id} with non-existent ID."""
        response = await client.get("/api/setting/categories/99999")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_create_category(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test POST /api/setting/categories/."""
        section = Section(name="Test Section", is_active=True)
        db_session.add(section)
        await db_session.commit()
        await db_session.refresh(section)

        cat_data = {
            "name": "New Category",
            "sectionId": section.id,
            "description": "Test description",
            "isActive": True,
        }

        response = await client.post("/api/setting/categories/", json=cat_data)
        assert response.status_code == 200

        data = response.json()
        assert data["name"] == "New Category"
        assert data["sectionId"] == section.id
        assert data["isActive"] is True
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_category_validation_error(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/categories/ with invalid data."""
        cat_data = {"name": "Missing section_id"}

        response = await client.post("/api/setting/categories/", json=cat_data)
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_update_category(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test PUT /api/setting/categories/{category_id}."""
        section = Section(name="Test Section", is_active=True)
        db_session.add(section)
        await db_session.commit()
        await db_session.refresh(section)

        cat = Category(name="Old Name", section_id=section.id, is_active=True)
        db_session.add(cat)
        await db_session.commit()
        await db_session.refresh(cat)

        update_data = {"name": "Updated Name", "isActive": False}

        response = await client.put(f"/api/setting/categories/{cat.id}", json=update_data)
        assert response.status_code == 200

        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["isActive"] is False

    @pytest.mark.asyncio
    async def test_update_category_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test PUT /api/setting/categories/{category_id} with non-existent ID."""
        update_data = {"name": "Updated"}

        response = await client.put("/api/setting/categories/99999", json=update_data)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_category(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test DELETE /api/setting/categories/{category_id}."""
        section = Section(name="Test Section", is_active=True)
        db_session.add(section)
        await db_session.commit()
        await db_session.refresh(section)

        cat = Category(name="To Delete", section_id=section.id, is_active=True)
        db_session.add(cat)
        await db_session.commit()
        await db_session.refresh(cat)

        response = await client.delete(f"/api/setting/categories/{cat.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["message"] == "Category deleted successfully"

    @pytest.mark.asyncio
    async def test_delete_category_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test DELETE /api/setting/categories/{category_id} with non-existent ID."""
        response = await client.delete("/api/setting/categories/99999")
        assert response.status_code == 404
