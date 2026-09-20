'use client';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-center text-2xl font-bold leading-tight md:text-3xl">
        Something went wrong
      </h1>
      <p className="break-words text-center text-sm text-gray-600 md:text-base">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="min-h-12 w-full rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 sm:w-auto"
      >
        Try again
      </button>
    </main>
  );
}
