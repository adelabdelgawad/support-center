//! Persistent storage module using tauri-plugin-store
//!
//! Provides a type-safe, persistent key-value storage layer that:
//! - Survives app restarts
//! - Works across dev and production environments
//! - Handles defaults gracefully
//! - Does NOT rely on .env at runtime (reads once on initialization)
//!
//! Storage keys are defined as constants to prevent typos and ensure consistency.

use tauri::AppHandle;
use tauri_plugin_store::StoreExt;
use serde_json::Value;
use std::sync::Arc;
use crate::debug_println;

// ============================================================================
// STORAGE KEYS (Centralized)
// ============================================================================
// All storage keys are defined here to prevent typos and ensure discoverability

/// Auth-related keys (PRIVATE - only accessed via auth-specific commands)
/// SECURITY (Finding #42): These keys are explicitly allowlisted for auth_storage_* commands
pub const KEY_ACCESS_TOKEN: &str = "access_token";
pub const KEY_REFRESH_TOKEN: &str = "refresh_token";
pub const KEY_USER: &str = "user";
pub const KEY_USER_INFO: &str = "user_info";
pub const KEY_SESSION_ID: &str = "session_id";

/// SECURITY (Finding #42): Allowlist of keys permitted for auth_storage_* commands
/// Any key not in this list will be rejected with a clear error message.
/// This prevents arbitrary storage access through auth commands.
pub const ALLOWED_AUTH_KEYS: &[&str] = &[
    KEY_ACCESS_TOKEN,
    KEY_REFRESH_TOKEN,
    KEY_USER,
    KEY_USER_INFO,
    KEY_SESSION_ID,
];

/// Configuration keys (PUBLIC - accessible via generic storage commands)
pub const KEY_THEME_PREFERENCE: &str = "theme_preference";
pub const KEY_FEATURE_FLAGS: &str = "feature_flags";

/// Auto-start related keys (for Windows login auto-start feature)
/// profile_setup_completed: true once user has completed initial setup/auth
/// autostart_configured: true once auto-start has been enabled in Windows Registry
pub const KEY_PROFILE_SETUP_COMPLETED: &str = "profile_setup_completed";
pub const KEY_AUTOSTART_CONFIGURED: &str = "autostart_configured";

// ============================================================================
// STORE SINGLETON
// ============================================================================
// Store filename for persistent storage
const STORE_FILENAME: &str = "store.bin";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/// Get or initialize the Tauri Store instance
///
/// # Arguments
/// * `app` - Tauri AppHandle
///
/// # Returns
/// * `Result<Arc<tauri_plugin_store::Store>, String>` - Store instance or error message
pub fn get_store(app: &AppHandle) -> Result<Arc<tauri_plugin_store::Store<tauri::Wry>>, String> {
    app.store(STORE_FILENAME)
        .map_err(|e| format!("Failed to get store: {}", e))
}

/// Get a value from the store
///
/// # Arguments
/// * `app` - Tauri AppHandle
/// * `key` - Storage key
///
/// # Returns
/// * `Result<Option<Value>, String>` - Value if exists, None if not found, or error message
pub fn get_value(app: &AppHandle, key: &str) -> Result<Option<Value>, String> {
    let store = get_store(app)?;

    match store.get(key) {
        Some(value) => Ok(Some(value.clone())),
        None => Ok(None)
    }
}

/// Set a value in the store and save immediately
///
/// # Arguments
/// * `app` - Tauri AppHandle
/// * `key` - Storage key
/// * `value` - JSON value to store
///
/// # Returns
/// * `Result<(), String>` - Success or error message
pub fn set_value(app: &AppHandle, key: &str, value: Value) -> Result<(), String> {
    let store = get_store(app)?;

    store.set(key.to_string(), value);

    // Save immediately to ensure persistence
    store.save().map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

/// Delete a value from the store
///
/// # Arguments
/// * `app` - Tauri AppHandle
/// * `key` - Storage key to delete
///
/// # Returns
/// * `Result<(), String>` - Success or error message
pub fn delete_value(app: &AppHandle, key: &str) -> Result<(), String> {
    let store = get_store(app)?;

    store.delete(key.to_string());

    // Save immediately
    store.save().map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

/// Check if a key exists in the store
///
/// # Arguments
/// * `app` - Tauri AppHandle
/// * `key` - Storage key to check
///
/// # Returns
/// * `Result<bool, String>` - True if exists, false otherwise
pub fn has_key(app: &AppHandle, key: &str) -> Result<bool, String> {
    let store = get_store(app)?;
    Ok(store.has(key))
}

/// Initialize the store with default values (only if keys don't exist)
/// This should be called once during app startup
///
/// # Arguments
/// * `app` - Tauri AppHandle
///
/// # Returns
/// * `Result<(), String>` - Success or error message
pub fn init_store_with_defaults(app: &AppHandle) -> Result<(), String> {
    let store = get_store(app)?;

    // Only initialize if theme preference doesn't exist (indicates first launch)
    if !store.has(KEY_THEME_PREFERENCE) {
        debug_println!("[Storage] First launch detected - initializing defaults");

        // NOTE: server_address (API_URL) is no longer stored here
        // RuntimeConfig now handles backend URL selection dynamically via network detection

        // Set default values
        store.set(KEY_THEME_PREFERENCE.to_string(), Value::String("system".to_string()));
        store.set(KEY_FEATURE_FLAGS.to_string(), Value::Object(serde_json::Map::new()));

        // Save defaults
        store.save().map_err(|e| format!("Failed to save default values: {}", e))?;

        debug_println!("[Storage] Defaults initialized:");
        debug_println!("  - theme_preference: system");
        debug_println!("  - feature_flags: {{}}");
        debug_println!("  - server_address: (dynamic via RuntimeConfig network detection)");
    } else {
        debug_println!("[Storage] Using existing stored configuration");
    }

    Ok(())
}

/// Migrate data from localStorage to Tauri Store
/// This is a one-time operation to help users transition from localStorage
///
/// # Arguments
/// * `app` - Tauri AppHandle
/// * `local_storage_data` - JSON object containing localStorage data from frontend
///
/// # Returns
/// * `Result<(), String>` - Success or error message
pub fn migrate_from_local_storage(app: &AppHandle, local_storage_data: Value) -> Result<(), String> {
    let store = get_store(app)?;

    if let Value::Object(data) = local_storage_data {
        let mut migrated_count = 0;

        for (key, value) in data {
            // Only migrate if the key doesn't already exist in store
            if !store.has(&key) {
                store.set(key.clone(), value);
                migrated_count += 1;
            }
        }

        if migrated_count > 0 {
            store.save().map_err(|e| format!("Failed to save migrated data: {}", e))?;
            debug_println!("[Storage] Migrated {} keys from localStorage", migrated_count);
        }

        Ok(())
    } else {
        Err("Invalid migration data format".to_string())
    }
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/// Validate that a key is allowed for generic storage access
/// Auth-related keys should only be accessed via auth-specific commands
fn is_allowed_key(key: &str) -> bool {
    // SECURITY (Finding #42): Block all keys in the auth allowlist from generic access
    !ALLOWED_AUTH_KEYS.contains(&key)
}

/// Get allowed key or return error
pub fn validate_key(key: &str) -> Result<(), String> {
    if is_allowed_key(key) {
        Ok(())
    } else {
        Err(format!("Access denied: '{}' is a protected auth key. Use auth-specific commands instead.", key))
    }
}

/// SECURITY (Finding #42): Validate that a key is allowed for auth storage access
/// Only keys in the explicit allowlist are permitted.
/// This prevents arbitrary storage access through auth commands.
pub fn validate_auth_key(key: &str) -> Result<(), String> {
    if ALLOWED_AUTH_KEYS.contains(&key) {
        Ok(())
    } else {
        Err(format!(
            "Access denied: '{}' is not a valid auth storage key. Allowed keys: {:?}",
            key,
            ALLOWED_AUTH_KEYS
        ))
    }
}
