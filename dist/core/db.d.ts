import { Pool } from "pg";
export declare function getPool(): Pool;
export declare function closePool(): Promise<void>;
export declare function executeQuery<T = any>(query: string, params?: any[]): Promise<T[]>;
export declare function testConnection(): Promise<boolean>;
//# sourceMappingURL=db.d.ts.map