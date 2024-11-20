import { ArchiveResponse } from "./response";
import { type ArchiveDB } from "./archivedb";
import { type ArchiveRequest } from "./request";
import { type CollMetadata, type CollConfig } from "./types";
export type Prefixes = {
    static: string;
    root: string;
    main: string;
};
export declare class Collection {
    name: string;
    store: ArchiveDB;
    config: CollConfig;
    metadata: CollMetadata;
    injectScripts: string[];
    noRewritePrefixes: string[] | null;
    noPostToGet: boolean;
    convertPostToGet: boolean;
    coHeaders: boolean;
    csp: string;
    injectRelCanon: boolean;
    baseFramePrefix: string;
    baseFrameUrl: string;
    baseFrameHashReplay: boolean;
    liveRedirectOnNotFound: boolean;
    rootPrefix: string;
    isRoot: boolean;
    prefix: string;
    adblockUrl?: string;
    staticPrefix: string;
    constructor(opts: Record<string, any>, prefixes: Prefixes, defaultConfig?: {});
    handleRequest(request: ArchiveRequest, event: FetchEvent): Promise<Response>;
    getCanonRedirect(query: ArchiveRequest): Response | null;
    getWrappedModuleDecl(): Response;
    getSrcDocResponse(url: string, base64str?: string): ArchiveResponse;
    getBlobResponse(url: string): Promise<ArchiveResponse>;
    getReplayResponse(query: ArchiveRequest, event: FetchEvent): Promise<Response | ArchiveResponse | null>;
    makeTopFrame(url: string, requestTS: string): Promise<Response>;
    makeHeadInsert(url: string, requestTS: string, date: Date, topUrl: string, prefix: string, presetCookie: string, setCookie: string | null, isLive: boolean, referrer: string, extraOpts: Record<string, any> | null): string;
}
//# sourceMappingURL=collection.d.ts.map