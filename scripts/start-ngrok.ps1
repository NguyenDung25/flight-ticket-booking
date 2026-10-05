# scripts/start-ngrok.ps1
#
# Mở tunnel ngrok tới app đang chạy ở localhost và TỰ ghi APP_BASE_URL vào
# .env.local (để Momo gọi ngược IPN về được). Không lưu/in token ra file.
#
# Chạy (PowerShell, trong thư mục dự án):
#   powershell -ExecutionPolicy Bypass -File scripts\start-ngrok.ps1
# Sau khi script báo xong: RESTART `npm run dev` để app đọc APP_BASE_URL mới.

param([int]$Port = 3000)
$ErrorActionPreference = "Stop"
$envFile = Join-Path $PSScriptRoot "..\.env.local"

if (-not (Get-Command ngrok -ErrorAction SilentlyContinue)) {
  throw "Không tìm thấy lệnh ngrok. Cài ngrok và mở lại PowerShell trước."
}

# 1) Authtoken (chỉ cần nhập lần đầu; Enter để bỏ qua nếu đã lưu trước đó)
$token = Read-Host "Nhập authtoken ngrok MỚI (Enter để bỏ qua nếu đã lưu)"
if ($token) {
  ngrok config add-authtoken $token
  if ($LASTEXITCODE -ne 0) { throw "Lưu authtoken thất bại." }
}

# 2) Mở ngrok ở cửa sổ riêng (để mở suốt; đóng cửa sổ đó = tắt tunnel)
Start-Process ngrok -ArgumentList "http", $Port

# 3) Đợi ngrok sẵn sàng rồi đọc địa chỉ công khai từ API nội bộ (127.0.0.1:4040)
$url = $null
for ($i = 0; $i -lt 20 -and -not $url; $i++) {
  Start-Sleep -Seconds 1
  try {
    $tunnels = Invoke-RestMethod "http://127.0.0.1:4040/api/tunnels"
    $url = ($tunnels.tunnels | Where-Object { $_.public_url -like "https://*" } | Select-Object -First 1).public_url
  } catch { }
}
if (-not $url) {
  throw "Không lấy được địa chỉ ngrok. Xem cửa sổ ngrok vừa mở để biết lỗi (thường là chưa có/sai authtoken)."
}

# 4) Ghi/ cập nhật APP_BASE_URL trong .env.local (giữ nguyên các dòng khác)
$content = if (Test-Path $envFile) { Get-Content $envFile -Raw } else { "" }
$line = "APP_BASE_URL=$url"
if ($content -match "(?m)^APP_BASE_URL=") {
  $content = [regex]::Replace($content, "(?m)^APP_BASE_URL=[^\r\n]*", $line)
} else {
  $content = $content.TrimEnd() + "`r`n" + $line + "`r`n"
}
[System.IO.File]::WriteAllText($envFile, $content, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host "Xong. Địa chỉ công khai: $url" -ForegroundColor Green
Write-Host "Đã ghi APP_BASE_URL vào .env.local."
Write-Host "BƯỚC TIẾP: restart 'npm run dev', rồi MỞ WEB BẰNG ĐỊA CHỈ TRÊN (không dùng localhost)."
Write-Host "Theo dõi Momo gọi về tại: http://127.0.0.1:4040"
