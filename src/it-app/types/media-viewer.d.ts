/**
 * Type definitions for media viewer component
 * WhatsApp-style inline media viewer for chat screenshots
 */

export interface ScreenshotItem {
  /** Unique message ID */
  id: string;
  /** Screenshot filename for API requests */
  filename: string;
  /** Full URL for display (/api/screenshots/by-filename/...) */
  url: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Sender information */
  sender: {
    /** Full name or username */
    name: string;
    /** Initials for badge display */
    initials: string;
  };
  /** Optional message text (if not default "Screenshot") */
  messageContent?: string;
  /** Sequence number for ordering */
  sequenceNumber: number;
}

export interface MediaViewerProps {
  /** Array of all screenshots from conversation */
  screenshots: ScreenshotItem[];
  /** Initial index to display */
  initialIndex: number;
  /** Whether viewer is open */
  isOpen: boolean;
  /** Handler to close viewer */
  onClose: () => void;
  /** Handler for prev/next navigation */
  onNavigate: (direction: 'next' | 'prev') => void;
  /** Handler to change current index */
  onIndexChange: (index: number) => void;
}

export interface MediaViewerThumbnailProps {
  /** Screenshot item to display */
  screenshot: ScreenshotItem;
  /** Whether this thumbnail is currently active */
  isActive: boolean;
  /** Click handler to navigate to this screenshot */
  onClick: () => void;
}
