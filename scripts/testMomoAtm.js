// scripts/testMomoAtm.js
//
// Kiểm tra nhanh khóa MoMo + requestType payWithATM bằng cách gọi API Tạo thanh
// toán THẬT của môi trường Test (không cần chạy Next.js, không cần MongoDB):
//   npm run test:momo
// Thành công -> in resultCode 0 + payUrl; mở payUrl và nhập thẻ test
// 9704 0000 0000 0018, hạn 03/07, tên NGUYEN VAN A.

const path = require("path");

// Node >= 20.12 có sẵn loadEnvFile — không cần cài thêm dotenv.
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));

const momoClient = require("../lib/momoClient");

async function main() {
  const orderId = `TEST${Date.now()}`;
  const base = (process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");

  console.log(`MOMO_API_URL = ${process.env.MOMO_API_URL}`);
  console.log(`partnerCode  = ${process.env.MOMO_PARTNER_CODE}`);

  try {
    const result = await momoClient.createPaymentRequest({
      orderId,
      amount: 50000,
      orderInfo: "Test thanh toan the ATM",
      redirectUrl: `${base}/vi/payment`,
      ipnUrl: `${base}/api/payments/${"0".repeat(24)}`,
    });
    console.log("\nKET QUA: THANH CONG (resultCode 0)");
    console.log("payUrl:", result.payUrl);
    console.log("\nMo payUrl, nhap the 9704 0000 0000 0018 | 03/07 | NGUYEN VAN A | OTP theo yeu cau.");
  } catch (err) {
    console.error("\nKET QUA: THAT BAI");
    console.error(err.message);
    if (err.cause) console.error("Nguyen nhan:", err.cause.message || err.cause);
    process.exitCode = 1;
  }
}

main();
