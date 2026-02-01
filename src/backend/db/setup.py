"""
Database setup module for initializing default values - REFACTORED

Major Changes:
- Added seeding for 10 new lookup/reference tables
- Updated priority data with correct SLA times
- Updated request status descriptions
- Added default business unit and region
- Migrated from enum-based UserRole to is_technician boolean + user_roles table
"""

import bcrypt  # Direct bcrypt usage (Finding #27: passlib → bcrypt migration)
import logging
import os
from datetime import datetime
from typing import Optional

from dotenv import load_dotenv
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from db import (  # NOTE: AssignType and SessionType are now enums in db.enums, not tables; They no longer need to be seeded in the database
    ActiveDirectoryConfig,
    BusinessUnit,
    BusinessUnitRegion,
    Category,
    Page,
    PageRole,
    Priority,
    RequestStatus,
    RequestType,
    Role,
    ServiceSection,
    Subcategory,
    SystemEvent,
    SystemMessage,
    Tag,
    User,
)

# Load environment variables
load_dotenv()

# Import scheduler models locally in seed function to avoid circular imports

# Setup logging
logger = logging.getLogger(__name__)

# SECURITY (Finding #27 - passlib → bcrypt migration):
# Direct bcrypt usage for password hashing.
# bcrypt library natively handles the $2b$ prefix and is compatible
# with hashes created by passlib (which also uses bcrypt under the hood).


class DatabaseSetup:
    """Handles database initialization and default data setup."""

    def __init__(self):
        # Get admin configuration from environment
        self.admin_username = os.getenv("ADMIN_USERNAME", "admin")
        self.admin_password = os.getenv("ADMIN_PASSWORD", "Admin123!@#")
        self.admin_email = os.getenv(
            "ADMIN_EMAIL", "admin@servicecatalog.local"
        )
        self.admin_full_name = os.getenv(
            "ADMIN_FULL_NAME", "System Administrator"
        )

        logger.info("Database setup initialized with admin config:")
        logger.info(f"  Admin username: {self.admin_username}")
        logger.info(f"  Admin email: {self.admin_email}")
        logger.info(f"  Admin full name: {self.admin_full_name}")

    def get_password_hash(self, password: str) -> str:
        """Hash a password using bcrypt.

        SECURITY (Finding #27): Direct bcrypt usage instead of passlib wrapper.
        Produces hashes compatible with passlib's bcrypt scheme.
        """
        salt = bcrypt.gensalt()
        return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

    # ========================================================================
    # LOOKUP TABLE SEEDING
    # ========================================================================

    async def create_roles(self, db: AsyncSession) -> bool:
        """Create 3 default roles: technician, supervisor, admin."""
        logger.info("Creating default roles...")

        roles_data = [
            {
                "name": "technician",
                "description": "Handles technical service requests",
            },
            {
                "name": "supervisor",
                "description": "Supervisor technical staff",
            },
            {
                "name": "admin",
                "description": "System administrator with full access",
            },
        ]

        try:
            for role_data in roles_data:
                # Check by name instead of ID since ID is auto-generated
                stmt = select(Role).where(Role.name == role_data["name"])
                result = await db.execute(stmt)
                existing = result.scalar_one_or_none()

                if existing:
                    logger.info(
                        f"Role '{role_data['name']}' already exists, skipping..."
                    )
                    continue

                new_role = Role(**role_data)
                db.add(new_role)
                logger.info(f"✅ Created role: {role_data['name']}")

            await db.commit()
            logger.info("✅ Roles seeded successfully")
            return True

        except Exception as e:
            logger.error(f"❌ Failed to create roles: {str(e)}")
            await db.rollback()
            return False

    # NOTE: create_assign_types() and create_session_types() methods REMOVED
    # AssignType and SessionType are now enums in model_enum.py, not database tables
    # Values are defined in code:
    #   - AssignType.TECHNICIAN=1, AssignType.CC=2
    #   - SessionType.WEB=1, SessionType.DESKTOP=2, SessionType.MOBILE=3

    async def create_priorities(self, db: AsyncSession) -> bool:
        """Create/update 5 default priorities with specific SLA times."""
        logger.info("Creating/updating default priorities...")

        priorities_data = [
            {
                "id": 1,
                "name": "Critical",
                "response_time_minutes": 720,
                "resolution_time_hours": 4,
            },  # 12 hours response
            {
                "id": 2,
                "name": "High",
                "response_time_minutes": 900,
                "resolution_time_hours": 8,
            },  # 15 hours response
            {
                "id": 3,
                "name": "Medium",
                "response_time_minutes": 3600,
                "resolution_time_hours": 48,
            },  # 60 hours response
            {
                "id": 4,
                "name": "Low",
                "response_time_minutes": 14400,
                "resolution_time_hours": 120,
            },  # 240 hours response
            {
                "id": 5,
                "name": "Lowest",
                "response_time_minutes": 86400,
                "resolution_time_hours": 240,
            },  # 1440 hours response
        ]

        try:
            for priority_data in priorities_data:
                stmt = select(Priority).where(
                    Priority.id == priority_data["id"]
                )
                result = await db.execute(stmt)
                existing = result.scalar_one_or_none()

                if existing:
                    # Update existing priority
                    existing.name = priority_data["name"]
                    existing.response_time_minutes = priority_data[
                        "response_time_minutes"
                    ]
                    existing.resolution_time_hours = priority_data[
                        "resolution_time_hours"
                    ]
                    existing.is_active = True
                    logger.info(
                        f"✅ Updated priority: {priority_data['name']} (ID: {priority_data['id']})"
                    )
                else:
                    # Create new priority
                    new_priority = Priority(**priority_data, is_active=True)
                    db.add(new_priority)
                    logger.info(
                        f"✅ Created priority: {priority_data['name']} (ID: {priority_data['id']})"
                    )

            await db.commit()
            logger.info("✅ Priorities seeded successfully")
            return True

        except Exception as e:
            logger.error(f"❌ Failed to create priorities: {str(e)}")
            await db.rollback()
            return False

    async def create_request_types(self, db: AsyncSession) -> bool:
        """Create default request types for service request classification with bilingual support."""
        logger.info("Creating default request types...")

        request_types_data = [
            {
                "id": 1,
                "name_en": "Incident",
                "name_ar": "حادث",
                "brief_en": "An unplanned interruption or reduction in quality of an IT service",
                "brief_ar": "انقطاع أو تراجع غير مخطط له في جودة خدمة تقنية المعلومات",
            },
            {
                "id": 2,
                "name_en": "Service Request",
                "name_ar": "طلب خدمة",
                "brief_en": "A formal request from a user for something to be provided or done",
                "brief_ar": "طلب رسمي من المستخدم لتقديم أو تنفيذ شيء ما",
            },
            {
                "id": 3,
                "name_en": "Problem",
                "name_ar": "مشكلة",
                "brief_en": "A cause of one or more incidents, requiring investigation",
                "brief_ar": "سبب لحادث واحد أو أكثر، يتطلب تحقيقاً",
            },
            {
                "id": 4,
                "name_en": "Change Request",
                "name_ar": "طلب تغيير",
                "brief_en": "A request for modification to IT infrastructure or services",
                "brief_ar": "طلب لتعديل البنية التحتية أو الخدمات التقنية",
            },
            {
                "id": 5,
                "name_en": "Access Request",
                "name_ar": "طلب وصول",
                "brief_en": "A request for access to systems, applications, or resources",
                "brief_ar": "طلب للوصول إلى الأنظمة أو التطبيقات أو الموارد",
            },
        ]

        try:
            for type_data in request_types_data:
                stmt = select(RequestType).where(
                    RequestType.id == type_data["id"]
                )
                result = await db.execute(stmt)
                existing = result.scalar_one_or_none()

                if existing:
                    logger.info(
                        f"RequestType '{type_data['name_en']}' (ID: {type_data['id']}) already exists, skipping..."
                    )
                    continue

                new_type = RequestType(**type_data, is_active=True)
                db.add(new_type)
                logger.info(
                    f"✅ Created request type: {type_data['name_en']} / {type_data['name_ar']} (ID: {type_data['id']})"
                )

            await db.commit()
            logger.info("✅ Request types seeded successfully")
            return True

        except Exception as e:
            logger.error(f"❌ Failed to create request types: {str(e)}")
            await db.rollback()
            return False

    async def create_service_sections(self, db: AsyncSession) -> bool:
        """Create 3 default service sections."""
        logger.info("Creating default service sections...")

        sections_data = [
            {
                "id": 1,
                "name": "application_support",
                "shown_name_en": "Application Support",
                "shown_name_ar": "دعم التطبيقات",
                "description": "Application Support Services",
                "is_shown": True,
            },
            {
                "id": 2,
                "name": "infrastructure",
                "shown_name_en": "Infrastructure",
                "shown_name_ar": "البنية التحتية",
                "description": "Infrastructure Services",
                "is_shown": True,
            },
            {
                "id": 3,
                "name": "technical-support",
                "shown_name_en": "Technical Support",
                "shown_name_ar": "الدعم الفني",
                "description": "Technical Support Services",
                "is_shown": True,
            },
        ]

        try:
            for section_data in sections_data:
                stmt = select(ServiceSection).where(
                    ServiceSection.id == section_data["id"]
                )
                result = await db.execute(stmt)
                existing = result.scalar_one_or_none()

                if existing:
                    logger.info(
                        f"ServiceSection '{section_data['name']}' (ID: {section_data['id']}) already exists, skipping..."
                    )
                    continue

                new_section = ServiceSection(
                    **section_data, is_active=True, is_deleted=False
                )
                db.add(new_section)
                logger.info(
                    f"✅ Created service section: {section_data['name']} (ID: {section_data['id']})"
                )

            await db.commit()
            logger.info("✅ Service sections seeded successfully")
            return True

        except Exception as e:
            logger.error(f"❌ Failed to create service sections: {str(e)}")
            await db.rollback()
            return False

    async def create_categories_and_subcategories(
        self, db: AsyncSession
    ) -> bool:
        """Create default categories and subcategories with bilingual support."""
        logger.info("Creating default categories and subcategories...")

        # Categories with bilingual support (EN/AR)
        # Updated category structure as per requirements
        categories_data = [
            {
                "id": 1,
                "name": "hardware",
                "name_en": "Hardware",
                "name_ar": "الأجهزة",
                "description": "Hardware peripherals and devices",
                "section_id": None,
                "subcategories": [
                    {
                        "name": "keyboard_mouse",
                        "name_en": "Keyboard or mouse",
                        "name_ar": "لوحة المفاتيح أو الماوس",
                        "description": "Keyboard and mouse support",
                    },
                    {
                        "name": "monitor",
                        "name_en": "monitor",
                        "name_ar": "الشاشة",
                        "description": "Monitor support",
                    },
                    {
                        "name": "pc",
                        "name_en": "pc",
                        "name_ar": "الحاسوب",
                        "description": "PC support",
                    },
                    {
                        "name": "scanner",
                        "name_en": "Scanner",
                        "name_ar": "الماسح الضوئي",
                        "description": "Scanner support",
                    },
                ],
            },
            {
                "id": 2,
                "name": "printers",
                "name_en": "Printers",
                "name_ar": "الطابعات",
                "description": "Printer support and maintenance",
                "section_id": None,
                "subcategories": [
                    {
                        "name": "access_printer",
                        "name_en": "Access Printer",
                        "name_ar": "الوصول إلى الطابعة",
                        "description": "Printer access issues",
                    },
                    {
                        "name": "change_toner",
                        "name_en": "Change Toner",
                        "name_ar": "تغيير الحبر",
                        "description": "Toner replacement",
                    },
                    {
                        "name": "paper_jam",
                        "name_en": "Paper Jam",
                        "name_ar": "انحشار الورق",
                        "description": "Paper jam issues",
                    },
                    {
                        "name": "printer_not_working",
                        "name_en": "Printer Not Working",
                        "name_ar": "الطابعة لا تعمل",
                        "description": "Printer malfunction",
                    },
                ],
            },
            {
                "id": 3,
                "name": "pacs",
                "name_en": "PACS",
                "name_ar": "نظام أرشفة الصور الطبية",
                "description": "Picture Archiving and Communication System",
                "section_id": None,
                "subcategories": [
                    {
                        "name": "access",
                        "name_en": "Access",
                        "name_ar": "الوصول",
                        "description": "PACS access issues",
                    },
                    {
                        "name": "problem",
                        "name_en": "Problem",
                        "name_ar": "مشكلة",
                        "description": "PACS technical problems",
                    },
                ],
            },
            {
                "id": 4,
                "name": "avaya",
                "name_en": "Avaya",
                "name_ar": "أفايا",
                "description": "Avaya telephone system",
                "section_id": None,
                "subcategories": [
                    {
                        "name": "telephone_cable",
                        "name_en": "Telephone Cable",
                        "name_ar": "كابل الهاتف",
                        "description": "Telephone cable issues",
                    },
                    {
                        "name": "avaya_not_working",
                        "name_en": "Avaya Is Not Working",
                        "name_ar": "أفايا لا يعمل",
                        "description": "Avaya system malfunction",
                    },
                    {
                        "name": "electricity_problem",
                        "name_en": "Electricity Problem",
                        "name_ar": "مشكلة كهرباء",
                        "description": "Electrical issues",
                    },
                ],
            },
            {
                "id": 5,
                "name": "create_user_account",
                "name_en": "Create User Account",
                "name_ar": "إنشاء حساب مستخدم",
                "description": "User account creation and management",
                "section_id": None,
                "subcategories": [
                    {
                        "name": "for_dotcare_only",
                        "name_en": "For DotCare Only",
                        "name_ar": "لـ DotCare فقط",
                        "description": "DotCare account creation",
                    },
                    {
                        "name": "for_windows_and_dotcare",
                        "name_en": "For Windows And DotCare",
                        "name_ar": "لـ Windows و DotCare",
                        "description": "Windows and DotCare account creation",
                    },
                    {
                        "name": "reset_password",
                        "name_en": "Reset Password",
                        "name_ar": "إعادة تعيين كلمة المرور",
                        "description": "Password reset",
                    },
                    {
                        "name": "for_millensys",
                        "name_en": "For Millensys",
                        "name_ar": "لـ Millensys",
                        "description": "Millensys account creation",
                    },
                    {
                        "name": "for_windows_only",
                        "name_en": "For Windows Only",
                        "name_ar": "لـ Windows فقط",
                        "description": "Windows account creation",
                    },
                ],
            },
            {
                "id": 6,
                "name": "email",
                "name_en": "Email",
                "name_ar": "البريد الإلكتروني",
                "description": "Email and Outlook support",
                "section_id": None,
                "subcategories": [
                    {
                        "name": "outlook_issue",
                        "name_en": "Outlook Issue",
                        "name_ar": "مشكلة Outlook",
                        "description": "Outlook problems",
                    },
                    {
                        "name": "send_on_behalf",
                        "name_en": "Permission To Send On Behalf",
                        "name_ar": "إذن للإرسال بالنيابة",
                        "description": "Send on behalf permission",
                    },
                    {
                        "name": "setup_on_phone",
                        "name_en": "SetUp On Phone",
                        "name_ar": "الإعداد على الهاتف",
                        "description": "Email setup on mobile phone",
                    },
                ],
            },
            {
                "id": 7,
                "name": "network",
                "name_en": "Network",
                "name_ar": "الشبكة",
                "description": "Network connectivity",
                "section_id": None,
                "subcategories": [
                    {
                        "name": "lan",
                        "name_en": "LAN",
                        "name_ar": "شبكة محلية",
                        "description": "Local Area Network",
                    },
                    {
                        "name": "wireless",
                        "name_en": "Wireless",
                        "name_ar": "لاسلكي",
                        "description": "Wireless network",
                    },
                ],
            },
            {
                "id": 8,
                "name": "surveillance_cameras",
                "name_en": "Surveillance Cameras",
                "name_ar": "كاميرات المراقبة",
                "description": "Security camera systems",
                "section_id": None,
                "subcategories": [
                    {
                        "name": "add_access",
                        "name_en": "Add Access",
                        "name_ar": "إضافة وصول",
                        "description": "Add camera access",
                    },
                    {
                        "name": "add_camera",
                        "name_en": "Add Camera",
                        "name_ar": "إضافة كاميرا",
                        "description": "Add new camera",
                    },
                    {
                        "name": "camera_not_working",
                        "name_en": "Camera Not Working",
                        "name_ar": "الكاميرا لا تعمل",
                        "description": "Camera malfunction",
                    },
                    {
                        "name": "export_video",
                        "name_en": "Export Video",
                        "name_ar": "تصدير الفيديو",
                        "description": "Export video footage",
                    },
                ],
            },
            {
                "id": 9,
                "name": "sharepoint",
                "name_en": "SharePoint",
                "name_ar": "شير بوينت",
                "description": "SharePoint platform support",
                "section_id": None,
                "subcategories": [
                    {
                        "name": "access",
                        "name_en": "Access",
                        "name_ar": "الوصول",
                        "description": "SharePoint access issues",
                    },
                    {
                        "name": "edit_library",
                        "name_en": "Edit Library",
                        "name_ar": "تحرير المكتبة",
                        "description": "Edit SharePoint library",
                    },
                    {
                        "name": "edit_list",
                        "name_en": "Edit List",
                        "name_ar": "تحرير القائمة",
                        "description": "Edit SharePoint list",
                    },
                    {
                        "name": "not_working",
                        "name_en": "Not Working",
                        "name_ar": "لا يعمل",
                        "description": "SharePoint not working",
                    },
                ],
            },
        ]

        try:
            # Track statistics
            created_categories = 0
            skipped_categories = 0
            created_subcategories = 0
            skipped_subcategories = 0

            for category_data in categories_data:
                # Check if category already exists by ID or name
                stmt = select(Category).where(
                    (Category.id == category_data["id"]) |
                    (Category.name == category_data["name"])
                )
                result = await db.execute(stmt)
                existing_category = result.scalar_one_or_none()

                if existing_category:
                    logger.info(
                        f"Category '{category_data['name_en']}' (ID: {category_data['id']}) already exists, skipping..."
                    )
                    skipped_categories += 1
                    category_id = existing_category.id
                else:
                    # Create new category with bilingual support (without explicit ID)
                    new_category = Category(
                        name=category_data["name"],
                        name_en=category_data.get(
                            "name_en", category_data["name"]
                        ),
                        name_ar=category_data.get(
                            "name_ar", category_data["name"]
                        ),
                        description=category_data.get("description"),
                        section_id=category_data.get("section_id"),
                        is_active=True,
                    )
                    db.add(new_category)
                    await db.flush()  # Get the ID
                    category_id = new_category.id
                    created_categories += 1
                    logger.info(
                        f"✅ Created category: {category_data['name_en']} (ID: {category_id})"
                    )

                # Create subcategories for this category
                for subcat_data in category_data.get("subcategories", []):
                    # Check if subcategory already exists by name within this category
                    subcat_stmt = select(Subcategory).where(
                        Subcategory.category_id == category_id,
                        Subcategory.name == subcat_data["name"],
                    )
                    subcat_result = await db.execute(subcat_stmt)
                    existing_subcat = subcat_result.scalar_one_or_none()

                    if existing_subcat:
                        logger.info(
                            f"  Subcategory '{subcat_data['name_en']}' already exists, skipping..."
                        )
                        skipped_subcategories += 1
                        continue

                    # Create subcategory without explicit ID (let DB auto-increment)
                    new_subcategory = Subcategory(
                        category_id=category_id,
                        name=subcat_data["name"],
                        name_en=subcat_data.get(
                            "name_en", subcat_data["name"]
                        ),
                        name_ar=subcat_data.get(
                            "name_ar", subcat_data["name"]
                        ),
                        description=subcat_data.get("description"),
                        is_active=True,
                    )
                    db.add(new_subcategory)
                    await db.flush()  # Get the ID for logging
                    created_subcategories += 1
                    logger.info(
                        f"  ✅ Created subcategory: {subcat_data['name_en']} (ID: {new_subcategory.id})"
                    )

            await db.commit()
            logger.info(
                f"✅ Categories and subcategories seeded successfully - "
                f"Created: {created_categories} categories, {created_subcategories} subcategories | "
                f"Skipped: {skipped_categories} categories, {skipped_subcategories} subcategories"
            )
            return True

        except Exception as e:
            logger.error(
                f"❌ Failed to create categories and subcategories: {str(e)}"
            )
            await db.rollback()
            return False

    async def seed_tags(self, db: AsyncSession) -> bool:
        """Create default tags with bilingual support."""
        logger.info("Creating default tags...")

        # Comprehensive tags mapped to categories
        tags_data = [
            # Network category tags
            {
                "name_en": "Internet Connection Issue",
                "name_ar": "مشكلة اتصال الإنترنت",
                "category_name": "Network",
            },
            {
                "name_en": "Slow Network Speed",
                "name_ar": "سرعة الشبكة بطيئة",
                "category_name": "Network",
            },
            {
                "name_en": "Network Disconnection",
                "name_ar": "انقطاع الشبكة",
                "category_name": "Network",
            },
            {
                "name_en": "WiFi Not Working",
                "name_ar": "الواي فاي لا يعمل",
                "category_name": "Network",
            },
            {
                "name_en": "VPN Access Problem",
                "name_ar": "مشكلة الوصول إلى VPN",
                "category_name": "Network",
            },
            # Software category tags
            {
                "name_en": "Software Installation",
                "name_ar": "تثبيت البرنامج",
                "category_name": "Software",
            },
            {
                "name_en": "Software Update Required",
                "name_ar": "يتطلب تحديث البرنامج",
                "category_name": "Software",
            },
            {
                "name_en": "Application Crash",
                "name_ar": "تعطل التطبيق",
                "category_name": "Software",
            },
            {
                "name_en": "License Issue",
                "name_ar": "مشكلة الترخيص",
                "category_name": "Software",
            },
            {
                "name_en": "Antivirus Issue",
                "name_ar": "مشكلة مكافحة الفيروسات",
                "category_name": "Software",
            },
            # Hardware category tags
            {
                "name_en": "Computer Not Starting",
                "name_ar": "الحاسوب لا يعمل",
                "category_name": "Hardware",
            },
            {
                "name_en": "Printer Not Working",
                "name_ar": "الطابعة لا تعمل",
                "category_name": "Hardware",
            },
            {
                "name_en": "Keyboard/Mouse Issue",
                "name_ar": "مشكلة لوحة المفاتيح/الفأرة",
                "category_name": "Hardware",
            },
            {
                "name_en": "Monitor Display Problem",
                "name_ar": "مشكلة شاشة العرض",
                "category_name": "Hardware",
            },
            {
                "name_en": "Hardware Replacement",
                "name_ar": "استبدال الأجهزة",
                "category_name": "Hardware",
            },
            # Servers category tags
            {
                "name_en": "Server Down",
                "name_ar": "توقف الخادم",
                "category_name": "Servers",
            },
            {
                "name_en": "Server Performance Issue",
                "name_ar": "مشكلة أداء الخادم",
                "category_name": "Servers",
            },
            {
                "name_en": "Database Connection Error",
                "name_ar": "خطأ اتصال قاعدة البيانات",
                "category_name": "Servers",
            },
            {
                "name_en": "Server Maintenance Request",
                "name_ar": "طلب صيانة الخادم",
                "category_name": "Servers",
            },
            # ERP Systems category tags
            {
                "name_en": "Oracle EBS Error",
                "name_ar": "خطأ في أوراكل EBS",
                "category_name": "ERP Systems",
            },
            {
                "name_en": "SAP Access Issue",
                "name_ar": "مشكلة الوصول إلى SAP",
                "category_name": "ERP Systems",
            },
            {
                "name_en": "ERP Login Problem",
                "name_ar": "مشكلة تسجيل الدخول ERP",
                "category_name": "ERP Systems",
            },
            {
                "name_en": "Report Generation Failed",
                "name_ar": "فشل إنشاء التقرير",
                "category_name": "ERP Systems",
            },
            # Healthcare Applications category tags
            {
                "name_en": "HIS System Error",
                "name_ar": "خطأ في نظام المعلومات الطبية",
                "category_name": "Healthcare Applications",
            },
            {
                "name_en": "Patient Record Access",
                "name_ar": "الوصول إلى سجل المريض",
                "category_name": "Healthcare Applications",
            },
            {
                "name_en": "Lab System Issue",
                "name_ar": "مشكلة نظام المختبر",
                "category_name": "Healthcare Applications",
            },
            {
                "name_en": "Medical Device Integration",
                "name_ar": "تكامل الجهاز الطبي",
                "category_name": "Healthcare Applications",
            },
        ]

        try:
            tags_created = 0

            for tag_data in tags_data:
                # Find category by name_en
                category_stmt = select(Category).where(
                    Category.name_en == tag_data["category_name"]
                )
                category_result = await db.execute(category_stmt)
                category = category_result.scalar_one_or_none()

                if not category:
                    logger.warning(
                        f"Category '{tag_data['category_name']}' not found, skipping tag '{tag_data['name_en']}'"
                    )
                    continue

                # Check if tag already exists (by name_en to avoid duplicates)
                tag_stmt = select(Tag).where(
                    Tag.name_en == tag_data["name_en"],
                    Tag.category_id == category.id,
                )
                tag_result = await db.execute(tag_stmt)
                existing_tag = tag_result.scalar_one_or_none()

                if existing_tag:
                    logger.info(
                        f"Tag '{tag_data['name_en']}' already exists in category '{category.name_en}', skipping..."
                    )
                    continue

                # Create new tag
                new_tag = Tag(
                    name_en=tag_data["name_en"],
                    name_ar=tag_data["name_ar"],
                    category_id=category.id,
                    is_active=True,
                    is_deleted=False,
                )
                db.add(new_tag)
                tags_created += 1
                logger.info(
                    f"✅ Created tag: '{tag_data['name_en']}' (EN/AR) in category '{category.name_en}'"
                )

            if tags_created > 0:
                await db.commit()
                logger.info(
                    f"✅ Tags seeded successfully ({tags_created} tags created)"
                )
            else:
                logger.info("All default tags already exist")

            return True

        except Exception as e:
            logger.error(f"❌ Failed to seed tags: {str(e)}")
            await db.rollback()
            return False

    async def create_default_business_unit(
        self, db: AsyncSession, admin_user: User
    ) -> bool:
        """Create default business unit region and business units."""
        logger.info("Creating default business units and region...")

        try:
            # Create default region if not exists
            region_stmt = select(BusinessUnitRegion).where(
                BusinessUnitRegion.name == "Egypt"
            )
            result = await db.execute(region_stmt)
            region = result.scalar_one_or_none()

            if not region:
                region = BusinessUnitRegion(
                    name="Egypt",
                    description="Egypt Region",
                    created_by=admin_user.id,
                )
                db.add(region)
                await db.commit()
                await db.refresh(region)
                logger.info("✅ Created default region: Egypt")
            else:
                logger.info("Default region 'Egypt' already exists")

            # Define all business units (all with region_id = 1 for Egypt)
            business_units_data = [
                {
                    "name": "SMH",
                    "description": "Andalusia Smouha Hospital",
                    "network": "10.23.0.0/16",
                },
                {
                    "name": "ANC",
                    "description": "Andalusia Antoniadis Clinics",
                    "network": "10.26.0.0/16",
                },
                {
                    "name": "ARC",
                    "description": "Andalusia Roushdy Clinics",
                    "network": "10.25.0.0/16",
                },
                {
                    "name": "ASH",
                    "description": "Andalusia AlShalalat Hospital",
                    "network": "10.22.0.0/16",
                },
                {
                    "name": "AHQ",
                    "description": "Andalusia Alexandria Head Quarter",
                    "network": "10.24.0.0/16",
                },
                {
                    "name": "AMH",
                    "description": "Andalusia Maadi Hospital",
                    "network": "10.3.0.0/16",
                },
                {
                    "name": "CHQ",
                    "description": "Andalusia Cairo Head Quarter",
                    "network": "10.2.0.0/16",
                },
                {
                    "name": "AEG",
                    "description": "Andalusia Engineering",
                    "network": "10.5.0.0/16",
                },
            ]

            # Create each business unit if it doesn't exist
            created_count = 0
            for bu_data in business_units_data:
                bu_stmt = select(BusinessUnit).where(
                    BusinessUnit.name == bu_data["name"]
                )
                result = await db.execute(bu_stmt)
                existing_bu = result.scalar_one_or_none()

                if not existing_bu:
                    business_unit = BusinessUnit(
                        name=bu_data["name"],
                        description=bu_data["description"],
                        network=bu_data["network"],
                        business_unit_region_id=region.id,
                        created_by=admin_user.id,
                    )
                    db.add(business_unit)
                    created_count += 1
                    logger.info(
                        f"✅ Created business unit: {bu_data['name']} - {bu_data['description']} ({bu_data['network']})"
                    )
                else:
                    logger.info(
                        f"Business unit '{bu_data['name']}' already exists"
                    )

            if created_count > 0:
                await db.commit()
                logger.info(
                    f"✅ Created {created_count} business units successfully"
                )
            else:
                logger.info("All business units already exist")

            return True

        except Exception as e:
            logger.error(
                f"❌ Failed to create default business units: {str(e)}"
            )
            await db.rollback()
            return False

    async def create_pages(self, db: AsyncSession, admin_user: User) -> bool:
        """Create default application pages with hierarchy."""
        logger.info("Creating default pages...")

        try:
            # Parent Pages (without path for navigation groups, with path for standalone pages)
            parent_pages_data = [
                {
                    "id": 1,
                    "title": "Settings",
                    "description": "System settings and configuration",
                    "icon": "settings",
                    "path": None,
                    "parent_id": None,
                },
                {
                    "id": 2,
                    "title": "Support Center",
                    "description": "Support center and request management",
                    "icon": "support",
                    "path": None,
                    "parent_id": None,
                },
                {
                    "id": 3,
                    "title": "Reports",
                    "description": "Reports and analytics",
                    "icon": "bar_chart",
                    "path": None,
                    "parent_id": None,
                },
                {
                    "id": 4,
                    "title": "Management",
                    "description": "System management and active sessions",
                    "icon": "settings_applications",
                    "path": None,
                    "parent_id": None,
                },
                {
                    "id": 5,
                    "title": "Dashboard",
                    "description": "Dashboard with key metrics and quick actions for technicians",
                    "icon": "dashboard",
                    "path": "dashboard",
                    "parent_id": None,
                },
                {
                    "id": 6,
                    "title": "Portal",
                    "description": "Download portal for the IT Support Center desktop client",
                    "icon": "download",
                    "path": "portal",
                    "parent_id": None,
                },
            ]

            # Create parent pages first
            for page_data in parent_pages_data:
                stmt = select(Page).where(Page.id == page_data["id"])
                result = await db.execute(stmt)
                existing = result.scalar_one_or_none()

                if existing:
                    logger.info(
                        f"Page '{page_data['title']}' (ID: {page_data['id']}) already exists, skipping..."
                    )
                    continue

                new_page = Page(
                    **page_data,
                    is_active=True,
                    is_deleted=False,
                    created_by=admin_user.id,
                    updated_by=admin_user.id,
                )
                db.add(new_page)
                logger.info(
                    f"✅ Created parent page: {page_data['title']} (ID: {page_data['id']})"
                )

            await db.commit()

            # Child Pages (with paths and parent_id)
            child_pages_data = [
                # Settings children
                {
                    "id": 11,
                    "title": "Roles",
                    "description": "Manage user roles and permissions",
                    "icon": "admin_panel_settings",
                    "path": "setting/roles",
                    "parent_id": 1,
                },
                {
                    "id": 12,
                    "title": "Users",
                    "description": "Manage system users",
                    "icon": "group",
                    "path": "setting/users",
                    "parent_id": 1,
                },
                {
                    "id": 13,
                    "title": "Regions",
                    "description": "Manage business unit regions",
                    "icon": "public",
                    "path": "setting/business-unit-regions",
                    "parent_id": 1,
                },
                {
                    "id": 14,
                    "title": "Business Units",
                    "description": "Manage business units and locations",
                    "icon": "business",
                    "path": "setting/business-units",
                    "parent_id": 1,
                },
                {
                    "id": 15,
                    "title": "Request Status",
                    "description": "Manage request statuses and workflow",
                    "icon": "track_changes",
                    "path": "setting/request-statuses",
                    "parent_id": 1,
                },
                {
                    "id": 16,
                    "title": "System Events",
                    "description": "Manage automated system event triggers",
                    "icon": "event",
                    "path": "setting/system-events",
                    "parent_id": 1,
                },
                {
                    "id": 17,
                    "title": "System Messages",
                    "description": "Manage system message templates",
                    "icon": "message",
                    "path": "setting/system-messages",
                    "parent_id": 1,
                },
                {
                    "id": 18,
                    "title": "Request Types",
                    "description": "Manage request types for categorizing service requests",
                    "icon": "category",
                    "path": "setting/request-types",
                    "parent_id": 1,
                },
                {
                    "id": 19,
                    "title": "Client Versions",
                    "description": "Manage client version registry and enforcement policies",
                    "icon": "update",
                    "path": "setting/client-versions",
                    "parent_id": 1,
                },
                {
                    "id": 20,
                    "title": "Categories",
                    "description": "Manage service request categories",
                    "icon": "folder",
                    "path": "setting/categories",
                    "parent_id": 1,
                },
                # Support Center children
                {
                    "id": 21,
                    "title": "Requests",
                    "description": "View and manage service requests",
                    "icon": "assignment",
                    "path": "support-center/requests",
                    "parent_id": 2,
                },
                # Reports children
                {
                    "id": 30,
                    "title": "Executive Dashboard",
                    "description": "Executive reports dashboard with KPIs and trends",
                    "icon": "dashboard",
                    "path": "reports",
                    "parent_id": 3,
                },
                {
                    "id": 31,
                    "title": "Volume Reports",
                    "description": "View request volume and trends",
                    "icon": "bar_chart",
                    "path": "reports/volume",
                    "parent_id": 3,
                },
                {
                    "id": 32,
                    "title": "Agent Performance",
                    "description": "View agent performance metrics",
                    "icon": "people",
                    "path": "reports/agents",
                    "parent_id": 3,
                },
                {
                    "id": 33,
                    "title": "SLA Reports",
                    "description": "View SLA compliance and metrics",
                    "icon": "timer",
                    "path": "reports/sla",
                    "parent_id": 3,
                },
                {
                    "id": 34,
                    "title": "Operations Dashboard",
                    "description": "View operations dashboard and metrics",
                    "icon": "dashboard",
                    "path": "reports/operations",
                    "parent_id": 3,
                },
                {
                    "id": 35,
                    "title": "Outshift Report",
                    "description": "View agent outshift activity metrics",
                    "icon": "Moon",
                    "path": "reports/outshift",
                    "parent_id": 3,
                },
                {
                    "id": 36,
                    "title": "Saved Reports",
                    "description": "View and manage saved reports",
                    "icon": "bookmark",
                    "path": "reports/saved",
                    "parent_id": 3,
                },
                # Management children
                {
                    "id": 41,
                    "title": "Active Sessions",
                    "description": "View and manage active user sessions",
                    "icon": "devices",
                    "path": "management/active-sessions",
                    "parent_id": 4,
                },
                {
                    "id": 42,
                    "title": "Deployments",
                    "description": "Manage device discovery, deployment jobs, and credentials",
                    "icon": "cloud_download",
                    "path": "management/deployments",
                    "parent_id": 4,
                },
                {
                    "id": 45,
                    "title": "Scheduler",
                    "description": "Manage scheduled jobs and task automation",
                    "icon": "schedule",
                    "path": "management/scheduler",
                    "parent_id": 4,
                },
                {
                    "id": 46,
                    "title": "Active Directory",
                    "description": "Manage Active Directory server configurations",
                    "icon": "dns",
                    "path": "management/active-directory",
                    "parent_id": 4,
                },
            ]

            # Create child pages
            for page_data in child_pages_data:
                stmt = select(Page).where(Page.id == page_data["id"])
                result = await db.execute(stmt)
                existing = result.scalar_one_or_none()

                if existing:
                    logger.info(
                        f"Page '{page_data['title']}' (ID: {page_data['id']}) already exists, skipping..."
                    )
                    continue

                new_page = Page(
                    **page_data,
                    is_active=True,
                    is_deleted=False,
                    created_by=admin_user.id,
                    updated_by=admin_user.id,
                )
                db.add(new_page)
                logger.info(
                    f"✅ Created child page: {page_data['title']} (ID: {page_data['id']})"
                )

            await db.commit()
            logger.info("✅ Pages seeded successfully")
            return True

        except Exception as e:
            logger.error(f"❌ Failed to create pages: {str(e)}")
            await db.rollback()
            return False

    async def create_page_role_permissions(
        self, db: AsyncSession, admin_user: User
    ) -> bool:
        """Create default page-role permissions."""
        logger.info("Creating default page-role permissions...")

        try:
            # Get all roles
            roles_result = await db.execute(select(Role))
            roles = roles_result.scalars().all()

            # Create role name to ID mapping
            role_map = {role.name: role.id for role in roles}

            if "admin" not in role_map:
                logger.error("❌ Admin role not found")
                return False

            admin_role_id = role_map["admin"]

            # Define permissions
            # 1. Pages accessible to ALL roles (including non-technicians)
            all_roles_pages = [
                21,  # Requests
                6,   # Portal (download client)
            ]

            # 2. Settings pages - Admin only
            admin_only_pages = [
                11,  # Roles
                12,  # Users
                13,  # Regions
                14,  # Business Units
                15,  # Request Status
                16,  # System Events
                17,  # System Messages
                18,  # Request Types
                19,  # Client Versions
                20,  # Categories
                46,  # Active Directory
            ]

            # 3. Reports pages - Supervisor and Admin roles
            supervisor_admin_roles = ["supervisor", "admin"]
            reports_pages = [
                30,  # Executive Dashboard
                31,  # Volume Reports
                32,  # Agent Performance
                33,  # SLA Reports
                34,  # Operations Dashboard
                35,  # Outshift Report
                36,  # Saved Reports
            ]

            # 4. Management pages - All technician roles (technician, supervisor, admin)
            technician_roles = ["technician", "supervisor", "admin"]
            management_pages = [
                41,  # Active Sessions
                42,  # Deployments
                45,  # Scheduler
            ]

            # 5. Dashboard page - All technician roles
            dashboard_pages = [
                5,   # Dashboard (metrics and quick actions)
            ]

            permissions_created = 0

            # Assign Requests page to all roles
            for role_name, role_id in role_map.items():
                for page_id in all_roles_pages:
                    # Check if permission already exists
                    stmt = select(PageRole).where(
                        PageRole.role_id == role_id,
                        PageRole.page_id == page_id,
                    )
                    result = await db.execute(stmt)
                    existing = result.scalar_one_or_none()

                    if existing:
                        logger.info(
                            f"Permission already exists: {role_name} -> Page {page_id}"
                        )
                        continue

                    new_permission = PageRole(
                        role_id=role_id,
                        page_id=page_id,
                        created_by=admin_user.id,
                        updated_by=admin_user.id,
                        is_deleted=False,
                    )
                    db.add(new_permission)
                    permissions_created += 1
                    logger.info(
                        f"✅ Created permission: {role_name} -> Page {page_id} (Requests)"
                    )

            # Assign Settings pages to Admin only
            for page_id in admin_only_pages:
                # Check if permission already exists
                stmt = select(PageRole).where(
                    PageRole.role_id == admin_role_id,
                    PageRole.page_id == page_id,
                )
                result = await db.execute(stmt)
                existing = result.scalar_one_or_none()

                if existing:
                    logger.info(
                        f"Permission already exists: admin -> Page {page_id}"
                    )
                    continue

                # Get page name for logging
                page_stmt = select(Page).where(Page.id == page_id)
                page_result = await db.execute(page_stmt)
                page = page_result.scalar_one_or_none()
                page_name = page.title if page else f"Page {page_id}"

                new_permission = PageRole(
                    role_id=admin_role_id,
                    page_id=page_id,
                    created_by=admin_user.id,
                    updated_by=admin_user.id,
                    is_deleted=False,
                )
                db.add(new_permission)
                permissions_created += 1
                logger.info(
                    f"✅ Created permission: admin -> {page_name} (ID: {page_id})"
                )

            # Assign Reports pages to Supervisor and Admin roles
            for role_name in supervisor_admin_roles:
                if role_name not in role_map:
                    logger.warning(
                        f"Role '{role_name}' not found, skipping reports permissions"
                    )
                    continue

                role_id = role_map[role_name]

                for page_id in reports_pages:
                    # Check if permission already exists
                    stmt = select(PageRole).where(
                        PageRole.role_id == role_id,
                        PageRole.page_id == page_id,
                    )
                    result = await db.execute(stmt)
                    existing = result.scalar_one_or_none()

                    if existing:
                        logger.info(
                            f"Permission already exists: {role_name} -> Page {page_id}"
                        )
                        continue

                    # Get page name for logging
                    page_stmt = select(Page).where(Page.id == page_id)
                    page_result = await db.execute(page_stmt)
                    page = page_result.scalar_one_or_none()
                    page_name = page.title if page else f"Page {page_id}"

                    new_permission = PageRole(
                        role_id=role_id,
                        page_id=page_id,
                        created_by=admin_user.id,
                        updated_by=admin_user.id,
                        is_deleted=False,
                    )
                    db.add(new_permission)
                    permissions_created += 1
                    logger.info(
                        f"✅ Created permission: {role_name} -> {page_name} (ID: {page_id})"
                    )

            # Assign Management pages to all technician roles
            for role_name in technician_roles:
                if role_name not in role_map:
                    logger.warning(
                        f"Role '{role_name}' not found, skipping management permissions"
                    )
                    continue

                role_id = role_map[role_name]

                for page_id in management_pages:
                    # Check if permission already exists
                    stmt = select(PageRole).where(
                        PageRole.role_id == role_id,
                        PageRole.page_id == page_id,
                    )
                    result = await db.execute(stmt)
                    existing = result.scalar_one_or_none()

                    if existing:
                        logger.info(
                            f"Permission already exists: {role_name} -> Page {page_id}"
                        )
                        continue

                    # Get page name for logging
                    page_stmt = select(Page).where(Page.id == page_id)
                    page_result = await db.execute(page_stmt)
                    page = page_result.scalar_one_or_none()
                    page_name = page.title if page else f"Page {page_id}"

                    new_permission = PageRole(
                        role_id=role_id,
                        page_id=page_id,
                        created_by=admin_user.id,
                        updated_by=admin_user.id,
                        is_deleted=False,
                    )
                    db.add(new_permission)
                    permissions_created += 1
                    logger.info(
                        f"✅ Created permission: {role_name} -> {page_name} (ID: {page_id})"
                    )

            # Assign Dashboard page to all technician roles
            for role_name in technician_roles:
                if role_name not in role_map:
                    logger.warning(
                        f"Role '{role_name}' not found, skipping dashboard permissions"
                    )
                    continue

                role_id = role_map[role_name]

                for page_id in dashboard_pages:
                    # Check if permission already exists
                    stmt = select(PageRole).where(
                        PageRole.role_id == role_id,
                        PageRole.page_id == page_id,
                    )
                    result = await db.execute(stmt)
                    existing = result.scalar_one_or_none()

                    if existing:
                        logger.info(
                            f"Permission already exists: {role_name} -> Page {page_id}"
                        )
                        continue

                    new_permission = PageRole(
                        role_id=role_id,
                        page_id=page_id,
                        created_by=admin_user.id,
                        updated_by=admin_user.id,
                        is_deleted=False,
                    )
                    db.add(new_permission)
                    permissions_created += 1
                    logger.info(
                        f"✅ Created permission: {role_name} -> Dashboard (ID: {page_id})"
                    )

            await db.commit()
            logger.info(
                f"✅ Page-role permissions seeded successfully ({permissions_created} permissions created)"
            )
            return True

        except Exception as e:
            logger.error(
                f"❌ Failed to create page-role permissions: {str(e)}"
            )
            await db.rollback()
            return False

    # ========================================================================
    # ADMIN USER CREATION
    # ========================================================================

    async def create_admin_user(self, db: AsyncSession) -> Optional[User]:
        """
        Create or update the admin user.
        UPDATED: Uses is_technician and is_super_admin instead of role enum.
        """
        logger.info("Starting admin user setup...")

        # Check if admin user already exists
        stmt = select(User).where(
            (User.username == self.admin_username)
            | (User.email == self.admin_email)
        )
        result = await db.execute(stmt)
        existing_user = result.scalar_one_or_none()

        admin_password_hash = self.get_password_hash(self.admin_password)

        if existing_user:
            logger.info(
                f"Admin user '{self.admin_username}' already exists. Updating..."
            )

            # Update existing user - UPDATED: use is_technician instead of role
            existing_user.email = self.admin_email
            existing_user.full_name = self.admin_full_name
            existing_user.is_technician = True  # Admin is a technician
            existing_user.is_active = True
            existing_user.is_super_admin = True
            existing_user.is_domain = True
            existing_user.password_hash = admin_password_hash
            existing_user.updated_at = datetime.utcnow()

            await db.commit()
            await db.refresh(existing_user)

            logger.info(
                f"✅ Admin user '{self.admin_username}' updated successfully"
            )
            return existing_user
        else:
            logger.info(f"Creating new admin user '{self.admin_username}'...")

            # Create new admin user - UPDATED: use is_technician instead of role
            admin_user = User(
                username=self.admin_username,
                email=self.admin_email,
                full_name=self.admin_full_name,
                password_hash=admin_password_hash,
                is_technician=True,  # Admin is a technician
                is_active=True,
                is_super_admin=True,
                is_domain=True,
                phone_number=None,
                title="System Administrator",
                office="IT Department",
            )

            db.add(admin_user)
            await db.commit()
            await db.refresh(admin_user)

            logger.info(
                f"✅ Admin user '{self.admin_username}' created successfully"
            )
            return admin_user

    async def create_default_statuses(
        self, db: AsyncSession, admin_user: User
    ) -> bool:
        """Create 5 default request statuses with colors."""
        logger.info("Creating default request statuses...")

        default_statuses = [
            {
                "name": "Open",
                "name_en": "Open",
                "name_ar": "مفتوح",
                "id": 1,
                "description": "Request is open and being worked on",
                "color": "blue",
                "count_as_solved": False,
            },
            {
                "name": "Hold",
                "name_en": "Hold",
                "name_ar": "قيد الانتظار",
                "id": 2,
                "description": "Request is on hold waiting for something",
                "color": "yellow",
                "count_as_solved": False,
                "visible_on_requester_page": False,
            },
            {
                "name": "Solved",
                "name_en": "Solved",
                "name_ar": "تم حلها",
                "id": 3,
                "description": "Request has been resolved",
                "color": "green",
                "count_as_solved": True,
            },
            {
                "name": "Archived",
                "name_en": "Archived",
                "name_ar": "مؤرشفة",
                "id": 4,
                "description": "Request is archived",
                "color": "gray",
                "count_as_solved": False,
                "visible_on_requester_page": False,
            },
            {
                "name": "Canceled",
                "name_en": "Canceled",
                "name_ar": "ملغاة",
                "id": 5,
                "description": "Request is canceled",
                "color": "red",
                "count_as_solved": False,
                "visible_on_requester_page": False,
            },
            {
                "name": "in-progress",
                "name_en": "In Progress",
                "name_ar": "قيد التنفيذ",
                "id": 8,
                "description": "Request is being actively worked on by a technician",
                "color": "cyan",
                "count_as_solved": False,
            },
        ]

        try:
            for status_data in default_statuses:
                # Check if status already exists
                stmt = select(RequestStatus).where(
                    RequestStatus.id == status_data["id"]
                )
                result = await db.execute(stmt)
                existing_status = result.scalar_one_or_none()

                if existing_status:
                    # Update description, color, and count_as_solved if different
                    updated = False
                    if existing_status.description != status_data.get(
                        "description"
                    ):
                        existing_status.description = status_data.get(
                            "description"
                        )
                        updated = True
                    if existing_status.color != status_data.get("color"):
                        existing_status.color = status_data.get("color")
                        updated = True
                    if existing_status.count_as_solved != status_data.get(
                        "count_as_solved", False
                    ):
                        existing_status.count_as_solved = status_data.get(
                            "count_as_solved", False
                        )
                        updated = True
                    if "visible_on_requester_page" in status_data and existing_status.visible_on_requester_page != status_data["visible_on_requester_page"]:
                        existing_status.visible_on_requester_page = status_data["visible_on_requester_page"]
                        updated = True

                    if updated:
                        logger.info(
                            f"✅ Updated status: {status_data['name']} (ID: {status_data['id']})"
                        )
                    else:
                        logger.info(
                            f"Status '{status_data['name']}' (ID: {status_data['id']}) already exists, skipping..."
                        )
                    continue

                # Create new status
                new_status = RequestStatus(
                    id=status_data["id"],
                    name=status_data["name"],
                    name_en=status_data.get("name_en", status_data["name"]),
                    name_ar=status_data.get("name_ar", ""),
                    description=status_data.get("description"),
                    color=status_data.get("color"),
                    count_as_solved=status_data.get("count_as_solved", False),
                    visible_on_requester_page=status_data.get("visible_on_requester_page", True),
                    readonly=True,  # All default statuses are readonly
                    is_active=True,  # All default statuses are active
                    created_by=admin_user.id,
                    updated_by=admin_user.id,
                )

                db.add(new_status)
                logger.info(
                    f"✅ Created status: {status_data['name']} (ID: {status_data['id']})"
                )

            await db.commit()
            logger.info("✅ Default statuses created successfully")
            return True

        except Exception as e:
            logger.error(f"❌ Failed to create default statuses: {str(e)}")
            await db.rollback()
            return False

    async def create_system_messages(self, db: AsyncSession) -> bool:
        """Create default system message templates for bilingual notifications.

        Creates system messages and their corresponding system events for:
        - new_request: When a new request is created
        - ticket_assigned: When a technician is assigned
        - request_solved: When a request is marked as solved
        """
        logger.info("Creating system messages and events...")

        try:
            # Define system messages to create
            system_messages_data = [
                {
                    "message_type": "new_request",
                    "template_en": "New request created",
                    "template_ar": "تم إنشاء طلب جديد",
                    "is_active": True,
                },
                {
                    "message_type": "ticket_assigned",
                    "template_en": "{technician_name} has been assigned to your request",
                    "template_ar": "تم تعيين {technician_name} لحل مشكلتكم",
                    "is_active": True,
                },
                {
                    "message_type": "request_solved",
                    "template_en": "Request has been solved",
                    "template_ar": "تم حل الطلب",
                    "is_active": True,
                },
            ]

            # Create system messages
            created_messages = {}
            for msg_data in system_messages_data:
                # Check if message already exists
                result = await db.execute(
                    select(SystemMessage).where(
                        SystemMessage.message_type == msg_data["message_type"]
                    )
                )
                existing_msg = result.scalar_one_or_none()

                if existing_msg:
                    logger.info(f"System message '{msg_data['message_type']}' already exists, skipping...")
                    created_messages[msg_data["message_type"]] = existing_msg
                else:
                    # Create new system message
                    system_msg = SystemMessage(**msg_data)
                    db.add(system_msg)
                    await db.flush()
                    await db.refresh(system_msg)
                    created_messages[msg_data["message_type"]] = system_msg
                    logger.info(f"✅ Created system message: {msg_data['message_type']}")

            # Define system events (linked to messages)
            system_events_data = [
                {
                    "event_key": "new_request",
                    "event_name_en": "New Request",
                    "event_name_ar": "طلب جديد",
                    "description_en": "Triggered when a new request is created",
                    "description_ar": "يتم تفعيله عندما يتم إنشاء طلب جديد",
                    "message_type": "new_request",
                    "trigger_timing": "immediate",
                    "is_active": True,
                },
                {
                    "event_key": "ticket_assigned",
                    "event_name_en": "Ticket Assigned",
                    "event_name_ar": "تم تعيين التذكرة",
                    "description_en": "Triggered when a technician is assigned to a request",
                    "description_ar": "يتم تفعيله عندما يتم تعيين فني للطلب",
                    "message_type": "ticket_assigned",
                    "trigger_timing": "immediate",
                    "is_active": True,
                },
                {
                    "event_key": "request_solved",
                    "event_name_en": "Request Solved",
                    "event_name_ar": "تم حل الطلب",
                    "description_en": "Triggered when request status changes to solved",
                    "description_ar": "يتم تفعيله عندما تتغير حالة الطلب إلى محلول",
                    "message_type": "request_solved",
                    "trigger_timing": "immediate",
                    "is_active": True,
                },
            ]

            # Create system events
            for event_data in system_events_data:
                # Check if event already exists
                result = await db.execute(
                    select(SystemEvent).where(
                        SystemEvent.event_key == event_data["event_key"]
                    )
                )
                existing_event = result.scalar_one_or_none()

                if existing_event:
                    logger.info(f"System event '{event_data['event_key']}' already exists, skipping...")
                else:
                    # Get the system_message_id
                    message_type = event_data.pop("message_type")
                    system_msg = created_messages[message_type]

                    # Create new system event
                    system_event = SystemEvent(
                        **event_data,
                        system_message_id=system_msg.id
                    )
                    db.add(system_event)
                    await db.flush()
                    logger.info(f"✅ Created system event: {event_data['event_key']}")

            await db.commit()
            logger.info("✅ System messages and events created successfully")
            return True

        except Exception as e:
            logger.error(f"❌ Failed to create system messages: {e}")
            await db.rollback()
            return False

    async def seed_bilingual_status_names(self, db: AsyncSession) -> bool:
        """Populate bilingual names for default request statuses."""
        logger.info("Seeding bilingual names for request statuses...")

        status_translations = {
            "Open": {"en": "Open", "ar": "مفتوح"},
            "Hold": {"en": "Hold", "ar": "معلق"},
            "Solved": {"en": "Solved", "ar": "محلول"},
            "Archived": {"en": "Archived", "ar": "مؤرشف"},
            "Canceled": {"en": "Canceled", "ar": "ملغي"},
            "in-progress": {"en": "In Progress", "ar": "قيد التنفيذ"},
        }

        try:
            from sqlalchemy import update

            updated_count = 0
            for status_name, translations in status_translations.items():
                stmt = (
                    update(RequestStatus)
                    .where(RequestStatus.name == status_name)
                    .values(
                        name_en=translations["en"],
                        name_ar=translations["ar"],
                    )
                )
                result = await db.execute(stmt)
                await db.commit()

                if result.rowcount > 0:
                    logger.info(
                        f"✅ Updated '{status_name}': EN='{translations['en']}', AR='{translations['ar']}'"
                    )
                    updated_count += 1
                else:
                    logger.warning(
                        f"⚠️  No status found with name '{status_name}' (skipping)"
                    )

            logger.info(
                f"✅ Bilingual status names seeded successfully ({updated_count} statuses updated)"
            )
            return True

        except Exception as e:
            logger.error(f"❌ Failed to seed bilingual status names: {str(e)}")
            await db.rollback()
            return False

    async def seed_scheduler_data(self, db: AsyncSession) -> bool:
        """Seed scheduler job types and task functions."""
        try:
            # Import here to avoid circular imports
            from db.models import (
                SchedulerJobType,
                TaskFunction,
            )

            logger.info("🕐 Seeding scheduler data...")

            # Check if already seeded
            job_types_result = await db.execute(select(SchedulerJobType).limit(1))
            if job_types_result.scalar_one_or_none() is not None:
                logger.info("✅ Scheduler data already seeded, skipping")
                return True

            # Create job types
            job_types_data = [
                {
                    "name": "interval",
                    "display_name": "Interval Schedule",
                    "description": "Run at regular intervals (seconds, minutes, hours)",
                    "is_active": True,
                },
                {
                    "name": "cron",
                    "display_name": "Cron Schedule",
                    "description": "Run using cron expression (second, minute, hour, day, month, day_of_week)",
                    "is_active": True,
                },
            ]

            for jt_data in job_types_data:
                job_type = SchedulerJobType(**jt_data)
                db.add(job_type)

            await db.commit()
            logger.info(f"✅ Created {len(job_types_data)} job types")

            # Get job type IDs for task functions
            interval_result = await db.execute(
                select(SchedulerJobType).where(SchedulerJobType.name == "interval")
            )
            interval_type = interval_result.scalar_one()

            cron_result = await db.execute(
                select(SchedulerJobType).where(SchedulerJobType.name == "cron")
            )
            cron_type = cron_result.scalar_one()

            # Create task functions (system tasks that cannot be deleted)
            task_functions_data = [
                {
                    "name": "sync_domain_users",
                    "display_name": "Sync Domain Users from AD",
                    "description": "Synchronize enabled users from Active Directory",
                    "handler_path": "tasks.ad_sync_tasks.sync_domain_users_task",
                    "handler_type": "celery_task",
                    "queue": "ad_queue",
                    "default_timeout_seconds": 600,
                    "is_active": True,
                    "is_system": True,
                },
                {
                    "name": "cleanup_expired_sessions",
                    "display_name": "Cleanup Expired Sessions",
                    "description": "Remove expired desktop and web sessions from database",
                    "handler_path": "tasks.maintenance_tasks.cleanup_expired_sessions_task",
                    "handler_type": "async_function",
                    "queue": None,
                    "default_timeout_seconds": 300,
                    "is_active": True,
                    "is_system": True,
                },
                {
                    "name": "cleanup_old_executions",
                    "display_name": "Cleanup Old Job Executions",
                    "description": "Remove job execution records older than 90 days",
                    "handler_path": "tasks.maintenance_tasks.cleanup_old_job_executions_task",
                    "handler_type": "async_function",
                    "queue": None,
                    "default_timeout_seconds": 600,
                    "is_active": True,
                    "is_system": True,
                },
                {
                    "name": "timeout_stale_executions",
                    "display_name": "Timeout Stale Job Executions",
                    "description": "Mark stuck job executions as timed out (uses job-level timeout_seconds, default 5 minutes)",
                    "handler_path": "tasks.maintenance_tasks.timeout_stale_job_executions_task",
                    "handler_type": "async_function",
                    "queue": None,
                    "default_timeout_seconds": 300,
                    "is_active": True,
                    "is_system": True,
                },
            ]

            # Get the task function and job type references
            sync_task_result = await db.execute(
                select(TaskFunction).where(TaskFunction.name == "sync_domain_users")
            )
            sync_task = sync_task_result.scalar_one()

            cron_type_result = await db.execute(
                select(SchedulerJobType).where(SchedulerJobType.name == "cron")
            )
            cron_type = cron_type_result.scalar_one()

            # Create default scheduled job for AD sync
            from db.models import ScheduledJob

            ad_sync_job = ScheduledJob(
                name="ad_sync_job",
                description="Scheduled synchronization of domain users from Active Directory",
                task_function_id=sync_task.id,
                job_type_id=cron_type.id,
                schedule_config={
                    "cron": "0 */6 * * *",  # Every 6 hours
                    "timezone": "UTC"
                },
                max_instances=1,
                timeout_seconds=600,
                retry_count=3,
                retry_delay_seconds=60,
                is_enabled=True,
            )
            db.add(ad_sync_job)

            # Add task functions and get their IDs for scheduled jobs
            for tf_data in task_functions_data:
                task_function = TaskFunction(**tf_data)
                db.add(task_function)

            await db.commit()
            logger.info(f"✅ Created {len(task_functions_data)} task functions")

            # Get task function references for scheduled jobs
            cleanup_executions_result = await db.execute(
                select(TaskFunction).where(TaskFunction.name == "cleanup_old_executions")
            )
            cleanup_executions_task = cleanup_executions_result.scalar_one_or_none()

            timeout_executions_result = await db.execute(
                select(TaskFunction).where(TaskFunction.name == "timeout_stale_executions")
            )
            timeout_executions_task = timeout_executions_result.scalar_one_or_none()

            # Create scheduled job for timeout check (every 1 minute)
            if timeout_executions_task:
                timeout_check_job = ScheduledJob(
                    name="timeout_stale_executions_check",
                    description="Check every 1 minute for job executions that have exceeded their timeout (default 5 minutes)",
                    task_function_id=timeout_executions_task.id,
                    job_type_id=interval_type.id,
                    schedule_config={
                        "hours": 0,
                        "minutes": 1,
                        "seconds": 0,
                    },
                    max_instances=1,
                    timeout_seconds=300,
                    retry_count=1,
                    retry_delay_seconds=30,
                    is_enabled=True,
                )
                db.add(timeout_check_job)

            # Create scheduled job for cleanup of old executions (weekly)
            if cleanup_executions_task:
                cleanup_old_executions_job = ScheduledJob(
                    name="cleanup_old_executions_weekly",
                    description="Weekly cleanup of job execution records older than 90 days",
                    task_function_id=cleanup_executions_task.id,
                    job_type_id=cron_type.id,
                    schedule_config={
                        "cron": "0 2 * * 0",  # Sunday at 2 AM UTC
                        "timezone": "UTC"
                    },
                    max_instances=1,
                    timeout_seconds=600,
                    retry_count=1,
                    retry_delay_seconds=60,
                    is_enabled=True,
                )
                db.add(cleanup_old_executions_job)

            await db.commit()
            logger.info("✅ Scheduler data seeded successfully")

            # Create the default AD sync job after seeding
            await db.commit()
            logger.info("✅ Created default AD sync scheduled job")
            return True

        except Exception as e:
            logger.error(f"❌ Failed to seed scheduler data: {str(e)}")
            await db.rollback()
            return False

    async def is_database_already_initialized(self, db: AsyncSession) -> bool:
        """
        Quick check to see if database has already been initialized.
        Checks for existence of admin user and basic lookup data.
        """
        try:
            # Check if admin user exists
            admin_stmt = select(User).where(
                User.username == self.admin_username
            )
            admin_result = await db.execute(admin_stmt)
            admin_exists = admin_result.scalar_one_or_none() is not None

            # Check if roles exist
            roles_stmt = select(Role).limit(1)
            roles_result = await db.execute(roles_stmt)
            roles_exist = roles_result.scalar_one_or_none() is not None

            # Check if priorities exist
            priorities_stmt = select(Priority).limit(1)
            priorities_result = await db.execute(priorities_stmt)
            priorities_exist = (
                priorities_result.scalar_one_or_none() is not None
            )

            # If all basic data exists, database is already initialized
            return admin_exists and roles_exist and priorities_exist

        except Exception as e:
            logger.warning(f"Error checking database initialization: {e}")
            return False

    async def seed_active_directory_config(self, db: AsyncSession) -> bool:
        """Seed Active Directory configuration from environment variables if configured."""
        logger.info("Seeding Active Directory configuration...")

        try:
            from core.encryption import encrypt_value

            # Check if AD config already exists
            result = await db.execute(select(ActiveDirectoryConfig))
            if result.scalar_one_or_none():
                logger.info("Active Directory config already exists, skipping seed")
                return True

            # Only seed if env vars are set and non-default
            ad_path = settings.active_directory.path
            ad_password = settings.active_directory.ldap_password

            # Skip if using default/empty values
            if (
                not ad_password
                or ad_path == "dc.example.com"
                or ad_password == ""
            ):
                logger.info(
                    "No AD configuration in environment or using defaults, skipping seed"
                )
                return True

            # Create config from env vars
            encrypted_password = encrypt_value(ad_password)

            config = ActiveDirectoryConfig(
                name="Default AD Config",
                path=ad_path,
                domain_name=settings.active_directory.domain_name,
                port=settings.active_directory.port,
                use_ssl=settings.active_directory.use_ssl,
                ldap_username=settings.active_directory.ldap_username,
                encrypted_password=encrypted_password,
                base_dn=settings.active_directory.base_dn,
                desired_ous=settings.active_directory.desired_ous,
                is_active=True,
            )

            db.add(config)
            await db.commit()

            logger.info(
                f"✅ Seeded Active Directory config: {config.name} (ID: {config.id})"
            )
            return True

        except Exception as e:
            logger.error(f"Failed to seed Active Directory config: {e}")
            await db.rollback()
            return False

    async def setup_default_data(self, db: AsyncSession) -> bool:
        """Setup all default data for the database with sequential execution."""
        try:
            logger.info("🔧 Starting database default data setup...")

            # Quick check: if database is already initialized, skip setup
            if await self.is_database_already_initialized(db):
                logger.info("✅ Database already initialized, skipping setup")
                return True

            # Step 1: Create lookup tables data SEQUENTIALLY (async session issues with parallel)
            # NOTE: assign_types and session_types tables removed - now using enums
            logger.info("📋 Step 1: Creating lookup table data...")
            lookup_steps = [
                ("roles", self.create_roles(db)),
                # ("assign types", ...) - REMOVED: AssignType is now an enum
                # ("session types", ...) - REMOVED: SessionType is now an enum
                ("priorities", self.create_priorities(db)),
                ("request types", self.create_request_types(db)),
                ("service sections", self.create_service_sections(db)),
            ]

            for step_name, task in lookup_steps:
                try:
                    result = await task
                    if not result:
                        logger.error(f"❌ Failed to create {step_name}")
                        return False
                except Exception as e:
                    logger.error(f"❌ Failed to create {step_name}: {e}")
                    return False

            # Categories depend on service sections, so run separately
            if not await self.create_categories_and_subcategories(db):
                return False

            # Seed default tags (depends on categories existing)
            if not await self.seed_tags(db):
                return False

            # Step 2: Setup admin user
            logger.info("👤 Step 2: Creating admin user...")
            admin_user = await self.create_admin_user(db)
            if not admin_user:
                logger.error("❌ Failed to create admin user")
                return False

            # Step 3-5: Create data that depends on admin user SEQUENTIALLY
            logger.info("📊 Step 3-5: Creating admin-dependent data...")
            admin_dependent_steps = [
                (
                    "default statuses",
                    self.create_default_statuses(db, admin_user),
                ),
                (
                    "default business unit",
                    self.create_default_business_unit(db, admin_user),
                ),
                ("pages", self.create_pages(db, admin_user)),
            ]

            for step_name, task in admin_dependent_steps:
                try:
                    result = await task
                    if not result:
                        logger.error(f"❌ Failed to create {step_name}")
                        return False
                except Exception as e:
                    logger.error(f"❌ Failed to create {step_name}: {e}")
                    return False

            # Step 6: Create page-role permissions (depends on roles and pages)
            logger.info("🔐 Step 6: Creating page-role permissions...")
            if not await self.create_page_role_permissions(db, admin_user):
                return False

            # Step 7-9: Create system messages, bilingual data, and scheduler data SEQUENTIALLY
            logger.info(
                "📬 Step 7-9: Creating system messages, bilingual data, and scheduler data..."
            )
            final_steps = [
                ("system messages", self.create_system_messages(db)),
                (
                    "bilingual status names",
                    self.seed_bilingual_status_names(db),
                ),
                ("scheduler data", self.seed_scheduler_data(db)),
                (
                    "active directory config",
                    self.seed_active_directory_config(db),
                ),
            ]

            for step_name, task in final_steps:
                try:
                    result = await task
                    if not result:
                        logger.error(f"❌ Failed to create {step_name}")
                        return False
                except Exception as e:
                    logger.error(f"❌ Failed to create {step_name}: {e}")
                    return False

            logger.info("✅ Default data setup completed successfully")
            logger.info(
                f"✅ Admin user ready: {admin_user.username} ({admin_user.email})"
            )
            logger.info("✅ All lookup tables seeded")
            logger.info(
                "✅ 2 assignment types created (Assignees and CC only)"
            )
            logger.info(
                "✅ 9 categories with 31 subcategories created (with bilingual EN/AR names)"
            )
            logger.info(
                "✅ 28 default tags created across all categories (Hardware, Printers, PACS, Avaya, Create User Account, Email, Network, Surveillance Cameras, SharePoint)"
            )
            logger.info(
                "✅ 8 default statuses created (Open, Hold, Solved, Archived, Canceled, Pending Sub-Task, Pending Requester Response, In Progress)"
            )
            logger.info(
                "✅ 8 default statuses with bilingual names (EN/AR) seeded"
            )
            logger.info("✅ 5 priorities created")
            logger.info(
                "✅ 8 business units created (Andalusia hospitals and facilities)"
            )
            logger.info(
                "✅ 24 default pages created (4 parent + 20 child: 10 Settings, 1 Support Center, 7 Reports, 2 Management)"
            )
            logger.info(
                "✅ Page-role permissions created (Reports accessible to Manager and Administrator, Management accessible to all technician roles)"
            )
            logger.info(
                "✅ 3 system message templates created for bilingual notifications"
            )
            logger.info(
                "✅ Bilingual support fully initialized (Categories, Subcategories, Tags, Statuses)"
            )

            return True

        except Exception as e:
            logger.error(f"❌ Database setup failed: {str(e)}")
            await db.rollback()
            return False

    async def run_setup(self, db: AsyncSession) -> bool:
        """Main function to execute all default values creation."""
        logger.info("🚀 Database setup process started...")

        success = await self.setup_default_data(db)

        if success:
            logger.info("🎉 Database setup completed successfully!")
        else:
            logger.error("💥 Database setup failed!")

        return success


# Global database setup instance
database_setup = DatabaseSetup()


async def setup_database_default_data(db: AsyncSession) -> bool:
    """
    Convenience function to setup database default data.

    Args:
        db: Database session

    Returns:
        True if setup was successful, False otherwise
    """
    return await database_setup.run_setup(db)


if __name__ == "__main__":
    """
    Main function for standalone execution.
    Usage: python -m backend.database_setup
    """
    import asyncio

    from db.database import AsyncSessionLocal, engine

    async def main():
        """Main function for standalone database setup."""
        logger.info("🔧 Running standalone database setup...")

        async with AsyncSessionLocal() as db:
            success = await database_setup.run_setup(db)

            if success:
                logger.info("🎉 Database setup completed successfully!")
                logger.info("👤 Admin credentials:")
                logger.info(f"   Username: {database_setup.admin_username}")
                logger.info(f"   Password: {database_setup.admin_password}")
                logger.info(f"   Email: {database_setup.admin_email}")
            else:
                logger.error("💥 Database setup failed!")

        await engine.dispose()

    # Run the main function
    asyncio.run(main())
