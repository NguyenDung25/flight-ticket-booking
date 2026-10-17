export default function Card({ children, stub, className = "" }) {
  if (!stub) {
    return (
      <div
        className={`rounded-xl border border-sand-100 bg-white ${className}`}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className={`ticket-stub relative flex overflow-hidden rounded-xl border border-sand-100 bg-white ${className}`}
    >
      <div className="flex-1 p-5">{children}</div>
      <div
        aria-hidden="true"
        className="border-l border-sand-100"
      />
      <div className="flex min-w-[9rem] flex-col items-center justify-center gap-2 p-5 text-center">
        {stub}
      </div>
    </div>
  );
}
