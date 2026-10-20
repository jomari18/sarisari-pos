import { createHmac } from "node:crypto";
import { ipKeyGenerator } from "express-rate-limit";

/**
 * The demo limit counts visitors by a salted hash, so raw IPs are never stored (spec 12). An IPv6
 * visitor is counted by their /56 network, like the sign-in limit, so rotating addresses does not help.
 */
export function ipHash(ip: string, salt: string): string {
  return createHmac("sha256", salt).update(ipKeyGenerator(ip)).digest("hex");
}
