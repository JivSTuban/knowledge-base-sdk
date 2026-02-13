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
exports.getPool = getPool;
exports.closePool = closePool;
exports.executeQuery = executeQuery;
exports.testConnection = testConnection;
const pg_1 = require("pg");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let pool = null;
function getSslConfig() {
    if (process.env.DB_SSL_CA) {
        return { rejectUnauthorized: true, ca: process.env.DB_SSL_CA };
    }
    if (process.env.DB_SSL_CA_PATH) {
        try {
            const certPath = path.resolve(process.env.DB_SSL_CA_PATH);
            const ca = fs.readFileSync(certPath, "utf8");
            return { rejectUnauthorized: true, ca };
        }
        catch (err) {
            console.warn(`Knowledge Base SDK: Failed to read SSL CA from ${process.env.DB_SSL_CA_PATH}:`, err);
        }
    }
    return false;
}
function getPool() {
    if (!pool) {
        pool = new pg_1.Pool({
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT ?? "5432", 10),
            user: process.env.DB_USERNAME,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 30000,
            ssl: getSslConfig(),
        });
        pool.on("error", (err) => {
            console.error("Unexpected pool error:", err);
            pool = null;
        });
    }
    return pool;
}
async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}
async function executeQuery(query, params = []) {
    let client = null;
    try {
        client = await getPool().connect();
        const result = await client.query(query, params);
        if (process.env.DEBUG_KB_QUERIES === 'true') {
            console.log(`KB Query returned ${result.rows.length} rows`);
        }
        return result.rows;
    }
    catch (error) {
        console.error("Knowledge Base DB: Query error:", error);
        throw error;
    }
    finally {
        if (client) {
            client.release();
        }
    }
}
async function testConnection() {
    try {
        const result = await executeQuery("SELECT 1 as test");
        console.log("Knowledge Base DB: Connection test successful");
        return true;
    }
    catch (error) {
        console.error("Knowledge Base DB: Connection test failed:", error);
        return false;
    }
}
//# sourceMappingURL=db.js.map