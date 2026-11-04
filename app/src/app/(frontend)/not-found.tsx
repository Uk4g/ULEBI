import Link from "next/link"

/**
 * Custom not-found page for the frontend.
 * This renders when `notFound()` is called from any page in the (frontend) route group.
 *
 * Customize this component to match your app's design and provide helpful navigation.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-center justify-center px-8 py-16 text-center">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-white">Page not found</h1>
      <p className="mt-4 text-slate-400">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        className="mt-6 font-medium text-accent underline-offset-4 hover:underline"
        href="/"
      >
        &larr; Back to the ULEBI home page
      </Link>
    </main>
  )
}
