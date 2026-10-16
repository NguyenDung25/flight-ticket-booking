// e2e/global-setup.mjs — tạo database E2E sạch: xóa bản cũ (nếu lần trước dừng giữa chừng) rồi chạy seed
// (tài khoản demo, hãng bay, tàu bay, chuyến HAN↔SGN ngày mai).
import { execFileSync } from "node:child_process";
import mongoose from "mongoose";
import { E2E_DB_NAME, E2E_MONGO_URI } from "./env.mjs";

export default async function globalSetup() {
  if (!E2E_DB_NAME.includes("e2e")) throw new Error("Database E2E phải có chữ 'e2e' trong tên.");
  const conn = await mongoose.createConnection(E2E_MONGO_URI).asPromise();
  await conn.dropDatabase();
  await conn.close();
  execFileSync(process.execPath, ["scripts/seedSample.js"], {
    env: { ...process.env, MONGO_URI: E2E_MONGO_URI },
    stdio: "ignore",
  });
}
