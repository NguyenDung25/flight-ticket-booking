# Bảng test case — Đồ án Web đặt vé máy bay

> Dùng cho Chương 4 (Kiểm thử). Cột **Kết quả thực tế** và **Đạt?** để trống — điền sau khi bạn chạy thử trên máy demo.
>
> - **Tự động**: chạy `npm test` (21 test, không cần MongoDB). Cột "Tự động" ghi tên nhóm test tương ứng.
> - **Chuẩn bị chung**: `npm run seed`, `npm run seed:test`, chạy `npm run dev` + `npm run cron`; với test thanh toán thì bật ngrok (xem README mục 6) và mở web bằng địa chỉ ngrok.
> - Tài khoản: admin / khách demo do `npm run seed` in ra.

## 1. Xác thực & tài khoản (C8, C11, A4)

| Mã | Chức năng | Bước thực hiện | Kết quả mong đợi | Tự động | Kết quả thực tế | Đạt? |
|---|---|---|---|---|---|---|
| TC-01 | Đăng ký | Đăng ký email mới, mật khẩu hợp lệ | Tạo tài khoản `role: customer`, đăng nhập được | — | | |
| TC-02 | Đăng ký trùng email | Đăng ký lại đúng email đã có | Báo "Email đã được sử dụng", không tạo mới | — | | |
| TC-03 | Đăng ký trùng email tài khoản bị khóa | Admin khóa user A, rồi đăng ký lại bằng email của A | Vẫn bị từ chối (không né được lệnh khóa) | — | | |
| TC-04 | Đăng nhập sai mật khẩu | Nhập sai mật khẩu | Báo lỗi, không đăng nhập | — | | |
| TC-05 | Khóa có hiệu lực ngay | Khách đang đăng nhập; admin khóa; khách bấm giữ ghế | Hành động bị từ chối (403) dù session còn | — | | |
| TC-06 | Đổi ngôn ngữ | Bấm chuyển EN | Toàn bộ UI khách đổi sang tiếng Anh, `preferred_language` lưu vào DB | — | | |
| TC-07 | Admin xóa user | Xóa tài khoản khách chưa có booking | Xóa thành công | — | | |
| TC-08 | Admin xóa user có booking | Xóa tài khoản đã có booking | Bị chặn 409, gợi ý dùng "Khóa" | — | | |
| TC-09 | Admin xóa admin / chính mình | Thử xóa tài khoản admin | Bị chặn | — | | |

## 2. Quản lý dữ liệu nền (A1, A2)

| Mã | Chức năng | Bước thực hiện | Kết quả mong đợi | Tự động | Kết quả thực tế | Đạt? |
|---|---|---|---|---|---|---|
| TC-10 | Thêm hãng bay | Nhập mã + tên VI/EN | Hãng xuất hiện trong danh sách | — | | |
| TC-11 | Sửa hãng bay | Bấm Sửa, đổi tên EN, Lưu | Danh sách cập nhật tên mới | — | | |
| TC-12 | Sửa trùng mã hãng | Đổi mã thành mã hãng khác đã có | Báo trùng (409) | — | | |
| TC-13 | Xóa hãng đang có chuyến bay | Xóa hãng đã gắn với chuyến bay | Bị chặn 409, nêu số chuyến bay | — | | |
| TC-14 | Xóa hãng chưa dùng | Xóa hãng không có chuyến bay | Xóa thành công | — | | |
| TC-15 | Thêm / sửa máy bay | Tạo máy bay (2 hàng business, 10 hàng economy); sửa tên; sửa số hàng | Tổng ghế = hàng × số ghế/hàng; sửa số hàng sinh lại sơ đồ | — | | |
| TC-16 | Sửa máy bay không đổi chuyến cũ | Sửa số hàng ghế của máy bay đã có chuyến bay | Chuyến bay cũ giữ nguyên số ghế; chuyến tạo sau dùng sơ đồ mới | — | | |
| TC-17 | Xóa máy bay đang dùng | Xóa máy bay đã gắn chuyến bay | Bị chặn 409 | — | | |
| TC-18 | Tạo chuyến bay | Chọn Aircraft, nhập giờ, giá | `seats[]` tự sinh đủ ghế, status `available` | — | | |
| TC-19 | Deep copy ghế | Giữ 1 ghế ở chuyến A | Ghế cùng số ở chuyến B (cùng Aircraft) vẫn `available` | — | | |
| TC-20 | Validate chuyến bay | Tạo chuyến có điểm đi = điểm đến; hoặc giờ đến < giờ đi; hoặc có ghế business nhưng thiếu giá business | Mỗi trường hợp đều bị từ chối | — | | |
| TC-21 | Chặn sửa/xóa chuyến có booking | Sửa giờ bay / xóa chuyến đã có booking hiệu lực | Bị chặn 409 | — | | |
| TC-22 | Chặn đổi `aircraft_id` | PUT chuyến bay với `aircraft_id` khác | Luôn bị từ chối, kể cả chưa có booking | — | | |

## 3. Tìm kiếm & chọn chuyến (C1–C3)

| Mã | Chức năng | Bước thực hiện | Kết quả mong đợi | Tự động | Kết quả thực tế | Đạt? |
|---|---|---|---|---|---|---|
| TC-23 | Tìm một chiều | HAN → SGN, ngày có chuyến | Danh sách chuyến đúng tuyến/ngày, sắp theo giờ bay | — | | |
| TC-24 | Tìm khứ hồi 3 bước | Chọn khứ hồi, chọn chặng đi, chặng về | Bước 1/2/3 hiển thị đúng thanh trạng thái; bước 3 có tóm tắt + tổng tạm tính | — | | |
| TC-25 | Lọc kết quả | Lọc theo giá, khung giờ, hãng | Danh sách chỉ còn chuyến thỏa điều kiện | — | | |
| TC-26 | Transit khứ hồi | Chọn chặng về cất cánh < 2h sau khi chặng đi hạ cánh | UI lọc bỏ/báo lỗi; API tạo booking từ chối | `validateRoundTripTransit` | | |

## 4. Hành khách, ghế, thanh toán (C4–C7)

| Mã | Chức năng | Bước thực hiện | Kết quả mong đợi | Tự động | Kết quả thực tế | Đạt? |
|---|---|---|---|---|---|---|
| TC-27 | Giữ ghế | Chọn 1 ghế | Ghế `held`, `held_until` = +30 phút; người khác không chọn được | — | | |
| TC-28 | Xóa hành khách nhả ghế | Chọn ghế cho khách rồi xóa khách đó | Ghế về `available` ngay (gọi `release-seat`) | — | | |
| TC-29 | Giấy tờ người lớn | Khách ≥14 tuổi, bỏ trống số giấy tờ hoặc chọn giấy khai sinh | Bị từ chối | `validatePassengerDocument` | | |
| TC-30 | Giấy tờ trẻ em | Khách <14 tuổi dùng giấy khai sinh | Được chấp nhận; dùng CCCD thì bị từ chối | `validatePassengerDocument` | | |
| TC-31 | Trùng giấy tờ | Hai khách cùng số giấy tờ | Bị từ chối | `validateNoDuplicateDocumentIds` | | |
| TC-32 | Tính tiền theo hạng | 2 khách economy + 1 khách business trên một chặng | `amount = 2 × giá economy + 1 × giá business` | — | | |
| TC-33 | Thanh toán thành công | Thanh toán thẻ ATM test (9704 0000 0000 0018, 03/07, NGUYEN VAN A, OTP) | Booking `confirmed`, ghế `booked`, có `booking_code`, nhận email vé | — | | |
| TC-34 | Thanh toán thất bại | Hủy giao dịch trên trang MoMo | Booking `cancelled`, ghế nhả ngay | `decideWebhookAction` | | |
| TC-35 | IPN gửi lại | Gửi lại IPN thành công cho booking đã `confirmed` | Không đổi gì (idempotent) | `decideWebhookAction` | | |
| TC-36 | Chữ ký IPN giả | POST IPN với chữ ký sai/sửa số tiền | Bị từ chối 400 | `verifyIpnSignature` | | |
| TC-37 | Ngrok tắt khi thanh toán | Tắt ngrok, thanh toán xong, bật lại ngrok, mở lại `/payment?bookingId=...` | Booking tự chuyển `confirmed` nhờ hỏi lại MoMo | `queryTransaction` | | |
| TC-38 | Thanh toán đến muộn | Booking đã bị cron hủy (quá hạn) nhưng MoMo báo thành công | Booking chuyển `payment_error_manual_refund`, không đụng ghế | `decideWebhookAction` | | |
| TC-39 | Quá hạn thanh toán | Không thanh toán, chờ quá `payment_expires_at` | Cron hủy booking, nhả ghế | — | | |

## 5. Hủy vé & hoàn tiền (C9, A3, A7, A8)

| Mã | Chức năng | Bước thực hiện | Kết quả mong đợi | Tự động | Kết quả thực tế | Đạt? |
|---|---|---|---|---|---|---|
| TC-40 | Hủy booking chưa thanh toán | Khách hủy booking `pending_payment` | `cancelled`, ghế nhả | — | | |
| TC-41 | Hủy ≥24h | Hủy vé đã thanh toán, còn >24h | `refunded`, hoàn 100%, phí 0 | `computeFeeBucket` | | |
| TC-42 | Hủy 3h–24h | Hủy khi còn 4h, 2 khách | Phạt 800.000đ (400.000đ × 2), tier `fixed_fee` | `computeFeeBucket` | | |
| TC-43 | Hủy <3h / đã qua giờ bay | Hủy khi còn 2h | Phạt 100%, hoàn 0đ | `computeFeeBucket` | | |
| TC-44 | Khứ hồi TH1 | Hủy khi chưa bay chặng nào | Mốc tính theo chặng đi, áp trên toàn booking | — | | |
| TC-45 | Khứ hồi TH2 | Chặng đi đã bay, hủy khi chặng về còn >24h | Chỉ tính phần chặng về, tier `partial`, không phạt phần đã bay | — | | |
| TC-46 | Khứ hồi TH3 | Cả hai chặng đã bay | Từ chối "hành trình đã hoàn tất" | — | | |
| TC-47 | Chặn hủy sau check-in | Check-in rồi mới hủy | Bị chặn 409 | — | | |
| TC-48 | Admin hủy hộ | Admin bấm "Hủy vé" trên booking đã thanh toán | Dùng đúng quy tắc phí như khách tự hủy | — | | |
| TC-49 | Hoàn tiền tay — đủ | Với booking `payment_error_manual_refund`, nhập đủ số tiền, Xác nhận | `refunded`, tier `full`, phí 0, ghế còn `booked` của chủ booking được nhả | `computeManualRefund` | | |
| TC-50 | Hoàn tiền tay — thiếu | Nhập số nhỏ hơn tổng | `refunded`, tier `partial`, phần chênh vào phí | `computeManualRefund` | | |
| TC-51 | Hoàn tiền tay — sai | Nhập 0, số âm, số lẻ, hoặc lớn hơn tổng | Bị từ chối 400 | `computeManualRefund` | | |
| TC-52 | Hoàn tiền tay sai trạng thái | Gọi PATCH trên booking `confirmed` | Bị từ chối 409 | — | | |
| TC-53 | Hủy chuyến hàng loạt (A8) | Hủy chuyến bay có booking ở các trạng thái khác nhau | `pending_payment` → `cancelled`; `confirmed` → `refunded` (hoàn đủ, trừ chặng đã bay); ghế nhả | — | | |
| TC-54 | Nhật ký hoàn tiền | Mở trang Hoàn tiền / `GET /api/admin/bookings/refund-log` | Liệt kê booking `refunded` kèm số tiền hoàn, mức phạt, lý do, thời điểm; không có nút hành động | — | | |

## 6. Check-in & múi giờ (C10)

| Mã | Chức năng | Bước thực hiện | Kết quả mong đợi | Tự động | Kết quả thực tế | Đạt? |
|---|---|---|---|---|---|---|
| TC-55 | Ngoài khung check-in | Check-in khi còn >24h hoặc <2h | Bị từ chối | `isCheckInWindowOpen` | | |
| TC-56 | Trong khung check-in | Check-in khi còn 2h–24h | Nhận `boarding_pass_code`, ghế `checked_in` | `isCheckInWindowOpen` | | |
| TC-57 | Boarding pass đúng ngôn ngữ | Đặt vé ở EN, mở boarding pass | Hiển thị tiếng Anh theo `Booking.locale` | — | | |
| TC-58 | Múi giờ | Chạy server ở múi giờ UTC | Mốc phạt/check-in vẫn tính theo giờ VN | `hoursUntil` | | |

## 7. Thống kê & khuyến mãi (A5, A6)

| Mã | Chức năng | Bước thực hiện | Kết quả mong đợi | Tự động | Kết quả thực tế | Đạt? |
|---|---|---|---|---|---|---|
| TC-59 | Doanh thu | Có booking `confirmed` và `refunded` có phí | Doanh thu = Σ confirmed + Σ phí phạt của refunded | — | | |
| TC-60 | Phí phạt khứ hồi theo tuyến | Booking khứ hồi `refunded` có phí | Phí chia theo tỷ lệ từng chặng, không bị tính gấp đôi | — | | |
| TC-61 | Mã khuyến mãi | Áp mã hợp lệ / hết hạn / hết lượt | Giảm đúng; mã sai/hết hạn/hết lượt bị từ chối | — | | |

## 8. Phân quyền & bảo mật

| Mã | Chức năng | Bước thực hiện | Kết quả mong đợi | Tự động | Kết quả thực tế | Đạt? |
|---|---|---|---|---|---|---|
| TC-62 | Chưa đăng nhập | Vào `/booking`, `/my-bookings`, `/payment` khi chưa đăng nhập | Chuyển về trang đăng nhập | — | | |
| TC-63 | Khách vào API admin | Gọi `/api/admin/*` bằng tài khoản khách | 403 | — | | |
| TC-64 | Xem booking người khác | Đổi `bookingId` trên URL `/payment` sang booking của người khác | Hiển thị "không tìm thấy", không lộ dữ liệu | — | | |
