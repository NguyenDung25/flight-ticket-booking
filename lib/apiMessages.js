// lib/apiMessages.js
//
// Dịch thông báo lỗi do API/service trả về (viết bằng tiếng Việt) sang ngôn ngữ giao diện khách đang
// dùng (C11). Service giữ nguyên thông báo tiếng Việt (admin, log, tài liệu dùng tiếng Việt); giao diện
// khách gọi localizeApiMessage() ngay chỗ HIỂN THỊ lỗi. Không phụ thuộc DB nên dùng được cả ở server
// (trang Server Component, Server Action) lẫn client.
//
// Thông báo chưa có trong bảng thì giữ nguyên (tiếng Việt) — thêm vào EXACT/PATTERNS khi thêm lỗi mới.

const EXACT = {
  // Chung / phân quyền
  "Bạn cần đăng nhập để thực hiện thao tác này.": "Please log in to continue.",
  "Tài khoản không tồn tại.": "This account does not exist.",
  "Tài khoản đã bị khóa.": "This account has been locked.",
  "Đã có lỗi xảy ra, vui lòng thử lại sau.": "Something went wrong, please try again later.",
  "Đã có lỗi xảy ra, vui lòng thử lại.": "Something went wrong, please try again.",
  "Tham số không hợp lệ (sai định dạng id).": "Invalid parameter (malformed id).",
  "Dữ liệu bị trùng (vi phạm ràng buộc duy nhất, VD mã đã tồn tại).": "Duplicate data (this value already exists).",
  "Body request phải là JSON hợp lệ.": "The request body must be valid JSON.",
  "Không tìm thấy booking.": "Booking not found.",
  "Không tìm thấy chuyến bay.": "Flight not found.",
  "Ngôn ngữ không được hỗ trợ.": "Unsupported language.",

  // Đăng ký / đăng nhập (C8)
  "email, password, full_name đều là bắt buộc.": "Email, password and full name are required.",
  "email, password, full_name phải là chuỗi.": "Email, password and full name must be text.",
  "Địa chỉ email không hợp lệ.": "Invalid email address.",
  "Mật khẩu phải có ít nhất 6 ký tự.": "Password must be at least 6 characters.",
  "Email đã được sử dụng.": "This email is already in use.",
  "email và password đều là bắt buộc.": "Email and password are required.",
  "Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ít phút.": "Too many failed login attempts. Please try again in a few minutes.",
  "Email hoặc mật khẩu không đúng.": "Incorrect email or password.",

  // Tài khoản (đổi / quên mật khẩu)
  "Mật khẩu phải là chuỗi.": "Password must be text.",
  "Vui lòng nhập mật khẩu hiện tại.": "Please enter your current password.",
  "Mật khẩu hiện tại không đúng.": "Your current password is incorrect.",
  "Mật khẩu mới phải khác mật khẩu hiện tại.": "The new password must be different from the current one.",
  "Nhập sai mật khẩu hiện tại quá nhiều lần. Vui lòng thử lại sau ít phút.": "Too many incorrect current-password attempts. Please try again in a few minutes.",
  "Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.": "This password reset link is invalid or has expired.",
  "Bạn gửi yêu cầu quá nhiều lần. Vui lòng thử lại sau ít phút.": "Too many requests. Please try again in a few minutes.",
  "Bạn thử quá nhiều lần. Vui lòng thử lại sau ít phút.": "Too many attempts. Please try again in a few minutes.",
  "Mật khẩu vừa được thay đổi, vui lòng đăng nhập lại.": "Your password was just changed, please log in again.",
  "Không có thông tin nào để cập nhật.": "Nothing to update.",
  "Email đã được xác thực.": "Your email is already verified.",
  "Bạn vừa yêu cầu gửi email xác thực. Vui lòng đợi 1 phút rồi thử lại.":
    "You just requested a verification email. Please wait a minute and try again.",
  "Link xác thực email không hợp lệ hoặc đã hết hạn.": "This email verification link is invalid or has expired.",
  "Vui lòng xác thực email trước khi đặt vé. Kiểm tra hộp thư hoặc gửi lại email xác thực ở trang Tài khoản.":
    "Please verify your email before booking. Check your inbox or resend the verification email from your Account page.",
  "Nếu email này đã đăng ký tài khoản, chúng tôi đã gửi link đặt lại mật khẩu. Vui lòng kiểm tra hộp thư (cả mục Spam).":
    "If this email is registered, we have sent a password reset link. Please check your inbox (including Spam).",

  // Tìm chuyến (C1)
  "Thiếu điểm đi hoặc điểm đến.": "Please choose an origin and a destination.",
  "Điểm đi và điểm đến không được trùng nhau.": "Origin and destination must be different.",
  "Thiếu ngày bay.": "Please choose a departure date.",
  "Ngày bay không hợp lệ (định dạng YYYY-MM-DD).": "Invalid departure date (YYYY-MM-DD).",
  "Ngày bay không được ở trong quá khứ.": "The departure date cannot be in the past.",
  "Vé khứ hồi bắt buộc phải có return_date.": "A round trip needs a return date.",
  "Ngày về không hợp lệ (định dạng YYYY-MM-DD).": "Invalid return date (YYYY-MM-DD).",
  "Ngày về không được trước ngày đi.": "The return date cannot be before the departure date.",

  // Giữ ghế / đặt vé (C4–C6)
  "seat_number không hợp lệ.": "Invalid seat number.",
  "Thiếu seat_number.": "Missing seat number.",
  "Chuyến bay đã bị hủy hoặc đã khởi hành, không thể giữ ghế.": "This flight has been cancelled or has departed; seats can no longer be held.",
  "Họ tên hành khách phải là chuỗi từ 1 đến 100 ký tự.": "Passenger name must be 1–100 characters.",
  "Chặng về cất cánh quá sớm so với giờ hạ cánh chặng đi (cần tối thiểu 2 tiếng transit). Vui lòng chọn lại chặng về.":
    "The return flight departs too soon after the outbound flight lands (at least 2 hours needed). Please choose another return flight.",
  "Chặng về phải là chiều ngược lại của chặng đi (đi A→B thì về B→A). Vui lòng chọn lại chặng về.":
    "The return flight must be the reverse route of the outbound flight (A→B then B→A). Please choose another return flight.",
  "Booking phải có ít nhất 1 hành khách.": "A booking needs at least 1 passenger.",
  "Cần ít nhất 1 hành khách.": "At least 1 passenger is required.",
  "Chặng đi và chặng về không được là cùng một chuyến bay.": "The outbound and return flights cannot be the same flight.",
  "trip_type phải là 'one_way' hoặc 'round_trip'.": "Trip type must be one-way or round trip.",
  "Bạn đã có một booking đang chờ thanh toán chứa các ghế này. Hãy thanh toán hoặc hủy booking đó trước.":
    "You already have a booking awaiting payment with these seats. Please pay for or cancel that booking first.",
  "promotion_code không hợp lệ.": "Invalid promo code.",

  "Vui lòng nhập thông tin liên hệ (email và số điện thoại).": "Please enter contact details (email and phone number).",
  "Email liên hệ không hợp lệ.": "Invalid contact email.",
  "Số điện thoại liên hệ không hợp lệ (9–15 chữ số).": "Invalid contact phone number (9–15 digits).",

  // Thanh toán (C6)
  "Ghế của booking đã hết hạn giữ hoặc không còn thuộc về bạn — vui lòng đặt lại từ đầu.":
    "The seats on this booking are no longer held for you — please start a new booking.",
  "Đã quá hạn giữ ghế cho booking này, vui lòng đặt lại từ đầu.": "The seat hold for this booking has expired, please start a new booking.",
  "Bạn không có quyền thanh toán booking này.": "You are not allowed to pay for this booking.",

  // Hủy vé (C9)
  "Bạn không có quyền hủy booking này.": "You are not allowed to cancel this booking.",
  "Booking có hành khách đã check-in, không thể hủy vé.": "A passenger on this booking has checked in, so it can no longer be cancelled.",
  "Trạng thái booking vừa thay đổi (có thể vừa thanh toán xong). Vui lòng tải lại trang.":
    "The booking status has just changed (payment may have just completed). Please reload the page.",
  "Trạng thái booking vừa thay đổi (có thể đã được hủy hoặc xử lý ở nơi khác). Vui lòng tải lại trang.":
    "The booking status has just changed (it may have been cancelled or processed elsewhere). Please reload the page.",
  "Hành trình đã hoàn tất, không thể hủy vé.": "This trip has been completed and can no longer be cancelled.",

  // Vé điện tử (C7)
  "Bạn không có quyền xem vé của booking này.": "You are not allowed to view this ticket.",
  "Không xuất được vé, vui lòng thử lại.": "The ticket could not be issued, please try again.",
  "Không sinh được mã đặt chỗ duy nhất sau nhiều lần thử, vui lòng thử lại.": "Could not generate a booking code, please try again.",

  // Check-in (C10)
  "Chuyến bay đã bị hủy, không thể check-in.": "This flight has been cancelled; check-in is not available.",
  "Chỉ được check-in trong khung từ 24 tiếng đến 2 tiếng trước giờ bay.": "Check-in is only available from 24 hours to 2 hours before departure.",
  "Không tìm thấy vé đã thanh toán khớp với mã đặt chỗ và họ hành khách này.": "No paid booking matches this booking code and passenger last name.",
  "Vui lòng nhập đúng mã đặt chỗ (6 ký tự) và họ của một hành khách.": "Please enter a valid 6-character booking code and the last name of one passenger.",
  "Không thể check-in cho booking này, vui lòng liên hệ hãng.": "This booking cannot be checked in online, please contact the airline.",
  "Vui lòng đọc và đồng ý quy định làm thủ tục trực tuyến (ICI) trước khi check-in.": "Please read and accept the internet check-in (ICI) rules before checking in.",
  "Ghế này không thuộc mã đặt chỗ đã nhập.": "This seat does not belong to the booking code entered.",
};

/** [mẫu tiếng Việt, hàm dựng câu tiếng Anh từ các nhóm bắt được]. */
const PATTERNS = [
  [/^Gói hành lý ký gửi không hợp lệ \(chọn ([\d/]+) kg\)\.$/, (list) => `Invalid checked baggage package (choose ${list} kg).`],
  [/^Bạn đang giữ quá nhiều ghế \(tối đa (\d+)\)\. Hãy bỏ bớt ghế trước khi chọn thêm\.$/, (n) => `You are holding too many seats (max ${n}). Please release some before choosing more.`],
  [/^Ghế (\S+) không còn trống — vui lòng chọn ghế khác\.$/, (s) => `Seat ${s} is no longer available — please choose another seat.`],
  [/^Ghế (\S+) không hợp lệ để check-in \(chưa đặt, không thuộc về bạn, hoặc đã check-in trước đó\)\.$/, (s) => `Seat ${s} cannot be checked in (not booked, not yours, or already checked in).`],
  [/^Hành khách "(.*)" có ngày sinh không hợp lệ\.$/, (n) => `Passenger "${n}" has an invalid date of birth.`],
  [/^Ngày sinh của hành khách "(.*)" không được ở trong tương lai\.$/, (n) => `Passenger "${n}"'s date of birth cannot be in the future.`],
  [/^Ngày sinh của hành khách "(.*)" không hợp lệ \(quá (\d+) tuổi\)\.$/, (n, a) => `Passenger "${n}"'s date of birth is invalid (over ${a} years old).`],
  [/^Số giấy tờ của hành khách "(.*)" không hợp lệ\.$/, (n) => `Passenger "${n}" has an invalid ID number.`],
  [/^Hành khách "(.*)" từ (\d+) tuổi trở lên bắt buộc phải nhập số giấy tờ tùy thân\.$/, (n, a) => `Passenger "${n}" is ${a} or older and must provide an ID number.`],
  [/^Hành khách "(.*)" từ (\d+) tuổi trở lên phải dùng CCCD hoặc Hộ chiếu\.$/, (n, a) => `Passenger "${n}" is ${a} or older and must use a national ID card or passport.`],
  [/^Hành khách "(.*)" dưới (\d+) tuổi không thể dùng CCCD, chọn Giấy khai sinh hoặc Hộ chiếu\.$/, (n, a) => `Passenger "${n}" is under ${a} and cannot use a national ID card — choose a birth certificate or passport.`],
  [/^Số giấy tờ "(.*)" bị trùng giữa 2 hành khách \("(.*)" và "(.*)"\) — mỗi hành khách phải có số giấy tờ khác nhau\.$/, (id, a, b) => `ID number "${id}" is used by two passengers ("${a}" and "${b}") — each passenger needs a different ID number.`],
  [/^Chuyến bay (\S+) không còn nhận đặt vé \(đã bị hủy\)\.$/, (f) => `Flight ${f} is no longer bookable (cancelled).`],
  [/^Chuyến bay (\S+) đã khởi hành, không thể đặt vé\.$/, (f) => `Flight ${f} has already departed and cannot be booked.`],
  [/^Hành khách "(.*)" chưa chọn ghế cho chuyến bay (\S+)\.$/, (n, f) => `Passenger "${n}" has not chosen a seat on flight ${f}.`],
  [/^Hành khách "(.*)" chưa chọn ghế\.$/, (n) => `Passenger "${n}" has not chosen a seat.`],
  [/^Ghế (\S+) thuộc chuyến bay không nằm trong hành trình đã chọn\.$/, (s) => `Seat ${s} is on a flight that is not part of this trip.`],
  [/^Hành khách "(.*)" chọn nhiều hơn 1 ghế trên chuyến bay (\S+)\.$/, (n, f) => `Passenger "${n}" chose more than one seat on flight ${f}.`],
  [/^Ghế (\S+) \(chuyến (\S+)\) bị chọn trùng giữa "(.*)" và "(.*)"\.$/, (s, f, a, b) => `Seat ${s} (flight ${f}) was chosen by both "${a}" and "${b}".`],
  [/^Ghế (\S+) không tồn tại trên chuyến bay (\S+)\.$/, (s, f) => `Seat ${s} does not exist on flight ${f}.`],
  [/^Ghế (\S+) chưa được bạn giữ hợp lệ .*Vui lòng chọn lại ghế\.$/, (s) => `Seat ${s} is no longer validly held for you (the hold may have expired or another customer took it). Please choose the seat again.`],
  [/^Mỗi booking tối đa (\d+) hành khách\.$/, (n) => `A booking can have at most ${n} passengers.`],
  [/^Bạn có quá nhiều booking đang chờ thanh toán \(tối đa (\d+)\)\. Hãy thanh toán hoặc hủy bớt\.$/, (n) => `You have too many bookings awaiting payment (max ${n}). Please pay for or cancel some.`],
  [/^Tổng tiền (.+)đ nằm ngoài giới hạn thanh toán VNPay \((.+)–(.+)đ\)\.$/, (t, a, b) => `The total of ${t} VND is outside the VNPay payment limit (${a}–${b} VND).`],
  [/^Booking đang ở trạng thái '(.*)', không thể tạo yêu cầu thanh toán\.$/, (s) => `This booking is '${s}' and cannot be paid.`],
  [/^Booking đang ở trạng thái '(.*)', không thể hủy qua luồng này\.$/, (s) => `This booking is '${s}' and cannot be cancelled here.`],
  [/^Booking đang ở trạng thái '(.*)', chưa có vé để xuất\.$/, (s) => `This booking is '${s}', so no ticket is available yet.`],
  [/^Mã khuyến mãi "(.*)" không tồn tại\.$/, (c) => `Promo code "${c}" does not exist.`],
  [/^Mã khuyến mãi "(.*)" đã hết hiệu lực\.$/, (c) => `Promo code "${c}" has expired.`],
  [/^Mã khuyến mãi "(.*)" đã hết lượt sử dụng\.$/, (c) => `Promo code "${c}" has no uses left.`],
  [/^Họ tên phải từ 1 đến (\d+) ký tự\.$/, (n) => `Full name must be 1–${n} characters.`],
  [/^Mật khẩu quá dài \(tối đa (\d+) byte, ký tự có dấu tính nhiều byte\)\.$/, (n) => `Password is too long (max ${n} bytes; accented characters take more bytes).`],
  [/^passenger_count phải là số nguyên từ 1 đến (\d+)\.$/, (n) => `Passenger count must be a whole number from 1 to ${n}.`],
  [/^Bạn nhập sai quá nhiều lần\. Vui lòng thử lại sau (\d+) phút\.$/, (n) => `Too many incorrect attempts. Please try again in ${n} minutes.`],
  [/^Vui lòng đợi (\d+) giây trước khi gửi lại email vé\.$/, (n) => `Please wait ${n} seconds before resending the ticket email.`],
];

/**
 * @param {string} message - thông báo tiếng Việt từ API/service
 * @param {string} locale - "vi" | "en"
 * @returns {string} thông báo theo ngôn ngữ giao diện (giữ nguyên nếu chưa có bản dịch)
 */
function localizeApiMessage(message, locale) {
  if (locale !== "en" || typeof message !== "string") return message;
  if (Object.hasOwn(EXACT, message)) return EXACT[message];
  for (const [re, build] of PATTERNS) {
    const m = message.match(re);
    if (m) return build(...m.slice(1));
  }
  return message;
}

/** Ngôn ngữ giao diện hiện tại phía trình duyệt (thẻ <html lang> do app/[locale]/layout.js đặt). */
function currentUiLocale() {
  return typeof document !== "undefined" && document.documentElement.lang === "en" ? "en" : "vi";
}

module.exports = { localizeApiMessage, currentUiLocale, EXACT, PATTERNS };
