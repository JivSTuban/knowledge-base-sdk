"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadFileToS3 = uploadFileToS3;
exports.uploadFileToContextFolder = uploadFileToContextFolder;
exports.uploadFilesToS3 = uploadFilesToS3;
exports.uploadFilesToContextFolder = uploadFilesToContextFolder;
exports.deleteFileFromS3 = deleteFileFromS3;
const client_s3_1 = require("@aws-sdk/client-s3");
const uuid_1 = require("uuid");
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
let s3Client = null;
function getS3Client() {
    if (!s3Client) {
        s3Client = new client_s3_1.S3Client({
            region: process.env.AWS_REGION || "ap-southeast-2",
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
            },
        });
    }
    return s3Client;
}
function getBucket() {
    return process.env.AWS_S3_BUCKET || "ayahay-v2-assets";
}
function getLocalContextDir() {
    return process.env.KB_CONTEXT_DIR || path.resolve(process.cwd(), "context");
}
async function uploadFileToS3(buffer, originalFilename, mimeType, agentId, tenantId) {
    const ext = path.extname(originalFilename);
    const folder = tenantId ? `${tenantId}` : "default";
    const key = `context/${folder}/${agentId}/${(0, uuid_1.v4)()}${ext}`;
    const bucket = getBucket();
    const command = new client_s3_1.PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
    });
    await getS3Client().send(command);
    const url = `https://${bucket}.s3.amazonaws.com/${key}`;
    return { url, key };
}
async function uploadFileToContextFolder(buffer, originalFilename, agentId, tenantId) {
    const ext = path.extname(originalFilename);
    const folder = tenantId ? `${tenantId}` : "default";
    const fileName = `${(0, uuid_1.v4)()}${ext}`;
    const key = path.posix.join("context", folder, agentId, fileName);
    const targetDir = path.join(getLocalContextDir(), folder, agentId);
    const filePath = path.join(targetDir, fileName);
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(filePath, buffer);
    return { url: `/${key}`, key };
}
async function uploadFilesToS3(files, agentId, tenantId) {
    const results = [];
    for (const file of files) {
        const { url, key } = await uploadFileToS3(file.buffer, file.originalname, file.mimetype, agentId, tenantId);
        results.push({
            file: file.originalname,
            url,
            key,
        });
    }
    return results;
}
async function uploadFilesToContextFolder(files, agentId, tenantId) {
    const results = [];
    for (const file of files) {
        const { url, key } = await uploadFileToContextFolder(file.buffer, file.originalname, agentId, tenantId);
        results.push({ file: file.originalname, url, key });
    }
    return results;
}
async function deleteFileFromS3(key) {
    if (key.startsWith("context/")) {
        const relativePath = key.replace(/^context\//, "");
        const filePath = path.join(getLocalContextDir(), relativePath);
        await fs.rm(filePath, { force: true });
        return;
    }
    const bucket = getBucket();
    const command = new client_s3_1.DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
    });
    await getS3Client().send(command);
}
//# sourceMappingURL=storage.js.map