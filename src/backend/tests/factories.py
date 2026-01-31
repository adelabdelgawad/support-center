"""
Test data factories for generating realistic test data.

Usage:
    user = UserFactory.create()
    request = ServiceRequestFactory.create(requester=user)
"""

import secrets
import uuid
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID, uuid4

from db.models import (
    User, Role, Page, UserRole, ServiceRequest,
    RequestStatus, Priority, Category, BusinessUnit, BusinessUnitRegion,
    ChatMessage, RequestNote, DesktopSession, WebSession
)


def _unique_suffix() -> str:
    """Generate a unique suffix for test data."""
    return uuid.uuid4().hex[:8]


class UserFactory:
    """Factory for creating User instances."""

    @classmethod
    def create(
        cls,
        username: Optional[str] = None,
        email: Optional[str] = None,
        full_name: Optional[str] = None,
        is_active: bool = True,
        is_technician: bool = False,
        is_domain: bool = False,
        is_super_admin: bool = False,
        is_blocked: bool = False,
        phone_number: Optional[str] = None,
        manager_id: Optional[UUID] = None,
        title: Optional[str] = None,
        department: Optional[str] = None,
    ) -> User:
        """Create a User instance with realistic defaults."""
        suffix = _unique_suffix()

        first_names = ["Ahmed", "Mohamed", "Fatma", "Sara", "Omar", "Layla", "Youssef", "Nour"]
        last_names = ["Hassan", "Ali", "Ibrahim", "Mahmoud", "Khalil", "Mostafa", "Salem", "Farouk"]

        # Use hash of suffix to pick names deterministically but uniquely
        idx = hash(suffix) % len(first_names)
        first_name = first_names[idx]
        last_name = last_names[idx]

        if username is None:
            username = f"{first_name.lower()}.{last_name.lower()}_{suffix}"
        if email is None:
            email = f"{username}@company.com"
        if full_name is None:
            full_name = f"{first_name} {last_name}"
        if phone_number is None:
            phone_number = f"01{suffix}"
        if title is None:
            title = "Software Engineer"
        if department is None:
            department = "IT Department"

        return User(
            id=uuid4(),
            username=username,
            email=email,
            full_name=full_name,
            phone_number=phone_number,
            is_active=is_active,
            is_technician=is_technician,
            is_domain=is_domain,
            is_super_admin=is_super_admin,
            is_blocked=is_blocked,
            manager_id=manager_id,
            title=title,
            department=department,
            password_hash=None,  # Passwordless auth
        )

    @classmethod
    def create_technician(cls, **kwargs) -> User:
        """Create a technician user."""
        kwargs.setdefault("is_technician", True)
        return cls.create(**kwargs)

    @classmethod
    def create_admin(cls, **kwargs) -> User:
        """Create an admin user."""
        kwargs.setdefault("is_super_admin", True)
        kwargs.setdefault("is_technician", True)
        return cls.create(**kwargs)

    @classmethod
    def create_domain_user(cls, **kwargs) -> User:
        """Create an Active Directory domain user."""
        kwargs.setdefault("is_domain", True)
        return cls.create(**kwargs)


class RoleFactory:
    """Factory for creating Role instances."""

    _counter = 0

    PREDEFINED_ROLES = [
        {"name": "Admin", "ar_name": "مدير", "description": "Full system access"},
        {"name": "Supervisor", "ar_name": "مشرف", "description": "Supervisory access"},
        {"name": "Technician", "ar_name": "فني", "description": "Technical support access"},
        {"name": "Auditor", "ar_name": "مدقق", "description": "Audit and reporting access"},
        {"name": "Manager", "ar_name": "مدير قسم", "description": "Department management"},
        {"name": "Senior", "ar_name": "كبير", "description": "Senior staff access"},
    ]

    @classmethod
    def create(
        cls,
        name: Optional[str] = None,
        ar_name: Optional[str] = None,
        description: Optional[str] = None,
        is_active: bool = True,
        is_deleted: bool = False,
    ) -> Role:
        """Create a Role instance."""
        cls._counter += 1

        if name is None:
            predefined = cls.PREDEFINED_ROLES[cls._counter % len(cls.PREDEFINED_ROLES)]
            name = f"{predefined['name']}_{cls._counter}"
            ar_name = ar_name or predefined['ar_name']
            description = description or predefined['description']

        return Role(
            name=name,
            ar_name=ar_name or f"دور {cls._counter}",
            description=description or f"Role description {cls._counter}",
            is_active=is_active,
            is_deleted=is_deleted,
        )

    @classmethod
    def create_admin_role(cls) -> Role:
        """Create the Admin role."""
        return cls.create(
            name="Admin",
            ar_name="مدير",
            description="Full system access"
        )

    @classmethod
    def create_technician_role(cls) -> Role:
        """Create the Technician role."""
        return cls.create(
            name="Technician",
            ar_name="فني",
            description="Technical support access"
        )


class RequestStatusFactory:
    """Factory for creating RequestStatus instances."""

    STATUSES = [
        {"name": "New", "name_en": "New", "name_ar": "جديد", "color": "#3B82F6", "order": 1},
        {"name": "Open", "name_en": "Open", "name_ar": "مفتوح", "color": "#10B981", "order": 2},
        {"name": "In Progress", "name_en": "In Progress", "name_ar": "قيد التنفيذ", "color": "#F59E0B", "order": 3},
        {"name": "On Hold", "name_en": "On Hold", "name_ar": "معلق", "color": "#6B7280", "order": 4},
        {"name": "Pending", "name_en": "Pending", "name_ar": "معلق", "color": "#8B5CF6", "order": 5},
        {"name": "Resolved", "name_en": "Resolved", "name_ar": "تم الحل", "color": "#22C55E", "order": 6, "count_as_solved": True},
        {"name": "Closed", "name_en": "Closed", "name_ar": "مغلق", "color": "#EF4444", "order": 7, "count_as_solved": True},
        {"name": "Cancelled", "name_en": "Cancelled", "name_ar": "ملغي", "color": "#DC2626", "order": 8},
    ]

    @classmethod
    def create(
        cls,
        name: Optional[str] = None,
        name_en: Optional[str] = None,
        name_ar: Optional[str] = None,
        color: str = "#3B82F6",
        order: int = 1,
        is_active: bool = True,
        count_as_solved: bool = False,
        show_to_requester: bool = True,
    ) -> RequestStatus:
        """Create a RequestStatus instance."""
        if name is None:
            status_data = cls.STATUSES[order % len(cls.STATUSES)]
            name = status_data["name"]
            name_en = status_data["name_en"]
            name_ar = status_data["name_ar"]
            color = status_data["color"]
            count_as_solved = status_data.get("count_as_solved", False)

        return RequestStatus(
            name=name,
            name_en=name_en or name,
            name_ar=name_ar or name,
            color=color,
            order=order,
            is_active=is_active,
            count_as_solved=count_as_solved,
            show_to_requester=show_to_requester,
        )

    @classmethod
    def create_all_statuses(cls) -> list[RequestStatus]:
        """Create all predefined statuses."""
        return [
            cls.create(
                name=s["name"],
                name_en=s["name_en"],
                name_ar=s["name_ar"],
                color=s["color"],
                order=s["order"],
                count_as_solved=s.get("count_as_solved", False),
            )
            for s in cls.STATUSES
        ]


class PriorityFactory:
    """Factory for creating Priority instances."""

    PRIORITIES = [
        {"name": "Critical", "name_en": "Critical", "name_ar": "حرج", "response_time_minutes": 15, "resolution_time_hours": 4, "order": 1},
        {"name": "High", "name_en": "High", "name_ar": "مرتفع", "response_time_minutes": 60, "resolution_time_hours": 8, "order": 2},
        {"name": "Medium", "name_en": "Medium", "name_ar": "متوسط", "response_time_minutes": 240, "resolution_time_hours": 24, "order": 3},
        {"name": "Low", "name_en": "Low", "name_ar": "منخفض", "response_time_minutes": 480, "resolution_time_hours": 72, "order": 4},
    ]

    @classmethod
    def create(
        cls,
        name: Optional[str] = None,
        name_en: Optional[str] = None,
        name_ar: Optional[str] = None,
        response_time_minutes: int = 60,
        resolution_time_hours: int = 24,
        order: int = 3,
        is_active: bool = True,
    ) -> Priority:
        """Create a Priority instance."""
        if name is None:
            priority_data = cls.PRIORITIES[order - 1] if 1 <= order <= 4 else cls.PRIORITIES[2]
            name = priority_data["name"]
            name_en = priority_data["name_en"]
            name_ar = priority_data["name_ar"]
            response_time_minutes = priority_data["response_time_minutes"]
            resolution_time_hours = priority_data["resolution_time_hours"]

        return Priority(
            name=name,
            name_en=name_en or name,
            name_ar=name_ar or name,
            response_time_minutes=response_time_minutes,
            resolution_time_hours=resolution_time_hours,
            order=order,
            is_active=is_active,
        )

    @classmethod
    def create_all_priorities(cls) -> list[Priority]:
        """Create all predefined priorities."""
        return [
            cls.create(
                name=p["name"],
                name_en=p["name_en"],
                name_ar=p["name_ar"],
                response_time_minutes=p["response_time_minutes"],
                resolution_time_hours=p["resolution_time_hours"],
                order=p["order"],
            )
            for p in cls.PRIORITIES
        ]


class CategoryFactory:
    """Factory for creating Category instances."""

    CATEGORIES = [
        {"name": "Hardware", "name_en": "Hardware", "name_ar": "الأجهزة"},
        {"name": "Software", "name_en": "Software", "name_ar": "البرمجيات"},
        {"name": "Network", "name_en": "Network", "name_ar": "الشبكات"},
        {"name": "Email", "name_en": "Email", "name_ar": "البريد الإلكتروني"},
        {"name": "Access", "name_en": "Access", "name_ar": "الوصول"},
    ]

    _counter = 0

    @classmethod
    def create(
        cls,
        name: Optional[str] = None,
        name_en: Optional[str] = None,
        name_ar: Optional[str] = None,
        is_active: bool = True,
    ) -> Category:
        """Create a Category instance."""
        cls._counter += 1

        if name is None:
            cat_data = cls.CATEGORIES[cls._counter % len(cls.CATEGORIES)]
            name = cat_data["name"]
            name_en = cat_data["name_en"]
            name_ar = cat_data["name_ar"]

        return Category(
            name=name,
            name_en=name_en or name,
            name_ar=name_ar or name,
            is_active=is_active,
        )


class BusinessUnitFactory:
    """Factory for creating BusinessUnit instances."""

    UNITS = [
        {"name": "Headquarters", "ar_name": "المقر الرئيسي"},
        {"name": "Branch Office", "ar_name": "الفرع"},
        {"name": "Remote Site", "ar_name": "الموقع البعيد"},
        {"name": "Data Center", "ar_name": "مركز البيانات"},
    ]

    _counter = 0

    @classmethod
    def create(
        cls,
        name: Optional[str] = None,
        ar_name: Optional[str] = None,
        region_id: Optional[int] = None,
        is_active: bool = True,
    ) -> BusinessUnit:
        """Create a BusinessUnit instance."""
        cls._counter += 1

        if name is None:
            unit_data = cls.UNITS[cls._counter % len(cls.UNITS)]
            name = f"{unit_data['name']} {cls._counter}"
            ar_name = f"{unit_data['ar_name']} {cls._counter}"

        return BusinessUnit(
            name=name,
            ar_name=ar_name or name,
            region_id=region_id,
            is_active=is_active,
        )


class BusinessUnitRegionFactory:
    """Factory for creating BusinessUnitRegion instances."""

    REGIONS = [
        {"name": "Cairo Region", "ar_name": "منطقة القاهرة"},
        {"name": "Alexandria Region", "ar_name": "منطقة الإسكندرية"},
        {"name": "Delta Region", "ar_name": "منطقة الدلتا"},
        {"name": "Upper Egypt", "ar_name": "صعيد مصر"},
    ]

    _counter = 0

    @classmethod
    def create(
        cls,
        name: Optional[str] = None,
        ar_name: Optional[str] = None,
        is_active: bool = True,
    ) -> BusinessUnitRegion:
        """Create a BusinessUnitRegion instance."""
        cls._counter += 1

        if name is None:
            region_data = cls.REGIONS[cls._counter % len(cls.REGIONS)]
            name = region_data["name"]
            ar_name = region_data["ar_name"]

        return BusinessUnitRegion(
            name=name,
            ar_name=ar_name or name,
            is_active=is_active,
        )


class ServiceRequestFactory:
    """Factory for creating ServiceRequest instances."""

    TITLES = [
        "Cannot access email",
        "Printer not working",
        "VPN connection issues",
        "Need software installation",
        "Password reset required",
        "Computer running slow",
        "Network drive not accessible",
        "New equipment request",
        "Application error",
        "System update needed",
    ]

    _counter = 0

    @classmethod
    def create(
        cls,
        title: Optional[str] = None,
        description: Optional[str] = None,
        requester_id: Optional[UUID] = None,
        status_id: int = 1,
        priority_id: int = 3,
        category_id: Optional[int] = None,
        business_unit_id: Optional[int] = None,
        tag_id: Optional[int] = None,
        resolution: Optional[str] = None,
        parent_task_id: Optional[UUID] = None,
        is_deleted: bool = False,
    ) -> ServiceRequest:
        """Create a ServiceRequest instance."""
        cls._counter += 1

        if title is None:
            title = cls.TITLES[cls._counter % len(cls.TITLES)]
        if description is None:
            description = f"Detailed description for: {title}. User is experiencing issues and needs assistance."

        return ServiceRequest(
            id=uuid4(),
            title=title,
            description=description,
            requester_id=requester_id or uuid4(),
            status_id=status_id,
            priority_id=priority_id,
            category_id=category_id,
            business_unit_id=business_unit_id,
            tag_id=tag_id,
            resolution=resolution,
            parent_task_id=parent_task_id,
            is_deleted=is_deleted,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )

    @classmethod
    def create_with_requester(cls, requester: User, **kwargs) -> ServiceRequest:
        """Create a request with a specific requester."""
        kwargs["requester_id"] = requester.id
        return cls.create(**kwargs)


class ChatMessageFactory:
    """Factory for creating ChatMessage instances."""

    MESSAGES = [
        "Hello, I need help with this issue.",
        "Thanks for reaching out. Let me take a look.",
        "I've checked the system and found the problem.",
        "Could you please provide more details?",
        "I'll escalate this to the senior technician.",
        "The issue has been resolved.",
        "Please restart your computer and try again.",
        "I've updated the ticket status.",
    ]

    _counter = 0

    @classmethod
    def create(
        cls,
        request_id: Optional[UUID] = None,
        sender_id: Optional[UUID] = None,
        content: Optional[str] = None,
        is_screenshot: bool = False,
        screenshot_file_name: Optional[str] = None,
        is_read: bool = False,
        sequence_number: Optional[int] = None,
    ) -> ChatMessage:
        """Create a ChatMessage instance."""
        cls._counter += 1

        if content is None:
            content = cls.MESSAGES[cls._counter % len(cls.MESSAGES)]
        if sequence_number is None:
            sequence_number = cls._counter

        return ChatMessage(
            request_id=request_id or uuid4(),
            sender_id=sender_id or uuid4(),
            content=content,
            is_screenshot=is_screenshot,
            screenshot_file_name=screenshot_file_name,
            is_read=is_read,
            sequence_number=sequence_number,
            created_at=datetime.utcnow(),
        )


class RequestNoteFactory:
    """Factory for creating RequestNote instances."""

    _counter = 0

    @classmethod
    def create(
        cls,
        request_id: Optional[UUID] = None,
        created_by: Optional[UUID] = None,
        note: Optional[str] = None,
        is_internal: bool = True,
    ) -> RequestNote:
        """Create a RequestNote instance."""
        cls._counter += 1

        if note is None:
            note = f"Internal note #{cls._counter}: Investigation shows that the issue is related to network configuration."

        return RequestNote(
            request_id=request_id or uuid4(),
            created_by=created_by or uuid4(),
            note=note,
            is_internal=is_internal,
            created_at=datetime.utcnow(),
        )


class DesktopSessionFactory:
    """Factory for creating DesktopSession instances."""

    @classmethod
    def create(
        cls,
        user_id: Optional[UUID] = None,
        ip_address: str = "192.168.1.100",
        app_version: str = "1.0.0",
        is_active: bool = True,
    ) -> DesktopSession:
        """Create a DesktopSession instance."""
        return DesktopSession(
            id=uuid4(),
            user_id=user_id or uuid4(),
            ip_address=ip_address,
            app_version=app_version,
            is_active=is_active,
            created_at=datetime.utcnow(),
            last_heartbeat=datetime.utcnow(),
        )


class WebSessionFactory:
    """Factory for creating WebSession instances."""

    @classmethod
    def create(
        cls,
        user_id: Optional[UUID] = None,
        ip_address: str = "192.168.1.100",
        device_fingerprint: Optional[str] = None,
        is_active: bool = True,
    ) -> WebSession:
        """Create a WebSession instance."""
        return WebSession(
            id=uuid4(),
            user_id=user_id or uuid4(),
            ip_address=ip_address,
            device_fingerprint=device_fingerprint or secrets.token_hex(16),
            is_active=is_active,
            authenticated_at=datetime.utcnow(),
            last_auth_refresh=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(days=7),
        )


class PageFactory:
    """Factory for creating Page instances."""

    PAGES = [
        {"title": "Dashboard", "path": "/dashboard", "icon": "dashboard", "order": 1},
        {"title": "Support Center", "path": "/support-center", "icon": "support", "order": 2},
        {"title": "Requests", "path": "/support-center/requests", "icon": "requests", "order": 3},
        {"title": "Settings", "path": "/setting", "icon": "settings", "order": 4},
        {"title": "Users", "path": "/setting/users", "icon": "users", "order": 5},
        {"title": "Roles", "path": "/setting/roles", "icon": "roles", "order": 6},
        {"title": "Reports", "path": "/reports", "icon": "reports", "order": 7},
    ]

    _counter = 0

    @classmethod
    def create(
        cls,
        title: Optional[str] = None,
        path: Optional[str] = None,
        icon: Optional[str] = None,
        order: int = 1,
        parent_id: Optional[int] = None,
        is_active: bool = True,
    ) -> Page:
        """Create a Page instance."""
        cls._counter += 1

        if title is None:
            page_data = cls.PAGES[cls._counter % len(cls.PAGES)]
            title = page_data["title"]
            path = page_data["path"]
            icon = page_data["icon"]
            order = page_data["order"]

        return Page(
            title=title,
            description=f"{title} page",
            path=path or f"/page-{cls._counter}",
            icon=icon or "default",
            order=order,
            parent_id=parent_id,
            is_active=is_active,
        )


# Helper functions for common test scenarios

def create_user_with_role(
    db_session,
    role: Role,
    **user_kwargs
) -> tuple[User, UserRole]:
    """Create a user and assign them a role."""
    user = UserFactory.create(**user_kwargs)
    user_role = UserRole(user_id=user.id, role_id=role.id, is_active=True)
    return user, user_role


def create_complete_request(
    requester: User,
    status: RequestStatus,
    priority: Priority,
    **kwargs
) -> ServiceRequest:
    """Create a request with all required relationships."""
    return ServiceRequestFactory.create(
        requester_id=requester.id,
        status_id=status.id,
        priority_id=priority.id,
        **kwargs
    )
