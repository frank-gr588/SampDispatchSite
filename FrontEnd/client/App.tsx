import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import NotFound from "./pages/NotFound";
import ErrorBoundary from "./components/ErrorBoundary";
import Dashboard from "./pages/Dashboard";
import MapView from "./pages/MapView";
import BoardView from "./pages/BoardView";
import ManagementView from "./pages/ManagementView";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: true },
  },
});

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Dashboard />,
      errorElement: <ErrorBoundary />,
      children: [
        { index: true, element: <MapView /> },
        { path: "board", element: <BoardView /> },
        { path: "management", element: <ManagementView /> },
      ],
    },
    { path: "*", element: <NotFound />, errorElement: <ErrorBoundary /> },
  ],
  {
    future: ({
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    } as any),
  }
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <RouterProvider router={router} />
    </TooltipProvider>
  </QueryClientProvider>
);

createRoot(document.getElementById("root")!).render(<App />);
