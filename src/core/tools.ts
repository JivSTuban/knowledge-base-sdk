import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Tool execution context passed from API v2
 */
export interface ToolContext {
  tenantId?: number;
  scope?: string;
  getTenantById: (id: number) => Promise<any>;
  getAllTenants: () => Promise<any[]>;
  tenantRequest: <T>(method: string, path: string, body: any, tenant: any) => Promise<T>;
}

/**
 * Search for available ferry/ship trips between ports
 */
export function createSearchTripsTool(context: ToolContext) {
  return new DynamicStructuredTool({
    name: "search_trips",
    description: `Search for available ferry/ship trips between ports. Use this when user asks about:
- Trip schedules or availability
- "Show me trips from X to Y"
- "What trips are available tomorrow?"
- "Are there any boats to [destination]?"

IMPORTANT PORT CODE MAPPINGS (use these exact codes):
- Bogo (Bogo City, Cebu) = BOG
- Cordova (Cordova, Cebu) = COR
- Cebu (Cebu City) = CEB
- Manila = MNL
- Tagbilaran (Bohol) = TAG
- Cagayan = PAL
- Dumaguete = DUM
- Siquijor = SIQ
- Iloilo = ILO

CRITICAL: Cordova is NOT Manila! Cordova = COR, Manila = MNL. They are different locations.`,
    schema: z.object({
      origin_code: z.string().describe("3-letter origin port code - use mappings: BOG=Bogo, COR=Cordova, CEB=Cebu, MNL=Manila, TAG=Tagbilaran, PAL=Cagayan"),
      destination_code: z.string().describe("3-letter destination port code - use mappings: BOG=Bogo, COR=Cordova, CEB=Cebu, MNL=Manila, TAG=Tagbilaran, PAL=Cagayan"),
      date: z.string().describe("Travel date in YYYY-MM-DD format"),
      tenant_id: z.number().optional().describe("Specific shipping line ID, omit for all shipping lines"),
    }),
    func: async ({ origin_code, destination_code, date, tenant_id }) => {
      try {
        if (tenant_id || context.tenantId) {
          // Single tenant query
          const targetTenantId = tenant_id || context.tenantId;
          const tenant = await context.getTenantById(targetTenantId!);
          
          const response = await context.tenantRequest<any>(
            "GET",
            `/trips?origin_code=${origin_code}&destination_code=${destination_code}&departure_date=${date}&passenger_count=1&vehicle_count=0&page=1&sort=departureDate`,
            undefined,
            tenant
          );
          
          return JSON.stringify({
            success: true,
            trips: response.data || [],
            shipping_line: tenant.name,
            count: response.data?.length || 0,
          });
        } else {
          // Aggregator mode: query all tenants
          const tenants = await context.getAllTenants();
          const allTrips: any[] = [];
          
          await Promise.all(
            tenants.map(async (tenant) => {
              try {
                const response = await context.tenantRequest<any>(
                  "GET",
                  `/trips?origin_code=${origin_code}&destination_code=${destination_code}&departure_date=${date}&passenger_count=1&vehicle_count=0&page=1&sort=departureDate`,
                  undefined,
                  tenant
                );
                
                if (response.data && Array.isArray(response.data)) {
                  response.data.forEach((trip: any) => {
                    allTrips.push({
                      ...trip,
                      shipping_line: tenant.name,
                      tenant_id: tenant.id,
                    });
                  });
                }
              } catch (error) {
                // Gracefully handle tenant API failures
                console.error(`Failed to fetch trips from tenant ${tenant.name}:`, error);
              }
            })
          );
          
          // Sort by departure time
          allTrips.sort((a, b) => {
            const timeA = new Date(a.total_departure_time || a.scheduled_departure).getTime();
            const timeB = new Date(b.total_departure_time || b.scheduled_departure).getTime();
            return timeA - timeB;
          });
          
          return JSON.stringify({
            success: true,
            trips: allTrips,
            count: allTrips.length,
            shipping_lines: [...new Set(allTrips.map(t => t.shipping_line))],
          });
        }
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to search trips",
          trips: [],
        });
      }
    },
  });
}

/**
 * Get fare rates for a specific route
 */
export function createGetFareRatesTool(context: ToolContext) {
  return new DynamicStructuredTool({
    name: "get_fare_rates",
    description: `Get pricing information for ferry/ship trips. Use this when user asks about:
- Ticket prices or fares
- "How much is a ticket?"
- "What's the price from X to Y?"
- Cost for passengers or vehicles

IMPORTANT PORT CODE MAPPINGS (use these exact codes):
- Bogo (Bogo City, Cebu) = BOG
- Cordova (Cordova, Cebu) = COR
- Cebu (Cebu City) = CEB
- Manila = MNL
- Tagbilaran (Bohol) = TAG
- Cagayan = PAL
- Dumaguete = DUM
- Siquijor = SIQ
- Iloilo = ILO

CRITICAL: Cordova is NOT Manila! Cordova = COR, Manila = MNL. They are different locations.`,
    schema: z.object({
      origin_code: z.string().describe("3-letter origin port code - BOG=Bogo, COR=Cordova, CEB=Cebu, MNL=Manila, TAG=Tagbilaran, PAL=Cagayan, DUM=Dumaguete, SIQ=Siquijor, ILO=Iloilo"),
      destination_code: z.string().describe("3-letter destination port code - BOG=Bogo, COR=Cordova, CEB=Cebu, MNL=Manila, TAG=Tagbilaran, PAL=Cagayan, DUM=Dumaguete, SIQ=Siquijor, ILO=Iloilo"),
      passenger_type: z.enum(["adult", "child", "senior", "pwd", "infant"]).optional().describe("Type of passenger"),
      tenant_id: z.number().optional().describe("Specific shipping line ID"),
    }),
    func: async ({ origin_code, destination_code, passenger_type, tenant_id }) => {
      try {
        console.log(`[get_fare_rates] tenant_id=${tenant_id}, context.tenantId=${context.tenantId}`);
        if (tenant_id || context.tenantId) {
          // Single tenant query
          const targetTenantId = tenant_id || context.tenantId;
          console.log(`[get_fare_rates] Using single tenant mode with tenantId=${targetTenantId}`);
          const tenant = await context.getTenantById(targetTenantId!);
          
          // Build query params - use route_code format
          const routeCode = `${origin_code}-${destination_code}`;
          let queryParams = `route_code=${routeCode}`;
          if (passenger_type) {
            queryParams += `&passenger_type_code=${passenger_type}`;
          }
          
          // Query centralized API v2 rates endpoint instead of Client API
          const apiV2Url = process.env.API_V2_URL || 'http://localhost:3002';
          const url = `${apiV2Url}/rates/passenger?${queryParams}`;
          
          console.log(`[get_fare_rates] Querying API v2: ${url}`);
          
          const response = await fetch(url);
          const data: any = await response.json();
          
          console.log(`[get_fare_rates] API Response:`, JSON.stringify(data));
          console.log(`[get_fare_rates] Rates found: ${data.data?.length || 0}`);
          
          const result = {
            success: data.success || true,
            rates: data.data || [],
            origin: origin_code,
            destination: destination_code,
          };
          
          console.log(`[get_fare_rates] Returning:`, JSON.stringify(result));
          return result;
        }
      } catch (error: any) {
        return {
          success: false,
          error: error.message || "Failed to fetch fare rates",
          rates: [],
        };
      }
    },
  });
}

/**
 * Get vehicle rates for a specific route
 */
export function createGetVehicleRatesTool(context: ToolContext) {
  return new DynamicStructuredTool({
    name: "get_vehicle_rates",
    description: `Get vehicle pricing for ferry/ship trips. Use this when user asks about:
- Vehicle or car rates
- "How much to bring a car?"
- "What's the price for a motorcycle?"
- Cost for bringing vehicles

IMPORTANT PORT CODE MAPPINGS (use these exact codes):
- Bogo (Bogo City, Cebu) = BOG
- Cordova (Cordova, Cebu) = COR
- Cebu (Cebu City) = CEB
- Manila = MNL
- Tagbilaran (Bohol) = TAG
- Cagayan = PAL
- Dumaguete = DUM
- Siquijor = SIQ
- Iloilo = ILO

CRITICAL: Cordova is NOT Manila! Cordova = COR, Manila = MNL. They are different locations.`,
    schema: z.object({
      origin_code: z.string().describe("3-letter origin port code - BOG=Bogo, COR=Cordova, CEB=Cebu, MNL=Manila, TAG=Tagbilaran, PAL=Cagayan, DUM=Dumaguete, SIQ=Siquijor, ILO=Iloilo"),
      destination_code: z.string().describe("3-letter destination port code - BOG=Bogo, COR=Cordova, CEB=Cebu, MNL=Manila, TAG=Tagbilaran, PAL=Cagayan, DUM=Dumaguete, SIQ=Siquijor, ILO=Iloilo"),
      vehicle_type: z.string().optional().describe("Type of vehicle (e.g., motorcycle, car, truck)"),
      tenant_id: z.number().optional().describe("Specific shipping line ID"),
    }),
    func: async ({ origin_code, destination_code, vehicle_type, tenant_id }) => {
      try {
        if (tenant_id || context.tenantId) {
          const targetTenantId = tenant_id || context.tenantId;
          const tenant = await context.getTenantById(targetTenantId!);
          
          const routeCode = `${origin_code}-${destination_code}`;
          let queryParams = `route_code=${routeCode}`;
          if (vehicle_type) {
            queryParams += `&cargo_class_code=${vehicle_type}`;
          }
          
          // Query centralized API v2 rates endpoint
          const apiV2Url = process.env.API_V2_URL || 'http://localhost:3002';
          const url = `${apiV2Url}/rates/cargo?${queryParams}`;
          
          const response = await fetch(url);
          const data: any = await response.json();
          
          return {
            success: data.success || true,
            rates: data.data || [],
            origin: origin_code,
            destination: destination_code,
          };
        } else {
          const tenants = await context.getAllTenants();
          const allRates: any[] = [];
          const routeCode = `${origin_code}-${destination_code}`;
          
          await Promise.all(
            tenants.map(async (tenant) => {
              try {
                let queryParams = `route_code=${routeCode}`;
                if (vehicle_type) {
                  queryParams += `&cargo_class_code=${vehicle_type}`;
                }
                
                const response = await context.tenantRequest<any>(
                  "GET",
                  `/base-rates/cargo?${queryParams}`,
                  undefined,
                  tenant
                );
                
                if (response.data && Array.isArray(response.data)) {
                  response.data.forEach((rate: any) => {
                    allRates.push({
                      ...rate,
                      shipping_line: tenant.name,
                      tenant_id: tenant.id,
                    });
                  });
                }
              } catch (error) {
                console.error(`Failed to fetch vehicle rates from tenant ${tenant.name}:`, error);
              }
            })
          );
          
          return {
            success: true,
            rates: allRates,
            origin: origin_code,
            destination: destination_code,
            shipping_lines: [...new Set(allRates.map(r => r.shipping_line))],
          };
        }
      } catch (error: any) {
        return {
          success: false,
          error: error.message || "Failed to fetch vehicle rates",
          rates: [],
        };
      }
    },
  });
}
