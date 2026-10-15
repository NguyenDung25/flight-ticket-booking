// app/api/payments/vnpay-ipn/route.js
//
// C6 — IPN của VNPay: sau khi khách thanh toán xong, VNPay gọi ngầm (server -> server)
// GET tới URL này, kèm toàn bộ kết quả trên query string (vnp_TxnRef, vnp_Amount,
// vnp_ResponseCode, vnp_TransactionStatus, vnp_SecureHash...). Không có session —
// xác minh chữ ký ngay trong paymentService.handleWebhook(), KHÔNG qua requireActiveUser.
//
// URL này phải được khai báo ở trang quản trị merchant VNPay (IPN URL), dạng
// https://<địa chỉ ngrok>/api/payments/vnpay-ipn — VNPay không nhận IPN URL theo từng giao dịch.
//
// Phản hồi LUÔN là HTTP 200 + JSON { RspCode, Message } theo quy ước VNPay. VNPay ngừng gửi
// lại khi nhận "00" (đã xử lý) hoặc "02" (đơn đã xác nhận từ trước); mã khác ("97" sai chữ ký,
// "01" không thấy đơn, "04" sai số tiền, "99" lỗi khác) VNPay ghi nhận/gửi lại theo chính sách của họ.

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { handleWebhook } from "@/services/paymentService";

const MESSAGES = {
  "00": "Confirm Success",
  "01": "Order not found",
  "02": "Order already confirmed",
  "04": "Invalid amount",
  "97": "Invalid Checksum",
  "99": "Unknown error",
};

function reply(rspCode) {
  return NextResponse.json({ RspCode: rspCode, Message: MESSAGES[rspCode] ?? MESSAGES["99"] });
}

export async function GET(request) {
  // Giữ tham số đầu tiên của mỗi key; key lặp lại được đánh dấu mảng để verify từ chối.
  const query = {};
  for (const [key, value] of request.nextUrl.searchParams) {
    query[key] = Object.hasOwn(query, key) ? [].concat(query[key], value) : value;
  }

  try {
    await dbConnect();
    const { rspCode } = await handleWebhook(query);
    return reply(rspCode);
  } catch (err) {
    if (err && typeof err.rspCode === "string") {
      if (err.rspCode !== "00") console.error(`[vnpay-ipn] ${err.rspCode}: ${err.message}`);
      return reply(err.rspCode);
    }
    console.error("[vnpay-ipn] lỗi không mong đợi:", err);
    return reply("99");
  }
}
