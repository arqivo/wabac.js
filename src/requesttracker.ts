// ===========================================================================
// RequestTracker - Tracks requests and broadcasts stats
// This module is isolated from the core LiveProxy class to make it easier
// to maintain when upstream changes come in.
// ===========================================================================

type TrackedRequest = {
  id: string;
  url: string;
  completed: boolean;
  parentPageUrl: string;
};

type PageGroup = {
  parentPageUrl: string;
  requestTracking: Map<string, TrackedRequest>;
  totalRequests: number;
  totalRequestsCompleted: number;
  cleanupTimer: number | null;
};

export class RequestTracker {
  private pageGroups: Map<string, PageGroup>;
  private statsBroadcastTimer: number | null;
  private currentParentPageUrl: string | null;
  private broadcastChannel: BroadcastChannel;

  constructor(broadcastChannel: BroadcastChannel) {
    this.broadcastChannel = broadcastChannel;
    this.pageGroups = new Map();
    this.statsBroadcastTimer = null;
    this.currentParentPageUrl = null;
  }

  /**
   * Reset tracking state for a new page load
   * @param parentPageUrl - The URL of the parent page (from navigation request)
   */
  reset(parentPageUrl: string): void {
    // Create new PageGroup for this parentPageUrl if it doesn't exist
    if (!this.pageGroups.has(parentPageUrl)) {
      this.pageGroups.set(parentPageUrl, {
        parentPageUrl,
        requestTracking: new Map(),
        totalRequests: 0,
        totalRequestsCompleted: 0,
        cleanupTimer: null,
      });
    }

    // Set current parent page URL
    this.currentParentPageUrl = parentPageUrl;
  }

  /**
   * Check if a new page load should trigger a reset
   * @param destination - The request destination (e.g., "iframe", "document")
   * @param mode - The request mode (e.g., "navigate", "same-origin")
   */
  shouldReset(destination: string, mode?: string): boolean {
    // Reset on navigation events (main page loads)
    // Navigation mode indicates a top-level navigation, not a sub-request
    return destination === "iframe" && mode === "navigate";
  }

  /**
   * Track the start of a new request
   * @param requestId - Unique request ID
   * @param url - The request URL
   * @param method - HTTP method
   * @param destination - Request destination
   * @param referrer - Request referrer
   */
  trackRequestStart(
    requestId: string,
    url: string,
    method: string,
    destination: string,
    referrer: string,
  ): void {
    // Use current parent page URL, or skip tracking if none exists
    if (!this.currentParentPageUrl) {
      // No active parent page, skip tracking
      return;
    }

    // Get or create the page group
    let pageGroup = this.pageGroups.get(this.currentParentPageUrl);
    if (!pageGroup) {
      // Create group if it doesn't exist (shouldn't happen, but handle gracefully)
      pageGroup = {
        parentPageUrl: this.currentParentPageUrl,
        requestTracking: new Map(),
        totalRequests: 0,
        totalRequestsCompleted: 0,
        cleanupTimer: null,
      };
      this.pageGroups.set(this.currentParentPageUrl, pageGroup);
    }

    // Track request start
    pageGroup.requestTracking.set(requestId, {
      id: requestId,
      url,
      completed: false,
      parentPageUrl: this.currentParentPageUrl,
    });
    pageGroup.totalRequests++;

    // Broadcast request-started message with parentPageUrl
    this.broadcastChannel.postMessage({
      id: requestId,
      type: "request-started",
      url,
      method,
      destination,
      referrer,
      parentPageUrl: this.currentParentPageUrl,
    });

    // Send immediate stats broadcast when a new request starts
    // This ensures the client knows there are pending requests
    this.broadcastStats();

    // Start/restart debounced stats broadcaster
    this.scheduleStatsBroadcast();
  }

  /**
   * Track the completion of a request
   * @param requestId - Unique request ID
   * @param url - The request URL
   * @param method - HTTP method
   * @param status - HTTP status code (0 for errors)
   * @param error - Optional error message
   */
  trackRequestComplete(
    requestId: string,
    url: string,
    method: string,
    status: number,
    error?: string,
  ): void {
    // Find the request's PageGroup by searching through all groups
    let trackedRequest: TrackedRequest | undefined;
    let pageGroup: PageGroup | undefined;

    for (const group of this.pageGroups.values()) {
      const request = group.requestTracking.get(requestId);
      if (request) {
        trackedRequest = request;
        pageGroup = group;
        break;
      }
    }

    if (trackedRequest && pageGroup) {
      // Track request completion
      trackedRequest.completed = true;
      pageGroup.totalRequestsCompleted++;

      // Broadcast request-completed message with parentPageUrl
      const message: {
        id: string;
        type: string;
        url: string;
        method: string;
        status: number;
        parentPageUrl: string;
        error?: string;
      } = {
        id: requestId,
        type: "request-completed",
        url,
        method,
        status,
        parentPageUrl: pageGroup.parentPageUrl,
      };
      if (error) {
        message.error = error;
      }
      this.broadcastChannel.postMessage(message);

      // Check if all requests for this group are completed and trigger cleanup
      if (
        pageGroup.totalRequestsCompleted >= pageGroup.totalRequests &&
        pageGroup.totalRequests > 0
      ) {
        this.broadcastStats();
        // Schedule cleanup for this completed group
        this.scheduleCleanup(pageGroup.parentPageUrl);
      }
    } else {
      // Request not found in any group, still broadcast completion
      const message: {
        id: string;
        type: string;
        url: string;
        method: string;
        status: number;
        error?: string;
      } = {
        id: requestId,
        type: "request-completed",
        url,
        method,
        status,
      };
      if (error) {
        message.error = error;
      }
      this.broadcastChannel.postMessage(message);
    }

    // Trigger stats broadcast check
    this.scheduleStatsBroadcast();
  }

  /**
   * Broadcast request-stats message immediately
   * Broadcasts stats for each PageGroup separately
   */
  private broadcastStats(): void {
    // Broadcast stats for each PageGroup
    for (const pageGroup of this.pageGroups.values()) {
      this.broadcastChannel.postMessage({
        type: "request-stats",
        parentPageUrl: pageGroup.parentPageUrl,
        totalRequest: pageGroup.totalRequests,
        totalRequestsCompleted: pageGroup.totalRequestsCompleted,
      });
    }
  }

  /**
   * Schedule cleanup for a completed PageGroup
   * @param parentPageUrl - The parent page URL of the group to cleanup
   */
  private scheduleCleanup(parentPageUrl: string): void {
    const pageGroup = this.pageGroups.get(parentPageUrl);
    if (!pageGroup) {
      return;
    }

    // Clear existing cleanup timer if present
    if (pageGroup.cleanupTimer !== null) {
      clearTimeout(pageGroup.cleanupTimer);
      pageGroup.cleanupTimer = null;
    }

    // Set cleanup timer (5 seconds delay to ensure cleanup happens)
    pageGroup.cleanupTimer = setTimeout(() => {
      this.cleanupCompletedGroup(parentPageUrl);
    }, 5000) as unknown as number;
  }

  /**
   * Clean up a completed PageGroup
   * @param parentPageUrl - The parent page URL of the group to cleanup
   */
  private cleanupCompletedGroup(parentPageUrl: string): void {
    const pageGroup = this.pageGroups.get(parentPageUrl);
    if (!pageGroup) {
      return;
    }

    // Only cleanup if all requests are completed
    if (
      pageGroup.totalRequestsCompleted >= pageGroup.totalRequests &&
      pageGroup.totalRequests > 0
    ) {
      // Clear cleanup timer
      if (pageGroup.cleanupTimer !== null) {
        clearTimeout(pageGroup.cleanupTimer);
        pageGroup.cleanupTimer = null;
      }

      // Remove the group
      this.pageGroups.delete(parentPageUrl);

      // If this was the current parent page, clear it
      if (this.currentParentPageUrl === parentPageUrl) {
        this.currentParentPageUrl = null;
      }
    }
  }

  /**
   * Schedule a debounced stats broadcast (500ms delay)
   */
  private scheduleStatsBroadcast(): void {
    // Clear existing timer if present
    if (this.statsBroadcastTimer !== null) {
      clearTimeout(this.statsBroadcastTimer);
      this.statsBroadcastTimer = null;
    }

    // Set new timer for 500ms
    this.statsBroadcastTimer = setTimeout(() => {
      // Broadcast request-stats message
      this.broadcastStats();

      // Check if any PageGroup has pending requests
      let hasPendingRequests = false;
      for (const pageGroup of this.pageGroups.values()) {
        if (pageGroup.totalRequestsCompleted < pageGroup.totalRequests) {
          hasPendingRequests = true;
          break;
        }
      }

      // If there are pending requests, schedule next broadcast
      if (hasPendingRequests) {
        this.scheduleStatsBroadcast();
      } else {
        // All completed, clear timer
        this.statsBroadcastTimer = null;
      }
    }, 500) as unknown as number;
  }
}

