/**
 * Language Context Provider - Dual Language Support (English/Arabic)
 *
 * Provides app-wide language switching between English and Arabic.
 * Supports:
 * - Language toggle
 * - Persistent language preference in localStorage
 * - RTL/LTR direction switching
 *
 * Usage:
 * 1. Wrap your app with <LanguageProvider>
 * 2. Use the useLanguage() hook in components
 * 3. Call toggleLanguage() or setLanguage(lang)
 */

import {
  createContext,
  useContext,
  createSignal,
  createEffect,
  type ParentComponent,
  type Accessor,
} from "solid-js";

export type Language = "en" | "ar";
export type Direction = "ltr" | "rtl";

interface LanguageContextValue {
  /** Current language */
  language: Accessor<Language>;
  /** Text direction based on language */
  direction: Accessor<Direction>;
  /** Set language explicitly */
  setLanguage: (lang: Language) => void;
  /** Toggle between English and Arabic */
  toggleLanguage: () => void;
  /** Get translated text */
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>();

const STORAGE_KEY = "app-language";

// Translation dictionary
const translations: Record<Language, Record<string, string>> = {
  en: {
    // New Request Modal
    "modal.title": "Need Help?",
    "modal.subtitle": "We're here to assist you",
    "modal.greeting": "Hi there! Tell us what you need help with, and we'll connect you with a technician right away.",
    "modal.description": "Request Title",
    "modal.descriptionPlaceholder": "e.g., My laptop won't connect to WiFi...",
    "modal.titlePlaceholder": "e.g., My laptop won't connect to WiFi...",
    "modal.classification": "Request Classification",
    "modal.classificationPlaceholder": "Select service type",
    "modal.cancel": "Maybe Later",
    "modal.submit": "Start Chat",
    "modal.submitting": "Connecting...",
    "modal.success": "Request sent! 🎉",
    "modal.tip": "Pro tip:",
    "modal.tipText": "The more details you share, the faster we can help you! You'll be able to add more info in the chat.",
    "modal.errorShort": "Please tell us a bit more (at least 5 characters)",
    "modal.errorLong": "Please keep it under 200 characters",
    "modal.errorRequired": "Please select a service type",

    // Filter Bar
    "filter.status": "Status",
    "filter.messages": "Messages",
    "filter.all": "All",
    "filter.unread": "Unread",

    // Chat Page
    "chat.support": "Support",
    "chat.supportAgent": "Support Agent",
    "chat.administrator": "Administrator",
    "chat.requester": "Requester",
    "chat.connected": "Connected",
    "chat.disconnected": "Disconnected",
    "chat.emptyState": "No messages yet",
    "chat.emptyStateDesc": "Start the conversation below",
    "chat.resolved": "This request has been resolved. No further messages can be sent.",
    "chat.inputPlaceholder": "Type your message...",
    "chat.send": "Send",
    "chat.connectionError": "Connection lost. Please refresh the page.",
    "chat.scrollToBottom": "Scroll to bottom",
    "chat.newMessage": "new",
    "chat.newMessages": "new",

    // Chat Layout
    "layout.itSupport": "IT Support",
    "layout.settings": "Settings",
    "layout.supportChat": "Support Chat",
    "layout.searchPlaceholder": "Search conversations...",

    // Settings
    "settings.title": "Settings",
    "settings.save": "Save Changes",
    "settings.cancel": "Cancel",
    "settings.account": "Account Information",
    "settings.username": "Username",
    "settings.fullName": "Full Name",
    "settings.email": "Email",
    "settings.notifications": "Notification Settings",
    "settings.notificationsEnabled": "Enable Notifications",
    "settings.notificationsEnabledDesc": "Allow the app to show desktop notifications",
    "settings.sound": "Notification Sound",
    "settings.soundDesc": "Play sound when new messages arrive",
    "settings.volume": "Notification Volume",
    "settings.saving": "Saving...",
    "settings.saved": "Settings saved successfully!",
    "settings.failed": "Failed to save settings",
    "settings.note": "Note",
    "settings.noteDesc": "These settings are stored locally on your device. Changes take effect immediately for new notifications.",
    "settings.language": "Language Preferences",
    "settings.switchArabic": "Switch to Arabic (العربية)",
    "settings.switchEnglish": "Switch to English",
    "settings.version": "IT Support Center v1.0.0",
    "settings.theme": "Theme",
    "settings.themeDesc": "Choose your preferred color theme",

    // Theme
    "theme.light": "Light",
    "theme.dark": "Dark",
    "theme.system": "System",
    "theme.systemDesc": "Follow system preference",

    // Confirmation Dialogs
    "confirm.saveTitle": "Save Changes?",
    "confirm.saveMessage": "Are you sure you want to save these changes?",
    "confirm.save": "Save",
    "confirm.discardTitle": "Discard Changes?",
    "confirm.discardMessage": "You have unsaved changes. Do you want to discard them?",
    "confirm.discard": "Discard",
    "confirm.keepEditing": "Keep Editing",
    "confirm.changedSettings": "Changed Settings:",

    // Notifications
    "notif.newMessage": "New message notifications",
    "notif.statusUpdate": "Status update notifications",

    // General
    "general.loading": "Loading...",
    "general.error": "An error occurred",
    "general.optional": "Optional",
    "general.required": "Required",
    "general.you": "You",
    "general.unknown": "Unknown",

    // Search
    "search.placeholder": "Search conversations...",
    "search.label": "Search tickets",
    "search.clear": "Clear search",
    "search.noResults": "No results found",
    "search.noResultsDesc": "Try a different search term",
    "search.matchInSubject": "Match in title",
    "search.matchInMessage": "Match in message",
  },
  ar: {
    // New Request Modal
    "modal.title": "تحتاج مساعدة؟",
    "modal.subtitle": "نحن هنا لمساعدتك",
    "modal.greeting": "مرحباً! أخبرنا بما تحتاج مساعدة فيه، وسنقوم بتوصيلك بفني على الفور.",
    "modal.description": "عنوان الطلب",
    "modal.descriptionPlaceholder": "مثال: اللابتوب لا يتصل بالواي فاي...",
    "modal.titlePlaceholder": "مثال: اللابتوب لا يتصل بالواي فاي...",
    "modal.classification": "تصنيف الطلب",
    "modal.classificationPlaceholder": "اختر نوع الخدمة",
    "modal.cancel": "الغاء",
    "modal.submit": "بدء المحادثة",
    "modal.submitting": "جارِ الاتصال...",
    "modal.success": "تم إرسال الطلب! 🎉",
    "modal.tip": "نصيحة:",
    "modal.tipText": "كلما شاركت تفاصيل أكثر، كلما تمكنا من مساعدتك بشكل أسرع! ستتمكن من إضافة المزيد من المعلومات في المحادثة.",
    "modal.errorShort": "يرجى إخبارنا بالمزيد (5 أحرف على الأقل)",
    "modal.errorLong": "يرجى الاختصار إلى أقل من 200 حرف",
    "modal.errorRequired": "يرجى اختيار نوع الخدمة",

    // Filter Bar
    "filter.status": "الحالة",
    "filter.messages": "الرسائل",
    "filter.all": "الكل",
    "filter.unread": "غير مقروءة",

    // Chat Page
    "chat.support": "الدعم",
    "chat.supportAgent": "وكيل الدعم",
    "chat.administrator": "المسؤول",
    "chat.requester": "المستخدم",
    "chat.connected": "متصل",
    "chat.disconnected": "غير متصل",
    "chat.emptyState": "لا توجد رسائل بعد",
    "chat.emptyStateDesc": "ابدأ المحادثة أدناه",
    "chat.resolved": "تم حل هذا الطلب. لا يمكن إرسال المزيد من الرسائل.",
    "chat.inputPlaceholder": "اكتب رسالتك...",
    "chat.send": "إرسال",
    "chat.connectionError": "تم فقدان الاتصال. يرجى تحديث الصفحة.",
    "chat.scrollToBottom": "انتقل للأسفل",
    "chat.newMessage": "جديد",
    "chat.newMessages": "جديد",

    // Chat Layout
    "layout.itSupport": "الدعم الفني",
    "layout.settings": "الإعدادات",
    "layout.supportChat": "محادثة الدعم",
    "layout.searchPlaceholder": "البحث في المحادثات...",

    // Settings
    "settings.title": "الإعدادات",
    "settings.save": "حفظ التغييرات",
    "settings.cancel": "إلغاء",
    "settings.account": "معلومات الحساب",
    "settings.username": "اسم المستخدم",
    "settings.fullName": "الاسم الكامل",
    "settings.email": "البريد الإلكتروني",
    "settings.notifications": "إعدادات الإشعارات",
    "settings.notificationsEnabled": "تفعيل الإشعارات",
    "settings.notificationsEnabledDesc": "السماح للتطبيق بإظهار إشعارات سطح المكتب",
    "settings.sound": "صوت الإشعارات",
    "settings.soundDesc": "تشغيل صوت عند وصول رسائل جديدة",
    "settings.volume": "مستوى الصوت",
    "settings.saving": "جارِ الحفظ...",
    "settings.saved": "تم حفظ الإعدادات بنجاح!",
    "settings.failed": "فشل حفظ الإعدادات",
    "settings.note": "ملاحظة",
    "settings.noteDesc": "يتم تخزين هذه الإعدادات محلياً على جهازك. سيتم تطبيق التغييرات فوراً على الإشعارات الجديدة.",
    "settings.language": "تفضيلات اللغة",
    "settings.switchArabic": "التبديل إلى العربية",
    "settings.switchEnglish": "التبديل إلى الإنجليزية",
    "settings.version": "تطبيق دعم تكنولوجيا المعلومات v1.0.0",
    "settings.theme": "المظهر",
    "settings.themeDesc": "اختر المظهر المفضل لديك",

    // Theme
    "theme.light": "فاتح",
    "theme.dark": "داكن",
    "theme.system": "النظام",
    "theme.systemDesc": "اتبع إعدادات النظام",

    // Confirmation Dialogs
    "confirm.saveTitle": "حفظ التغييرات؟",
    "confirm.saveMessage": "هل أنت متأكد من حفظ هذه التغييرات؟",
    "confirm.save": "حفظ",
    "confirm.discardTitle": "تجاهل التغييرات؟",
    "confirm.discardMessage": "لديك تغييرات غير محفوظة. هل تريد تجاهلها؟",
    "confirm.discard": "تجاهل",
    "confirm.keepEditing": "متابعة التعديل",
    "confirm.changedSettings": "الإعدادات المتغيرة:",

    // Notifications
    "notif.newMessage": "إشعارات الرسائل الجديدة",
    "notif.statusUpdate": "إشعارات تحديث الحالة",

    // General
    "general.loading": "جارِ التحميل...",
    "general.error": "حدث خطأ",
    "general.optional": "اختياري",
    "general.required": "مطلوب",
    "general.you": "أنت",
    "general.unknown": "غير معروف",

    // Search
    "search.placeholder": "البحث في المحادثات...",
    "search.label": "البحث في التذاكر",
    "search.clear": "مسح البحث",
    "search.noResults": "لم يتم العثور على نتائج",
    "search.noResultsDesc": "جرب كلمة بحث مختلفة",
    "search.matchInSubject": "تطابق في العنوان",
    "search.matchInMessage": "تطابق في الرسالة",
  },
};

export const LanguageProvider: ParentComponent = (props) => {
  // Initialize from localStorage or default to English
  const storedLang = localStorage.getItem(STORAGE_KEY) as Language | null;
  const [language, setLanguageSignal] = createSignal<Language>(
    storedLang === "ar" ? "ar" : "en"
  );

  // Compute direction based on language
  const direction = (): Direction => (language() === "ar" ? "rtl" : "ltr");

  /**
   * Set language and persist to localStorage
   */
  const setLanguage = (lang: Language) => {
    setLanguageSignal(lang);
    localStorage.setItem(STORAGE_KEY, lang);
  };

  /**
   * Toggle between English and Arabic
   */
  const toggleLanguage = () => {
    const newLang = language() === "en" ? "ar" : "en";
    setLanguage(newLang);
  };

  /**
   * Get translated text for a key
   * Falls back to English if key not found
   */
  const t = (key: string): string => {
    const currentLang = language();
    return translations[currentLang][key] || translations.en[key] || key;
  };

  // Update document direction and lang attribute
  createEffect(() => {
    const lang = language();
    const dir = direction();
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", dir);
  });

  const value: LanguageContextValue = {
    language,
    direction,
    setLanguage,
    toggleLanguage,
    t,
  };

  return (
    <LanguageContext.Provider value={value}>
      {props.children}
    </LanguageContext.Provider>
  );
};

/**
 * Hook to access language context
 * @throws Error if used outside LanguageProvider
 */
export const useLanguage = (): LanguageContextValue => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
