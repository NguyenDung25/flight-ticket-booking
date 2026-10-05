// app/admin/promotions/page.js
//
// A5 — quản lý mã khuyến mãi (tùy chọn, đúng kế hoạch "làm sau cùng nếu còn
// thời gian"). Cùng mức tối giản với app/admin/aircraft, app/admin/airlines:
// có thêm sửa/xóa qua PromotionsTable.jsx (route [id]/route.js).
//
// Gọi thẳng Promotion.find() (KHÔNG qua /api/admin/promotions) — đúng
// convention mọi page.js khác trong khu Admin.

import dbConnect from "@/lib/mongodb";
import Promotion from "@/models/Promotion";
import { nowVN, toVN } from "@/lib/timezone";
import PromotionForm from "./PromotionForm";
import PromotionsTable from "./PromotionsTable";

export const metadata = {
  title: "Khuyến mãi — Quản trị",
};

export default async function AdminPromotionsPage() {
  await dbConnect();
  const promotionDocs = await Promotion.find().sort({ created_at: -1 }).lean();

  const now = nowVN().toDate();
  const promotions = promotionDocs.map((p) => {
    let statusLabel = "Đang hiệu lực";
    if (now < p.valid_from) statusLabel = "Chưa tới hạn";
    else if (now > p.valid_until) statusLabel = "Đã hết hạn";
    else if (p.usage_limit != null && p.used_count >= p.usage_limit) statusLabel = "Đã hết lượt";

    return {
      id: String(p._id),
      code: p.code,
      discount_percent: p.discount_percent,
      // valid_until lưu ở DB là 00:00 VN của NGÀY KẾ TIẾP (xem route POST) —
      // trừ 1ms để ra đúng ngày CUỐI CÙNG còn hiệu lực mà admin đã chọn (trước
      // đây bảng hiển thị lệch +1 ngày).
      valid_from_date: toVN(p.valid_from).format("YYYY-MM-DD"),
      valid_until_date: toVN(new Date(p.valid_until.getTime() - 1)).format("YYYY-MM-DD"),
      valid_from_label: toVN(p.valid_from).format("DD/MM/YYYY"),
      valid_until_label: toVN(new Date(p.valid_until.getTime() - 1)).format("DD/MM/YYYY"),
      usage_limit: p.usage_limit,
      used_count: p.used_count,
      statusLabel,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-sea-900">Khuyến mãi</h1>
        <p className="text-sm text-ink/60">
          {promotions.length} mã. Áp dụng lúc khách tạo booking (C6) — giảm đều theo % trên toàn bộ
          giá vé (mọi chặng). Có thể sửa % / ngày / giới hạn lượt (không đổi được mã); chỉ xóa được
          mã chưa có booking nào dùng.
        </p>
      </div>

      <PromotionForm />

      <PromotionsTable promotions={promotions} />
    </div>
  );
}
