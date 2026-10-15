// scripts/testVnpay.js
//
// Kiểm tra nhanh khóa VNPay sandbox (không cần chạy Next.js, không cần MongoDB):
//   npm run test:vnpay
// 1) Dựng 1 URL thanh toán thử 50.000đ — mở URL trong trình duyệt, chọn ngân hàng NCB, nhập thẻ test
//    9704 1985 2619 1432 198, tên NGUYEN VAN A, ngày phát hành 07/15, OTP 123456.
// 2) Gọi API truy vấn (querydr) cho 1 mã đơn hàng không tồn tại: VNPay trả "không tìm thấy giao
//    dịch" nghĩa là Terminal ID + Secret Key ĐÚNG; sai khóa thì VNPay báo lỗi chữ ký (mã 97).

const path = require("path");

// Node >= 20.12 có sẵn loadEnvFile — không cần cài thêm dotenv.
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));

const vnpayClient = require("../lib/vnpayClient");

async function main() {
  const base = (process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
  console.log(`VNPAY_TMN_CODE = ${process.env.VNPAY_TMN_CODE}`);

  const txnRef = `TEST${Date.now()}`;
  const { payUrl, createDate } = vnpayClient.createPaymentUrl({
    txnRef,
    amount: 50000,
    orderInfo: "Test thanh toan VNPay",
    returnUrl: `${base}/vi/payment`,
    ipAddr: "127.0.0.1",
  });
  console.log("\n1) URL thanh toán thử (mở trong trình duyệt):\n" + payUrl);

  try {
    const result = await vnpayClient.queryTransaction({ txnRef: `NOTEXIST${Date.now()}`, transactionDate: createDate });
    console.log(`\n2) Truy vấn thử: status = ${result.status} (mã ${result.responseCode})`);
    console.log(result.status === "not_found" ? "   → Khóa VNPay hợp lệ." : "   → Phản hồi lạ, kiểm tra lại cấu hình.");
  } catch (err) {
    console.error(`\n2) Truy vấn thử LỖI: ${err.message}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
