import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import * as path from "path";
import * as fs from "fs/promises";

// Lazy-initialize S3 client to ensure env vars are loaded
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
    if (!s3Client) {
        s3Client = new S3Client({
            region: process.env.AWS_REGION || "ap-southeast-2",
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
            },
        });
    }
    return s3Client;
}

function getBucket(): string {
    return process.env.AWS_S3_BUCKET || "ayahay-v2-assets";
}

function getLocalContextDir(): string {
    return process.env.KB_CONTEXT_DIR || path.resolve(process.cwd(), "context");
}

export interface UploadResult {
    url: string;
    key: string;
}

/**
 * Upload a file to S3 in the knowledge-base folder
 */
export async function uploadFileToS3(
    buffer: Buffer,
    originalFilename: string,
    mimeType: string,
    agentId: string,
    tenantId?: number
): Promise<UploadResult> {
    const ext = path.extname(originalFilename);
    // path: context/{tenantId}/{agentId}/...
    const folder = tenantId ? `${tenantId}` : "default";
    const key = `context/${folder}/${agentId}/${uuidv4()}${ext}`;
    const bucket = getBucket();

    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
    });

    await getS3Client().send(command);

    const url = `https://${bucket}.s3.amazonaws.com/${key}`;

    return { url, key };
}

/**
 * Save a file to the local context folder
 */
export async function uploadFileToContextFolder(
    buffer: Buffer,
    originalFilename: string,
    agentId: string,
    tenantId?: number,
): Promise<UploadResult> {
    const ext = path.extname(originalFilename);
    const folder = tenantId ? `${tenantId}` : "default";
    const fileName = `${uuidv4()}${ext}`;
    const key = path.posix.join("context", folder, agentId, fileName);
    const targetDir = path.join(getLocalContextDir(), folder, agentId);
    const filePath = path.join(targetDir, fileName);

    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(filePath, buffer);

    return { url: `/${key}`, key };
}

/**
 * Upload multiple files to S3
 */
export async function uploadFilesToS3(
    files: { buffer: Buffer; mimetype: string; originalname: string }[],
    agentId: string,
    tenantId?: number
): Promise<{ file: string; url: string; key: string }[]> {
    const results: { file: string; url: string; key: string }[] = [];

    for (const file of files) {
        const { url, key } = await uploadFileToS3(
            file.buffer,
            file.originalname,
            file.mimetype,
            agentId,
            tenantId
        );
        results.push({
            file: file.originalname,
            url,
            key,
        });
    }

    return results;
}

export async function uploadFilesToContextFolder(
    files: { buffer: Buffer; mimetype: string; originalname: string }[],
    agentId: string,
    tenantId?: number,
): Promise<{ file: string; url: string; key: string }[]> {
    const results: { file: string; url: string; key: string }[] = [];

    for (const file of files) {
        const { url, key } = await uploadFileToContextFolder(
            file.buffer,
            file.originalname,
            agentId,
            tenantId,
        );
        results.push({ file: file.originalname, url, key });
    }

    return results;
}

/**
 * Delete a file from S3 or local storage
 */
export async function deleteFileFromS3(key: string): Promise<void> {
    if (key.startsWith("context/")) {
        const relativePath = key.replace(/^context\//, "");
        const filePath = path.join(getLocalContextDir(), relativePath);
        await fs.rm(filePath, { force: true });
        return;
    }

    const bucket = getBucket();
    const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
    });
    await getS3Client().send(command);
}
