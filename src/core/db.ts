import { Pool, PoolClient } from "pg";

let pool: Pool | null = null;

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
            ssl: process.env.DB_SSL_CA
                ? {
                    rejectUnauthorized: true,
                    ca: process.env.DB_SSL_CA,
                }
                : false,
        });

        pool.on("error", (err) => {
            console.error("Unexpected pool error:", err);
            pool = null;
        });

        pool.on("connect", () => {
            console.log("Knowledge Base DB: New client connected to pool");
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
        console.log("Knowledge Base DB: Acquiring connection...");
        client = await getPool().connect();
        console.log("Knowledge Base DB: Connection acquired, executing query...");
        const result = await client.query(query, params);
        console.log(`Knowledge Base DB: Query returned ${result.rows.length} rows`);
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
