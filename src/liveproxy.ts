import { getProxyNotFoundResponse } from "./notfound";
import { type ArchiveRequest } from "./request";
import { ArchiveResponse } from "./response";
import { type ExtraConfig, type DBStore } from "./types";
import { RequestTracker } from "./requesttracker";
import { getConfigValue } from "./configdb";

declare let self: ServiceWorkerGlobalScope;

// ===========================================================================
export class LiveProxy implements DBStore {
  prefix: string;
  proxyPathOnly: boolean;
  isLive: boolean;
  archivePrefix: string;
  archiveMod: string;
  cloneResponse: boolean;
  allowBody: boolean;
  // [TODO]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hostProxy: Record<string, any>;
  hostProxyOnly: boolean;

  messageOnProxyErrors: boolean;
  broadcastChannel: any;
  requestTracker: RequestTracker;

  constructor(
    extraConfig?: ExtraConfig,
    { cloneResponse = false, allowBody = false, hostProxyOnly = false } = {},
  ) {
    extraConfig = extraConfig || {};

    this.prefix = extraConfig.prefix || "";
    this.proxyPathOnly = extraConfig.proxyPathOnly || false;
    this.isLive = extraConfig.isLive !== undefined ? extraConfig.isLive : true;
    this.archivePrefix = extraConfig.archivePrefix || "";
    this.archiveMod = extraConfig.archiveMod || "id_";
    this.cloneResponse = cloneResponse;
    this.allowBody = allowBody || this.isLive || !!extraConfig.noPostToGet;

    // @ts-expect-error [TODO] - TS4111 - Property 'messageOnProxyErrors' comes from an index signature, so it must be accessed with ['messageOnProxyErrors'].
    this.messageOnProxyErrors = extraConfig.messageOnProxyErrors || false;

    // @ts-expect-error [TODO] - TS4111 - Property 'hostProxy' comes from an index signature, so it must be accessed with ['hostProxy'].
    this.hostProxy = extraConfig.hostProxy;

    if (this.hostProxy instanceof Array) {
      // [TODO]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const byHost: Record<string, any> = {};
      for (const entry of this.hostProxy) {
        byHost[entry.host] = entry;
      }
      this.hostProxy = byHost;
    }

    this.hostProxyOnly = hostProxyOnly;

    this.broadcastChannel = new BroadcastChannel("arqivo-messages");
    this.requestTracker = new RequestTracker(this.broadcastChannel);

  }

  async getAllPages() {
    return [];
  }

  getFetchUrl(url: string, request: ArchiveRequest, headers: Headers) {
    let parsedUrl;

    // [TODO]
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (this.hostProxy) {
      parsedUrl = new URL(url);
      const hostdata = this.hostProxy[parsedUrl.host];
      if (hostdata) {
        // set X-Proxy-Host to matched host
        headers.set("X-Proxy-Host", parsedUrl.host);
        // Given https://example.com/path/somefile.html, and prefix "https://upstream-server/prefix/"
        // with pathOnly, send to https://upstream-server/prefix/path/somefile.html
        // without pathOnly, send to https://upstream-server/prefix/https://example.com/path/somefile.html
        return (
          hostdata.prefix +
          (hostdata.pathOnly ? parsedUrl.pathname + parsedUrl.search : url)
        );
      }
    }

    if (this.hostProxyOnly) {
      return null;
    }

    if (this.proxyPathOnly) {
      if (!parsedUrl) {
        parsedUrl = new URL(url);
      }
      return this.prefix + parsedUrl.pathname + parsedUrl.search;
    } else if (this.isLive || (!request.timestamp && !this.archivePrefix)) {
      return this.prefix + url;
    } else {
      return (
        this.prefix +
        this.archivePrefix +
        request.timestamp +
        this.archiveMod +
        "/" +
        url
      );
    }
  }

  async getResource(request: ArchiveRequest, prefix: string) {
    const { headers, credentials, url } = request.prepareProxyRequest(
      prefix,
      true,
    );

    // Read API key from IndexedDB and add as X-WA-KEY header
    const waKey = await getConfigValue("api-key");
    if (waKey) {
      headers.set("X-WA-KEY", waKey);
    }

    const fetchUrl = this.getFetchUrl(url, request, headers);

    if (!fetchUrl) {
      return null;
    }

    // Detect new page load: iframe destination indicates the first request
    // Reset on navigation events (mode === "navigate") which are main page loads
    if (this.requestTracker.shouldReset(request.destination, request.mode)) {
      this.requestTracker.reset(request.url);
    }

    let body: Uint8Array | null = null;

    const isPOST =
      request.method === "POST" ||
      request.method === "PUT" ||
      request.method === "DELETE";

    if (isPOST) {
      if (this.allowBody) {
        body = await request.getBody();
      } else {
        void this.sendProxyError("post-request-attempt", url, request.method);
      }
    }

    let requestId = crypto.randomUUID();

    // Track request start
    this.requestTracker.trackRequestStart(
      requestId,
      fetchUrl,
      request.method,
      request.destination,
      request.referrer,
    );

    // console.log('SW request object:', request);

    let response: Response;
    let fetchError: Error | null = null;

    try {
      response = await fetch(fetchUrl, {
        method: request.method,
        body,
        headers,
        credentials,
        mode: "cors",
        redirect: "follow",
      });
    } catch (error) {
      // Fetch failed (network error, CORS, etc.)
      fetchError = error as Error;
      // Track request completion even on error
      this.requestTracker.trackRequestComplete(
        requestId,
        fetchUrl,
        request.method,
        0,
        fetchError.message,
      );

      // Re-throw the error so it can be handled upstream
      throw error;
    }

    let noRW = false;

    if (isPOST && response.status >= 400) {
      void this.sendProxyError(
        "post-request-failed",
        url,
        request.method,
        response.status,
      );
    } else if (response.status === 429) {
      void this.sendProxyError(
        "rate-limited",
        url,
        request.method,
        response.status,
      );
    }

    // Track request completion
    this.requestTracker.trackRequestComplete(
      requestId,
      fetchUrl,
      request.method,
      response.status,
    );

    if (
      response.status > 400 &&
      response.status !== 404 &&
      ["", "document", "iframe"].includes(request.destination)
    ) {
      response = getProxyNotFoundResponse(url, response.status);
      noRW = true;
    }

    try {
      // was a redirect, issue a redirect to the exact URL
      const fullFetchURL = new URL(fetchUrl, self.location.href).href;

      if (response.ok && response.url && response.url !== fullFetchURL) {
        const inx = response.url.indexOf("/http");
        const actualUrl = response.url.slice(inx + 1);
        // ensure actual URL is different, not just timestamp
        if (url !== actualUrl) {
          response = Response.redirect(actualUrl);
        }
      }
    } catch (_) {
      // ignore
    }

    let clonedResponse: Response | null = null;

    if (this.cloneResponse) {
      clonedResponse = response.clone();
    }

    const archiveResponse = ArchiveResponse.fromResponse({
      url,
      response,
      date: new Date(),
      noRW,
      isLive: this.isLive,
      archivePrefix: this.archivePrefix,
    });

    if (clonedResponse) {
      archiveResponse.clonedResponse = clonedResponse;
    }

    return archiveResponse;
  }

  async sendProxyError(
    type: string,
    url: string,
    method: string,
    status?: number,
  ) {
    if (!this.messageOnProxyErrors) {
      return;
    }

    const clients = await self.clients.matchAll({ type: "window" });
    for (const client of clients) {
      const clientUrl = new URL(client.url);
      if (clientUrl.searchParams.get("source") === this.prefix) {
        client.postMessage({ type, url, method, status });
        break;
      }
    }
  }
}
