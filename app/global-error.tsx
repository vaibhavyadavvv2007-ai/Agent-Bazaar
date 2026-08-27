"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-[#f4eeda] p-6 text-[#1c1a17]">
        <div className="w-full max-w-md border-[1.5px] border-[#1c1a17] bg-[#faf6ea] p-8 text-center shadow-[4px_4px_0_#1c1a17]">
          <h2 className="font-masthead text-2xl font-bold uppercase tracking-tight text-[#b3282d]">Fatal Error</h2>
          <p className="mt-4 font-clause text-sm text-[#57503f]">
            The Gazette encountered an unrecoverable failure.
          </p>
          <div className="mt-4 border-t border-b border-[#d8cdb0] py-3 text-left">
            <pre className="overflow-x-auto font-clause text-[10px] text-[#1c1a17]">
              {error.message || "Unknown error occurred"}
            </pre>
          </div>
          <button
            onClick={() => reset()}
            className="mt-6 border-[1.5px] border-[#1c1a17] bg-transparent px-6 py-2 font-clause text-xs font-bold uppercase tracking-wider hover:bg-[#1c1a17] hover:text-[#f4eeda]"
          >
            Attempt Recovery
          </button>
        </div>
      </body>
    </html>
  );
}
