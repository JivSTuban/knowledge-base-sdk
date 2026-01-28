export interface UploadResult {
    url: string;
    key: string;
}
export declare function uploadFileToS3(buffer: Buffer, originalFilename: string, mimeType: string, agentId: string, tenantId?: number): Promise<UploadResult>;
export declare function uploadFileToContextFolder(buffer: Buffer, originalFilename: string, agentId: string, tenantId?: number): Promise<UploadResult>;
export declare function uploadFilesToS3(files: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
}[], agentId: string, tenantId?: number): Promise<{
    file: string;
    url: string;
    key: string;
}[]>;
export declare function uploadFilesToContextFolder(files: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
}[], agentId: string, tenantId?: number): Promise<{
    file: string;
    url: string;
    key: string;
}[]>;
export declare function deleteFileFromS3(key: string): Promise<void>;
//# sourceMappingURL=storage.d.ts.map