// app/[locale]/search/loading.js
//
// Next.js App Router special file — TỰ ĐỘNG hiện trong lúc page.js (Server
// Component) đang chạy searchFlights()/dbConnect() (issue UI đã sửa: trước
// đây tìm kiếm trên mạng chậm sẽ trắng trang, không có phản hồi gì). KHÔNG
// nhận props (locale/searchParams) — đây là quy ước riêng của Next.js cho
// loading.js, khác hẳn page.js — nên component này CỐ TÌNH không có chữ nào
// cần dịch, chỉ dựng khung skeleton nhấp nháy mô phỏng đúng bố cục
// FlightCard.jsx, để không phải phụ thuộc next-intl (không có locale ở đây
// để gọi getTranslations).

function SkeletonCard() {
  return (
    <div className="flex w-full items-center justify-between gap-4 rounded-2xl border border-sand-100 bg-white/70 p-5">
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
