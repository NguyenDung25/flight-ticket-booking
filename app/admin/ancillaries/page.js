import dbConnect from "@/lib/mongodb";
import { guardAdminPage } from "@/lib/adminPageGuard";
import { toVN } from "@/lib/timezone";
import { getAncillaryPricingInfo } from "@/services/ancillaryPricingService";
import AncillaryPricingForm from "./AncillaryPricingForm";

export const metadata = {
  title: "Dịch vụ bổ sung — Quản trị",
};

export default async function AdminAncillariesPage() {
  await guardAdminPage();
  await dbConnect();
  const { pricing, updated_at, is_default } = await getAncillaryPricingInfo();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-sea-900">Dịch vụ bổ sung</h1>
        <p className="text-sm text-ink/60">
          Bảng giá hành lý ký gửi và suất ăn khách chọn ở bước nhập hành khách (tính theo từng khách, từng
          chặng). Giá mới chỉ áp dụng cho booking tạo sau khi lưu — vé đã bán giữ nguyên giá và số kg lúc
          đặt.{" "}
          {is_default
            ? "Đang dùng bảng giá mặc định."
            : `Cập nhật lần cuối: ${toVN(updated_at).format("HH:mm DD/MM/YYYY")}.`}
        </p>
      </div>
      <AncillaryPricingForm initialPricing={JSON.parse(JSON.stringify(pricing))} />
    </div>
  );
}
