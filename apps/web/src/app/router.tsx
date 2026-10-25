import { lazy, useState, type ComponentType, type ReactNode } from "react";
import { Navigate, Outlet, createBrowserRouter, type RouteObject } from "react-router";
import { RouterProvider } from "react-router/dom";
import { useSession } from "../auth/session";
import { LandingPage } from "../landing/LandingPage";
import type { RouteHandle } from "./AppShell";
import { Providers } from "./Providers";

/**
 * Every screen but the landing page is its own chunk, so a first visit downloads only the landing; the service
 * worker still precaches them all for offline use.
 */
function lazily<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then((module) => ({ default: module[name] })));
}
const AppShell = lazily(() => import("./AppShell"), "AppShell");
const LoginPage = lazily(() => import("../features/auth/LoginPage"), "LoginPage");
const SampleBarcodesPage = lazily(() => import("../features/barcodes/SampleBarcodesPage"), "SampleBarcodesPage");
const CreditsPage = lazily(() => import("../features/credits/CreditsPage"), "CreditsPage");
const DashboardPage = lazily(() => import("../features/dashboard/DashboardPage"), "DashboardPage");
const CategoriesPage = lazily(() => import("../features/inventory/CategoriesPage"), "CategoriesPage");
const CountPage = lazily(() => import("../features/inventory/CountPage"), "CountPage");
const NewProductPage = lazily(() => import("../features/inventory/ProductForm"), "NewProductPage");
const EditProductPage = lazily(() => import("../features/inventory/ProductForm"), "EditProductPage");
const ProductsPage = lazily(() => import("../features/inventory/ProductsPage"), "ProductsPage");
const RestockPage = lazily(() => import("../features/inventory/RestockPage"), "RestockPage");
const NotFoundPage = lazily(() => import("../features/notFound/NotFoundPage"), "NotFoundPage");
const PosScreen = lazily(() => import("../features/pos/PosScreen"), "PosScreen");
const ReportsPage = lazily(() => import("../features/reports/ReportsPage"), "ReportsPage");
const ReviewPage = lazily(() => import("../features/review/ReviewPage"), "ReviewPage");
const SalesPage = lazily(() => import("../features/sales/SalesPage"), "SalesPage");
const SettingsPage = lazily(() => import("../features/settings/SettingsPage"), "SettingsPage");
const MyShiftPage = lazily(() => import("../features/shift/MyShiftPage"), "MyShiftPage");
const StaffPage = lazily(() => import("../features/staff/StaffPage"), "StaffPage");
const SukiLedgerPage = lazily(() => import("../features/suki/SukiLedgerPage"), "SukiLedgerPage");
const SukiListPage = lazily(() => import("../features/suki/SukiListPage"), "SukiListPage");

const page = (path: string, title: string, element: ReactNode): RouteObject => ({ path, element, handle: { title } satisfies RouteHandle });

/** The owner lands on the dashboard; a bantay goes straight to the POS. */
function AppHome() {
  const session = useSession();
  return session?.user.role === "OWNER" ? <DashboardPage /> : <Navigate to="/app/pos" replace />;
}

/** Owner screens (spec 7.4). The API refuses a bantay anyway; this keeps them out of screens they cannot use. */
function RequireOwner() {
  const session = useSession();
  return session?.user.role === "OWNER" ? <Outlet /> : <Navigate to="/app/pos" replace />;
}

const pages: RouteObject[] = [
  { path: "/", element: <LandingPage /> },
  { path: "/login", element: <LoginPage /> },
  {
    path: "/app",
    element: <AppShell />,
    children: [
      { index: true, element: <AppHome />, handle: { title: "Dashboard" } satisfies RouteHandle },
      { path: "pos", element: <PosScreen />, handle: { title: "POS" } satisfies RouteHandle },
      page("suki", "Suki", <SukiListPage />),
      page("suki/:id", "Suki ledger", <SukiLedgerPage />),
      page("shift", "My shift", <MyShiftPage />),
      page("settings", "Settings", <SettingsPage />),
      {
        element: <RequireOwner />,
        children: [
          page("sales", "Sales", <SalesPage />),
          page("products", "Products", <ProductsPage />),
          page("products/new", "New product", <NewProductPage />),
          page("products/:id", "Edit product", <EditProductPage />),
          page("categories", "Categories", <CategoriesPage />),
          page("stock/restock", "Restock", <RestockPage />),
          page("stock/count", "Stock count", <CountPage />),
          page("reports", "Reports", <ReportsPage />),
          page("review", "Needs review", <ReviewPage />),
          page("staff", "Staff", <StaffPage />),
        ],
      },
    ],
  },
  { path: "/barcodes", element: <SampleBarcodesPage /> },
  { path: "/credits", element: <CreditsPage /> },
  { path: "*", element: <NotFoundPage /> },
];

/** Every page sits under the providers (the query cache). */
export const routes: RouteObject[] = [{ element: <Providers />, children: pages }];

export function App() {
  const [router] = useState(() => createBrowserRouter(routes));
  return <RouterProvider router={router} />;
}
