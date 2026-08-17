export interface UpdateInfo {
    latest: string;
    hasUpdate: boolean;
    url?: string;
}
export declare function checkLatestVersion(proxyUrl?: string): Promise<UpdateInfo>;
