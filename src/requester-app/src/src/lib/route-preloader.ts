/**
 * Route Preloader
 *
 * Preloads lazy-loaded route chunks on hover for instant navigation.
 * The browser caches the chunks, so when the user clicks, the route loads instantly.
 */

// Track which routes have been preloaded to avoid duplicate imports
const preloadedRoutes = new Set<string>();

/**
 * Preload a route chunk by its name.
 * Safe to call multiple times - only loads once.
 */
export function preloadRoute(route: 'tickets' | 'ticket-chat' | 'settings' | 'sso'): void {
  if (preloadedRoutes.has(route)) {
    return; // Already preloaded
  }

  preloadedRoutes.add(route);

  // Dynamic imports match the lazy() calls in index.tsx
  // The browser will cache these chunks
  switch (route) {
    case 'tickets':
      import('@/routes/tickets').catch(() => {
        preloadedRoutes.delete(route); // Allow retry on failure
      });
      break;
    case 'ticket-chat':
      import('@/routes/ticket-chat').catch(() => {
        preloadedRoutes.delete(route);
      });
      break;
    case 'settings':
      import('@/routes/settings').catch(() => {
        preloadedRoutes.delete(route);
      });
      break;
    case 'sso':
      import('@/routes/sso').catch(() => {
        preloadedRoutes.delete(route);
      });
      break;
  }
}

/**
 * Preload the chat route - commonly used from ticket list
 */
export function preloadChatRoute(): void {
  preloadRoute('ticket-chat');
}

/**
 * Preload the tickets route - commonly used from chat or settings
 */
export function preloadTicketsRoute(): void {
  preloadRoute('tickets');
}
