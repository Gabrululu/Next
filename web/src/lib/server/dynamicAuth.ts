// Verifies a Dynamic access token on the server, per https://www.dynamic.xyz/docs/auth/tokens.md:
// RS256, keys from the environment's JWKS, and the scope list MUST include "user:basic"
// (otherwise authentication isn't complete, e.g. MFA pending). Tokens are never logged or stored.
import { createRemoteJWKSet, jwtVerify } from "jose";

const ENV_ID = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID ?? "";
const jwks = ENV_ID ? createRemoteJWKSet(new URL(`https://app.dynamicauth.com/api/v0/sdk/${ENV_ID}/.well-known/jwks`)) : null;

export type DynamicUser = { userId: string; email?: string; addresses: string[] };

type Claims = {
  sub?: string;
  scope?: string;
  email?: string;
  environment_id?: string;
  verified_credentials?: { address?: string; chain?: string }[];
};

export async function verifyDynamicToken(authorization: string | null): Promise<DynamicUser> {
  if (!jwks) throw new AuthError("Sign-in is not configured");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) throw new AuthError("Missing token");
  let claims: Claims;
  try {
    ({ payload: claims } = await jwtVerify<Claims>(token, jwks, { algorithms: ["RS256"] }));
  } catch {
    throw new AuthError("Invalid or expired session");
  }
  // The JWKS is per environment; also reject tokens that say they belong to another environment.
  if (claims.environment_id && claims.environment_id !== ENV_ID) throw new AuthError("Wrong environment");
  if (!(claims.scope ?? "").split(" ").includes("user:basic")) throw new AuthError("Authentication incomplete");
  if (!claims.sub) throw new AuthError("Invalid session");
  const addresses = (claims.verified_credentials ?? [])
    .map((c) => c.address?.toLowerCase())
    .filter((a): a is string => !!a && /^0x[0-9a-f]{40}$/.test(a));
  return { userId: claims.sub, email: claims.email ?? undefined, addresses };
}

export class AuthError extends Error {}
