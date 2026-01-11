"use client";

import * as React from "react";
import {
  Settings,
  HeadphonesIcon,
  BarChart3,
  ShieldCheck,
  Users,
  Globe,
  Building2,
  Target,
  ClipboardList,
  Home,
  FileText,
  Mail,
  Phone,
  Calendar,
  Clock,
  Search,
  Filter,
  Download,
  Upload,
  Edit,
  Trash2,
  Plus,
  Minus,
  X,
  Check,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  MoreHorizontal,
  MoreVertical,
  AlertCircle,
  Info,
  HelpCircle,
  Star,
  Heart,
  HeartPulse,
  Bookmark,
  Share2,
  Send,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Key,
  UserCircle,
  LogOut,
  LogIn,
  Menu,
  Bell,
  MessageSquare,
  LucideIcon,
} from "lucide-react";

// Icon mapping from string names to lucide-react components
const iconMap: Record<string, LucideIcon> = {
  // Settings & Admin
  settings: Settings,
  settings_applications: Settings,
  admin_panel_settings: ShieldCheck,

  // Support & Communication
  support: HeadphonesIcon,
  headphones: HeadphonesIcon,
  message: MessageSquare,
  mail: Mail,
  phone: Phone,
  send: Send,

  // Analytics & Charts
  bar_chart: BarChart3,
  chart: BarChart3,
  analytics: BarChart3,

  // Users & Groups
  group: Users,
  users: Users,
  user: UserCircle,
  user_circle: UserCircle,

  // Location & Organization
  public: Globe,
  globe: Globe,
  business: Building2,
  building: Building2,

  // Tracking & Progress
  track_changes: Target,
  target: Target,

  // Documents & Tasks
  assignment: ClipboardList,
  clipboard: ClipboardList,
  file: FileText,
  document: FileText,

  // Navigation
  home: Home,
  menu: Menu,

  // Time
  calendar: Calendar,
  clock: Clock,

  // Actions
  search: Search,
  filter: Filter,
  download: Download,
  upload: Upload,
  edit: Edit,
  trash: Trash2,
  delete: Trash2,
  plus: Plus,
  add: Plus,
  minus: Minus,
  close: X,
  check: Check,

  // Chevrons
  chevron_right: ChevronRight,
  chevron_left: ChevronLeft,
  chevron_up: ChevronUp,
  chevron_down: ChevronDown,

  // More
  more_horizontal: MoreHorizontal,
  more_vertical: MoreVertical,
  more: MoreHorizontal,

  // Alerts & Info
  alert: AlertCircle,
  info: Info,
  help: HelpCircle,
  question: HelpCircle,

  // Favorites & Social
  star: Star,
  favorite: Star,
  heart: Heart,
  heart_pulse: HeartPulse,
  monitor_heart: HeartPulse,
  bookmark: Bookmark,
  share: Share2,

  // Visibility
  eye: Eye,
  eye_off: EyeOff,
  visible: Eye,
  hidden: EyeOff,

  // Security
  lock: Lock,
  unlock: Unlock,
  key: Key,

  // Auth
  logout: LogOut,
  login: LogIn,

  // Notifications
  bell: Bell,
  notification: Bell,
};

interface DynamicIconProps {
  name: string | null;
  className?: string;
  size?: number;
}

export function DynamicIcon({ name, className, size }: DynamicIconProps) {
  if (!name) {
    return null;
  }

  // Convert name to lowercase and replace spaces/dashes with underscores
  const normalizedName = name.toLowerCase().replace(/[\s-]/g, "_");

  const IconComponent = iconMap[normalizedName];

  if (!IconComponent) {
    // Return a default icon or null if not found
    console.warn(`Icon "${name}" not found in icon map`);
    return <HelpCircle className={className} size={size} />;
  }

  return <IconComponent className={className} size={size} />;
}

export { iconMap };
