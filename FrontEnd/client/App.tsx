import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import ErrorBoundary from "./components/ErrorBoundary";
import { DataProvider } from "./contexts/DataContext";

const queryClient = new QueryClient();

// Create a router and opt-in to React Router v7 future flags (silences the deprecation warnings)
const router = createBrowserRouter(
  [
    { path: "/", element: <Index />, errorElement: <ErrorBoundary /> },
    // ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE
    { path: "*", element: <NotFound />, errorElement: <ErrorBoundary /> },
  ],
  {
    // Cast to any to avoid TypeScript type mismatch while still passing the runtime future flags
    future: ({
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    } as any),
  }
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <DataProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <RouterProvider router={router} />
      </TooltipProvider>
    </DataProvider>
  </QueryClientProvider>
);

createRoot(document.getElementById("root")!).render(<App />);
