import type { StoreView, UserView } from "@sari/shared";
import type { Store, User } from "../generated/prisma/client.js";

export function toUserView(user: Pick<User, "id" | "role" | "username" | "displayName">): UserView {
  return { id: user.id, role: user.role, username: user.username, displayName: user.displayName };
}

export function toStoreView(store: Pick<Store, "id" | "code" | "name" | "expiresAt">): StoreView {
  return { id: store.id, code: store.code, name: store.name, expiresAt: store.expiresAt.toISOString() };
}
