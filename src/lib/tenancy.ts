import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ClientProfile, Role } from "@prisma/client";

/**
 * Multi-tenancy guardrails. Every client-facing query must be scoped by
 * clientId. Prefer resolving the tenant via these helpers rather than trusting
 * a clientId from the request body.
 */

export class AuthError extends Error {}
export class ForbiddenError extends Error {}

export interface SessionActor {
  userId: string;
  email: string;
  role: Role;
}

/** Require an authenticated user (any role). */
export async function requireUser(): Promise<SessionActor> {
  const session = await auth();
  if (!session?.user?.id) throw new AuthError("Not authenticated");
  return {
    userId: session.user.id,
    email: session.user.email ?? "",
    role: session.user.role,
  };
}

export async function requireAdmin(): Promise<SessionActor> {
  const actor = await requireUser();
  if (actor.role !== "ADMIN") throw new ForbiddenError("Admin only");
  return actor;
}

/**
 * Resolve the ClientProfile for the current session.
 * Admins may pass an explicit clientId (for impersonate / view-as); clients are
 * always locked to their own profile regardless of any supplied id.
 */
export async function requireClient(
  requestedClientId?: string,
): Promise<{ actor: SessionActor; client: ClientProfile }> {
  const actor = await requireUser();

  if (actor.role === "ADMIN" && requestedClientId) {
    const client = await prisma.clientProfile.findUnique({
      where: { id: requestedClientId },
    });
    if (!client) throw new ForbiddenError("Client not found");
    return { actor, client };
  }

  const client = await prisma.clientProfile.findUnique({
    where: { userId: actor.userId },
  });
  if (!client) throw new ForbiddenError("No client profile for this user");
  return { actor, client };
}

/** Assert a row belongs to the given tenant. Use before any mutation. */
export function assertOwnership(row: { clientId: string }, clientId: string) {
  if (row.clientId !== clientId) throw new ForbiddenError("Cross-tenant access denied");
}
