// e2e/global-teardown.mjs — xóa database E2E sau khi chạy xong.
import mongoose from "mongoose";
import { E2E_MONGO_URI } from "./env.mjs";

export default async function globalTeardown() {
  const conn = await mongoose.createConnection(E2E_MONGO_URI).asPromise();
  await conn.dropDatabase();
  await conn.close();
}
