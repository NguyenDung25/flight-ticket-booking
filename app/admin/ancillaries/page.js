import Link from "next/link";
import dbConnect from "@/lib/mongodb";
import { guardAdminPage } from "@/lib/adminPageGuard";
import { toVN } from "@/lib/timezone";
import Airline from "@/models/Airline";
import { getAncillaryPricingInfo, listAirlinesWithOwnPricing } from "@/services/ancillaryPricingService";
import AncillaryPricingForm from "./AncillaryPricingForm";

export const metadata = {
  title: "Dịch vụ bổ sung — Quản trị",
};

export default async function AdminAncillariesPage({ searchParams }) {
  await guardAdminPage();
  await dbConnect();
  const sp = await searchParams;

  const [airlineDocs, ownCodes] = await Promise.all([Airline.find().sort({ code: 1 }).lean(), listAirlinesWithOwnPricing()]);
  const airlines = airlineDocs.map((a) => ({ code: a.code, name: a.name?.vi || a.code, hasOwn: ownCodes.includes(a.code) }));
  // Mã hãng không tồn tại trên URL -> về bảng chung.
  const selected = airlines.find((a) => a.code === sp.airline)?.code ?? "";
  const { pricing, updated_at, is_default, has_own } = await getAncillaryPricingInfo(selected);

  const tabCls = (active) =>
    `rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? "border-sea-500 bg-sea-500 text-white" : "border-sand-100 bg-white text-ink/70 hover:bg-sea-50"
    }`;
  const selectedName = airlines.find((a) => a.code === selected)?.name;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-sea-900">Dịch vụ bổ sung</h1>
        <p className="text-sm text-ink/60">
          Bảng giá hành lý ký gửi và suất ăn khách chọn ở bước nhập hành khách (tính theo từng khách, từng
          chặng). Mỗi hãng có thể có bảng giá riêng; hãng chưa chỉnh thì dùng bảng giá chung. Giá mới chỉ áp
          dụng cho booking tạo sau khi lưu — vé đã bán giữ nguyên giá và số kg lúc đặt.
        </p>
      </div>

      <nav aria-label="Chọn hãng bay" className="flex flex-wrap gap-2">
        <Link href="/admin/ancillaries" className={tabCls(selected === "")}>
          Giá chung
        </Link>
        {airlines.map((a) => (
          <Link
            key={a.code}
            href={`/admin/ancillaries?airline=${a.code}`}
            className={tabCls(selected === a.code)}
            title={a.hasOwn ? "Đã có bảng giá riêng" : "Đang dùng giá chung"}
          >
            {a.name}
            {a.hasOwn && <span aria-label="đã có bảng giá riêng"> ●</span>}
          </Link>
        ))}
      </nav>

      <p className="text-sm text-ink/70">
        {selected === "" ? (
          <>
            <strong>Giá chung</strong> — áp dụng cho mọi hãng chưa có bảng giá riêng.{" "}
          </>
        ) : has_own ? (
          <>
            <strong>{selectedName}</strong> đang dùng <strong>bảng giá riêng</strong>.{" "}
          </>
        ) : (
          <>
            <strong>{selectedName}</strong> chưa có bảng giá riêng nên đang dùng giá chung. Sửa và lưu bên dưới để
            tạo bảng giá riêng cho hãng này.{" "}
          </>
        )}
        {is_default || !updated_at ? "Đang dùng giá mặc định của hệ thống." : `Cập nhật lần cuối: ${toVN(updated_at).format("HH:mm DD/MM/YYYY")}.`}
      </p>

      <AncillaryPricingForm
        key={selected || "general"}
        initialPricing={JSON.parse(JSON.stringify(pricing))}
        airlineCode={selected}
        hasOwn={has_own}
      />
    </div>
  );
}
