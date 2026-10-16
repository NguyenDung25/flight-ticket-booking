// lib/ancillaries.js
//
// Hành lý ký gửi + suất ăn (dịch vụ bổ sung) — chọn theo TỪNG hành khách, TỪNG chặng. Dùng chung cho
// server (tính tiền khi tạo booking — KHÔNG tin giá client gửi) và giao diện (hiện giá, tạm tính).
//
// - Hành lý xách tay: 7kg cho mọi hạng (miễn phí, chỉ hiển thị).
// - Hành lý ký gửi: hạng phổ thông 0kg miễn phí, mua thêm gói 15–30kg; thương gia đã gồm 30kg (vẫn
//   mua thêm được, cộng dồn).
// - Suất ăn: phổ thông trả phí; thương gia đã gồm (không tính tiền).
// Tiền dịch vụ cộng thẳng vào flights[].amount của chặng đó nên bất biến total_amount = Σ
// flights[].amount (ghi chú t) và mọi phép tính hoàn tiền khi hủy vé giữ nguyên.

const CARRY_ON_KG = 7;
const INCLUDED_CHECKED_BAGGAGE_KG = { economy: 0, business: 30 };
// Gói hành lý ký gửi mua thêm (kg -> giá VNĐ / khách / chặng). 0 = không mua.
const BAGGAGE_PACKAGES = { 0: 0, 15: 200_000, 20: 250_000, 25: 320_000, 30: 400_000 };
const MEAL_PRICE = { economy: 80_000, business: 0 };
const MEAL_INCLUDED = { economy: false, business: true };

class AncillaryError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const baggageOptions = () => Object.keys(BAGGAGE_PACKAGES).map(Number).sort((a, b) => a - b);

/**
 * Chuẩn hóa + tính giá dịch vụ của 1 ghế (1 khách, 1 chặng).
 * @param {{ baggage_kg?: number|string, meal?: boolean }} input - lựa chọn client gửi
 * @param {"economy"|"business"} seatClass - hạng ghế THẬT (đã đối chiếu với Flight)
 * @returns {{ baggage_kg: number, meal: boolean, addons_amount: number }}
 * @throws {AncillaryError} 400 gói hành lý không tồn tại
 */
function priceAddons(input, seatClass) {
  const raw = input?.baggage_kg ?? 0;
  const kg = Number(raw);
  if (!Number.isInteger(kg) || !(kg in BAGGAGE_PACKAGES)) {
    throw new AncillaryError(`Gói hành lý ký gửi không hợp lệ (chọn ${baggageOptions().join("/")} kg).`);
  }
  const meal = MEAL_INCLUDED[seatClass] ? true : input?.meal === true;
  const addons_amount = BAGGAGE_PACKAGES[kg] + (meal ? MEAL_PRICE[seatClass] ?? 0 : 0);
  return { baggage_kg: kg, meal, addons_amount };
}

/** Tổng kg hành lý ký gửi được mang (đã gồm theo hạng + gói mua thêm). */
function checkedBaggageAllowance(seatClass, baggageKg = 0) {
  return (INCLUDED_CHECKED_BAGGAGE_KG[seatClass] ?? 0) + (Number(baggageKg) || 0);
}

module.exports = {
  CARRY_ON_KG,
  INCLUDED_CHECKED_BAGGAGE_KG,
  BAGGAGE_PACKAGES,
  MEAL_PRICE,
  MEAL_INCLUDED,
  AncillaryError,
  baggageOptions,
  priceAddons,
  checkedBaggageAllowance,
};
