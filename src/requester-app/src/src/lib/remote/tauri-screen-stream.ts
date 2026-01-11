/**
 * Tauri Screen Stream
 *
 * Creates a MediaStream from Tauri screen captures, bypassing the browser's
 * getDisplayMedia picker. This allows using our custom screen picker.
 */

import { invoke } from "@tauri-apps/api/core";

/**
 * Resolution profiles for different network conditions
 * - standard: 960x540 @ quality 95 - balanced for most networks
 * - extreme: 1920x1080 @ quality 97 - optimal for local network (best visual quality)
 */
export type ResolutionProfile = "standard" | "extreme";

export interface ResolutionConfig {
  width: number;
  height: number;
  captureCommand: string;
  description: string;
}

export const RESOLUTION_PROFILES: Record<ResolutionProfile, ResolutionConfig> = {
  standard: {
    width: 960,
    height: 540,
    captureCommand: "capture_monitor_stream",
    description: "Standard (960x540) - Balanced quality/bandwidth",
  },
  extreme: {
    width: 1920,
    height: 1080,
    captureCommand: "capture_monitor_stream_extreme",
    description: "Extreme (1920x1080) - Best quality for local network",
  },
};

interface TauriScreenStreamOptions {
  monitorId: number;
  frameRate?: number;
  width?: number;
  height?: number;
  profile?: ResolutionProfile;
}

/**
 * Creates a MediaStream from Tauri screen captures
 * Uses canvas to convert captured images to video frames
 * @param options - Stream options including resolution profile
 */
export async function createTauriScreenStream(
  options: TauriScreenStreamOptions
): Promise<MediaStream> {
  const { monitorId, frameRate = 15, profile = "standard" } = options;

  // Get resolution config from profile (or use custom width/height if provided)
  const profileConfig = RESOLUTION_PROFILES[profile];
  const width = options.width ?? profileConfig.width;
  const height = options.height ?? profileConfig.height;
  const captureCommand = profileConfig.captureCommand;

  console.log("[TauriScreenStream] ========================================");
  console.log("[TauriScreenStream] Creating screen capture stream");
  console.log("[TauriScreenStream] Monitor ID:", monitorId);
  console.log("[TauriScreenStream] Profile:", profile, `(${profileConfig.description})`);
  console.log("[TauriScreenStream] Target resolution:", width, "x", height);
  console.log("[TauriScreenStream] Target frame rate:", frameRate, "fps");
  console.log("[TauriScreenStream] Capture command:", captureCommand);
  console.log("[TauriScreenStream] ========================================");

  // Create canvas for rendering frames
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Failed to create canvas context");
  }

  // Create a MediaStream from the canvas
  const stream = canvas.captureStream(frameRate);
  const videoTrack = stream.getVideoTracks()[0];

  // Track state
  let isCapturing = true;
  let isCapturePending = false; // Prevent overlapping captures

  // Image for loading captures
  const img = new Image();

  // Capture stats for debugging
  let frameCount = 0;
  let lastStatsTime = performance.now();
  let captureErrors = 0;
  let totalCaptureTime = 0;

  // Capture loop - adaptive, captures as fast as possible
  async function captureLoop() {
    if (!isCapturing) return;

    // Prevent overlapping captures (if previous capture is still in progress)
    if (isCapturePending) {
      requestAnimationFrame(captureLoop);
      return;
    }

    isCapturePending = true;
    const now = performance.now();

    try {
      // Capture screen using Tauri (resolution based on profile)
      const captureStart = performance.now();
      const base64 = await invoke<string>(captureCommand, { monitorId });
      const captureTime = performance.now() - captureStart;
      totalCaptureTime += captureTime;

      // Log first frame and periodic stats
      if (frameCount === 0) {
        console.log("[TauriScreenStream] ✅ First frame captured!");
        console.log("[TauriScreenStream] Base64 length:", base64.length, "bytes");
        console.log("[TauriScreenStream] Capture time:", captureTime.toFixed(1), "ms");
      }

      // Load image (JPEG format for fast streaming)
      img.src = `data:image/jpeg;base64,${base64}`;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          // Log actual image dimensions on first frame
          if (frameCount === 0) {
            console.log("[TauriScreenStream] Actual image dimensions:", img.naturalWidth, "x", img.naturalHeight);
            console.log("[TauriScreenStream] Canvas size:", width, "x", height);
          }
          resolve();
        };
        img.onerror = () => reject(new Error("Failed to load capture"));
      });

      // Draw to canvas
      ctx.drawImage(img, 0, 0, width, height);
      frameCount++;

      // Log stats every 5 seconds
      const statsDelta = performance.now() - lastStatsTime;
      if (statsDelta >= 5000) {
        const fps = (frameCount / (statsDelta / 1000)).toFixed(1);
        const avgCaptureTime = (totalCaptureTime / frameCount).toFixed(0);
        console.log(`[TauriScreenStream] Stats: ${fps} fps, ${frameCount} frames, avg capture: ${avgCaptureTime}ms, errors: ${captureErrors}`);
        frameCount = 0;
        captureErrors = 0;
        totalCaptureTime = 0;
        lastStatsTime = performance.now();
      }

    } catch (error) {
      captureErrors++;
      if (captureErrors <= 3) {
        console.error("[TauriScreenStream] ❌ Capture error:", error);
      } else if (captureErrors === 4) {
        console.error("[TauriScreenStream] ❌ Multiple capture errors, suppressing further logs...");
      }
    }

    // Mark capture as complete
    isCapturePending = false;

    // Continue loop immediately (no throttling - capture as fast as possible)
    if (isCapturing) {
      // Use setTimeout(0) instead of requestAnimationFrame for faster looping
      setTimeout(captureLoop, 0);
    }
  }

  // Start capture loop
  console.log("[TauriScreenStream] Starting capture loop...");
  captureLoop();

  // Override track.stop to clean up
  const originalStop = videoTrack.stop.bind(videoTrack);
  videoTrack.stop = () => {
    console.log("[TauriScreenStream] ========================================");
    console.log("[TauriScreenStream] Stopping stream");
    console.log("[TauriScreenStream] Total frames captured:", frameCount);
    console.log("[TauriScreenStream] ========================================");
    isCapturing = false;
    originalStop();
  };

  // Add ended event support
  videoTrack.onended = () => {
    console.log("[TauriScreenStream] Video track ended event");
    isCapturing = false;
  };

  console.log("[TauriScreenStream] ✅ Stream created successfully");
  console.log("[TauriScreenStream] Video track id:", videoTrack.id);
  console.log("[TauriScreenStream] Video track enabled:", videoTrack.enabled);
  console.log("[TauriScreenStream] Video track readyState:", videoTrack.readyState);
  return stream;
}

/**
 * Fallback to browser's getDisplayMedia if Tauri capture isn't available
 * @param monitorId - Optional monitor ID for Tauri capture
 * @param profile - Resolution profile to use (default: "standard")
 */
export async function createScreenStream(
  monitorId?: number,
  profile: ResolutionProfile = "standard"
): Promise<MediaStream> {
  // Try Tauri screen capture first (if monitor ID provided)
  if (monitorId !== undefined) {
    try {
      return await createTauriScreenStream({
        monitorId,
        frameRate: 15,
        profile,
      });
    } catch (error) {
      console.warn("[ScreenStream] Tauri capture failed, falling back to getDisplayMedia:", error);
    }
  }

  // Get fallback resolution from profile
  const profileConfig = RESOLUTION_PROFILES[profile];

  // Fallback to browser's getDisplayMedia
  return navigator.mediaDevices.getDisplayMedia({
    video: {
      width: { ideal: profileConfig.width, max: 1920 },
      height: { ideal: profileConfig.height, max: 1080 },
      frameRate: { ideal: 15, max: 24 },
    },
    audio: false,
  });
}
