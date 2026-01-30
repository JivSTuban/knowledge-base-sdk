import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
export interface ToolContext {
    tenantId?: number;
    scope?: string;
    getTenantById: (id: number) => Promise<any>;
    getAllTenants: () => Promise<any[]>;
    tenantRequest: <T>(method: string, path: string, body: any, tenant: any) => Promise<T>;
}
export declare function createSearchTripsTool(context: ToolContext): DynamicStructuredTool<z.ZodObject<{
    origin_code: z.ZodString;
    destination_code: z.ZodString;
    date: z.ZodString;
    tenant_id: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>, {
    origin_code: string;
    destination_code: string;
    date: string;
    tenant_id?: number | undefined;
}, {
    origin_code: string;
    destination_code: string;
    date: string;
    tenant_id?: number | undefined;
}, string, "search_trips">;
export declare function createGetFareRatesTool(context: ToolContext): DynamicStructuredTool<z.ZodObject<{
    origin_code: z.ZodString;
    destination_code: z.ZodString;
    passenger_type: z.ZodOptional<z.ZodEnum<{
        adult: "adult";
        child: "child";
        senior: "senior";
        pwd: "pwd";
        infant: "infant";
    }>>;
    tenant_id: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>, {
    origin_code: string;
    destination_code: string;
    passenger_type?: "adult" | "child" | "senior" | "pwd" | "infant" | undefined;
    tenant_id?: number | undefined;
}, {
    origin_code: string;
    destination_code: string;
    passenger_type?: "adult" | "child" | "senior" | "pwd" | "infant" | undefined;
    tenant_id?: number | undefined;
}, {
    success: any;
    rates: any;
    origin: string;
    destination: string;
} | {
    success: boolean;
    error: any;
    rates: never[];
} | undefined, "get_fare_rates">;
export declare function createGetVehicleRatesTool(context: ToolContext): DynamicStructuredTool<z.ZodObject<{
    origin_code: z.ZodString;
    destination_code: z.ZodString;
    vehicle_type: z.ZodOptional<z.ZodString>;
    tenant_id: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>, {
    origin_code: string;
    destination_code: string;
    vehicle_type?: string | undefined;
    tenant_id?: number | undefined;
}, {
    origin_code: string;
    destination_code: string;
    vehicle_type?: string | undefined;
    tenant_id?: number | undefined;
}, {
    success: any;
    rates: any;
    origin: string;
    destination: string;
    shipping_lines?: undefined;
    error?: undefined;
} | {
    success: boolean;
    rates: any[];
    origin: string;
    destination: string;
    shipping_lines: any[];
    error?: undefined;
} | {
    success: boolean;
    error: any;
    rates: never[];
    origin?: undefined;
    destination?: undefined;
    shipping_lines?: undefined;
}, "get_vehicle_rates">;
//# sourceMappingURL=tools.d.ts.map