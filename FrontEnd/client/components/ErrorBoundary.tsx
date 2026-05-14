import React from "react";

export default function ErrorBoundary({ error }: { error?: Error | null }) {
  return (
    <div className="h-screen flex items-center justify-center bg-[#020304]">
      <div className="border border-[#ff2020] bg-[#060a0e] p-6 max-w-[500px]">
        <div className="text-[#ff2020] text-[12px] tracking-[3px] uppercase mb-3">[ERROR] SYSTEM FAULT</div>
        <div className="text-[#5a9a5a] text-[10px] mb-4 border-b border-[#003d10] pb-3">
          An unexpected error occurred while rendering this page.
        </div>
        {error && (
          <pre className="text-[#007a1f] text-[10px] mb-4 p-2 bg-[#020304] border border-[#003d10] overflow-auto max-h-[200px]">
            {String(error.stack || error.message)}
          </pre>
        )}
        <button onClick={() => window.location.reload()}
          className="border border-[#007a1f] bg-[#003d10] text-[#33ff66] text-[10px] uppercase tracking-[2px] px-4 py-2 hover:bg-[#007a1f] hover:text-[#020304]">
          RELOAD SYSTEM
        </button>
      </div>
    </div>
  );
}
