import React from "react";

export default function ErrorBoundary({ error }: { error?: Error | null }) {
  return (
    <div className="p-8">
      <h2 className="text-xl font-bold mb-2">Unexpected Application Error</h2>
      <p className="mb-4 text-sm text-muted-foreground">An unexpected error occurred while rendering this page.</p>
      {error && (
        <pre className="whitespace-pre-wrap bg-black/5 rounded p-3 text-xs">{String(error.stack || error.message)}</pre>
      )}
      <div className="mt-4">
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center rounded bg-primary px-3 py-2 text-white"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
