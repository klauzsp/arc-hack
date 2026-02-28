import { CEO_ADDRESS } from "@/lib/contracts";

export type Role = "admin" | "employee" | null;

/** Mock: determine role from connected wallet. When integrated, backend returns role after SIWE. */
export function getMockRole(address: string | undefined): Role {
  if (!address) return null;
  if (address.toLowerCase() === CEO_ADDRESS.toLowerCase()) return "admin";
  return "employee";
}
