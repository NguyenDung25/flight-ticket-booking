function SkeletonCard() {
  return (
    <div className="flex w-full items-center justify-between gap-4 rounded-2xl border border-sand-100 bg-white p-5">
      <div className="flex-1 animate-pulse">
        <div className="h-3 w-32 rounded bg-sand-100" />
        <div className="mt-3 flex items-center gap-3">
          <div className="h-6 w-12 rounded bg-sand-100" />
          <div className="h-3 w-4 rounded bg-sand-100" />
          <div className="h-6 w-12 rounded bg-sand-100" />
        </div>
        <div className="mt-3 h-3 w-24 rounded bg-sand-100" />
      </div>
      <div className="flex animate-pulse flex-col items-center gap-2">
        <div className="h-5 w-20 rounded bg-sand-100" />
        <div className="h-9 w-28 rounded-lg bg-sand-100" />
      </div>
    </div>
  );
}

export default function SearchLoading() {
  return (
    <div className="flex flex-1 flex-col items-center gap-4 bg-sand-50 px-4 py-12 sm:px-16">
      <div className="flex w-full max-w-3xl flex-col gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
