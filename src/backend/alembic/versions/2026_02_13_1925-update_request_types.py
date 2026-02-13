"""update default request types with new bilingual names and descriptions

Revision ID: h3i4j5k6l7m1
Revises: f1a2b3c4d5e9
Create Date: 2026-02-13 19:25:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "h3i4j5k6l7m1"
down_revision: Union[str, None] = "f1a2b3c4d5e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Update request type 1: Application Support (Dotcare)
    op.execute("""
        UPDATE request_types
        SET name_en = 'Application Support (Dotcare)',
            name_ar = 'دعم التطبيقات (دوت كير)',
            brief_en = 'Support services responsible for maintaining, troubleshooting, and resolving issues related to Dotcare application to ensure continuous and efficient operation.',
            brief_ar = 'خدمات دعم مسؤولة عن صيانة تطبيق دوت كير واستكشاف الأخطاء وإصلاحها وحل المشكلات لضمان التشغيل المستمر والفعّال للتطبيق'
        WHERE id = 1
    """)

    # Update request type 2: Technical Support (Windows)
    op.execute("""
        UPDATE request_types
        SET name_en = 'Technical Support (Windows)',
            name_ar = 'الدعم الفني (ويندوز)',
            brief_en = 'Technical assistance provided to diagnose, troubleshoot, and resolve issues related to Windows operating systems, devices, and software.',
            brief_ar = 'مساعدة فنية تُقدَّم لتشخيص المشكلات واستكشاف الأخطاء وإصلاحها المتعلقة بأنظمة تشغيل ويندوز والأجهزة والبرامج المرتبطة بها'
        WHERE id = 2
    """)

    # Update request type 3: Internet Support (Infrastructure)
    op.execute("""
        UPDATE request_types
        SET name_en = 'Internet Support (Infrastructure)',
            name_ar = 'دعم الإنترنت (البنية التحتية)',
            brief_en = 'Support services focused on maintaining, monitoring, and resolving issues related to network connectivity and internet infrastructure to ensure reliable access.',
            brief_ar = 'خدمات دعم تركز على صيانة ومراقبة وحل المشكلات المتعلقة بالاتصال الشبكي وبنية الإنترنت التحتية لضمان توفر اتصال موثوق'
        WHERE id = 3
    """)

    # Delete request types 4 and 5 (Change Request, Access Request)
    op.execute("DELETE FROM request_types WHERE id IN (4, 5)")


def downgrade() -> None:
    # Revert request type 1 to original values
    op.execute("""
        UPDATE request_types
        SET name_en = 'Incident',
            name_ar = 'حادث',
            brief_en = 'An unplanned interruption or reduction in quality of an IT service',
            brief_ar = 'انقطاع أو تراجع غير مخطط له في جودة خدمة تقنية المعلومات'
        WHERE id = 1
    """)

    # Revert request type 2 to original values
    op.execute("""
        UPDATE request_types
        SET name_en = 'Service Request',
            name_ar = 'طلب خدمة',
            brief_en = 'A formal request from a user for something to be provided or done',
            brief_ar = 'طلب رسمي من المستخدم لتقديم أو تنفيذ شيء ما'
        WHERE id = 2
    """)

    # Revert request type 3 to original values
    op.execute("""
        UPDATE request_types
        SET name_en = 'Problem',
            name_ar = 'مشكلة',
            brief_en = 'A cause of one or more incidents, requiring investigation',
            brief_ar = 'سبب لحادث واحد أو أكثر، يتطلب تحقيقاً'
        WHERE id = 3
    """)

    # Restore request types 4 and 5 (Change Request, Access Request)
    op.execute("""
        INSERT INTO request_types (id, name_en, name_ar, brief_en, brief_ar, is_active, created_at)
        VALUES
            (4, 'Change Request', 'طلب تغيير', 'A request for modification to IT infrastructure or services', 'طلب لتعديل البنية التحتية أو الخدمات التقنية', true, CURRENT_TIMESTAMP),
            (5, 'Access Request', 'طلب وصول', 'A request for access to systems, applications, or resources', 'طلب للوصول إلى الأنظمة أو التطبيقات أو الموارد', true, CURRENT_TIMESTAMP)
    """)
