// lib/ancillaries.js
//
// Hành lý ký gửi + suất ăn (dịch vụ bổ sung) — chọn theo TỪNG hành khách, TỪNG chặng. Dùng chung cho
// server (tính tiền khi tạo booking — KHÔNG tin giá client gửi) và giao diện (hiện giá, tạm tính).
//
// Bảng giá (`pricing`) do admin sửa ở Admin → Dịch vụ bổ sung, lưu trong collection Setting
// (services/ancillaryPricingService.js). File này KHÔNG đọc DB — nơi gọi truyền bảng giá vào; chưa có
// bảng giá trong DB thì dùng DEFAULT_PRICING.
//
// - Hành lý xách tay: `carry_on_kg` cho mọi hạng (miễn phí, chỉ hiển thị).
// - Hành lý ký gửi đã gồm theo hạng (`included_checked_kg`), mua thêm theo gói (`baggage_packages`).
// - Suất ăn: theo hạng — đã gồm (`meal_included`) hoặc trả `meal_price`.
// Tiền dịch vụ cộng thẳng vào flights[].amount của chặng đó nên bất biến total_amount = Σ
// flights[].amount (ghi chú t) và mọi phép tính hoàn tiền khi hủy vé giữ nguyên. Mỗi ghế trong booking
// lưu lại giá + số kg TẠI LÚC ĐẶT, nên admin đổi bảng giá không làm thay đổi booking cũ.

const SEAT_CLASSES = ["economy", "business"];

const DEFAULT_PRICING = Object.freeze({
  carry_on_kg: 7,
  included_checked_kg: { economy: 0, business: 30 },
  // Gói hành lý ký gửi mua thêm (VNĐ / khách / chặng).
  baggage_packages: [
    { kg: 15, price: 200_000 },
    { kg: 20, price: 250_000 },
    { kg: 25, price: 320_000 },
    { kg: 30, price: 400_000 },
  ],
  meal_price: { economy: 80_000, business: 80_000 },
  meal_included: { economy: false, business: true },
});

// Giới hạn khi admin sửa bảng giá (chặn nhập nhầm số vô lý).
const LIMITS = Object.freeze({
  maxPackages: 8,
  maxKg: 100,
  maxCarryOnKg: 30,
  maxPrice: 10_000_000,
});

class AncillaryError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function toInt(value, label, min, max) {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new AncillaryError(`${label} phải là số nguyên từ ${min} đến ${max.toLocaleString("vi-VN")}.`);
  }
  return n;
}

/**
 * Kiểm tra + chuẩn hóa bảng giá admin gửi lên.
 * @returns {Object} bảng giá sạch (gói hành lý sắp theo kg tăng dần)
 * @throws {AncillaryError} 400 nếu thiếu/sai giá trị
 */
function normalizePricing(raw) {
  if (!raw || typeof raw !== "object") throw new AncillaryError("Bảng giá không hợp lệ.");

  const carry_on_kg = toInt(raw.carry_on_kg, "Hành lý xách tay (kg)", 0, LIMITS.maxCarryOnKg);
  const included_checked_kg = {};
  const meal_price = {};
  const meal_included = {};
  for (const c of SEAT_CLASSES) {
    const name = c === "economy" ? "phổ thông" : "thương gia";
    included_checked_kg[c] = toInt(raw.included_checked_kg?.[c], `Ký gửi đã gồm hạng ${name} (kg)`, 0, LIMITS.maxKg);
    meal_price[c] = toInt(raw.meal_price?.[c], `Giá suất ăn hạng ${name}`, 0, LIMITS.maxPrice);
    meal_included[c] = raw.meal_included?.[c] === true;
  }

  if (!Array.isArray(raw.baggage_packages)) throw new AncillaryError("Danh sách gói hành lý không hợp lệ.");
  if (raw.baggage_packages.length > LIMITS.maxPackages) {
    throw new AncillaryError(`Tối đa ${LIMITS.maxPackages} gói hành lý ký gửi.`);
  }
  const baggage_packages = raw.baggage_packages
    .map((p, i) => ({
      kg: toInt(p?.kg, `Gói hành lý ${i + 1}: số kg`, 1, LIMITS.maxKg),
      price: toInt(p?.price, `Gói hành lý ${i + 1}: giá`, 0, LIMITS.maxPrice),
    }))
    .sort((a, b) => a.kg - b.kg);
  for (let i = 1; i < baggage_packages.length; i++) {
    if (baggage_packages[i].kg === baggage_packages[i - 1].kg) {
      throw new AncillaryError(`Có 2 gói hành lý cùng ${baggage_packages[i].kg}kg.`);
    }
  }

  return { carry_on_kg, included_checked_kg, baggage_packages, meal_price, meal_included };
}

/** Bảng giá đọc từ DB: hỏng/thiếu thì quay về mặc định (không làm sập trang đặt vé). */
function pricingOrDefault(raw) {
  if (!raw) return DEFAULT_PRICING;
  try {
    return normalizePricing(raw);
  } catch {
    return DEFAULT_PRICING;
  }
}

/** Các lựa chọn số kg mua thêm (0 = không mua), tăng dần. */
const baggageOptions = (pricing = DEFAULT_PRICING) => [0, ...pricing.baggage_packages.map((p) => p.kg)];

/** Giá gói hành lý `kg` (0 -> 0đ), undefined nếu không có gói này. */
function baggagePrice(kg, pricing = DEFAULT_PRICING) {
  if (kg === 0) return 0;
  return pricing.baggage_packages.find((p) => p.kg === kg)?.price;
}

/** Tổng kg hành lý ký gửi được mang (đã gồm theo hạng + gói mua thêm). */
function checkedBaggageAllowance(seatClass, baggageKg = 0, pricing = DEFAULT_PRICING) {
  return (pricing.included_checked_kg[seatClass] ?? 0) + (Number(baggageKg) || 0);
}

/**
 * Chuẩn hóa + tính giá dịch vụ của 1 ghế (1 khách, 1 chặng), kèm số kg TẠI LÚC ĐẶT để lưu vào booking.
 * @param {{ baggage_kg?: number|string, meal?: boolean }} input - lựa chọn client gửi
 * @param {"economy"|"business"} seatClass - hạng ghế THẬT (đã đối chiếu với Flight)
 * @returns {{ baggage_kg, meal, addons_amount, carry_on_kg, checked_baggage_kg }}
 * @throws {AncillaryError} 400 gói hành lý không tồn tại
 */
function priceAddons(input, seatClass, pricing = DEFAULT_PRICING) {
  const kg = Number(input?.baggage_kg ?? 0);
  const bagPrice = Number.isInteger(kg) ? baggagePrice(kg, pricing) : undefined;
  if (bagPrice === undefined) {
    throw new AncillaryError(`Gói hành lý ký gửi không hợp lệ (chọn ${baggageOptions(pricing).join("/")} kg).`);
  }
  const included = pricing.meal_included[seatClass] === true;
  const meal = included ? true : input?.meal === true;
  return {
    baggage_kg: kg,
    meal,
    addons_amount: bagPrice + (meal && !included ? pricing.meal_price[seatClass] ?? 0 : 0),
    carry_on_kg: pricing.carry_on_kg,
    checked_baggage_kg: checkedBaggageAllowance(seatClass, kg, pricing),
  };
}

module.exports = {
  SEAT_CLASSES,
  DEFAULT_PRICING,
  LIMITS,
  AncillaryError,
  normalizePricing,
  pricingOrDefault,
  baggageOptions,
  baggagePrice,
  checkedBaggageAllowance,
  priceAddons,
};
