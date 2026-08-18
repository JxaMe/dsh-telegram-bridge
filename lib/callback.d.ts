export declare function cleanupCallbackStore(): void;
export declare function encodeData(parts: string[]): string;
export declare function decodeData(data: string): string[];
export declare function encodeCallback(parts: string[]): string;
export declare function decodeCallback(data: string): string[] | undefined;
export declare function clearCallbackStoreForTests(): void;
export declare function setCallbackEntryTimestampForTests(key: string, timestamp: number): void;
