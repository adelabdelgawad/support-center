/// <reference types="vite/client" />

/**
 * Tauri API type declarations
 */
declare global {
  interface Window {
    /**
     * Tauri API namespace
     * Available when running in Tauri desktop app
     */
    __TAURI__?: {
      invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
    };
  }
}

export {};
