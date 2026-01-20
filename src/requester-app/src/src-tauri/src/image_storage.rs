// ============================================================================
// Image Filesystem Storage Module
// ============================================================================
//
// Provides filesystem-based image storage for the image cache.
// Images are stored in %APPDATA%/supportcenter.requester/images/
//
// This module handles:
// - Writing image bytes to filesystem
// - Reading image bytes from filesystem
// - Deleting images
// - Migrating legacy base64 images from SQLite
// - Validating image file existence
// ============================================================================

use tauri::{AppHandle, Manager};
use tokio::fs;
use tokio::io::AsyncWriteExt;
use std::path::PathBuf;
use base64::{Engine as _, engine::general_purpose};
use crate::debug_eprintln;

/// Get the images directory path
/// Creates the directory if it doesn't exist
async fn get_images_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let images_dir = app_data_dir.join("images");

    // Ensure directory exists
    if !images_dir.exists() {
        fs::create_dir_all(&images_dir).await
            .map_err(|e| format!("Failed to create images directory: {}", e))?;
    }

    Ok(images_dir)
}

/// Generate a safe filename from the image key
/// Removes or replaces characters that are problematic for filesystems
fn sanitize_filename(filename: &str) -> String {
    filename
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect()
}

/// Write image bytes to filesystem
/// Returns the relative file path (just the filename)
#[tauri::command]
pub async fn image_storage_write(
    app: AppHandle,
    filename: String,
    base64_data: String,
) -> Result<String, String> {
    let images_dir = get_images_dir(&app).await?;
    let safe_filename = sanitize_filename(&filename);
    let file_path = images_dir.join(&safe_filename);

    // Decode base64 data
    let bytes = general_purpose::STANDARD.decode(&base64_data)
        .map_err(|e| format!("Failed to decode base64 data: {}", e))?;

    // Write to file
    let mut file = fs::File::create(&file_path).await
        .map_err(|e| format!("Failed to create image file: {}", e))?;

    file.write_all(&bytes).await
        .map_err(|e| format!("Failed to write image data: {}", e))?;

    file.sync_all().await
        .map_err(|e| format!("Failed to sync image file: {}", e))?;

    debug_eprintln!("[image_storage] Wrote {} bytes to {:?}", bytes.len(), file_path);

    Ok(safe_filename)
}

/// Read image bytes from filesystem
/// Returns base64-encoded data and mime type
#[tauri::command]
pub async fn image_storage_read(
    app: AppHandle,
    filename: String,
) -> Result<ImageReadResult, String> {
    let images_dir = get_images_dir(&app).await?;
    let safe_filename = sanitize_filename(&filename);
    let file_path = images_dir.join(&safe_filename);

    // Check if file exists
    if !file_path.exists() {
        return Err("Image file not found".to_string());
    }

    // Read file bytes
    let bytes = fs::read(&file_path).await
        .map_err(|e| format!("Failed to read image file: {}", e))?;

    // Determine mime type from extension
    let mime_type = guess_mime_type(&safe_filename);

    // Encode to base64
    let base64_data = general_purpose::STANDARD.encode(&bytes);

    Ok(ImageReadResult {
        base64_data,
        mime_type,
        size_bytes: bytes.len() as u64,
    })
}

/// Result of reading an image from filesystem
#[derive(serde::Serialize)]
pub struct ImageReadResult {
    pub base64_data: String,
    pub mime_type: String,
    pub size_bytes: u64,
}

/// Check if an image file exists
#[tauri::command]
pub async fn image_storage_exists(
    app: AppHandle,
    filename: String,
) -> Result<bool, String> {
    let images_dir = get_images_dir(&app).await?;
    let safe_filename = sanitize_filename(&filename);
    let file_path = images_dir.join(&safe_filename);

    Ok(file_path.exists())
}

/// Delete an image file
#[tauri::command]
pub async fn image_storage_delete(
    app: AppHandle,
    filename: String,
) -> Result<(), String> {
    let images_dir = get_images_dir(&app).await?;
    let safe_filename = sanitize_filename(&filename);
    let file_path = images_dir.join(&safe_filename);

    if file_path.exists() {
        fs::remove_file(&file_path).await
            .map_err(|e| format!("Failed to delete image file: {}", e))?;
        debug_eprintln!("[image_storage] Deleted {:?}", file_path);
    }

    Ok(())
}

/// Delete all images in the cache directory
#[tauri::command]
pub async fn image_storage_clear_all(app: AppHandle) -> Result<u32, String> {
    let images_dir = get_images_dir(&app).await?;

    let mut entries = fs::read_dir(&images_dir).await
        .map_err(|e| format!("Failed to read images directory: {}", e))?;

    let mut count = 0u32;

    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        if path.is_file() {
            if let Err(_e) = fs::remove_file(&path).await {
                debug_eprintln!("[image_storage] Warning: Failed to delete {:?}: {}", path, _e);
            } else {
                count += 1;
            }
        }
    }

    debug_eprintln!("[image_storage] Cleared {} images from cache", count);
    Ok(count)
}

/// Get the total size of cached images in bytes
#[tauri::command]
pub async fn image_storage_get_size(app: AppHandle) -> Result<u64, String> {
    let images_dir = get_images_dir(&app).await?;

    let mut entries = fs::read_dir(&images_dir).await
        .map_err(|e| format!("Failed to read images directory: {}", e))?;

    let mut total_size = 0u64;

    while let Ok(Some(entry)) = entries.next_entry().await {
        if let Ok(metadata) = entry.metadata().await {
            if metadata.is_file() {
                total_size += metadata.len();
            }
        }
    }

    Ok(total_size)
}

/// Get the images directory path (for debugging)
#[tauri::command]
pub async fn image_storage_get_directory(app: AppHandle) -> Result<String, String> {
    let images_dir = get_images_dir(&app).await?;
    Ok(images_dir.to_string_lossy().to_string())
}

/// Guess MIME type from filename extension
fn guess_mime_type(filename: &str) -> String {
    let ext = filename.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg".to_string(),
        "png" => "image/png".to_string(),
        "gif" => "image/gif".to_string(),
        "webp" => "image/webp".to_string(),
        "bmp" => "image/bmp".to_string(),
        "ico" => "image/x-icon".to_string(),
        "svg" => "image/svg+xml".to_string(),
        _ => "image/png".to_string(), // Default to PNG
    }
}
