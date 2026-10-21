import type { Role } from "@sari/shared";
import {
  ChartColumn,
  ClipboardCheck,
  Clock,
  LayoutDashboard,
  Package,
  ReceiptText,
  ShoppingCart,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Paths that light this item up; "/app" alone matches only the dashboard itself. */
  match: string[];
};

const pos: NavItem = { to: "/app/pos", label: "POS", icon: ShoppingCart, match: ["/app/pos"] };
const suki: NavItem = { to: "/app/suki", label: "Suki", icon: Users, match: ["/app/suki"] };

const OWNER_ITEMS: NavItem[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, match: [] },
  pos,
  { to: "/app/sales", label: "Sales", icon: ReceiptText, match: ["/app/sales"] },
  // Restock, Count and Categories are reached from Products, so Products stays lit on those screens.
  { to: "/app/products", label: "Products", icon: Package, match: ["/app/products", "/app/categories", "/app/stock"] },
  suki,
  { to: "/app/reports", label: "Reports", icon: ChartColumn, match: ["/app/reports"] },
  { to: "/app/review", label: "Review", icon: ClipboardCheck, match: ["/app/review"] },
  { to: "/app/staff", label: "Staff", icon: UserCog, match: ["/app/staff"] },
];

const BANTAY_ITEMS: NavItem[] = [pos, suki, { to: "/app/shift", label: "My shift", icon: Clock, match: ["/app/shift"] }];

/** The rail's sections for each role (spec 7.4). */
export function navItems(role: Role): NavItem[] {
  return role === "OWNER" ? OWNER_ITEMS : BANTAY_ITEMS;
}

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.to === "/app") return pathname === "/app" || pathname === "/app/";
  return item.match.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
