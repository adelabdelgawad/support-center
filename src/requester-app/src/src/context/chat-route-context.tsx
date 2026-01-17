/**
 * Chat Route Context
 *
 * Provides a single source of truth for whether the user is on the chat route.
 * This is used to gate message fetching and prevent chat data operations
 * from occurring on the tickets page.
 *
 * CRITICAL (fix-chat-navigation.md):
 * Chat message fetches and cache writes MUST NOT occur unless:
 * - The chat route is actively mounted
 * - isChatRoute() returns true
 *
 * This prevents the "over-fetching" issue where HTTP calls to /chat/messages
 * were triggered during tickets page lifecycle.
 */

import {
  createContext,
  useContext,
  createSignal,
  type ParentComponent,
  type Accessor,
} from "solid-js";

// Route values
type RouteIntent = "tickets" | "chat" | "other";

interface ChatRouteContextValue {
  /** Current route intent */
  routeIntent: Accessor<RouteIntent>;
  /** Whether we're currently on the chat route */
  isChatRoute: Accessor<boolean>;
  /** Set the current route intent (called by route components) */
  setRouteIntent: (intent: RouteIntent) => void;
}

const ChatRouteContext = createContext<ChatRouteContextValue>();

/**
 * Provider component for chat route context
 * Should be placed high in the component tree (e.g., in App.tsx)
 */
export const ChatRouteProvider: ParentComponent = (props) => {
  const [routeIntent, setRouteIntent] = createSignal<RouteIntent>("other");

  const isChatRoute = () => routeIntent() === "chat";

  const value: ChatRouteContextValue = {
    routeIntent,
    isChatRoute,
    setRouteIntent,
  };

  return (
    <ChatRouteContext.Provider value={value}>
      {props.children}
    </ChatRouteContext.Provider>
  );
};

/**
 * Hook to access the chat route context
 */
export function useChatRouteContext(): ChatRouteContextValue {
  const context = useContext(ChatRouteContext);

  if (!context) {
    // Return a default context for cases where provider is not mounted
    // This makes it safe to use in shared hooks without crashing
    console.warn("[ChatRouteContext] Context not found, using default (NOT on chat route)");
    return {
      routeIntent: () => "other",
      isChatRoute: () => false,
      setRouteIntent: () => {},
    };
  }

  return context;
}

/**
 * Global state for checking chat route from outside React context
 * This is used by API functions that don't have access to context
 */
let globalIsChatRoute = false;

export function setGlobalChatRouteState(isChatRoute: boolean): void {
  globalIsChatRoute = isChatRoute;
  console.log(`[ChatRouteContext] Global chat route state: ${isChatRoute ? "CHAT" : "NOT CHAT"}`);
}

export function getGlobalChatRouteState(): boolean {
  return globalIsChatRoute;
}

export default ChatRouteProvider;
