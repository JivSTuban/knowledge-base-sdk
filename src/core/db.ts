import { Pool, PoolClient } from "pg";
import * as fs from "fs";
import * as path from "path";

let pool: Pool | null = null;

function getSslConfig(): false | { rejectUnauthorized: boolean; ca: string } {
    // Prefer inline cert string, then fall back to file path
    if (process.env.DB_SSL_CA) {
        return { rejectUnauthorized: true, ca: process.env.DB_SSL_CA };
    }
    if (process.env.DB_SSL_CA_PATH) {
        try {
            const certPath = path.resolve(process.env.DB_SSL_CA_PATH);
            const ca = fs.readFileSync(certPath, "utf8");
            return { rejectUnauthorized: true, ca };
        } catch (err) {
            console.warn(`Knowledge Base SDK: Failed to read SSL CA from ${process.env.DB_SSL_CA_PATH}:`, err);
        }
    }
    return false;
}

export function getPool(): Pool {
    if (!pool) {
        pool = new Pool({
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT ?? "5432", 10),
            user: process.env.DB_USERNAME,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 30000, // Increased to 30 seconds for remote DB
            ssl: getSslConfig(),
        });

        pool.on("error", (err) => {
            console.error("Unexpected pool error:", err);
            pool = null;
        });
    }

    return pool;
}

export async function closePool(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = null;
    }
}

export async function executeQuery<T = any>(
    query: string,
    params: any[] = [],
): Promise<T[]> {
    let client: PoolClient | null = null;
    try {
        client = await getPool().connect();
        const result = await client.query(query, params);

        // Only log in development or with DEBUG flag
        if (process.env.DEBUG_KB_QUERIES === 'true') {
            console.log(`KB Query returned ${result.rows.length} rows`);
        }

        return result.rows;
    } catch (error) {
        console.error("Knowledge Base DB: Query error:", error);
        throw error;
    } finally {
        if (client) {
            client.release();
        }
    }
}

// Test the connection on first import
export async function testConnection(): Promise<boolean> {
    try {
        const result = await executeQuery("SELECT 1 as test");
        console.log("Knowledge Base DB: Connection test successful");
        return true;
    } catch (error) {
        console.error("Knowledge Base DB: Connection test failed:", error);
        return false;
    }
}
