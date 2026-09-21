// app/[locale]/page.js — C1: trang tìm kiếm chuyến bay.
//
// Fetch Airport TRỰC TIẾP ở đây (KHÔNG qua /api/airports) — page.js đã chạy
// server-side sẵn, gọi thẳng model tiết kiệm 1 vòng HTTP (giống cách
// register/actions.js gọi thẳng service thay vì tự fetch route của chính
// mình). /api/airports vẫn giữ lại cho client khác cần fetch lại (VD nếu
// sau này thêm nút "đổi chiều" fetch động, hoặc app di động).
//
// Map về mảng thuần TRƯỚC khi truyền cho SearchForm (Client Component) —
// .lean() vẫn có thể lẫn field không cần thiết, và Next.js RSC serialization
// yêu cầu prop truyền qua boundary phải là JSON-serializable thuần túy.

import { getTranslations, setRequestLocale } from "next-intl/server";
import dbConnect from "@/lib/mongodb";
import Airport from "@/models/Airport";
import SearchForm from "./SearchForm";

export default async function HomePage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");

  await dbConnect();
  const airportDocs = await Airport.find({}, "code name city country")
    .sort({ city: 1 })
    .lean();
  const airports = airportDocs.map((a) => ({
    code: a.code,
    name: { vi: a.name.vi, en: a.name.en },
    city: a.city,
  }));

  return (
    <div className="flex flex-col flex-1 items-center gap-8 bg-sand-50 px-4 py-16 sm:px-16">
      <h1 className="font-display text-center text-3xl font-semibold tracking-tight text-sea-900">
        {t("title")}
      </h1>
      <SearchForm airports={airports} locale={locale} />
    </div>
  );
}
