import { useState, type ReactNode } from "react";
import { Navigate, Outlet, createBrowserRouter, type RouteObject } from "react-router";
import { RouterProvider } from "react-router/dom";
import { useSession } from "../auth/session";
import { LoginPage } from "../features/auth/LoginPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { CategoriesPage } from "../features/inventory/CategoriesPage";
import { CountPage } from "../features/inventory/CountPage";
import { EditProductPage, NewProductPage } from "../features/inventory/ProductForm";
import { ProductsPage } from "../features/inventory/ProductsPage";
import { RestockPage } from "../features/inventory/RestockPage";
import { PosScreen } from "../features/pos/PosScreen";
import { ReportsPage } from "../features/reports/ReportsPage";
import { ReviewPage } from "../features/review/ReviewPage";
import { SalesPage } from "../features/sales/SalesPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { MyShiftPage } from "../features/shift/MyShiftPage";
import { StaffPage } from "../features/staff/StaffPage";
import { SukiLedgerPage } from "../features/suki/SukiLedgerPage";
import { SukiListPage } from "../features/suki/SukiListPage";
import { AppShell, type RouteHandle } from "./AppShell";
import { PagePlaceholder } from "./Placeholder";
import { Providers } from "./Providers";

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
  { path: "/", element: <PagePlaceholder title="SariSari POS" /> },
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
  { path: "/barcodes", element: <PagePlaceholder title="Sample barcodes" /> },
  { path: "/credits", element: <PagePlaceholder title="Credits" /> },
  { path: "*", element: <PagePlaceholder title="Page not found" /> },
];

/** Every page sits under the providers (the query cache). */
export const routes: RouteObject[] = [{ element: <Providers />, children: pages }];

export function App() {
  const [router] = useState(() => createBrowserRouter(routes));
  return <RouterProvider router={router} />;
}
