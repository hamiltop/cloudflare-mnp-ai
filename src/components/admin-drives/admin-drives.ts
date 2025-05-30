import "./admin-drives.css";
import { Drive } from "@/helpers/google-drive";
import { html } from "@respond-run/html";

type UserDrive = {
  id: string;
  drive_id: string;
  name: string;
  file_count: number;
  last_synced_at: string | null;
};

type SyncResponse = {
  success: boolean;
  vectorizeStatus?: {
    vectorsCount: number;
    lastProcessedAt: string;
    config: {
      dimensions: number;
      metric: string;
    };
  };
  error?: string;
  details?: string;
  authUrl?: string;
};

export default {
  drives: [] as UserDrive[],
  availableDrives: [] as Drive[],
  showSelect: false,
  showRemove: false,
  selectedDrive: null as UserDrive | null,
  selectedDriveIds: [] as string[],
  connected: false,
  syncing: false,
  error: null as string | null,

  async checkDriveConnected() {
    const res = await fetch("/api/admin/drives/connected");
    this.connected = ((await res.json()) as { connected: boolean }).connected;
  },

  async fetchAvailableDrives() {
    const res = await fetch("/api/admin/drives/list");
    this.availableDrives = await res.json();
    this.showSelect = true;
  },

  async fetchDrives() {
    const res = await fetch("/api/admin/drives");
    this.drives = await res.json();
  },

  async importDrives() {
    await fetch("/api/admin/drives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driveIds: this.selectedDriveIds }),
    });
    this.showSelect = false;
    await this.fetchDrives();
  },

  async syncDrive(driveId: string) {
    this.syncing = true;
    this.error = null;
    try {
      console.log("Starting sync for drive:", driveId);
      const res = await fetch(`/api/admin/drives/${driveId}/sync`, {
        method: "POST",
      });
      const data = (await res.json()) as SyncResponse;

      if (!res.ok) {
        console.error("Sync failed:", {
          status: res.status,
          statusText: res.statusText,
          data,
        });

        // If the error is due to an expired refresh token, redirect to reauthorize
        if (data.error === "REFRESH_TOKEN_EXPIRED" && data.authUrl) {
          window.location.href = data.authUrl;
          return;
        }

        throw new Error(data.details || data.error || "Failed to sync drive");
      }

      // Log detailed Vectorize status
      console.log("Drive sync completed. Vectorize status:", {
        success: data.success,
        vectorCount: data.vectorizeStatus?.vectorsCount,
        lastProcessed: data.vectorizeStatus?.lastProcessedAt,
        config: data.vectorizeStatus?.config,
      });

      // Notify search component about sync completion
      const searchComponent = document.querySelector("[x-data='adminSearch()']") as any;
      if (searchComponent && searchComponent.__x) {
        searchComponent.__x.$data.onSyncComplete();
      }

      await this.fetchDrives();
    } catch (err) {
      console.error("Sync error:", {
        error: err,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.syncing = false;
    }
  },

  openRemove(drive: UserDrive) {
    this.selectedDrive = drive;
    this.showRemove = true;
  },

  async removeDrive() {
    if (!this.selectedDrive) return;
    await fetch(`/api/admin/drives/${encodeURIComponent(this.selectedDrive.id)}/remove`, {
      method: "DELETE",
    });
    this.showRemove = false;
    await this.fetchDrives();
  },

  connectDrive() {
    window.location.href = "/api/admin/drives/connect";
  },

  async init() {
    await this.checkDriveConnected();
    await this.fetchDrives();
  },

  render: async function () {
    const { default: adminDrivesTemplate } = await import("./admin-drives.html?raw");
    return html(adminDrivesTemplate, {});
  },
};
