import { useState, type ReactNode } from "react";
import { Navigate, Outlet, createBrowserRouter, type RouteObject } from "react-router";
import { RouterProvider } from "react-router/dom";
import { useSession } from "../auth/session";
import { LoginPage } from "../features/auth/LoginPage";
import { DemoLoginsCard } from "../features/demo/DemoLoginsCard";
import { CategoriesPage } from "../features/inventory/CategoriesPage";
import { CountPage } from "../features/inventory/CountPage";
import { EditProductPage, NewProductPage } from "../features/inventory/ProductForm";
import { ProductsPage } from "../features/inventory/ProductsPage";
import { RestockPage } from "../features/inventory/RestockPage";
import { PosScreen } from "../features/pos/PosScreen";
import { SukiLedgerPage } from "../features/suki/SukiLedgerPage";
import { SukiListPage } from "../features/suki/SukiListPage";
import { AppShell, type RouteHandle } from "./AppShell";
import { PagePlaceholder, ScreenPlaceholder } from "./Placeholder";
import { Providers } from "./Providers";

const page = (path: string, title: string, element: ReactNode): RouteObject => ({ path, element, handle: { title } satisfies RouteHandle });
const screen = (path: string, title: string) => page(path, title, <ScreenPlaceholder />);

/** The owner lands on the dashboard; a bantay goes straight to the POS. */
function AppHome() {
  const session = useSession();
  return session?.user.role === "OWNER" ? <ScreenPlaceholder /> : <Navigate to="/app/pos" replace />;
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
      screen("sales", "Sales"),
      page("suki", "Suki", <SukiListPage />),
      page("suki/:id", "Suki ledger", <SukiLedgerPage />),
      screen("shift", "My shift"),
      {
        path: "settings",
        // Task 28 builds the rest of Settings; the demo logins card is needed from the first sign-in.
        element: (
          <div className="flex flex-col gap-6">
            <DemoLoginsCard />
            <ScreenPlaceholder />
          </div>
        ),
        handle: { title: "Settings" } satisfies RouteHandle,
      },
      {
        element: <RequireOwner />,
        children: [
          page("products", "Products", <ProductsPage />),
          page("products/new", "New product", <NewProductPage />),
          page("products/:id", "Edit product", <EditProductPage />),
          page("categories", "Categories", <CategoriesPage />),
          page("stock/restock", "Restock", <RestockPage />),
          page("stock/count", "Stock count", <CountPage />),
          screen("reports", "Reports"),
          screen("review", "Needs review"),
          screen("staff", "Staff"),
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
