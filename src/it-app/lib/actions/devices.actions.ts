"use server";

import { serverFetch, CACHE_PRESETS } from "@/lib/api/server-fetch";
import type {
  Device,
  DeviceListItem,
  DeviceListResponse,
  DeviceCountResponse,
} from "@/types/device";

/**
 * Get list of discovered devices with optional filtering.
 *
 * Cache: SHORT_LIVED (30s) - devices update relatively frequently
 */
export async function getDevices(options?: {
  lifecycleState?: string;
  discoverySource?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<DeviceListResponse> {
  try {
    const params = new URLSearchParams();

    if (options?.lifecycleState) {
      params.set("lifecycle_state", options.lifecycleState);
    }
    if (options?.discoverySource) {
      params.set("discovery_source", options.discoverySource);
    }
    if (options?.search) {
      params.set("search", options.search);
    }
    params.set("limit", String(options?.limit ?? 100));
    params.set("offset", String(options?.offset ?? 0));

    const devices = await serverFetch<DeviceListItem[]>(
      `/devices?${params.toString()}`,
      CACHE_PRESETS.SHORT_LIVED()
    );

    return { devices, total: devices.length };
  } catch (error: unknown) {
    console.error("Failed to fetch devices:", error);
    return { devices: [], total: 0 };
  }
}

/**
 * Get device count with optional filtering.
 */
export async function getDeviceCount(options?: {
  lifecycleState?: string;
  discoverySource?: string;
}): Promise<number> {
  try {
    const params = new URLSearchParams();

    if (options?.lifecycleState) {
      params.set("lifecycle_state", options.lifecycleState);
    }
    if (options?.discoverySource) {
      params.set("discovery_source", options.discoverySource);
    }

    const response = await serverFetch<DeviceCountResponse>(
      `/devices/count?${params.toString()}`,
      CACHE_PRESETS.SHORT_LIVED()
    );

    return response.count;
  } catch (error: unknown) {
    console.error("Failed to fetch device count:", error);
    return 0;
  }
}

/**
 * Get a single device by ID.
 */
export async function getDevice(deviceId: string): Promise<Device | null> {
  try {
    const device = await serverFetch<Device>(
      `/devices/${deviceId}`,
      CACHE_PRESETS.SHORT_LIVED()
    );

    return device;
  } catch (error: unknown) {
    console.error(`Failed to fetch device ${deviceId}:`, error);
    return null;
  }
}

/**
 * Calculate device lifecycle metrics from list.
 * Local function - not exported as server actions must be async.
 */
interface DeviceMetrics {
  total: number;
  discovered: number;
  installPending: number;
  installed: number;
  enrolled: number;
  managed: number;
  quarantined: number;
  withActiveSession: number;
}

function calculateDeviceMetrics(devices: DeviceListItem[]): DeviceMetrics {
  return {
    total: devices.length,
    discovered: devices.filter((d) => d.lifecycleState === "discovered").length,
    installPending: devices.filter((d) => d.lifecycleState === "install_pending").length,
    installed: devices.filter((d) => d.lifecycleState === "installed_unenrolled").length,
    enrolled: devices.filter((d) => d.lifecycleState === "enrolled").length,
    managed: devices.filter((d) => d.lifecycleState === "managed").length,
    quarantined: devices.filter((d) => d.lifecycleState === "quarantined").length,
    withActiveSession: devices.filter((d) => d.hasActiveSession).length,
  };
}

/**
 * Get devices page data with filtering and metrics.
 */
export interface DevicesPageData {
  devices: DeviceListItem[];
  metrics: DeviceMetrics;
  total: number;
}

export async function getDevicesPageData(filters?: {
  lifecycleState?: string;
  discoverySource?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<DevicesPageData> {
  const { lifecycleState, discoverySource, search, page = 1, limit = 25 } = filters || {};
  const offset = (page - 1) * limit;

  // Get all devices for metrics calculation (with search filter)
  const response = await getDevices({
    search,
    limit: 1000, // Get all for metrics
    offset: 0,
  });

  const allDevices = response.devices;
  const metrics = calculateDeviceMetrics(allDevices);

  // Apply lifecycle and discovery source filters for display
  let filteredDevices = allDevices;

  if (lifecycleState && lifecycleState !== "all") {
    filteredDevices = filteredDevices.filter((d) => d.lifecycleState === lifecycleState);
  }

  if (discoverySource && discoverySource !== "all") {
    filteredDevices = filteredDevices.filter((d) => d.discoverySource === discoverySource);
  }

  const total = filteredDevices.length;

  // Apply pagination
  const paginatedDevices = filteredDevices.slice(offset, offset + limit);

  return {
    devices: paginatedDevices,
    metrics,
    total,
  };
}
