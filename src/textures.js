/* Procedural canvas textures (no image assets). Each returns { map, bump } where useful. */
import * as THREE from "three";

let seed = 11;
export const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
export const rr = (a, b) => a + (b - a) * rnd();
export const pick = arr => arr[Math.floor(rnd() * arr.length)];

const cv = (w, h = w) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
function tex(c, { srgb = true, repeat = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}
function grain(g, s, n, alpha, dark = "40,30,10", light = "255,255,255", max = 2) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * s, y = rnd() * s, w = 1 + rnd() * max, h = 1 + rnd() * max;
    g.fillStyle = rnd() > 0.5 ? `rgba(${dark},${rr(0.2, 1) * alpha})` : `rgba(${light},${rr(0.2, 1) * alpha})`;
    g.fillRect(x, y, w, h);
  }
}
const pair = (cc, cb, o) => ({ map: tex(cc, o), bump: tex(cb, { ...o, srgb: false }) });

export function makeTextures(tier) {
  const hi = tier === "high";
  const S = hi ? 1024 : 512;
  const out = {};

  /* Plaster: warm off-white with fine grain and soft blotches. */
  {
    const c = cv(S), g = c.getContext("2d"), b = cv(S), gb = b.getContext("2d");
    g.fillStyle = "#f4efe3"; g.fillRect(0, 0, S, S);
    gb.fillStyle = "#808080"; gb.fillRect(0, 0, S, S);
    for (let i = 0; i < 40; i++) {
      const x = rnd() * S, y = rnd() * S, r = rr(30, 120);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(150,120,80,${rr(0.015, 0.04)})`); gr.addColorStop(1, "rgba(150,120,80,0)");
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    grain(g, S, S * 14, 0.07); grain(gb, S, S * 14, 0.5, "0,0,0", "255,255,255");
    Object.assign(out, { plaster: tex(c), plasterB: tex(b, { srgb: false }) });
  }

  /* Brick (1 m tile, running bond). */
  {
    const c = cv(S), g = c.getContext("2d"), b = cv(S), gb = b.getContext("2d");
    g.fillStyle = "#cfc6b4"; g.fillRect(0, 0, S, S); gb.fillStyle = "#303030"; gb.fillRect(0, 0, S, S);
    const rows = 13, bh = S / rows, bw = S / 4.6, cols = ["#a85a43", "#9c4f3b", "#b46a4e", "#8f4a38", "#b8765a", "#a05743"];
    for (let r = 0; r < rows; r++) for (let k = -1; k < 6; k++) {
      const x = k * bw + (r % 2 ? bw / 2 : 0), y = r * bh;
      g.fillStyle = pick(cols); g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      gb.fillStyle = `rgb(${170 + rnd() * 40},${170 + rnd() * 40},${170 + rnd() * 40})`; gb.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    }
    grain(g, S, S * 8, 0.12, "30,10,0"); grain(gb, S, S * 8, 0.4, "0,0,0");
    Object.assign(out, { brick: tex(c), brickB: tex(b, { srgb: false }) });
  }

  /* Stone, irregular courses (1.4 m tile). */
  {
    const c = cv(S), g = c.getContext("2d"), b = cv(S), gb = b.getContext("2d");
    g.fillStyle = "#8e8677"; g.fillRect(0, 0, S, S); gb.fillStyle = "#202020"; gb.fillRect(0, 0, S, S);
    const cols = ["#bdb4a3", "#b0a695", "#c8bfae", "#a9a08f", "#c2b9a6"];
    let y = 0;
    while (y < S) {
      const h = rr(S / 9, S / 6); let x = -rnd() * 60;
      while (x < S) {
        const w = rr(S / 6, S / 3.2);
        g.fillStyle = pick(cols); g.beginPath(); g.roundRect(x + 3, y + 3, w - 6, h - 6, 10); g.fill();
        gb.fillStyle = `rgb(${150 + rnd() * 70},${150 + rnd() * 70},${150 + rnd() * 70})`; gb.beginPath(); gb.roundRect(x + 3, y + 3, w - 6, h - 6, 10); gb.fill();
        x += w;
      }
      y += h;
    }
    grain(g, S, S * 10, 0.1); grain(gb, S, S * 10, 0.4, "0,0,0");
    Object.assign(out, { stone: tex(c), stoneB: tex(b, { srgb: false }) });
  }

  /* Roof shingles (1.2 m tile). */
  {
    const c = cv(S), g = c.getContext("2d"), b = cv(S), gb = b.getContext("2d");
    g.fillStyle = "#10261f"; g.fillRect(0, 0, S, S); gb.fillStyle = "#101010"; gb.fillRect(0, 0, S, S);
    const rows = 10, th = S / rows, tw = S / 8, cols = ["#1d4a3c", "#22554a", "#18392f", "#2a5d4d", "#1f4d40"];
    for (let r = rows; r >= -1; r--) for (let k = -1; k < 9; k++) {
      const x = k * tw + (r % 2 ? tw / 2 : 0), y = r * th;
      g.fillStyle = pick(cols); g.beginPath(); g.roundRect(x + 1.5, y, tw - 3, th * 1.35, [0, 0, 14, 14]); g.fill();
      g.fillStyle = "rgba(255,255,255,.05)"; g.fillRect(x + 3, y + 2, tw - 6, 3);
      gb.fillStyle = `rgb(${150 + rnd() * 60},${150 + rnd() * 60},${150 + rnd() * 60})`; gb.beginPath(); gb.roundRect(x + 1.5, y, tw - 3, th * 1.35, [0, 0, 14, 14]); gb.fill();
    }
    grain(g, S, S * 5, 0.1, "0,0,0");
    Object.assign(out, { roof: tex(c), roofB: tex(b, { srgb: false }) });
  }

  /* Oak floor planks (2.2 m tile). */
  {
    const c = cv(S), g = c.getContext("2d"), b = cv(S), gb = b.getContext("2d");
    const rows = 9, ph = S / rows, cols = ["#dccdb0", "#d3c19f", "#e2d4ba", "#cdb994", "#d9c8a8"];
    gb.fillStyle = "#909090"; gb.fillRect(0, 0, S, S);
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * S * 0.4;
      while (x < S) {
        const w = rr(S * 0.35, S * 0.7);
        g.fillStyle = pick(cols); g.fillRect(x, r * ph, w, ph);
        for (let k = 0; k < 14; k++) {
          const yy = r * ph + rnd() * ph;
          g.strokeStyle = `rgba(110,80,40,${rr(0.05, 0.16)})`; g.lineWidth = rr(0.5, 1.6);
          g.beginPath(); g.moveTo(x, yy); g.bezierCurveTo(x + w * 0.3, yy + rr(-3, 3), x + w * 0.6, yy + rr(-3, 3), x + w, yy + rr(-2, 2)); g.stroke();
        }
        gb.fillStyle = "#2a2a2a"; gb.fillRect(x, r * ph, 2, ph);
        x += w;
      }
      gb.fillStyle = "#2a2a2a"; gb.fillRect(0, r * ph, S, 2);
      g.fillStyle = "rgba(60,40,15,.45)"; g.fillRect(0, r * ph, S, 1.5);
    }
    Object.assign(out, { wood: tex(c), woodB: tex(b, { srgb: false }) });
  }

  /* Fabric weave (greyscale, tinted by material colour). */
  {
    const s = hi ? 256 : 128, c = cv(s), g = c.getContext("2d");
    g.fillStyle = "#e8e8e8"; g.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 2) { g.fillStyle = "rgba(0,0,0,.09)"; g.fillRect(i, 0, 1, s); g.fillRect(0, i, s, 1); }
    grain(g, s, s * 30, 0.1, "0,0,0", "255,255,255", 1);
    out.fabric = tex(c);
  }

  /* Hedge / foliage. */
  {
    const c = cv(S / 2), g = c.getContext("2d"), s = S / 2;
    g.fillStyle = "#3a6a45"; g.fillRect(0, 0, s, s);
    const cols = ["#2f5a3b", "#467a50", "#3a6a45", "#56895a", "#274d33", "#6d9a5e"];
    for (let i = 0; i < 1400; i++) { g.fillStyle = pick(cols); g.beginPath(); g.arc(rnd() * s, rnd() * s, rr(3, 11), 0, 7); g.fill(); }
    out.leaf = tex(c);
  }

  /* Lawn with mowing stripes. Maps once over the plot. */
  {
    const w = hi ? 1024 : 512, c = cv(w), g = c.getContext("2d");
    g.fillStyle = "#b9c996"; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? "rgba(255,255,255,.07)" : "rgba(40,80,30,.07)"; g.fillRect(0, (i * w) / 12, w, w / 12); }
    grain(g, w, w * 30, 0.12, "40,80,30", "230,240,180", 2);
    out.lawn = tex(c, { repeat: false });
  }

  /* Dirt path / road. */
  {
    const c = cv(S / 2), g = c.getContext("2d"), s = S / 2;
    g.fillStyle = "#cdbf9e"; g.fillRect(0, 0, s, s);
    grain(g, s, s * 30, 0.2, "100,80,50", "245,235,210", 3);
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(${150 + rnd() * 60},${140 + rnd() * 50},${110 + rnd() * 40},.8)`; g.beginPath(); g.ellipse(rnd() * s, rnd() * s, rr(1.5, 4), rr(1, 3), rnd() * 3, 0, 7); g.fill(); }
    out.dirt = tex(c);
  }

  /* Ground: farmland patchwork + topographic contours. */
  {
    const gs = hi ? 2048 : 1024, c = cv(gs), g = c.getContext("2d");
    g.fillStyle = "#dcd8c4"; g.fillRect(0, 0, gs, gs);
    const fcols = ["#cdd5b0", "#d9d2a6", "#c6cfa5", "#bfc79c", "#e0d9b4", "#d2cc9a", "#c9d3ae"];
    for (let i = 0; i < 160; i++) {
      g.save(); g.translate(rnd() * gs, rnd() * gs); g.rotate(rr(-0.5, 0.5));
      g.fillStyle = pick(fcols); g.fillRect(0, 0, rr(60, 260) * (gs / 1024), rr(40, 200) * (gs / 1024));
      g.restore();
    }
    g.lineWidth = Math.max(1.5, gs / 1024 * 2);
    for (let i = 1; i <= 60; i++) {
      const r = (i / 60) * (gs / 2) * 0.99;
      g.beginPath();
      for (let k = 0; k <= 180; k++) {
        const a = (k / 180) * Math.PI * 2;
        const w = 1 + 0.045 * Math.sin(3 * a + i * 0.5) + 0.03 * Math.sin(5 * a + i * 0.9) + 0.02 * Math.cos(7 * a + i);
        const x = gs / 2 + Math.cos(a) * r * w, y = gs / 2 + Math.sin(a) * r * w * 0.94;
        k ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath(); g.strokeStyle = `rgba(23,61,50,${i % 5 === 0 ? 0.3 : 0.12})`; g.stroke();
    }
    grain(g, gs, gs * 20, 0.05, "60,80,40", "255,255,230", 3);
    out.ground = tex(c, { repeat: false, aniso: 8 });
  }

  /* Soft radial sprite (shadows, glows, clouds, dust). */
  const radial = (rgb, a0, a1 = 0, stops = null) => {
    const c = cv(128), g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, `rgba(${rgb},${a0})`);
    if (stops) stops.forEach(([p, a]) => gr.addColorStop(p, `rgba(${rgb},${a})`));
    gr.addColorStop(1, `rgba(${rgb},${a1})`);
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return tex(c, { repeat: false });
  };
  out.blob = radial("20,15,5", 0.55, 0, [[0.5, 0.3]]);
  out.glow = radial("255,235,190", 1, 0, [[0.2, 0.5]]);
  out.cloud = radial("255,255,255", 0.7, 0, [[0.5, 0.35]]);
  out.dust = radial("255,244,210", 1, 0, [[0.3, 0.5]]);

  /* Light shaft: bright at the window end, fading away, soft sides. */
  {
    const c = cv(128), g = c.getContext("2d");
    const v = g.createLinearGradient(0, 0, 0, 128); v.addColorStop(0, "rgba(255,255,255,.9)"); v.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = v; g.fillRect(0, 0, 128, 128);
    g.globalCompositeOperation = "destination-in";
    const h = g.createLinearGradient(0, 0, 128, 0); h.addColorStop(0, "rgba(0,0,0,0)"); h.addColorStop(0.25, "#000"); h.addColorStop(0.75, "#000"); h.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = h; g.fillRect(0, 0, 128, 128);
    out.shaft = tex(c, { repeat: false });
  }

  /* Posters: land-map art in the brand palette. */
  out.art = [0, 1, 2].map(n => {
    const c = cv(256, 320), g = c.getContext("2d");
    g.fillStyle = n === 1 ? "#173d32" : "#f1eadb"; g.fillRect(0, 0, 256, 320);
    g.strokeStyle = n === 1 ? "#d5b28d" : "#173d32"; g.lineWidth = 1.5;
    for (let i = 1; i < 16; i++) {
      g.beginPath();
      for (let k = 0; k <= 80; k++) {
        const a = (k / 80) * Math.PI * 2, r = i * 9 * (1 + 0.1 * Math.sin(3 * a + i * 0.4 + n) + 0.06 * Math.cos(5 * a + n * 2));
        const x = 128 + Math.cos(a) * r * 0.95, y = 170 + Math.sin(a) * r * 1.15;
        k ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath(); g.stroke();
    }
    g.fillStyle = "#a77b52"; g.beginPath(); g.arc(128 + (n - 1) * 40, 70, 22, 0, 7); g.fill();
    return tex(c, { repeat: false });
  });

  /* Rug pattern. */
  {
    const c = cv(512), g = c.getContext("2d");
    g.fillStyle = "#ece0c8"; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = "#173d32"; g.lineWidth = 14; g.strokeRect(24, 24, 464, 464);
    g.strokeStyle = "#a77b52"; g.lineWidth = 6; g.strokeRect(50, 50, 412, 412);
    g.strokeStyle = "rgba(23,61,50,.55)"; g.lineWidth = 3;
    for (let i = -6; i < 7; i++) { g.beginPath(); g.moveTo(256 + i * 36, 90); g.lineTo(256 + i * 36 + 120, 256); g.lineTo(256 + i * 36, 422); g.stroke(); }
    grain(g, 512, 8000, 0.15, "60,40,20", "255,255,255", 2);
    out.rug = tex(c, { repeat: false });
  }

  /* Agency sign and house number. */
  {
    const c = cv(1024), g = c.getContext("2d");
    g.fillStyle = "#173d32"; g.fillRect(0, 0, 1024, 1024);
    g.strokeStyle = "#a77b52"; g.lineWidth = 8; g.strokeRect(24, 24, 976, 976);
    g.fillStyle = "#f4efe3"; g.textAlign = "center";
    g.font = "italic 200px Georgia, serif"; g.fillText("Mahto", 512, 500);
    g.fillStyle = "#d5b28d"; g.font = "bold 62px Arial, sans-serif"; g.fillText("REAL ESTATE AGENCY", 512, 690);
    out.sign = tex(c, { repeat: false });
    const n = cv(128), h = n.getContext("2d");
    h.fillStyle = "#b58a5a"; h.fillRect(0, 0, 128, 128); h.fillStyle = "#2a1c0c"; h.font = "bold 72px Georgia, serif"; h.textAlign = "center"; h.fillText("12", 64, 88);
    out.number = tex(n, { repeat: false });
  }
  return out;
}
