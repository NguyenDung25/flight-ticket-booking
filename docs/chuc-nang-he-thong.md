# Tài liệu chức năng hệ thống đặt vé máy bay

## 1. Tổng quan

Hệ thống gồm 2 nhóm người dùng chính: **Khách hàng** và **Quản trị viên (Admin)**, phân quyền qua trường `role` trong bảng `User`. Database MongoDB chạy **local** trên máy (demo trực tiếp, không deploy public), chế độ **standalone** (không cần replica set). Dữ liệu chuyến bay/sân bay/hãng bay ban đầu lấy từ **AirLabs API** để seed. **Bắt buộc đăng nhập mới đặt được vé** — không hỗ trợ đặt vé khách vãng lai (guest checkout).

Giao diện khách hàng hỗ trợ **2 ngôn ngữ (Tiếng Việt / English)**, có nút chuyển đổi (C11). Giao diện Admin **cố định tiếng Việt**, không áp dụng đa ngôn ngữ.

---

## 2. Chức năng phía Khách hàng (Client)

### C1. Tìm kiếm chuyến bay

| | |
|---|---|
| **Mô tả** | Khách hàng tìm chuyến bay theo tiêu chí: điểm đi, điểm đến, ngày bay, số hành khách, loại vé một chiều/khứ hồi. **Nếu khứ hồi, hiển thị theo luồng 3 bước** (xem chi tiết ở C3) thay vì hiện cùng lúc 2 danh sách. |
| **Đầu vào** | `origin`, `destination`, `departure_date`, `trip_type` (`one_way`/`round_trip`), `return_date` (bắt buộc nếu khứ hồi), `passenger_count` |
| **Đầu ra** | Danh sách chuyến bay phù hợp (chặng đi, và chặng về nếu khứ hồi), sắp xếp mặc định theo giờ khởi hành |
| **API liên quan** | `GET /api/flights/search` |
| **Ghi chú kỹ thuật** | Query trên collection `Flight`, dùng index `origin_code + dest_code + departure_time`; nếu khứ hồi, query 2 lần (chặng đi + chặng về đảo chiều origin/dest) |

### C2. Hiển thị & lọc kết quả

| | |
|---|---|
| **Mô tả** | Sau khi có kết quả tìm kiếm, khách hàng lọc thêm theo giá, khung giờ bay, hãng bay. |
| **Đầu vào** | Danh sách chuyến bay từ C1 + bộ lọc (`min_price`, `max_price`, `time_range`, `airline_code`) |
| **Đầu ra** | Danh sách chuyến bay đã lọc |
| **Ghi chú kỹ thuật** | Xử lý phía client (filter mảng đã có) hoặc query lại server tùy lượng dữ liệu; với quy mô đồ án, filter phía client là đủ |

### C3. Chọn chuyến bay

| | |
|---|---|
| **Mô tả** | Khách hàng xem chi tiết 1 chuyến bay (hoặc 2 nếu khứ hồi). Hạng ghế (economy/business) **chưa chọn ở bước này** — được xác định riêng cho từng hành khách khi chọn ghế cụ thể ở C5 (mỗi ghế trong `Flight.seats[]` đã có sẵn `seat_class`), không bắt buộc cả đơn phải cùng 1 hạng. **Nếu khứ hồi, đi theo luồng 3 bước:** Bước 1 — chỉ hiện danh sách chặng đi, kèm thanh trạng thái "Bước 1: Chọn chuyến bay đi từ [origin] đến [destination]"; khách chọn 1 chuyến. Bước 2 — giao diện chuyển sang danh sách chặng về, thanh trạng thái đổi thành "Bước 2: Chọn chuyến bay về từ [destination] đến [origin]"; khách chọn tiếp. Bước 3 — gộp `flight_id` của cả 2 chặng đã chọn, hiển thị bảng tóm tắt hành trình + tổng tiền **tạm tính** (ước lượng theo giá economy, chưa chốt vì chưa biết hạng ghế thật của từng khách), có nút "Tiếp tục nhập thông tin hành khách" chuyển sang C4. |
| **Đầu vào** | `flight_id` (mỗi chặng) |
| **Đầu ra** | Thông tin chi tiết chuyến bay, kèm bảng giá tham khảo theo từng hạng ghế (economy/business) của từng chặng — chưa phải giá đã chốt |
| **API liên quan** | `GET /api/flights/[id]` |

### C4. Nhập thông tin hành khách

| | |
|---|---|
| **Mô tả** | Khách hàng nhập họ tên, loại giấy tờ tùy thân + số giấy tờ, ngày sinh cho từng hành khách. Ô nhập số giấy tờ hiển thị nhãn chung là **"Số giấy tờ tùy thân"** (không cố định "Số CCCD" như trước), kèm 1 dropdown/radio chọn **loại giấy tờ**: Căn cước công dân (mặc định), Hộ chiếu, hoặc Giấy khai sinh (dành cho trẻ em dưới 14 tuổi) — giúp khách nước ngoài hoặc trẻ em vẫn nhập được đúng loại giấy tờ mình có. Mỗi hành khách cần 1 ghế trên mỗi chặng bay (một chiều: 1 ghế; khứ hồi: 2 ghế, có thể khác số ghế giữa 2 chặng). **Diễn ra cùng màn hình với C5** (chọn ghế) — không phải 2 bước tách rời hoàn toàn: khách nhập tên xong thì chọn ghế ngay cho người đó (hoặc ngược lại), vì `seats[]` của mỗi hành khách chỉ hoàn chỉnh sau khi đã chọn ghế cụ thể. **Nếu khách xóa bớt 1 hành khách đã lỡ chọn ghế** (đổi ý giữa chừng), client phải gọi ngay `POST /api/flights/[id]/release-seat` cho (các) ghế người đó đã giữ, không chỉ xóa khỏi state phía client — tránh ghế bị giữ (`held`) lãng phí 30 phút trên server dù không còn ai dùng tới. **Thông tin liên hệ của booking (bổ sung khi triển khai):** ngoài hành khách, khách nhập **email nhận vé điện tử** (mặc định email tài khoản, sửa được khi đặt hộ người khác) và **số điện thoại** liên hệ — bắt buộc, lưu ở `Booking.contact`; vé điện tử (C7) gửi về `contact.email`. |
| **Đầu vào** | Danh sách hành khách: `full_name`, `document_type` (`cccd`/`passport`/`birth_certificate`), `document_id`, `date_of_birth`, `seats[]` (1 phần tử/chặng, gồm `flight_id` + `seat_number` + `seat_class`) |
| **Đầu ra** | Dữ liệu hành khách được lưu tạm (state phía client), chuẩn bị cho bước tạo booking |
| **Ghi chú kỹ thuật** | Nhúng vào mảng `passengers[]` trong `Booking`; schema validate số lượng `seats[]` của mỗi hành khách phải khớp đúng số chặng (`flights.length`). Xóa hành khách ở client **luôn kèm side-effect gọi API nhả ghế** (không chỉ xóa local state) — nếu bỏ bước này, ghế vẫn `held` trên server dù UI không còn hiển thị người đó, gây lãng phí ghế tới khi cron job (ghi chú b) dọn sau 30 phút. **Validate giấy tờ theo độ tuổi ở tầng service khi tạo booking (xem ghi chú aa):** tính tuổi từ `date_of_birth`, nếu ≥14 tuổi thì `document_id` bắt buộc và `document_type` chỉ được là `cccd` hoặc `passport`; nếu <14 tuổi thì chấp nhận `document_type: birth_certificate` với `document_id` không cần đủ cấu trúc 12 số như CCCD người lớn. |

### C5. Chọn ghế ngồi

| | |
|---|---|
| **Mô tả** | Khách hàng chọn ghế cụ thể trên sơ đồ ghế đơn giản, **cho từng hành khách, trên từng chặng bay**. Chọn 1 ghế cũng đồng thời xác định `seat_class` của hành khách đó (lấy từ chính `seat_class` có sẵn của ghế trong `Flight.seats[]`), không cần chọn hạng ghế riêng. **Bắt buộc đăng nhập.** Ghế được giữ tạm trong **30 phút**, quá hạn tự động nhả nếu chưa thanh toán xong. |
| **Đầu vào** | `flight_id`, `seat_number` |
| **Đầu ra** | Ghế chuyển `status: held`, gắn `held_by` (user hiện tại) và `held_until` (now + 30 phút) |
| **API liên quan** | `POST /api/flights/[id]/hold-seat`, `POST /api/flights/[id]/release-seat` (gọi khi khách bỏ chọn ghế hoặc xóa hành khách — xem C4) |
| **Ghi chú kỹ thuật** | Update atomic bằng điều kiện `status: available` trong query (không cần transaction); cron job (Giai đoạn 6) quét ghế/booking quá hạn để tự nhả |

### C6. Thanh toán

| | |
|---|---|
| **Mô tả** | Khách hàng thanh toán đơn đặt vé qua **cổng thanh toán VNPay** (tích hợp API VNPay môi trường sandbox để thu tiền — khách chọn ngân hàng, thẻ ATM nội địa/thẻ quốc tế/QR ngay trên trang VNPay; trước đây dùng VNPay, đã chuyển sang VNPay vì tài khoản VNPay bị khóa). Nếu là booking khứ hồi, trước khi tạo booking phải validate khoảng cách thời gian giữa 2 chặng (xem ghi chú z) — từ chối nếu chặng về cất cánh quá sớm so với giờ hạ cánh chặng đi. |
| **Đầu vào** | `booking_id`, `payment_method` |
| **Đầu ra** | Trạng thái thanh toán (`success`/`failed`), booking chuyển từ `pending_payment` sang `confirmed` nếu thành công |
| **API liên quan** | `POST /api/bookings`, `POST /api/payments/[bookingId]` (tạo URL thanh toán), `GET /api/payments/vnpay-ipn` (IPN của VNPay) |
| **Ghi chú kỹ thuật** | Tổng tiền = tổng `flights[].amount` (từng chặng) trừ giảm giá từ `promotion_id` — giảm giá được chia xuống từng chặng nên `total_amount = Σ flights[].amount` (ghi chú am); `payment_expires_at = held_until − 5 phút` (**đệm 5 phút, KHÔNG đặt bằng đúng `held_until`** — xem ghi chú y để tránh race-condition với độ trễ IPN của VNPay); `transaction_id` unique+sparse chống thanh toán trùng. **Nhận kết quả từ VNPay (IPN hoặc trang kết quả hỏi lại VNPay):** nếu VNPay báo thanh toán thành công nhưng tại thời điểm đó ghế đã bị cron nhả hoặc bị người khác giữ/đặt, **không được ghi đè `status: confirmed`** — xem ghi chú (y). **Nếu VNPay báo thất bại** (khách chủ động hủy giao dịch trên trang VNPay, hoặc link thanh toán hết hạn, hoặc lỗi thanh toán) **trước khi hết 30 phút giữ ghế**, Backend xử lý ngay lập tức (trong IPN, hoặc khi khách về trang kết quả), không đợi cron job (ghi chú b) quét dọn: nhả ghế về `available`, chuyển `Booking.status = cancelled`. Giúp giải phóng ghế sớm cho khách khác thay vì giữ chết tới hết 30 phút dù giao dịch đã rõ ràng thất bại. |

### C7. Xuất vé điện tử

| | |
|---|---|
| **Mô tả** | Sau khi thanh toán thành công, hệ thống tạo mã đặt chỗ; gửi vé điện tử qua email *(nên có)*, đúng ngôn ngữ khách đang dùng. |
| **Đầu vào** | `booking_id` |
| **Đầu ra** | Mã đặt chỗ (`booking_code`), email chứa thông tin vé (đủ cả 2 chặng nếu khứ hồi) |
| **API liên quan** | `GET /api/bookings/[id]/ticket` |
| **Ghi chú kỹ thuật** | Gửi email bằng Nodemailer/Resend; ngôn ngữ email lấy từ `Booking.locale` (chụp lại `User.preferred_language` tại thời điểm đặt vé) |

### C8. Đăng ký / Đăng nhập

| | |
|---|---|
| **Mô tả** | Khách hàng bắt buộc tạo tài khoản hoặc đăng nhập trước khi đặt vé (không có guest checkout). **Không cho đăng ký nếu `email` đã tồn tại trong hệ thống, bất kể tài khoản đó đang `is_blocked` hay không** — tránh trường hợp tài khoản bị khóa do vi phạm lại đăng ký mới bằng chính email cũ để né lệnh khóa. |
| **Đầu vào** | `email`, `password`, `full_name` (khi đăng ký) |
| **Đầu ra** | Session/token xác thực, `role: customer` mặc định |
| **API liên quan** | `POST /api/auth/register`, NextAuth `/api/auth/[...nextauth]` |
| **Ghi chú kỹ thuật** | Mật khẩu hash bằng bcrypt; không cho tự chọn role; kiểm tra thêm `is_blocked` khi đăng nhập; `preferred_language` lưu ngôn ngữ ưa thích. `POST /api/auth/register` kiểm tra `User.findOne({ email })` — nếu đã tồn tại (dù `is_blocked: true` hay `false`) thì từ chối, trả lỗi "Email đã được sử dụng"; `email` cần index `unique` ở tầng schema làm lớp bảo vệ cuối chống race-condition đăng ký trùng. |

### C8b. Tài khoản: hồ sơ, đổi mật khẩu, quên mật khẩu *(bổ sung khi triển khai)*

| | |
|---|---|
| **Mô tả** | Trang **Tài khoản** (`/account`, cần đăng nhập): xem email, sửa họ tên, đổi mật khẩu (nhập mật khẩu hiện tại + mật khẩu mới 2 lần). **Quên mật khẩu** (`/forgot-password`, công khai): nhập email, hệ thống gửi link đặt lại mật khẩu (hạn 30 phút, dùng 1 lần) tới `/reset-password?token=...`. Trang đăng nhập có link "Quên mật khẩu?". |
| **Đầu vào** | Sửa hồ sơ: `full_name`. Đổi mật khẩu: `current_password`, `new_password`. Quên mật khẩu: `email`. Đặt lại: `token`, `new_password` |
| **API liên quan** | `GET/PATCH /api/users/me`, `POST /api/users/me/password`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` |
| **Ghi chú kỹ thuật** | Mật khẩu mới theo cùng quy tắc đăng ký (≥6 ký tự, ≤72 byte). Đổi/đặt lại mật khẩu ghi `User.password_changed_at` — **mọi phiên đăng nhập cấp trước thời điểm đó hết hiệu lực** (JWT mang `auth_at`, `requireActiveUser` so sánh), tức đăng xuất mọi thiết bị. Sai mật khẩu hiện tại 5 lần thì khóa tạm 15 phút. Token đặt lại: 32 byte ngẫu nhiên, **chỉ lưu SHA-256** trong DB, xóa ngay khi dùng. Quên mật khẩu **luôn trả cùng 1 câu** dù email có tồn tại hay không (không cho dò email), giới hạn 5 yêu cầu / 15 phút / IP và 1 yêu cầu / 60 giây / email. Chưa cấu hình SMTP (chạy local) thì link được in ra log server để demo. Sửa họ tên cập nhật luôn tên trong phiên đăng nhập (header hiện tên mới ngay). |

### C9. Tra cứu & quản lý đơn đặt vé

| | |
|---|---|
| **Mô tả** | Khách hàng xem lại lịch sử đặt vé. Cách hủy khác nhau theo trạng thái: booking **chưa thanh toán** → hủy ngay lập tức, chuyển `cancelled`. Booking **đã thanh toán** → hệ thống xử lý hủy **hoàn toàn tự động trong cùng 1 request**: chặn ngay nếu có ghế đã `checked_in` (C10); nếu không, kiểm tra tiếp đã bay chặng nào chưa (khứ hồi — xem ghi chú w): nếu cả 2 chặng đã bay thì từ chối, trả lỗi "hành trình đã hoàn tất, không thể hủy"; ngược lại tính `refund_amount` theo mốc thời gian thực (xem A7), nhả ghế liên quan về `available` ngay lập tức, và chuyển thẳng booking sang `refunded` — **không còn bước chờ admin duyệt**. |
| **Đầu vào** | `user_id` (lấy từ session); khi hủy booking đã thanh toán: `reason` (lý do khách nhập, không bắt buộc) |
| **Đầu ra** | Danh sách booking kèm trạng thái; với booking vừa hủy đã thanh toán: `status: refunded`, `refund_amount`, `cancellation_fee_amount`, kèm **thông báo hủy vé thành công** hiển thị ngay cho khách (VD: hủy trước giờ bay 4 tiếng → rơi vào mốc 3h-24h → "Bạn sẽ được hoàn (tiền gốc − 400.000đ)") — VNPay chưa thực sự chuyển khoản lại, chỉ là thông báo số tiền dự kiến hoàn |
| **API liên quan** | `GET /api/bookings/my`, `PATCH /api/bookings/[id]/cancel` (dùng chung cho cả 2 trường hợp — service tự rẽ nhánh theo `Booking.status` hiện tại) |
| **Điều kiện** | Yêu cầu đã đăng nhập (phụ thuộc C8) |

### C10. Check-in online

| | |
|---|---|
| **Mô tả** | Khách hàng check-in online cho ghế đã đặt (booking đã thanh toán), nhận thẻ lên máy bay. Chỉ check-in được trong khung **24h trước giờ bay đến 2h trước giờ bay**. **Làm theo 4 bước như website hãng bay (VD Sun PhuQuoc Airways), không cần đăng nhập:** (1) nhập **mã đặt chỗ (mã vé điện tử — `booking_code`) + HỌ của một hành khách** trong booking (nhận họ kiểu Việt "Nguyễn", tên cuối kiểu phương Tây, hoặc nguyên họ tên; không phân biệt hoa/thường, có dấu hay không); (2) trang **Dữ liệu đặt chỗ**: chọn **chặng bay** rồi chọn **các hành khách** cần làm thủ tục (ghế đã làm thủ tục / chưa mở / đã đóng / chuyến hủy thì không chọn được), nhấn "Tiếp tục"; (3) đọc **quy định làm thủ tục trực tuyến (ICI) về hành khách và hành lý**, tick đồng ý, nhấn "Đồng ý & Tiếp tục" — server bắt buộc `ici_accepted: true`; (4) nhận **thẻ lên máy bay** cho từng hành khách đã chọn. Mục "Vé của tôi" có lối tắt "Check-in online" điền sẵn mã. Sai mã hoặc sai họ đều nhận cùng một thông báo (không lộ mã nào tồn tại); nhập sai 5 lần liên tiếp thì IP bị khóa tra cứu 15 phút. Tài khoản đặt vé bị khóa thì không check-in được. |
| **Đầu vào** | `booking_code` (6 ký tự), `passenger_name` (họ — hoặc họ tên — của 1 hành khách trong booking), `flight_id`, `seat_number`, `ici_accepted` (bắt buộc `true`) |
| **Đầu ra** | Thẻ lên máy bay gồm: tên hành khách, mã đặt chỗ, số hiệu chuyến, điểm đi/đến, giờ khởi hành, giờ lên máy bay (= giờ khởi hành − 40 phút, hằng số `BOARDING_STARTS_MINUTES_BEFORE_DEPARTURE`), số ghế, hạng ghế, `boarding_pass_code`, **mã QR** (nội dung `DELAYX|mã đặt chỗ|chuyến|ngày bay|chặng|ghế|họ tên không dấu|mã thẻ`), nút **In / Lưu PDF**, và **hướng dẫn tại sân bay** (chỉ xách tay → đi thẳng cửa an ninh với CCCD/VNeID + thẻ QR; có ký gửi → quầy "Gửi hành lý nhanh"; nên có mặt trước 90 phút); ghế chuyển `checked_in: true`, `checked_in_at` ghi lại thời điểm check-in |
| **API liên quan** | `POST /api/check-in/lookup` (bước 1: tra cứu bằng mã + họ), `POST /api/flights/[id]/check-in` (bước 4, gọi cho từng ghế đã chọn; body `seat_number`, `booking_code`, `passenger_name`, `ici_accepted`; thiếu đồng ý ICI → 422) — cả hai không cần đăng nhập |
| **Ghi chú kỹ thuật** | Lưu trực tiếp trong `Flight.seats[]`, không tách bảng riêng. Nội dung boarding pass khi hiển thị/tải xuống phải đúng ngôn ngữ khách đang dùng — lấy từ `Booking.locale`, cùng cách áp dụng với vé điện tử ở C7. Kiểm tra khung giờ (`departure_time - 24h` đến `departure_time - 2h`) ở tầng service, không cần thêm field mới. **Ghế đã check-in thì không cho hủy vé (xem C9) — kiểm tra này chạy TRƯỚC bước tính mốc thời gian phạt hủy ở A7, bất kể mốc thời gian còn lại là bao nhiêu.** **Không cho check-in chuyến đã bị hãng hủy** (`Flight.status: cancelled`) — booking có thể vẫn `confirmed` cho tới khi admin chạy hủy hàng loạt (A8), nhưng không được phát thẻ lên máy bay; trang check-in hiển thị "Chuyến bay đã bị hủy". Trạng thái hiển thị chia 3: chưa mở (còn hơn 24h), đang mở, đã đóng (dưới 2h trước giờ bay, kể cả khi chuyến chưa cất cánh). Nhãn thẻ lên máy bay lấy theo `Booking.locale` (`lib/boardingPass.js`), không theo ngôn ngữ giao diện đang chọn. |

### C11. Chuyển đổi ngôn ngữ giao diện

| | |
|---|---|
| **Mô tả** | Khách hàng đổi ngôn ngữ hiển thị (vi/en) ở toàn bộ khu vực khách hàng. Không áp dụng cho khu vực Admin. |
| **Đầu vào** | Lựa chọn ngôn ngữ |
| **Đầu ra** | Giao diện hiển thị lại theo ngôn ngữ đã chọn; lưu vào `User.preferred_language` nếu đã đăng nhập |
| **API liên quan** | `PATCH /api/users/me` |
| **Ghi chú kỹ thuật** | Route dạng `app/[locale]/...` cho khách hàng, `app/admin/...` không có locale. Chữ giao diện (nút, nhãn, thông báo) dịch qua file JSON tĩnh (thư viện next-intl), không lưu DB — chỉ dữ liệu do admin nhập/seed (tên sân bay, tên hãng bay) lưu `{vi, en}` trong DB |

---

## 3. Chức năng phía Admin (Quản trị)

> Toàn bộ giao diện Admin cố định tiếng Việt, không áp dụng đa ngôn ngữ.

### A1. Quản lý chuyến bay

| | |
|---|---|
| **Mô tả** | Thêm, sửa, xóa chuyến bay; quản lý lịch bay và giá vé theo hạng ghế. Khi tạo chuyến bay mới, admin chọn 1 `Aircraft` (loại máy bay) — hệ thống **tự động sinh `Flight.seats[]`** từ `Aircraft.seat_map_template` của loại máy bay đó (đã có sẵn đúng số ghế, số hiệu ghế như `1A`, `12C`... và hạng ghế tương ứng), admin không cần nhập tay từng ghế. **Không cho sửa `departure_time`/`aircraft_id` hoặc xóa chuyến bay nếu chuyến đã có booking liên quan** (còn hiệu lực, chưa `cancelled`) — tránh làm sai lệch dữ liệu vé đã bán. Riêng `aircraft_id`: **không cho sửa dù chưa có booking**, vì sơ đồ ghế (`seats[]`) đã được sinh cố định theo `Aircraft` lúc tạo — muốn đổi loại máy bay, admin xóa chuyến (nếu chưa có booking) và tạo lại. |
| **API liên quan** | `POST /api/admin/flights`, `PATCH /api/admin/flights/[id]`, `DELETE /api/admin/flights/[id]` |
| **Ghi chú kỹ thuật** | Khi tạo chuyến bay mới, có thể auto-fill thêm thông tin từ API AirLabs (mã chuyến, giờ bay, sân bay) ngoài phần seats đã tự sinh từ template. **Bắt buộc Deep Copy khi copy `Aircraft.seat_map_template` sang `Flight.seats[]`** (VD `structuredClone(...)` hoặc `JSON.parse(JSON.stringify(...))`) — **tuyệt đối không gán trực tiếp** (`flight.seats = aircraft.seat_map_template`) hay dùng shallow copy (`[...template]`/`Object.assign`), vì mảng object lồng nhau vẫn giữ reference tới cùng vùng nhớ; nếu sai, mọi `Flight` cùng dùng chung `Aircraft` sẽ chia sẻ chung 1 mảng ghế — khách đặt ghế ở chuyến bay A sẽ vô tình đổi luôn trạng thái ghế của chuyến bay B. Trước khi `PUT` đổi `departure_time` hoặc `DELETE`, kiểm tra `Booking.find({ 'flights.flight_id': flightId, status: { $in: ['pending_payment', 'confirmed'] } })` — **chỉ tính booking đang thực sự hiệu lực**, không tính `pending_refund`/`refunded`/`cancelled` (đã xử lý xong, không còn giữ ghế thật) — nếu có kết quả thì chặn, trả lỗi rõ ràng cho admin biết đang có booking phụ thuộc. `PUT` luôn từ chối nếu body chứa `aircraft_id` khác giá trị hiện tại (bất kể có booking hay không). |

### A2. Quản lý hãng hàng không & máy bay

| | |
|---|---|
| **Mô tả** | Thêm, sửa, xóa thông tin hãng bay (`Airline`) và loại máy bay (`Aircraft`). Tên hãng bay lưu đa ngôn ngữ (vi/en). |
| **API liên quan** | `POST/PUT/DELETE /api/admin/airlines`, `/api/admin/aircraft` |
| **Ghi chú kỹ thuật** | AirLabs chỉ trả tên tiếng Anh — cần tự bổ sung bản tiếng Việt khi seed (không có trang admin riêng để quản lý `Airport`, chỉ seed từ script) |

### A3. Quản lý đơn đặt vé

| | |
|---|---|
| **Mô tả** | Admin xem toàn bộ đơn đặt vé trong hệ thống, xác nhận hoặc hủy đơn khi cần. |
| **API liên quan** | `GET/PATCH /api/admin/bookings` |
| **Ghi chú kỹ thuật** | Booking khứ hồi hiển thị đủ 2 chặng và ghế riêng từng chặng của mỗi hành khách. **`PATCH` ở đây KHÔNG được phép đổi `status` thành `refunded` trực tiếp, và KHÔNG được nhập tay `refund_amount`** — muốn hủy 1 booking đã `confirmed` (VD khách gọi tổng đài nhờ admin hủy hộ), admin gọi cùng API `PATCH /api/bookings/[id]/cancel` như khách (C9), để hệ thống tự tính `refund_amount` theo đúng mốc thời gian thực, tránh 2 con đường xử lý hủy vé (1 tự động, 1 tùy ý admin) dẫn tới sai lệch chính sách. **Ngoại lệ duy nhất cho phép admin nhập tay `refund_amount`**: booking ở trạng thái `payment_error_manual_refund` (xem ghi chú y — trường hợp VNPay báo thanh toán thành công nhưng ghế đã mất do race-condition) — đây là sự cố kỹ thuật hy hữu ngoài luồng chính sách phí hủy bình thường, cần admin xử lý tay để hoàn đúng số tiền khách đã bị trừ qua VNPay. |

### A4. Quản lý người dùng

| | |
|---|---|
| **Mô tả** | Admin xem danh sách người dùng, khóa/mở tài khoản nếu vi phạm. |
| **API liên quan** | `GET/PATCH/DELETE /api/admin/users` |
| **Ghi chú kỹ thuật** | Field `is_blocked` (Boolean) trên `User`; tài khoản bị khóa không đăng nhập được (kiểm tra ở C8) |

### A5. Quản lý khuyến mãi / mã giảm giá *(tùy chọn, làm sau cùng)*

| | |
|---|---|
| **Mô tả** | Tạo mã giảm giá, thiết lập % giảm, thời hạn hiệu lực, giới hạn lượt dùng. |
| **API liên quan** | `POST/PUT/DELETE /api/admin/promotions` |

### A6. Thống kê & báo cáo doanh thu

| | |
|---|---|
| **Mô tả** | Hiển thị biểu đồ doanh thu theo tháng, theo tuyến bay. |
| **API liên quan** | `GET /api/admin/stats/revenue` |
| **Ghi chú kỹ thuật** | Dùng MongoDB Aggregation Pipeline trên `Booking.flights[].amount` (thành tiền riêng từng chặng) kết hợp `$lookup` sang `Flight` để lấy `origin_code`/`dest_code`. **Công thức doanh thu (đã sửa — có cộng tiền phạt hủy vé):** doanh thu = Σ(`flights[].amount` của các `Booking` có `status: 'confirmed'`) + Σ(`cancellation_fee_amount` của các `Booking` có `status: 'refunded'`). Khoản phạt hủy vé (A7/A8) là tiền hãng thực thu, không hoàn lại khách nên vẫn tính là doanh thu — chỉ riêng `refund_amount` (phần hoàn lại) mới bị loại khỏi doanh thu, không phải loại nguyên cả booking `refunded`. **"Theo tháng"** tính theo `payment.paid_at` cho phần `confirmed`, và theo `refund_processed_at` cho phần tiền phạt (vì đây là thời điểm hãng thực thu khoản phạt, có thể khác tháng với lúc đặt vé) — không dùng `createdAt` của booking. **"Theo tuyến bay"**: `flights[].amount` gắn sẵn theo từng chặng nên phân bổ tự nhiên; riêng `cancellation_fee_amount` tính trên toàn booking chứ không tách theo chặng — **phân bổ theo tỷ lệ** `flights[].amount` gốc của từng chặng trong booking đó (VD chặng đi chiếm 60% `total_amount` gốc thì nhận 60% khoản phí phạt khi cộng vào doanh thu theo tuyến). **Bẫy kỹ thuật khi code Pipeline (đọc kỹ trước khi viết `$unwind`):** vì `cancellation_fee_amount` và `refund_processed_at` là trường đơn ở cấp `Booking`, không nằm trong mảng `flights[]` — nếu `$unwind: "$flights"` rồi cộng thẳng `cancellation_fee_amount` vào từng chặng, MongoDB sẽ nhân bản trường đơn này ra mọi phần tử `flights[]`, khiến vé khứ hồi (2 chặng) bị tính tiền phạt **gấp đôi** giá trị thật. Bắt buộc phải dùng `$project` để chia tỷ lệ **ngay trong pipeline** trước khi cộng dồn, không cộng nguyên `cancellation_fee_amount`:

```js
db.bookings.aggregate([
  { $match: { status: "refunded" } },
  { $unwind: "$flights" },
  {
    $project: {
      flight_id: "$flights.flight_id",
      leg_amount: "$flights.amount",
      // Tính tổng flights[].amount gốc của booking để làm mẫu số tỷ lệ
      original_total: { $sum: "$flights.amount" }, // lưu ý: cần $sum trên mảng gốc trước $unwind, xem ghi chú bên dưới
      fee_share: {
        $multiply: [
          "$cancellation_fee_amount",
          { $divide: ["$flights.amount", "$original_total"] } // tỷ lệ chặng này / tổng gốc
        ]
      },
      refund_processed_at: 1,
    }
  },
  // group theo tháng (refund_processed_at) hoặc theo tuyến (flight_id → $lookup Flight lấy origin/dest)
]);
// Lưu ý triển khai thực tế: original_total nên tính bằng $sum trên mảng flights TRƯỚC khi $unwind
// (VD thêm 1 $addFields: { original_total: { $sum: "$flights.amount" } } đặt TRƯỚC bước $unwind),
// vì sau khi $unwind, "$flights.amount" chỉ còn là 1 số của riêng chặng đó, không phải mảng để $sum nữa.
``` |

### A7. Nhật ký đối soát hoàn tiền (Refund Audit Log)

| | |
|---|---|
| **Mô tả** | Không còn là hàng đợi phê duyệt. Khi khách (hoặc admin thay mặt khách, xem A3) hủy 1 booking **đã thanh toán** (qua `PATCH /api/bookings/[id]/cancel`), Backend tự động đối chiếu **thời điểm nhận request** (`new Date()`) với `departure_time` để rẽ nhánh theo mốc **≥24h / 3h-24h / <3h**: ≥24h → hoàn 100%, `cancellation_fee_amount = 0`; 3h-24h → phạt cố định **400.000đ/khách** (tính theo số hành khách trong `passengers[]`, không phụ thuộc hạng ghế), trừ thẳng vào tiền của phần bị áp mốc; <3h → phạt 100% phần bị áp mốc. **Với vé 1 chiều, áp mốc trên toàn `total_amount`. Với vé khứ hồi, cách áp mốc phụ thuộc chặng nào đã bay — xem 3 trường hợp chi tiết ở ghi chú (w)** (TH1 chưa bay chặng nào: áp trên toàn booking theo chặng đi; TH2 chặng đi đã bay: chỉ áp trên riêng chặng về, không phạt oan phần đã bay; TH3 cả 2 đã bay: từ chối hủy). Ghế được nhả về `available` ngay lập tức trong cùng request (với phần chặng liên quan), không phụ thuộc vào mốc hoàn tiền nào. Giao diện Admin ở mục này **chỉ đọc (read-only)**: liệt kê các booking đã bị hủy theo diện này, kèm số tiền đã hoàn, mốc phạt đã áp dụng, lý do khách nhập, thời điểm xử lý — phục vụ đối soát tài chính, không có nút hành động nào. |
| **Đầu vào** | *(Không có input trực tiếp ở màn hình này — chỉ hiển thị dữ liệu do C9/A3 tạo ra)* |
| **Đầu ra** | Danh sách booking đã `refunded`, mỗi dòng gồm `refund_amount`, `cancellation_fee_amount`, `cancellation_tier` (`full`/`fixed_fee`/`none`), `cancel_reason`, `refund_processed_at` |
| **API liên quan** | `GET /api/admin/bookings/refund-log` (chỉ đọc); logic tính toán thực tế nằm trong service dùng chung bởi `PATCH /api/bookings/[id]/cancel` (C9) |
| **Ghi chú kỹ thuật** | `elapsed_hours = (departure_time_mốc − now) / 3600000` — `departure_time_mốc` là chặng đi (TH1) hoặc chặng về (TH2), xem cách chọn ở ghi chú (w); TH3 chặn ngay từ đầu, không tính `elapsed_hours`. Hàm rẽ nhánh thuần túy ở tầng service, không cần cron job vì tính tại đúng thời điểm request. Số tiền phạt cố định trừ vào phần tiền tương ứng (toàn `total_amount` ở TH1, hoặc riêng `flights[chặng về].amount` ở TH2), **không** sửa lại các giá trị `flights[].amount` lịch sử (giữ nguyên phục vụ báo cáo doanh thu A6 — xem ghi chú t). `refund_status` giữ nguyên hành vi cũ (`pending`): **chiều thu tiền (C6) dùng API VNPay thật, nhưng chiều hoàn tiền KHÔNG gọi API hoàn tiền của VNPay** — hệ thống chỉ tính và ghi `refund_amount` vào DB, rồi hiển thị **thông báo hủy vé thành công** cho khách (VD: "Đơn hàng đã hủy trước giờ bay 4 tiếng, bạn sẽ được hoàn (tiền gốc − 400.000đ) = X đồng"). Việc VNPay thực sự chuyển khoản lại cho khách để sau, chưa làm ở giai đoạn này. Trạng thái `pending_refund` không còn được set trong luồng thông thường nữa; A8 vẫn giữ nhánh xử lý `pending_refund` phòng hờ (defensive), nhưng thực tế không còn đường nào dẫn tới trạng thái đó. |

### A8. Xử lý hàng loạt booking khi hủy chuyến bay

| | |
|---|---|
| **Mô tả** | Khi 1 chuyến bay bị hủy (`Flight.status: cancelled`), admin **chủ động kích hoạt riêng** 1 thao tác xử lý hàng loạt (không tự động chạy ngầm khi đổi status) — hệ thống xử lý mọi `Booking` liên quan đến chuyến bay đó theo đúng trạng thái hiện tại của từng booking: **`pending_payment`** → chuyển `cancelled` (chưa thu tiền, không có gì để hoàn). **`confirmed`** → chuyển `refunded`, tính lại `refund_amount` như mô tả ở ghi chú kỹ thuật bên dưới (không mặc định hoàn nguyên `total_amount` nữa — xem trường hợp khứ hồi mà chặng còn lại đã bay). (Trạng thái `pending_refund` được xử lý tương tự nếu tồn tại, nhưng từ khi A7 tự động hóa — xem mục A7 — luồng thường không còn tạo ra `pending_refund` nữa; nhánh này chỉ giữ lại phòng hờ, không còn ý nghĩa thực tế trong vận hành bình thường.) Tất cả đều tự thêm `cancel_reason` theo nội dung admin nhập (VD: "Hủy do thời tiết xấu"), và ghế liên quan (nếu còn `booked`) được nhả về `available`. |
| **Đầu vào** | `flight_id`, `cancel_reason` (bắt buộc, admin nhập) |
| **Đầu ra** | Danh sách `booking_id` bị ảnh hưởng, mỗi booking chuyển đúng trạng thái theo nhánh ở trên; ghế của chuyến bay đó được nhả |
| **API liên quan** | `POST /api/admin/flights/[id]/cancel-bulk` |
| **Ghi chú kỹ thuật** | Đây là hành động **riêng biệt, phải admin bấm rõ ràng** (VD nút "Hủy chuyến & xử lý vé liên quan"), không tự động kích hoạt ngay khi `PATCH /api/admin/flights/[id]` đổi `status` thành `cancelled` — tránh side-effect ẩn ngoài ý muốn khi admin chỉ định sửa trạng thái đơn thuần. Không đi qua luồng A7 (vì đây là quyết định 1 chiều từ phía hãng bay do lỗi khách quan, không phải yêu cầu chủ động từ khách). **Chính sách hoàn tiền:** mặc định hoàn 100% (`cancellation_tier = full`), không trừ phí khách vì lỗi thuộc hãng bay, bất kể còn bao lâu tới giờ bay. **Ngoại lệ bắt buộc với vé khứ hồi khi chặng còn lại đã bay xong:** nếu booking là khứ hồi và chặng KHÔNG bị hủy (VD chặng đi) đã có `departure_time <= now` tại thời điểm xử lý — tức khách đã bay chặng đó rồi — hệ thống **không được hoàn phần tiền của chặng đã bay**. Công thức: `refund_amount = total_amount − Σ(flights[].amount của các chặng có departure_time <= now)`, `cancellation_tier = partial` (thêm giá trị mới vào enum, xem ghi chú x). Nếu cả 2 chặng đều chưa bay thì công thức tự nhiên cho ra `refund_amount = total_amount` (giống trường hợp `full`). Bỏ qua hoàn toàn rào cản "đã check-in thì không cho hủy" của C9/C10 — rào cản đó chỉ áp dụng khi CHÍNH khách hàng chủ động xin hủy, không áp dụng khi admin bắt buộc hủy do sự cố khách quan; ghế đã `checked_in` vẫn bị nhả về `available` và `checked_in`/`boarding_pass_code` được reset. **Lưu ý:** nếu booking là khứ hồi và chỉ 1 trong 2 chặng bị hủy, **toàn bộ booking** (cả chặng không bị ảnh hưởng) vẫn bị chuyển `refunded` theo — hệ thống không hỗ trợ hủy tách riêng từng chặng (xem mục 6); phần "không hỗ trợ tách chặng" chỉ nói về trạng thái booking, còn **số tiền hoàn thì vẫn phải tính tách theo từng chặng** như công thức trên. |

---

### A9. Nhật ký thao tác admin *(bổ sung khi triển khai)*

| | |
|---|---|
| **Mô tả** | Ghi lại mọi thao tác **thay đổi dữ liệu** của quản trị viên: tạo/sửa/xóa chuyến bay, hủy chuyến hàng loạt (A8), hủy vé thay khách (A3), hoàn tiền tay, khóa/mở khóa/xóa tài khoản, tạo/sửa/xóa khuyến mãi, máy bay, hãng bay, tuyến phổ biến. Trang **Admin → Nhật ký thao tác** (`/admin/logs`) liệt kê 200 dòng mới nhất, lọc theo nhóm; thao tác ảnh hưởng tiền/tài khoản khách được tô đỏ. Chỉ đọc. |
| **Đầu ra** | Mỗi dòng: thời điểm, email admin, loại thao tác, mô tả, chi tiết rút gọn |
| **Ghi chú kỹ thuật** | Collection `AdminLog` (append-only, không có API sửa/xóa). Ghi **sau khi** thao tác thành công qua `lib/adminLog.js`; lỗi ghi nhật ký chỉ in log, **không** làm hỏng thao tác chính. Chi tiết được rút gọn (bỏ field mật khẩu/token, mảng chỉ ghi số phần tử). |

---

## 4. Ghi chú giải thích thiết kế

(a) **Bắt buộc đăng nhập mới đặt được ghế** (C5, C6): không hỗ trợ khách vãng lai. `Booking.user` và `Flight.seats.held_by` luôn tham chiếu tài khoản đã đăng nhập thật.

(b) **Giữ ghế 30 phút** (C5): `seat.held_until = now + 30 phút`. Quá hạn chưa thanh toán, ghế tự nhả về `available` qua cron job (Giai đoạn 6).

(c) **Ghế nhúng vào Flight** (C5): giữ ghế là 1 update atomic trên đúng 1 document, không cần MongoDB Transaction, chạy tốt trên MongoDB standalone.

(d) **Đa ngôn ngữ 2 lớp** (A2, C11): dữ liệu do admin nhập/seed (tên sân bay, hãng bay) lưu `{vi, en}` trong DB — khác với chữ giao diện (nút, nhãn, thông báo) dịch qua file JSON tĩnh phía frontend, không liên quan DB.

(e) **Khứ hồi** (C1, C3, C4, C6): `Booking.trip_type` quyết định số chặng trong `flights[]`. Mỗi hành khách cần 1 ghế riêng cho mỗi chặng.

(f) **Booking quá hạn thanh toán**: cron job quét `payment_expires_at` đã qua, tự chuyển `cancelled` và nhả ghế — khác với luồng hủy tự động theo mốc giờ (A7), vì đây là do khách bỏ ngang **chưa từng thanh toán** (không có tiền để tính hoàn), không phải khách chủ động hủy đơn đã thanh toán.

(g) **Luồng hủy vé 2 nhánh** (C9, A7) *(đã cập nhật — tự động hóa hoàn toàn)*: booking **chưa thanh toán** → hủy ngay lập tức, chuyển thẳng `cancelled` (chưa có tiền để hoàn). Booking **đã thanh toán** → hệ thống tự tính `refund_amount` theo mốc thời gian thực ngay trong request hủy (xem A7), chuyển thẳng `refunded` và **ghế nhả ngay lập tức** — không còn bước trung gian `pending_refund` chờ admin, không còn ai có quyền "từ chối" hay chỉnh tay số tiền.

(h) **Doanh thu theo tuyến bay** (A6): `Booking.total_amount` gộp cả 2 chặng nếu khứ hồi, không dùng được để tách doanh thu theo tuyến — phải dùng `Booking.flights[].amount`.

(i) **Chống thanh toán trùng** (C6): `payment.transaction_id` có index `unique + sparse`.

(j) **Chính sách phí hủy vé — đã cập nhật (thay thế quyết định nhập tay trước đó)**: hệ thống tự động áp bảng mốc cố định dựa trên thời gian thực so với giờ khởi hành của **chặng sớm nhất** trong booking: ≥24h → hoàn 100%; 3h–24h → phạt cố định 400.000đ/hành khách (trừ vào `total_amount`); <3h (kể cả khi chặng đã khởi hành) → phạt 100%, hoàn 0đ. Admin không còn quyền nhập tay số tiền hoàn hay % phí cho từng trường hợp — xem A7. Đây là thay đổi có chủ đích so với bản thiết kế trước, nhằm loại bỏ hoàn toàn thao tác thủ công và sai sót do con người.

(k) **Khung giờ check-in** (C10): mở trước giờ bay 24h, đóng trước giờ bay 2h — tính toán ở tầng service dựa vào `Flight.departure_time`, không lưu thành field riêng.

(l) **Chặn hủy sau khi check-in** (C9, C10): nếu bất kỳ ghế nào trong booking đã `checked_in: true`, không cho gửi yêu cầu hủy — tránh mâu thuẫn dữ liệu (đã lên máy bay/chuẩn bị bay mà vẫn hủy được vé).

(m) **Hạng ghế gắn theo từng hành khách, không theo cả đơn** (C3, C4): mỗi hành khách có thể chọn hạng ghế khác nhau trên cùng 1 chặng — `seat_class` nằm trong `Passenger.seats[]` (gắn với từng ghế cụ thể), không còn nằm ở cấp `Booking.flights[]` để tránh suy luận ngầm hoặc nhầm lẫn khi tính giá.

(n) **Giá vé chỉ có 1 loại tiền tệ (VNĐ)**: dù giao diện hỗ trợ song ngữ (C11), giá vé không quy đổi theo ngôn ngữ — đây là quyết định có chủ đích để giới hạn phạm vi, không phải thiếu sót.

(o) **Toàn vẹn dữ liệu `seat_class`**: `Passenger.seats[].seat_class` do client gửi lên phải được đối chiếu với `Flight.seats[seat_number].seat_class` thật ở tầng service khi tạo booking — không tin dữ liệu client, vì nó ảnh hưởng trực tiếp tới cách tính `amount`.

(p) **Chống dùng vượt hạn mức khuyến mãi**: tăng `Promotion.used_count` phải dùng update atomic. Lưu ý `usage_limit` có thể để trống (không giới hạn) — khi đó **không được** áp điều kiện `used_count < usage_limit` (so sánh với giá trị rỗng sẽ chặn nhầm mọi lượt dùng), phải rẽ nhánh: có giới hạn thì check điều kiện, không giới hạn thì tăng thẳng. **Quyết định:** khi booking dùng mã khuyến mãi bị hủy (qua A7/A8), **không** giảm lại `used_count` — giữ đơn giản, tránh race condition khi nhiều booking cùng hủy/tạo lúc mã sắp hết lượt; đây là đánh đổi có chủ đích, chấp nhận mã có thể hết lượt hơi sớm hơn thực tế.

(q) **Khóa tài khoản có hiệu lực ngay, không chỉ ở lần đăng nhập sau**: các hành động nhạy cảm phía khách hàng (giữ ghế, tạo booking, thanh toán) kiểm tra lại `is_blocked` trực tiếp từ DB tại thời điểm thực hiện (hàm `requireActiveUser`), không chỉ dựa vào session đã đăng nhập trước đó — đảm bảo admin khóa tài khoản có tác dụng ngay cả khi khách đang có phiên đăng nhập hoạt động.

(r) **Tìm kiếm khứ hồi theo luồng 3 bước** (C1, C3): thay vì hiện đồng thời 2 danh sách chặng đi/chặng về (dễ rối mắt), giao diện dẫn dắt tuần tự — chọn chặng đi trước, chặng về sau, cuối cùng mới tóm tắt cả hành trình + tổng tiền. Không cần logic gợi ý combo giá tốt nhất ở backend, giữ đơn giản cho quy mô đồ án nhưng vẫn có trải nghiệm rõ ràng, mạch lạc.

(s) **Ràng buộc dữ liệu chuyến bay**: `origin_code` không được trùng `dest_code`; `arrival_time` phải sau `departure_time`; nếu chuyến bay có ghế hạng business thì bắt buộc phải khai báo `base_price.business` (tránh trường hợp có ghế nhưng không có giá để tính tiền).

(t) **Công thức tính `flights[].amount`** (C6): vì hạng ghế gắn theo từng hành khách (ghi chú m), `amount` của mỗi chặng = tổng theo từng hành khách trên chặng đó, nhân đúng giá theo hạng ghế người đó chọn — VD 2 khách economy + 1 khách business trên cùng chặng thì `amount = 2 × base_price.economy + 1 × base_price.business`, không phải nhân đơn giản `số khách × 1 giá`.

(u) **`Flight.seats[]` tự sinh, không nhập tay, và PHẢI deep copy** (A1): khi tạo chuyến bay, admin chỉ chọn `Aircraft`, hệ thống copy nguyên `seat_map_template` của `Aircraft` đó thành `Flight.seats[]` (status mặc định `available`) — **bắt buộc deep copy**, không gán tham chiếu trực tiếp (xem ghi chú kỹ thuật A1 để tránh lỗi các `Flight` cùng loại máy bay chia sẻ chung 1 mảng ghế). Vì vậy ghi chú "chưa xác nhận trước đây (đã sửa lại)": vấn đề validate số ghế khớp `total_seats` là trách nhiệm khi **tạo `Aircraft`** (đảm bảo `seat_map_template.length === total_seats`), không phải validate lại mỗi lần tạo `Flight` — vì `Flight` chỉ copy y nguyên, không cho admin chỉnh tay số ghế ở bước tạo chuyến bay.

(v) **Chặn sửa/xóa chuyến bay đã có booking, và hủy hàng loạt là hành động riêng** (A1, A8): sửa `departure_time`, `arrival_time`, `origin_code`, `dest_code` hoặc xóa `Flight` khi đã có booking sẽ làm sai lệch dữ liệu vé đã bán (vé điện tử, boarding pass, transit time khứ hồi đều phụ thuộc các field này) nên bị chặn cứng ở tầng API. `base_price` **không** bị chặn vì tiền mỗi vé đã chốt vào `Booking.flights[].amount` lúc đặt (ghi chú t), đổi bảng giá chỉ ảnh hưởng lượt đặt sau. Ngược lại, khi **hủy** chuyến bay (`status: cancelled` qua `PATCH /api/admin/flights/[id]`), đây là sửa trạng thái đơn thuần — hệ thống **không** tự động hủy theo các booking liên quan. Nếu vẫn còn booking hiệu lực, API trả thêm trường `warning` nhắc admin bấm riêng hành động A8 để hoàn tiền cho khách. Admin phải chủ động bấm 1 hành động riêng (A8) kèm lý do cụ thể, để tránh thay đổi dữ liệu booking hàng loạt một cách ẩn ý ngoài dự tính của admin.

(w) **Mốc thời gian tính phí hủy cho vé khứ hồi — đã sửa lại theo 3 trường hợp** (A7, mục 6): vì không hỗ trợ khách **chủ động** tách chặng để hủy riêng, mặc định vẫn dùng `departure_time` của chặng sớm nhất làm mốc — nhưng cách áp dụng chia theo 3 trường hợp cụ thể:

- **TH1 — Chưa chặng nào bay** (`now < chặng_đi.departure_time`): áp mốc 24h/3h như bình thường so với `departure_time` chặng đi, tính trên **toàn bộ `total_amount`**, giống mô tả gốc ở A7.
- **TH2 — Chặng đi đã bay, chặng về chưa** (`chặng_đi.departure_time <= now < chặng_về.departure_time`): **không được phạt 100% cả booking** như bản thiết kế trước — vì chặng đi khách đã bay xong hợp lệ, không liên quan gì tới quyết định hủy chặng về. Hệ thống tự động chỉ xử lý phần **chặng về**: áp mốc 24h/3h/dưới 3h so với `departure_time` của **chặng về** (không phải chặng đi), tính trên `flights[chặng về].amount`. Công thức: `refund_amount = flights[chặng về].amount − phí phạt tính theo mốc thời gian còn lại của chặng về` (dùng đúng bảng phí ở ghi chú j, chỉ áp cho riêng chặng về). Booking vẫn chuyển `refunded` (đúng cách A8 xử lý case tương tự), `cancellation_tier = partial`. Đây không phải "hủy tách chặng do khách chọn" (vẫn ngoài phạm vi theo mục 6) — mà là hệ quả bắt buộc vì chặng đi đã bay, không thể "hủy" một việc đã xảy ra rồi.
- **TH3 — Cả 2 chặng đều đã bay** (`now >= chặng_về.departure_time`): **không cho hủy nữa** — trả lỗi rõ ràng cho khách (VD "Hành trình đã hoàn tất, không thể hủy vé"), không xử lý refund (không phải trường hợp phạt 100%, mà là không còn gì để hủy).

`cancellation_tier` do đó có 2 cách dùng: `full`/`fixed_fee`/`none` cho TH1 (áp cho toàn booking), và `partial` cho TH2 (chỉ áp cho phần chặng về) — trùng khái niệm `partial` đã định nghĩa ở A8, dùng chung 1 giá trị enum cho cả 2 chức năng.

(x) **Field mới trên `Booking` phục vụ hủy vé tự động** (A7, A8): `refund_amount` (Number), `cancellation_fee_amount` (Number), `cancellation_tier` (enum: `full` / `fixed_fee` / `none` / `partial` — `partial` chỉ dùng cho trường hợp A8 hủy 1 chặng khứ hồi mà chặng còn lại đã bay, xem A8), `refund_processed_at` (Date). Các field này được service ghi tự động khi xử lý `PATCH /api/bookings/[id]/cancel` (C9/A3) hoặc `POST /api/admin/flights/[id]/cancel-bulk` (A8), không có trường nào do admin nhập tay.

(y) **Đệm thời gian chống race-condition giữa giữ ghế (C5) và IPN VNPay (C6)**: nếu đặt `payment_expires_at` đúng bằng `held_until`, có rủi ro khách bấm thanh toán sát phút thứ 30, nhập OTP mất 1-2 phút, webhook IPN của VNPay báo về sau khi cron job (ghi chú b) đã nhả ghế — dẫn tới khách bị trừ tiền thật nhưng ghế đã mất/đổi chủ. **Cách khắc phục:** `payment_expires_at = held_until − 5 phút`, tạo khoảng đệm để ghế vẫn còn giữ khi webhook về trong điều kiện bình thường. **Ở tầng xử lý webhook**, nếu VNPay báo thành công nhưng tại thời điểm đó ghế **đã** bị nhả (do vượt quá cả khoảng đệm) hoặc đã bị người khác giữ/đặt, hệ thống **tuyệt đối không ghi đè `Booking.status = confirmed`** — thay vào đó chuyển booking sang trạng thái riêng `payment_error_manual_refund` và cần cơ chế báo cho admin (VD hiển thị nổi bật trong A3) để xử lý hoàn tiền thủ công cho khách, vì đây là trường hợp hy hữu ngoài luồng tự động bình thường, không áp theo mốc giờ của A7.

(z) **Ràng buộc thời gian transit giữa 2 chặng vé khứ hồi** (C3, C6): tài liệu trước chưa validate khoảng cách giữa giờ hạ cánh chặng đi và giờ cất cánh chặng về, dẫn tới rủi ro khách chọn được chặng về cất cánh trước hoặc trùng giờ hạ cánh chặng đi. **Bắt buộc validate ở tầng service khi tạo booking (C6)**: `flight_về.departure_time >= flight_đi.arrival_time + 2 tiếng` (thời gian transit tối thiểu), nếu không thỏa thì từ chối tạo booking, trả lỗi rõ cho client hiển thị lại cho khách chọn lại chặng về. Nên lọc bớt ở UI ngay từ bước chọn chặng về (C3, bước 2) để tránh khách chọn được rồi mới báo lỗi, nhưng validate ở service vẫn là lớp bảo vệ bắt buộc cuối cùng (không tin dữ liệu client).

(aa) **Loại giấy tờ tùy thân theo độ tuổi** (C4): thêm field `document_type` (enum: `cccd` / `passport` / `birth_certificate`) đi kèm `document_id` cho mỗi hành khách — `document_id` vẫn giữ nguyên là 1 trường String chung, dùng để lưu số CCCD, số hộ chiếu, hay số/quyển giấy khai sinh tùy theo `document_type` đã chọn, không tách thành nhiều trường riêng. **Validate ở tầng service khi tạo booking** (không chỉ validate ở UI, vì không tin dữ liệu client): tính tuổi từ `Passenger.date_of_birth` so với thời điểm tạo booking — hành khách ≥14 tuổi bắt buộc có `document_id` và `document_type` phải là `cccd` hoặc `passport` (từ chối tạo booking, trả lỗi rõ nếu thiếu); hành khách <14 tuổi được phép dùng `document_type: birth_certificate`, không bắt buộc `document_id` phải đúng cấu trúc 12 số như CCCD người lớn. Đây thuần là validate giấy tờ hợp lệ theo độ tuổi, **không liên quan đến giá vé** — giá vé trẻ em vẫn tính phẳng theo hạng ghế như đã nêu ở mục 6 (không tính giảm giá riêng cho trẻ em/sơ sinh).

(ab) **Múi giờ khi tính mốc thời gian** (A7, C10): MongoDB lưu `Date` dưới dạng UTC. Khi tính `elapsed_hours` cho phí hủy vé (A7, ghi chú w) hoặc khung giờ check-in (C10, mở 24h/đóng 2h trước giờ bay), **bắt buộc ép `departure_time`/`arrival_time` và thời điểm hiện tại về cùng múi giờ `Asia/Ho_Chi_Minh` (GMT+7)** trước khi so sánh — dùng thư viện như `dayjs` (kèm plugin `utc`/`timezone`) hoặc `moment-timezone`, không so sánh trực tiếp 2 giá trị `Date` thô nếu server chạy ở múi giờ khác UTC+7 (VD server host ở múi giờ UTC mặc định), vì lệch 7 tiếng sẽ làm sai mốc phạt hoàn tiền hoặc mở/đóng nhầm khung check-in.

(ac) **Xác minh kết quả thanh toán VNPay** (C6): IPN của VNPay (`GET /api/payments/vnpay-ipn`) chỉ được tin khi chữ ký HMAC-SHA512 đúng (khóa `vnp_HashSecret` là RIÊNG của từng merchant, không dùng chung công khai như khóa sandbox VNPay trước đây), `vnp_TmnCode` đúng mã của hệ thống và `vnp_Amount / 100 = total_amount` (lệch tiền → trả `RspCode 04`, không đổi booking). Thành công = `vnp_ResponseCode = 00` và `vnp_TransactionStatus = 00`; thất bại dứt khoát = `vnp_TransactionStatus = 02`; giao dịch chưa hoàn tất (`01`) → trả `RspCode 99` để VNPay gửi lại. **Trang kết quả (Return URL) KHÔNG tin tham số `vnp_*` trên URL**: server tự hỏi lại VNPay bằng API truy vấn `querydr` (gửi `vnp_TxnRef` + ngày tạo giao dịch đã lưu ở `payment.last_order_id`/`last_order_date`) rồi chốt booking theo kết quả thật — nhờ vậy chạy localhost không có IPN vẫn xác nhận được thanh toán.

(ad) **Thanh toán trùng** (C6 + A7): nếu khách trả tiền 2 lần (VD bấm "Thanh toán" 2 lần → 2 giao dịch VNPay), khoản thành công thứ hai (`vnp_TransactionNo` khác) được ghi vào `payment.extra_payments[]` và hiện ở trang Nhật ký hoàn tiền để admin hoàn tay. IPN gửi lại cùng `transId` vẫn bị bỏ qua (idempotent).

(ae) **Giới hạn chống chiếm ghế** (C4/C5): mỗi user giữ tối đa 20 ghế cùng lúc (`MAX_HELD_SEATS_PER_USER`). Gọi lại hold-seat cho ghế mình đang giữ còn hạn là **idempotent — không gia hạn** `held_until` (nếu cho gia hạn, 1 người gọi lặp lại có thể giữ ghế vô thời hạn, phá cơ chế 30 phút của C5); hết hạn rồi thì giữ lại được như hold mới. Mỗi user cũng tối đa 3 booking `pending_payment` còn hạn (`MAX_PENDING_BOOKINGS_PER_USER`) và không tạo được booking thứ 2 chứa cùng ghế với 1 booking đang chờ (trả 409 kèm `existing_booking_id`; giao diện cho khách tiếp tục thanh toán booking đó). Mục đích: không để 1 tài khoản giữ kín chuyến bay hoặc tạo booking lặp để đốt lượt mã khuyến mãi (ghi chú p không hoàn lại `used_count`).

(af) **Ghế `held` quá hạn coi như trống ngay** (C5, ghi chú b): `holdSeat`, sơ đồ ghế và số ghế trống khi tìm kiếm đều tính `held_until < now` là trống. Cron (ghi chú b) vẫn là cơ chế dọn dữ liệu chính, nhưng không cần đợi cron chạy để ghế trống trở lại cho khách khác.

(ag) **Vé khứ hồi — chiều ngược bắt buộc** (C3/C6): chặng về phải là chiều ngược lại chặng đi (`origin_về = dest_đi`, `dest_về = origin_đi`), kiểm tra ở server cùng với transit time (ghi chú z). Nếu không thỏa, từ chối tạo booking với lỗi rõ ràng.

(ah) **Hủy vé atomic** (C9/A7): chuyển `confirmed → refunded` bằng `updateOne` có điều kiện `status: confirmed`; 2 request hủy đồng thời chỉ 1 bên thắng, bên thua nhận 409. Chỉ bên thắng mới nhả ghế.

(ai) **A8 — chặng bị hủy không bao giờ tính là "đã bay"** (A8): khi tính `refund_amount = total_amount − Σ(chặng đã bay)`, bỏ qua chính chuyến bay bị hủy dù giờ khởi hành dự kiến đã qua. Công thức chỉ trừ chặng có `departure_time <= now` VÀ không phải `cancelledFlightId`.

(aj) **Đăng nhập — khóa tạm và chống dò thời gian** (C8): khóa tạm 15 phút sau 5 lần sai liên tiếp theo email (lưu trong bộ nhớ tiến trình); luôn chạy bcrypt kể cả email không tồn tại (không lộ email qua thời gian phản hồi); mật khẩu tối đa 72 byte (giới hạn của bcrypt); `full_name` 1–100 ký tự; `preferred_language` chỉ nhận `vi`/`en`. Gửi lại email vé cách nhau tối thiểu 60 giây.

(ak) **Kiểm tra quyền ở từng trang** (ghi chú q mở rộng): mỗi trang admin tự gọi `guardAdminPage()` (không chỉ dựa vào layout — Next.js không chạy lại layout khi điều hướng phía client); các trang khách cần đăng nhập (lịch sử, vé, thanh toán) gọi `guardActivePage()` (trang check-in không cần đăng nhập — kiểm tra khóa tài khoản đặt vé ngay trong service check-in) để kiểm tra `is_blocked` từ DB — đảm bảo tài khoản vừa bị khóa không xem được dữ liệu qua tab đang mở.

(al) **Đầu vào API — chặn injection** (chung): `seat_number` phải là chuỗi khớp regex `^[0-9A-Za-z_-]{1,8}$` (chặn object toán tử NoSQL như `{ $gt: "" }`); `id` MongoDB sai định dạng trả 400 thay vì để Mongoose ném CastError.

(am) **`flights[].amount` đã trừ phần chia giảm giá** (C6, A6, A7): khi booking dùng mã khuyến mãi, `discountAmount` được chia xuống từng chặng theo tỷ lệ `amount` và giữ bất biến `total_amount = Σ flights[].amount`. Nhờ đó doanh thu A6 và tiền hoàn TH2 (ghi chú w) tính trên số tiền khách thực trả. Điều chỉnh so với mô tả "amount trước giảm giá" ở ghi chú kỹ thuật C6 — hiểu `amount` là sau khi chia giảm giá.

(an) **Validate giấy tờ — làm rõ khi triển khai** (C4, ghi chú aa): ngoài quy tắc ≥14 tuổi, hành khách <14 tuổi chọn `cccd` bị từ chối (chọn `birth_certificate` hoặc `passport`); và 2 hành khách trong cùng booking không được trùng `document_id`.

(ao) **Xác nhận thanh toán atomic và chịu được chạy song song** (C6, ghi chú y): IPN của VNPay và trang kết quả (`syncPaymentStatus`, khi khách được VNPay đưa về) thường tới gần như cùng lúc, và cả hai đều chỉ hành động trên dữ liệu đã được xác minh (ghi chú ac). Mọi thay đổi `status` đều là update có điều kiện `status: pending_payment` (atomic), nên chỉ MỘT bên chốt được `confirmed`/`payment_error_manual_refund`/`cancelled`, bên còn lại đọc lại kết quả và không phát vé 2 lần, không nhả ghế nhầm. Khi `confirm` ghế thất bại, hệ thống phân biệt "mất ghế thật" với "luồng song song vừa đặt xong chính booking này": ghế đã `booked` bởi đúng chủ và không thuộc booking `confirmed`/`payment_error_manual_refund` nào khác thì coi là thành công. Số tiền VNPay thu (theo kết quả truy vấn) khác `total_amount` thì không confirm, chuyển `payment_error_manual_refund` và nhả ghế đang giữ. Nếu booking bị hủy trong lúc đang xử lý thì nhả các ghế vừa đặt và ghi nhận thanh toán muộn (ghi chú y). IPN thất bại của một lần thanh toán CŨ (không phải `last_order_id`) bị bỏ qua, không hủy booking khi lần mới có thể đang chờ. Cron quá hạn (ghi chú f) không hủy booking đã có `transaction_id` mà còn kẹt `pending_payment`: chuyển `payment_error_manual_refund`.

(ap) **Kiểm tra trước khi tạo giao dịch và khi tạo booking** (C6): trước khi tạo giao dịch VNPay, mọi ghế của booking phải còn `held` bởi chính chủ và chưa quá `held_until` (nếu không, từ chối 409 để khách đặt lại — tránh trả tiền rồi mới mất ghế). Tổng tiền phải nằm trong giới hạn VNPay 5.000đ – dưới 1 tỷ đồng, kiểm tra ngay khi tạo booking (VD mã giảm 100% cho tổng 0đ bị từ chối). Link thanh toán VNPay hết hạn cùng lúc với `payment_expires_at` (`vnp_ExpireDate`). Nếu việc tạo booking thất bại sau khi đã tăng `used_count`, lượt mã được trả lại (khác ghi chú p: trường hợp booking đã tạo rồi bị hủy thì vẫn không hoàn).

(aq) **Validate sơ đồ ghế `Aircraft` và bảo mật bổ sung** (A2, chung): API tạo/sửa `Aircraft` từ chối `seat_map_template` có số ghế trùng, sai định dạng (`^[0-9A-Za-z_-]{1,8}$`) hoặc sai `seat_class`, và (khi có `total_seats`) từ chối nếu số ghế không khớp — đây là bổ sung so với mục 6 (nay có validate cơ bản). Trả về header bảo mật (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`); API công khai `GET /api/flights/[id]` không trả `held_by`, `held_until`, thông tin check-in của ghế.

(ar) **Kiểm tra đầu vào và độ bền bổ sung**: ghế khi tạo booking phải còn được giữ **hơn 5 phút** (vì `payment_expires_at = held_until − 5 phút`, ghi chú y); `full_name` hành khách là chuỗi 1–100 ký tự, `document_id` là chuỗi tối đa 30 ký tự (chặn object/mảng gây lỗi 500); lý do hủy tối đa 500 ký tự; body JSON sai ở tạo khuyến mãi trả 400; `booking_code` được gán atomic (chỉ khi chưa có) nên IPN và trang kết quả chạy đồng thời không sinh 2 mã hay gửi email vé 2 lần.

(as) **Củng cố tích hợp VNPay và dữ liệu demo** (C6): IPN chỉ được chấp nhận khi chữ ký đúng **và** `vnp_TmnCode` là của hệ thống; `VNPAY_PAY_URL`/`VNPAY_API_URL` bắt buộc `https://` (trừ localhost) vì phản hồi truy vấn VNPay là căn cứ xác nhận thanh toán, và phản hồi truy vấn phải khớp đúng `vnp_TmnCode` + `vnp_TxnRef`; mỗi lần gọi VNPay có giới hạn thời gian 15 giây để không treo trang kết quả. Script `seed` tạo tài khoản demo (`admin@example.com`/`Admin@123`) từ chối chạy khi `NODE_ENV=production` và cho phép đổi mật khẩu bằng `SEED_ADMIN_PASSWORD`, `SEED_CUSTOMER_PASSWORD` — tài khoản demo mật khẩu mặc định tuyệt đối không dùng khi triển khai thật.

## 5. Ma trận phụ thuộc giữa các chức năng

- **C5 (Chọn ghế)** phụ thuộc **C8 (Đăng nhập)**
- **C4 (Nhập hành khách)** và **C5 (Chọn ghế)** diễn ra cùng lúc trên 1 màn hình, không tách rời — `Passenger.seats[]` chỉ hoàn chỉnh khi cả 2 việc đã xong
- **C6 (Thanh toán)** phụ thuộc **C4 (Nhập hành khách)** và **C5 (Giữ ghế)**
- **C9 (Tra cứu đơn vé)** phụ thuộc **C8 (Đăng nhập)**
- **A7 (Nhật ký đối soát hoàn tiền)** chỉ đọc dữ liệu do **C9 (khách hủy booking đã thanh toán)** hoặc **A3 (admin hủy hộ)** sinh ra — không còn là bước duyệt riêng, không chặn hay trì hoãn kết quả hủy vé
- **C10 (Check-in)** phụ thuộc **C6 (Thanh toán thành công)**
- **A1 (Quản lý chuyến bay)** nên có trước **C1 (Tìm kiếm)** để có dữ liệu test
- **A8 (Hủy hàng loạt booking)** phụ thuộc **A1 (Flight.status đã chuyển `cancelled`)**

## 6. Ngoài phạm vi đồ án

- Đánh giá/phản hồi (review) và các chức năng liên quan — đã loại bỏ khỏi phạm vi.
- Triển khai công khai (deploy) — hệ thống chạy demo trực tiếp trên localhost.
- Đặt vé không cần đăng nhập (guest checkout) — không hỗ trợ.
- Trang admin quản lý riêng `Airport` — không có, sân bay chỉ seed qua script từ AirLabs.
- Hủy/hoàn từng chặng riêng lẻ trong vé khứ hồi (VD chỉ hủy chặng về) — chỉ hỗ trợ hủy toàn bộ booking cùng lúc.
- Đa tiền tệ theo ngôn ngữ — không hỗ trợ, giá luôn hiển thị VNĐ, xem ghi chú (n).
- Giảm giá vé riêng cho trẻ em/sơ sinh — không có, giá vé tính phẳng theo hạng ghế cho mọi độ tuổi; hệ thống chỉ validate **loại giấy tờ tùy thân** hợp lệ theo độ tuổi (xem ghi chú aa), không tính lại `amount` theo độ tuổi.
- Validate `Aircraft.seat_map_template` khớp đúng `total_seats` — ban đầu ngoài phạm vi; khi triển khai đã có validate cơ bản (không trùng ghế, đúng định dạng, đúng `seat_class`, khớp `total_seats` nếu có khai báo), xem ghi chú (aq). Vì `Flight.seats[]` chỉ copy nguyên từ template (ghi chú u), admin vẫn cần nhập đúng số ghế thực tế của máy bay.
