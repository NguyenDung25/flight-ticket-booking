const test = require("node:test");
const assert = require("node:assert/strict");
const { sniffImageType, MAX_IMAGE_BYTES } = require("../lib/imageSniff");

const pad = (arr) => Buffer.from([...arr, ...new Array(Math.max(0, 16 - arr.length)).fill(0)]);

test("sniffImageType: nhận đúng JPEG, PNG, WebP theo magic bytes", () => {
  assert.equal(sniffImageType(pad([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffImageType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(sniffImageType(Buffer.concat([Buffer.from("RIFF"), Buffer.from([1, 2, 3, 4]), Buffer.from("WEBPVP8 ")])), "image/webp");
});

test("sniffImageType: từ chối SVG, GIF, HTML/script giả ảnh, file quá ngắn, rỗng", () => {
  assert.equal(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), null);
  assert.equal(sniffImageType(Buffer.from("GIF89a" + "\0".repeat(10))), null);
  assert.equal(sniffImageType(Buffer.from("<html><script>alert(1)</script></html>")), null);
  assert.equal(sniffImageType(Buffer.from([0xff, 0xd8])), null);
  assert.equal(sniffImageType(Buffer.alloc(0)), null);
  assert.equal(sniffImageType(null), null);
});

test("MAX_IMAGE_BYTES là 1 MB", () => {
  assert.equal(MAX_IMAGE_BYTES, 1024 * 1024);
});
