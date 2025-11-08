// ===========================================================================
// RequestTracker - Tracks requests and broadcasts stats
// This module is isolated from the core LiveProxy class to make it easier
// to maintain when upstream changes come in.
// ===========================================================================

type TrackedRequest = {
  id: string;
  url: string;
  completed: boolean;
};

export class RequestTracker {
  private requestTracking: Map<string, TrackedRequest>;
  private statsBroadcastTimer: number | null;
  private totalRequests: number;
  private totalRequestsCompleted: number;
  private broadcastChannel: BroadcastChannel;

  constructor(broadcastChannel: BroadcastChannel) {
    this.broadcastChannel = broadcastChannel;
    this.requestTracking = new Map();
    this.statsBroadcastTimer = null;
    this.totalRequests = 0;
    this.totalRequestsCompleted = 0;
  }

  /**
   * Reset tracking state for a new page load
   */
  reset(): void {
    this.requestTracking.clear();
    this.totalRequests = 0;
    this.totalRequestsCompleted = 0;
    if (this.statsBroadcastTimer !== null) {
      clearTimeout(this.statsBroadcastTimer);
      this.statsBroadcastTimer = null;
    }
  }

  /**
   * Check if a new page load should trigger a reset
   * @param destination - The request destination (e.g., "iframe", "document")
   */
  shouldReset(destination: string): boolean {
    return destination === "iframe";
  }

  /**
   * Track the start of a new request
   * @param requestId - Unique request ID
   * @param url - The request URL
   * @param method - HTTP method
   * @param destination - Request destination
   */
  trackRequestStart(
    requestId: string,
    url: string,
    method: string,
    destination: string,
  ): void {
    // Track request start
    this.requestTracking.set(requestId, {
      id: requestId,
      url,
      completed: false,
    });
    this.totalRequests++;

    // Broadcast request-started message
    this.broadcastChannel.postMessage({
      id: requestId,
      type: "request-started",
      url,
      method,
      destination,
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
    // Track request completion
    const trackedRequest = this.requestTracking.get(requestId);
    if (trackedRequest) {
      trackedRequest.completed = true;
      this.totalRequestsCompleted++;
    }

    // Broadcast request-completed message
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

    // Send immediate stats broadcast if all requests are completed
    if (
      this.totalRequestsCompleted >= this.totalRequests &&
      this.totalRequests > 0
    ) {
      this.broadcastStats();
    }

    // Trigger stats broadcast check
    this.scheduleStatsBroadcast();
  }

  /**
   * Broadcast request-stats message immediately
   */
  private broadcastStats(): void {
    this.broadcastChannel.postMessage({
      type: "request-stats",
      totalRequest: this.totalRequests,
      totalRequestsCompleted: this.totalRequestsCompleted,
    });
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

      // If not all requests are completed, schedule next broadcast
      if (this.totalRequestsCompleted < this.totalRequests) {
        this.scheduleStatsBroadcast();
      } else {
        // All completed, clear timer
        this.statsBroadcastTimer = null;
      }
    }, 500) as unknown as number;
  }
}

