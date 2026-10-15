/* VehicleHub — plate.js
 * Finds the number plate on a vehicle photo, in the browser (free, nothing is uploaded).
 * findPlates(canvas) -> [{ x, y, w, h }] in the canvas's pixels (best first, at most 2).
 * A plate is a row of 4+ dark letters/digits of the same height on a light background
 * (or light on dark). We find letter-like blobs, join the ones that line up into rows,
 * and keep the rows that look most like a plate. It is a guess: the photo editor shows
 * the box so the user can undo it or draw another one. */
(function (root) {
  'use strict';

  function findPlates(src) {
    var sw = src.width, sh = src.height;
    if (!sw || !sh) return [];
    var all = [];
    [720, 360].forEach(function (W) { all = all.concat(scan(src, sw, sh, W)); });
    all.sort(function (a, b) { return b.score - a.score; });
    var picked = [];
    all.forEach(function (o) {
      if (picked.length >= 2) return;
      if (picked.length && o.score < picked[0].score * 0.5) return;
      if (picked.some(function (p) { return overlap(p, o); })) return;
      picked.push(o);
    });
    return picked.map(function (o) { return { x: o.x, y: o.y, w: o.w, h: o.h }; });
  }

  function scan(src, sw, sh, W) {
    var s = Math.min(1, W / sw);
    W = Math.max(1, Math.round(sw * s)); var H = Math.max(1, Math.round(sh * s));
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var cx = c.getContext('2d'); cx.drawImage(src, 0, 0, W, H);
    var px = cx.getImageData(0, 0, W, H).data, N = W * H, i;
    var g = new Float32Array(N);
    for (i = 0; i < N; i++) g[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];

    // local mean (integral image), window ~ 1/14 of the width
    var I = new Float64Array((W + 1) * (H + 1)), x, y;
    for (y = 0; y < H; y++) {
      var rs = 0;
      for (x = 0; x < W; x++) { rs += g[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + rs; }
    }
    var R = Math.max(4, Math.round(W / 60));
    var mean = new Float32Array(N);
    for (y = 0; y < H; y++) {
      var y0 = Math.max(0, y - R), y1 = Math.min(H, y + R + 1);
      for (x = 0; x < W; x++) {
        var x0 = Math.max(0, x - R), x1 = Math.min(W, x + R + 1);
        mean[y * W + x] = (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
      }
    }
    var out = [];
    [true, false].forEach(function (darkText) {
      var b = new Uint8Array(N);
      for (i = 0; i < N; i++) b[i] = darkText ? (g[i] < mean[i] - 12 ? 1 : 0) : (g[i] > mean[i] + 12 ? 1 : 0);
      var chars = components(b, W, H).filter(function (k) {
        var w = k.x1 - k.x0 + 1, h = k.y1 - k.y0 + 1, f = k.n / (w * h);
        return h >= 8 && h <= H * 0.3 && h / w >= 0.6 && h / w <= 6 && f > 0.15 && f < 0.9;
      });
      rows(chars).forEach(function (r) {
        var o = rate(r, g, b, W, H, darkText);
        if (!o) return;
        out.push({ x: o.x / s, y: o.y / s, w: o.w / s, h: o.h / s, score: o.score });
      });
    });
    return out;
  }

  // join blobs of about the same height that sit side by side
  function rows(chars) {
    chars.forEach(function (k) { k.h = k.y1 - k.y0 + 1; k.cy = (k.y0 + k.y1) / 2; });
    chars.sort(function (a, b) { return a.x0 - b.x0; });
    var used = [], out = [];
    for (var i = 0; i < chars.length; i++) {
      if (used[i]) continue;
      var row = [chars[i]], last = chars[i];
      for (var j = i + 1; j < chars.length; j++) {
        if (used[j]) continue;
        var k = chars[j];
        if (k.x0 - last.x1 > 1.3 * last.h) break;
        if (k.x0 - last.x1 < -0.3 * last.h) continue;
        var hr = k.h / last.h;
        if (hr < 0.7 || hr > 1.4 || Math.abs(k.cy - last.cy) > 0.3 * last.h) continue;
        row.push(k); used[j] = true; last = k;
      }
      if (row.length >= 4) out.push(row);
    }
    return out;
  }

  function rate(row, g, b, W, H, darkText) {
    var x0 = row[0].x0, x1 = row[row.length - 1].x1, y0 = 1e9, y1 = 0, hs = [];
    row.forEach(function (k) { y0 = Math.min(y0, k.y0); y1 = Math.max(y1, k.y1); hs.push(k.h); });
    var h = y1 - y0 + 1, w = x1 - x0 + 1, n = row.length;
    if (n > 12 || w / h < 1.5 || w / h > 12) return null;
    var mh = hs.reduce(function (a, b) { return a + b; }, 0) / n;
    var dev = hs.reduce(function (a, b) { return a + Math.abs(b - mh); }, 0) / n / mh;   // 0 = all the same height
    // inside the row: letters vs. the panel between them (a plate's panel is plain)
    var fg = 0, nf = 0, bg = 0, bb = 0, nb = 0, x, y;
    for (y = y0; y <= y1; y++) for (x = x0; x <= x1; x++) {
      var v = g[y * W + x];
      if (b[y * W + x]) { fg += v; nf++; } else { bg += v; bb += v * v; nb++; }
    }
    if (!nf || !nb) return null;
    fg /= nf; bg /= nb;
    var ringSd = Math.sqrt(Math.max(0, bb / nb - bg * bg));
    var contrast = darkText ? bg - fg : fg - bg;
    if (contrast < 30) return null;
    var px = Math.round(mh * 0.7), py = Math.round(mh * 0.55);
    var bx0 = Math.max(0, x0 - px), bx1 = Math.min(W - 1, x1 + px), by0 = Math.max(0, y0 - py), by1 = Math.min(H - 1, y1 + py);
    var yc = (y0 + h / 2) / H;
    var score = Math.min(n, 9) * (1.2 - Math.min(dev, 1)) * Math.min(contrast, 120) / (1 + ringSd / 20) *
      (darkText ? 1.2 : 1) * (yc < 0.15 ? 0.3 : 1) * (n >= 5 && n <= 9 ? 1.3 : 1);
    return { x: bx0, y: by0, w: bx1 - bx0 + 1, h: by1 - by0 + 1, score: score };
  }

  function overlap(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  function components(b, W, H) {
    var lab = new Int32Array(W * H), out = [], stack = [], i, n = 0;
    for (i = 0; i < W * H; i++) {
      if (!b[i] || lab[i]) continue;
      n++; var k = { x0: W, y0: H, x1: 0, y1: 0, n: 0 };
      stack.push(i); lab[i] = n;
      while (stack.length) {
        var p = stack.pop(), x = p % W, y = (p - x) / W;
        k.n++;
        if (x < k.x0) k.x0 = x; if (x > k.x1) k.x1 = x; if (y < k.y0) k.y0 = y; if (y > k.y1) k.y1 = y;
        if (x > 0 && b[p - 1] && !lab[p - 1]) { lab[p - 1] = n; stack.push(p - 1); }
        if (x < W - 1 && b[p + 1] && !lab[p + 1]) { lab[p + 1] = n; stack.push(p + 1); }
        if (y > 0 && b[p - W] && !lab[p - W]) { lab[p - W] = n; stack.push(p - W); }
        if (y < H - 1 && b[p + W] && !lab[p + W]) { lab[p + W] = n; stack.push(p + W); }
      }
      if (k.n >= 12) out.push(k);
    }
    return out;
  }

  root.findPlates = findPlates;
})(window);
