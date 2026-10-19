# Bảng test case — Đồ án Web đặt vé máy bay

> Dùng cho Chương 4 (Kiểm thử). Cột **Kết quả thực tế** và **Đạt?** để trống — điền sau khi bạn chạy thử trên máy demo.
>
> - **Tự động**: chạy `npm test` (170 test, không cần MongoDB; luồng thanh toán/race dùng bản giả của DB nên **không thay thế** việc test tay với MongoDB + VNPay sandbox thật). `npm run test:integration` chạy thêm 12 test với MongoDB thật (DB tạm, tự xóa sau khi chạy) cho giữ ghế/race, hủy vé đồng thời, IPN + querydr, check-in, khuyến mãi, đặt lại mật khẩu, xác thực email, bảng giá dịch vụ bổ sung, nhật ký admin. `npm run test:e2e` chạy 9 kịch bản giao diện trên Chrome (Playwright): trang chủ tab Làm thủ tục, trang chủ + đổi ngôn ngữ, đăng nhập, đặt vé có hành lý tới VNPay rồi hủy, đăng ký chưa xác thực email, check-in sai mã, trang cần đăng nhập, check-in trọn luồng tới thẻ lên máy bay (có hành lý + QR), admin sửa bảng giá dịch vụ bổ sung. Cột "Tự động" ghi tên nhóm test tương ứng.
> - **Chuẩn bị chung**: `npm run seed`, `npm run seed:test`, chạy `npm run dev` + `npm run cron`; test thanh toán chạy được trên `localhost`; riêng test IPN thì bật ngrok và khai báo IPN URL (README mục 6b).
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
| TC-33 | Thanh toán thành công | Chọn ngân hàng NCB, thẻ test `9704198526191432198`, `NGUYEN VAN A`, `07/15`, OTP `123456` | Booking `confirmed`, ghế `booked`, có `booking_code`, nhận email vé | — | | |
| TC-34 | Thanh toán thất bại | Bấm "Hủy thanh toán" trên trang VNPay | Booking `cancelled`, ghế nhả ngay khi về trang kết quả (hoặc khi IPN tới) | `sync: VNPay xác nhận thất bại`, `IPN thất bại` | | |
| TC-35 | IPN gửi lại | Gửi lại IPN thành công cho booking đã `confirmed` | Không đổi gì (idempotent), trả `RspCode: "02"` | `IPN trùng / muộn / gửi lại` | | |
| TC-36 | Chữ ký IPN giả | GET `/api/payments/vnpay-ipn` với chữ ký sai hoặc sửa `vnp_Amount` | `RspCode: "97"`, booking không đổi | `verifyReturnParams`, `IPN sai chữ ký` | | |
| TC-37 | Không có IPN (chạy localhost, không ngrok) | Thanh toán thành công rồi được VNPay đưa về trang `/payment` | Booking tự chuyển `confirmed` nhờ server hỏi lại VNPay (`querydr`) | `queryTransaction`, `race IPN+sync` | | |
| TC-38 | Thanh toán đến muộn | Booking đã bị cron hủy (quá hạn) nhưng VNPay báo thành công | Booking chuyển `payment_error_manual_refund`, không đụng ghế | `decideWebhookAction`, `IPN trùng / muộn` | | |
| TC-39 | Quá hạn thanh toán | Không thanh toán, chờ quá `payment_expires_at` | Cron hủy booking, nhả ghế | — | | |

## 5. Hủy vé & hoàn tiền (C9, A3, A7, A8)

| Mã | Chức năng | Bước thực hiện | Kết quả mong đợi | Tự động | Kết quả thực tế | Đạt? |
|---|---|---|---|---|---|---|
| TC-40 | Hủy booking chưa thanh toán | Khách hủy booking `pending_payment` | `cancelled`, ghế nhả | — | | |
| TC-41 | Hủy ≥24h | Hủy vé đã thanh toán, còn >24h: 1 khách phổ thông; 1 khách thương gia | Phổ thông: phí 300.000đ, tier `fixed_fee`. Thương gia: hoàn 100%, phí 0, tier `full` | `computeCancellationFee` | | |
| TC-42 | Hủy 3h–24h | Hủy khi còn 4h, 1 khách phổ thông + 1 khách thương gia | Phí 600.000đ + 300.000đ = 900.000đ, tier `fixed_fee` | `computeCancellationFee` | | |
| TC-43 | Hủy <3h / đã qua giờ bay | Hủy khi còn 2h: khách phổ thông; khách thương gia | Phổ thông: mất toàn bộ, hoàn 0đ (tier `none`). Thương gia: phí bỏ chỗ 650.000đ, hoàn phần còn lại | `computeCancellationFee` | | |
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
| TC-57 | Boarding pass đúng ngôn ngữ | Đặt vé ở EN rồi chuyển giao diện sang VI (hoặc ngược lại), mở thẻ lên máy bay | Nhãn thẻ theo `Booking.locale` (ngôn ngữ lúc đặt), không đổi theo giao diện | `boardingPassLabels` | | |
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
| TC-62 | Chưa đăng nhập | Vào `/booking`, `/my-bookings`, `/payment` khi chưa đăng nhập (riêng `/check-in` mở được, không cần đăng nhập) | Chuyển về trang đăng nhập | — | | |
| TC-63 | Khách vào API admin | Gọi `/api/admin/*` bằng tài khoản khách | 403 | — | | |
| TC-64 | Xem booking người khác | Đổi `bookingId` trên URL `/payment` sang booking của người khác | Hiển thị "không tìm thấy", không lộ dữ liệu | — | | |

## 9. Độ bền, chống lạm dụng và đồng thời (bổ sung sau vòng rà soát logic & bảo mật)

| Mã | Chức năng | Bước thực hiện | Kết quả mong đợi | Tự động | Kết quả thực tế | Đạt? |
|---|---|---|---|---|---|---|
| TC-65 | Giữ ghế không gia hạn | Giữ ghế 2A, chờ vài phút, chọn lại đúng ghế 2A | `held_until` KHÔNG đổi (không giữ vô hạn); hết hạn rồi mới giữ lại được | `holdSeat: ... KHÔNG bị gia hạn` | | |
| TC-66 | Hạn mức giữ ghế | Một tài khoản giữ lần lượt >20 ghế | Ghế thứ 21 bị từ chối 429 | — | | |
| TC-67 | Ghế quá hạn không cần cron | Tắt cron, để ghế `held` quá 30 phút, tài khoản khác chọn lại ghế đó | Chọn được; sơ đồ ghế hiển thị trống | — | | |
| TC-68 | Đặt trùng ghế | Tạo booking rồi quay lại từ trang VNPay, bấm đặt lại cùng ghế | 409 kèm `existing_booking_id`; giao diện hỏi có tiếp tục thanh toán booking cũ | — | | |
| TC-69 | Hạn mức booking chờ | Tạo >3 booking `pending_payment` cùng lúc | Booking thứ 4 bị từ chối 429 | — | | |
| TC-70 | Ghế sắp hết hạn | Tạo booking khi ghế chỉ còn giữ <5 phút | Bị từ chối (không đủ thời gian thanh toán) | `assertSeatIsHeldByUser` | | |
| TC-71 | Thanh toán trùng | Bấm "Thanh toán" 2 lần, trả tiền cả 2 giao dịch VNPay | Booking `confirmed` 1 lần; khoản thứ hai hiện ở trang Hoàn tiền để admin hoàn tay | `IPN trùng / muộn / gửi lại` | | |
| TC-72 | IPN + redirect đồng thời | Thanh toán thành công và để cả IPN lẫn trang kết quả chạy cùng lúc | Đúng 1 vé, 1 email, trạng thái `confirmed` | `race IPN+sync`, `race:` | | |
| TC-73 | IPN thất bại của lần thanh toán cũ | Thanh toán lần 1 thất bại, tạo lần 2; IPN thất bại của lần 1 về sau | Booking KHÔNG bị hủy (chỉ xét giao dịch cuối `last_order_id`) | `IPN thất bại của lần thanh toán CŨ` | | |
| TC-74 | IPN lệch số tiền | IPN ký đúng nhưng `vnp_Amount` khác tổng tiền booking | `RspCode: "04"`, booking không đổi | `IPN số tiền không khớp` | | |
| TC-75 | IPN giao dịch chưa hoàn tất | IPN có `vnp_TransactionStatus = 01` | `RspCode: "99"` (VNPay gửi lại sau), booking không đổi | `IPN giao dịch còn đang xử lý` | | |
| TC-76 | Cron không hủy booking đã trả tiền | Booking quá hạn nhưng đã có `transaction_id` | Chuyển `payment_error_manual_refund`, không nhả ghế | `cron: booking quá hạn nhưng ĐÃ có giao dịch` | | |
| TC-77 | Ghế đã hết hạn khi bấm thanh toán | Chờ ghế hết hạn rồi bấm Thanh toán | Từ chối 409 trước khi tạo giao dịch VNPay | — | | |
| TC-78 | Tổng tiền ngoài giới hạn VNPay | Dùng mã giảm 100% (tổng < 5.000đ) | Từ chối 400 ngay khi tạo booking; lượt mã được trả lại | — | | |
| TC-79 | Khóa đăng nhập tạm | Nhập sai mật khẩu 5 lần liên tiếp | Thông báo "đăng nhập sai quá nhiều lần"; mở lại sau 15 phút (hoặc restart server) | `khóa tạm sau 5 lần sai` | | |
| TC-80 | Đăng ký sai kiểu/quá dài | POST đăng ký với `email` là object, mật khẩu >72 byte, ngôn ngữ `fr` | 400 (không còn 500) | `đăng ký: sai kiểu` | | |
| TC-81 | Khứ hồi sai chiều | Gọi API tạo booking khứ hồi với chặng về không phải chiều ngược của chặng đi | 400 | `validateRoundTripRoute` | | |
| TC-82 | Sửa chuyến có booking | Chuyến đã có booking: sửa số hiệu / đổi giờ đến / đổi giá / đặt `status: cancelled` | Số hiệu & giá sửa được; giờ đến bị 409; `cancelled` được nhận kèm `warning` nhắc bấm A8 | `flightPatchRules` | | |
| TC-83 | Hủy đồng thời | Hai request hủy cùng 1 booking `confirmed` cùng lúc | Một bên thành công, bên kia 409; hoàn tiền ghi nhận 1 lần | — | | |
| TC-84 | A8 sau giờ khởi hành | Admin hủy chuyến đã quá giờ khởi hành dự kiến | Khách được hoàn chặng bị hủy (không bị coi là "đã bay") | `computeBulkRefund` | | |
| TC-85 | Đầu vào bất thường | `seat_number` là object, `id` sai định dạng, `full_name` là mảng | 400 (không 500) | `assertValidSeatNumber`, `validatePassenger...` | | |
| TC-86 | Sơ đồ ghế máy bay sai | Tạo/sửa máy bay có số ghế trùng hoặc ký tự lạ | 400 | — | | |
| TC-87 | Trang bị khóa | Admin khóa khách đang mở `/my-bookings` rồi khách tải lại / điều hướng | Về trang đăng nhập; trang admin của admin bị khóa/hạ quyền cũng không còn truy cập được | — | | |
| TC-88 | Header bảo mật | Mở DevTools → Network → xem phản hồi trang | Có `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` | — | | |
| TC-89 | IPN của merchant khác | IPN ký đúng nhưng `vnp_TmnCode` khác mã của hệ thống | `RspCode: "97"` | `verifyReturnParams: ... TmnCode của merchant khác` | | |
| TC-90 | Cấu hình VNPay không an toàn | Đặt `VNPAY_API_URL=http://...` (không phải localhost) rồi truy vấn | Báo lỗi cấu hình, không gọi VNPay | `cấu hình không an toàn` | | |
| TC-91 | Seed demo ở production | Chạy `npm run seed` với `NODE_ENV=production` | Script từ chối chạy | — | | |
| TC-92 | Check-in chuyến đã bị hủy | Admin đặt chuyến bay `cancelled` (chưa bấm hủy hàng loạt), khách mở trang Check-in rồi gọi API check-in | Trang hiện "Chuyến bay đã bị hủy", không có nút; API trả 409 | `checkInSeat: chuyến đã bị hủy` | | |
| TC-93 | Trạng thái khung check-in | Mở trang Check-in với vé còn >24h, trong 24h–2h, và <2h trước giờ bay | Lần lượt "Chưa mở check-in" / nút Check-in / "Đã đóng check-in" | `checkInWindowState` | | |
| TC-94 | Nội dung thẻ lên máy bay | Check-in thành công | Thẻ có tên khách, mã đặt chỗ, chuyến bay, điểm đi/đến, giờ khởi hành, giờ lên máy bay (−40 phút), ghế, hạng ghế, mã thẻ | `checkIn: trả đủ dữ liệu thẻ lên máy bay` | | |
| TC-95 | Trang Khuyến mãi | Admin tạo mã còn hạn, mã hết hạn, mã hết lượt; khách mở menu "Khuyến mãi" | Chỉ hiện mã còn hạn và còn lượt, kèm % giảm, hạn dùng, số lượt còn lại; nút "Sao chép mã" chép đúng mã | `listActivePromotions` | | |
| TC-96 | Trang Chính sách hủy vé | Mở menu "Chính sách hủy vé" | Bảng mốc 24h / 3h theo 2 cột Phổ thông / Thương gia (300.000 / 600.000 / mất hết; 0 / 300.000 / 650.000), 3 trường hợp khứ hồi khớp với hằng số trong `config/constants.js` | — | | |
| TC-97 | Báo đúng trạng thái email vé | Để trống `SMTP_USER`/`SMTP_PASS`, thanh toán thành công | Trang kết quả báo "chưa gửi được qua email" (không báo đã gửi); cấu hình SMTP rồi bấm "Gửi lại qua email" thì báo đã gửi | `ticketEmail` | | |
| TC-98 | Check-in bằng mã đặt chỗ + họ | Đăng xuất, mở trang Check-in, nhập mã đặt chỗ + chỉ HỌ của một hành khách (thử gõ không dấu, chữ thường); thử mã sai và mã đúng nhưng họ sai | Không cần đăng nhập; đúng mã + họ thì sang trang "Dữ liệu đặt chỗ"; sai mã hoặc sai họ đều báo cùng một thông báo | `checkIn: chỉ cần HỌ`, `passengerNameMatches` | | |
| TC-99 | Chống dò mã check-in | Nhập sai mã/tên 5 lần liên tiếp rồi thử lần 6 | Lần 6 bị chặn 429 "nhập sai quá nhiều lần", mở lại sau 15 phút (hoặc restart server) | — | | |
| TC-100 | Thẻ lên máy bay có QR | Check-in thành công, quét mã QR bằng điện thoại | QR đọc ra `DELAYX|mã|chuyến|ngày|chặng|ghế|tên|mã thẻ`; thẻ có hướng dẫn hành lý/an ninh | `thẻ lên máy bay: ... QR` | | |
| TC-101 | Chọn hành khách và chặng bay | Booking 2 khách: ở trang "Dữ liệu đặt chỗ" chọn chặng, tick 1 hoặc cả 2 khách, nhấn "Tiếp tục" | Chỉ tick được khách của chặng đang chọn và còn trong khung giờ; khách đã làm thủ tục hiện "Đã làm thủ tục"; chưa tick ai thì không bấm được "Tiếp tục" | — | | |
| TC-102 | Quy định ICI | Ở bước Quy định, chưa tick đồng ý; tick rồi bấm "Đồng ý & Tiếp tục"; gọi API check-in thiếu `ici_accepted` | Chưa tick: nút bị khóa. Tick: phát thẻ cho mọi khách đã chọn. API thiếu đồng ý → 422, không check-in | `checkIn: chưa đồng ý quy định ICI` | | |
| TC-103 | Sửa họ tên | Vào Tài khoản, đổi họ tên, Lưu | Báo đã cập nhật; tên trên header đổi ngay, không cần đăng nhập lại | — | | |
| TC-104 | Đổi mật khẩu | Nhập sai mật khẩu hiện tại; rồi nhập đúng + mật khẩu mới | Sai: báo lỗi, không đổi. Đúng: bị đăng xuất, về trang đăng nhập có thông báo; mật khẩu cũ không đăng nhập được nữa | `changePassword` | | |
| TC-105 | Phiên cũ hết hiệu lực | Đăng nhập cùng tài khoản trên 2 trình duyệt, đổi mật khẩu ở trình duyệt 1, thao tác ở trình duyệt 2 | Trình duyệt 2 bị yêu cầu đăng nhập lại | `phiên đăng nhập cấp TRƯỚC lần đổi mật khẩu` | | |
| TC-106 | Quên mật khẩu | Nhập email đã đăng ký và email không tồn tại | Cả 2 đều hiện cùng 1 thông báo; email có thật nhận link (chưa có SMTP: link in ở log server) | `requestPasswordReset` | | |
| TC-107 | Đặt lại mật khẩu | Mở link, đặt mật khẩu mới; mở lại đúng link lần 2 | Lần 1 thành công, đăng nhập được bằng mật khẩu mới; lần 2 báo link không hợp lệ/hết hạn | `resetPassword` | | |
| TC-108 | Thông tin liên hệ khi đặt vé | Đặt vé: để trống SĐT / SĐT sai; rồi nhập email khác email tài khoản + SĐT đúng | Thiếu/sai: báo lỗi, không tạo booking. Đúng: booking lưu contact, trang vé hiện người liên hệ, email vé gửi về email liên hệ | `normalizeContact` | | |
| TC-110 | Xác thực email khi đăng ký | Đăng ký tài khoản mới; vào bước nhập hành khách; bấm "Gửi lại" 2 lần liền; mở link trong email; mở lại link lần 2 | Sau đăng ký: trang Tài khoản báo chưa xác thực, bước đặt vé bị chặn (API giữ ghế 403). Gửi lại lần 2 trong 60 giây bị từ chối. Mở link: xác thực thành công, đặt vé được. Mở lại: báo link không hợp lệ | `xác thực email` (integration), E2E `đăng ký tài khoản mới` | | |
| TC-111 | Hành lý ký gửi + suất ăn | Đặt vé phổ thông: chọn +20kg và suất ăn; đặt vé thương gia; gọi API với `baggage_kg: 12` hoặc `addons_amount` giả | Tổng = giá vé + 250.000 + 80.000; thương gia đã gồm 30kg + suất ăn (0đ). API: gói 12kg bị 400, `addons_amount` giả bị bỏ qua (server tự tính). Vé điện tử/email/thẻ lên máy bay hiện hành lý ký gửi + suất ăn | `ancillaries.test.js`, E2E `đặt vé 1 chiều có hành lý` | | |
| TC-112 | Admin sửa bảng giá dịch vụ bổ sung | Admin → Dịch vụ bổ sung: nhập 2 gói cùng số kg, lưu; sửa giá gói 20kg, lưu; mở bước nhập hành khách; xem lại 1 vé đã bán trước đó | Trùng kg: báo lỗi, bảng giá không đổi. Lưu đúng: báo đã lưu, form đặt vé hiện giá mới, Nhật ký thao tác có dòng "Sửa giá hành lý & suất ăn". Vé đã bán giữ nguyên giá và số kg lúc đặt | `normalizePricing`, `bảng giá dịch vụ bổ sung` (integration) | | |
| TC-113 | Mã khuyến mãi không giảm dịch vụ bổ sung | Đặt vé 1.000.000đ + 20kg + suất ăn (330.000đ), nhập mã giảm 10% | Tổng = 1.000.000 × 90% + 330.000 = 1.230.000đ (giảm 100.000đ, không phải 133.000đ); khứ hồi: giảm chia theo giá vé từng chặng, tổng các chặng = tổng tiền | `khuyến mãi: chỉ giảm trên giá vé` | | |
| TC-114 | Giới hạn đăng ký theo IP | Đăng ký liên tục 6 tài khoản từ cùng 1 máy trong 15 phút | 5 lần đầu xử lý bình thường; lần thứ 6 báo "Bạn đăng ký quá nhiều lần", không tạo tài khoản, không gửi email | `đăng ký: tối đa 5 lần` | | |
| TC-109 | Nhật ký thao tác admin | Admin khóa/mở khóa 1 tài khoản, hủy vé thay khách, sửa 1 chuyến bay; mở Admin → Nhật ký thao tác | Mỗi thao tác 1 dòng (thời điểm, email admin, mô tả, chi tiết); lọc theo nhóm đúng | `logAdminAction` | | |
