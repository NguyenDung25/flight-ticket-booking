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
