import { Link } from "@tanstack/react-router";

export function NotFound() {
  return (
    <main className="page-width py-20">
      <h1 className="text-2xl">Page not found</h1>
      <Link to="/" className="text-link mt-5 inline-block">
        Back to FluentCI
      </Link>
    </main>
  );
}
