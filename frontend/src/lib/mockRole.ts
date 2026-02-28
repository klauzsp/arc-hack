import { CEO_ADDRESS } from "@/lib/contracts";
import { isKnownRecipientAddress } from "@/lib/mockPayrollEngine";

export type Role = "admin" | "employee" | null;

/** Mock: determine role from connected wallet. When integrated, backend returns role after SIWE. */
export function getMockRole(address: string | undefined): Role {
  if (!address) return null;
  if (address.toLowerCase() === CEO_ADDRESS.toLowerCase()) return "admin";
  if (isKnownRecipientAddress(address)) return "employee";
  return null;
}
