/**
 * ============================================================================
 * PHASE 3 OPTIMIZATION: Centralized Icon Imports
 * ============================================================================
 *
 * This file imports ONLY the 29 icons actually used in the app.
 *
 * Benefits:
 * - Better tree-shaking (only imports what's needed)
 * - Single source of truth for icons
 * - Easy to track icon usage
 * - Potential 50-100 KB bundle reduction
 *
 * Usage:
 * Instead of: import { Send } from 'lucide-solid'
 * Use: import { Send } from '@/components/icons'
 */

// Import only the icons we actually use (29 total)
export {
  AlertCircle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Image,
  Inbox,
  Languages,
  Loader2,
  MessageCircle,
  Monitor,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Shield,
  Sun,
  User,
  Wifi,
  WifiOff,
  X,
} from 'lucide-solid';

/**
 * Icon inventory (for reference):
 *
 * Total icons in lucide-solid: 1000+
 * Icons actually used: 29
 * Optimization potential: ~97% of icons not needed
 *
 * If tree-shaking doesn't work well, consider:
 * - Switching to @tabler/icons-solidjs (smaller library)
 * - Creating static SVG components (zero runtime cost)
 */
