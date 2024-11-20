import { type ArchiveRequest } from "./request";
import { ArchiveResponse } from "./response";
import { type DBStore } from "./types";
export declare class LiveProxy implements DBStore {
    prefix: string;
    proxyPathOnly: boolean;
    isLive: boolean;
    archivePrefix: string;
    cloneResponse: boolean;
    allowBody: boolean;
    hostProxy: Record<string, any>;
    hostProxyOnly: boolean;
    messageOnProxyErrors: boolean;
    constructor(extraConfig: Record<string, any>, { cloneResponse, allowBody, hostProxyOnly }?: {
        cloneResponse?: boolean | undefined;
        allowBody?: boolean | undefined;
        hostProxyOnly?: boolean | undefined;
    });
    getAllPages(): Promise<never[]>;
    getFetchUrl(url: string, request: ArchiveRequest, headers: Headers): string | null;
    getResource(request: ArchiveRequest, prefix: string): Promise<ArchiveResponse | null>;
    sendProxyError(type: string, url: string, method: string, status?: number): Promise<void>;
}
//# sourceMappingURL=liveproxy.d.ts.map