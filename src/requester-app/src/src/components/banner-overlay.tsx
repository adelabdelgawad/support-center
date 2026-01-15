/**
 * Banner Overlay Container
 *
 * Renders Remote Support banners outside the main app layout using Portal.
 * This ensures banners are true overlays that don't affect document flow or layout.
 *
 * Banners are rendered directly to document.body, completely isolated from
 * the app's component tree and layout system.
 */

import { Portal } from 'solid-js/web';
import { Show } from 'solid-js';
import { useIsAuthenticated } from '@/stores';
import { IncomingRequestBanner } from './incoming-request-banner';
import { RemoteSessionBanner } from './remote-session-banner';

/**
 * BannerOverlay Component
 *
 * Uses Portal to mount banners outside the normal React tree.
 * This prevents any layout impact on the main application.
 */
export function BannerOverlay() {
  const isAuthenticated = useIsAuthenticated();

  return (
    <Portal mount={document.body}>
      <Show when={isAuthenticated()}>
        {/* Incoming Request Banner - z-index: 9999 */}
        <IncomingRequestBanner />

        {/* Remote Session Banner - z-index: 9998 */}
        <RemoteSessionBanner />
      </Show>
    </Portal>
  );
}

export default BannerOverlay;
