/* Scroll-driven WebGL walkthrough: a plot on a contour-line plain, a detailed house, the rooms.
   Source for ../walk3d.js. Build: esbuild src/walk3d.src.js --bundle --minify --format=iife --outfile=walk3d.js
   Reliability: quality tiers + live frame-time downgrade; blank-render and context-loss detection;
   any failure removes .is-3d so the page falls back to the plain card stack. */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const section = document.querySelector(".walk");
const sticky = section && section.querySelector(".walk-sticky");
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function hasWebGL2() {
  try { return !!document.createElement("canvas").getContext("webgl2"); } catch (_) { return false; }
}
if (section && sticky && !reduce && hasWebGL2()) {
  try { init(); } catch (e) { console.warn("walk3d disabled:", e); document.documentElement.classList.remove("is-3d"); }
}

function init() {
  const html = document.documentElement;
  const clamp = (v, a = 0, b = 1) => Math.min(Math.max(v, a), b);
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const FOREST = 0x173d32, BRASS = 0xa77b52, HORIZON = 0xece5d3;

  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const rr = (a, b) => a + rnd() * (b - a);

  /* ---------- Quality tiers (2 high, 1 mid, 0 low) ---------- */
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4;
  let tier = (coarse || mem <= 3 || cores <= 4 || Math.min(screen.width, screen.height) < 700) ? 1 : 2;
  if (mem <= 2 || cores <= 2) tier = 0;
  const TIER = [
    { dpr: 1, shadow: 1024, trees: 36, tufts: 0, motes: 60 },
    { dpr: 1.5, shadow: 1024, trees: 60, tufts: 0, motes: 120 },
    { dpr: 2, shadow: 2048, trees: 90, tufts: 0, motes: 200 }
  ];

  const renderer = new THREE.WebGLRenderer({ antialias: tier > 0, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, TIER[tier].dpr));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.84;
  const canvas = renderer.domElement;
  canvas.className = "walk-canvas";
  canvas.setAttribute("aria-hidden", "true");
  sticky.prepend(canvas);
  html.classList.add("is-3d");

  let dead = false;
  function fallback(reason) {
    if (dead) return;
    dead = true;
    console.warn("walk3d fallback:", reason);
    html.classList.remove("is-3d");
    section.querySelectorAll(".walk-cap,.room-card,.walk-head").forEach(el => { el.style.opacity = ""; el.style.transform = ""; el.style.visibility = ""; });
    canvas.remove();
    try { renderer.dispose(); } catch (_) { /* ignore */ }
  }
  canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); fallback("context lost"); });

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd4e4ee, 70, 300);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.08, 1400);

  /* ---------- Procedural textures ---------- */
  const mk = (size, draw, { repeat = false, srgb = true, w = size, h = size } = {}) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = tier > 1 ? 8 : 2;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  const speckle = (g, w, h, n, cols, size = 2, alpha = 0.5) => {
    for (let i = 0; i < n; i++) { g.fillStyle = cols[(rnd() * cols.length) | 0]; g.globalAlpha = rr(0.1, alpha); g.fillRect(rnd() * w, rnd() * h, rr(1, size * 2), rr(1, size)); }
    g.globalAlpha = 1;
  };

  const tGround = mk(2048, (g, s) => {
    g.fillStyle = "#e4ddc9"; g.fillRect(0, 0, s, s);
    speckle(g, s, s, 9000, ["#cfc8b0", "#f0eadb", "#b9c19a"], 3, 0.25);
    for (let i = 1; i <= 52; i++) {
      const r = (i / 52) * (s / 2) * 0.99;
      g.beginPath();
      for (let k = 0; k <= 180; k++) {
        const a = (k / 180) * Math.PI * 2;
        const wob = 1 + 0.05 * Math.sin(3 * a + i * 0.5) + 0.03 * Math.sin(5 * a + i * 0.9) + 0.02 * Math.cos(7 * a + i);
        const x = s / 2 + Math.cos(a) * r * wob, y = s / 2 + Math.sin(a) * r * wob * 0.95;
        k ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath(); g.lineWidth = i % 5 === 0 ? 3 : 1.6; g.strokeStyle = `rgba(23,61,50,${i % 5 === 0 ? 0.32 : 0.15})`; g.stroke();
    }
  });
  const tGrass = mk(512, (g, s) => {
    g.fillStyle = "#c9d3a6"; g.fillRect(0, 0, s, s);
    speckle(g, s, s, 7000, ["#b4c488", "#d9e0b8", "#a3b878", "#c0cc96"], 2, 0.5);
  }, { repeat: true });
  tGrass.repeat.set(10, 9);
  const tSiding = mk(512, (g, s) => {
    g.fillStyle = "#f3eee2"; g.fillRect(0, 0, s, s);
    const n = 6, bh = s / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = `rgba(${200 + rnd() * 30},${190 + rnd() * 30},${165 + rnd() * 30},0.12)`; g.fillRect(0, i * bh, s, bh);
      g.fillStyle = "rgba(60,45,20,0.42)"; g.fillRect(0, i * bh + bh - 6, s, 6);
      g.fillStyle = "rgba(255,255,255,0.5)"; g.fillRect(0, i * bh, s, 3);
    }
    speckle(g, s, s, 1500, ["#d8cfb8", "#fff"], 2, 0.2);
  }, { repeat: true });
  const tShingle = mk(512, (g, s) => {
    g.fillStyle = "#26231f"; g.fillRect(0, 0, s, s);
    const rows = 10, rh = s / rows, cw = s / 8;
    for (let r = 0; r < rows; r++) for (let c = -1; c < 9; c++) {
      const x = c * cw + (r % 2 ? cw / 2 : 0), y = r * rh, l = 22 + rnd() * 14;
      g.fillStyle = `hsl(${24 + rnd() * 14},${5 + rnd() * 7}%,${l - 6}%)`;
      g.beginPath(); g.roundRect(x + 1.5, y + 1, cw - 3, rh + 6, [0, 0, 7, 7]); g.fill();
      g.fillStyle = "rgba(0,0,0,0.38)"; g.fillRect(x + 1.5, y + rh - 3, cw - 3, 4);
    }
  }, { repeat: true });
  const tWood = mk(1024, (g, s) => {
    const rows = 12, rh = s / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * 300;
      while (x < s) {
        const len = rr(340, 620), l = 74 + rnd() * 8;
        g.fillStyle = `hsl(${34 + rnd() * 6},${34 + rnd() * 10}%,${l}%)`; g.fillRect(x, r * rh, len, rh);
        g.strokeStyle = "rgba(90,60,30,0.12)"; g.lineWidth = 1;
        for (let k = 0; k < 9; k++) { const y = r * rh + rnd() * rh; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + len * 0.3, y + rr(-3, 3), x + len * 0.6, y + rr(-3, 3), x + len, y + rr(-2, 2)); g.stroke(); }
        g.fillStyle = "rgba(60,38,15,0.55)"; g.fillRect(x, r * rh, 2.5, rh);
        x += len;
      }
      g.fillStyle = "rgba(60,38,15,0.55)"; g.fillRect(0, r * rh, s, 2.5);
    }
  }, { repeat: true });
  const tRug = mk(512, (g, s) => {
    g.fillStyle = "#efe4cf"; g.fillRect(0, 0, s, s);
    g.strokeStyle = "#173d32"; g.lineWidth = 16; g.strokeRect(24, 24, s - 48, s - 48);
    g.strokeStyle = "#a77b52"; g.lineWidth = 5; g.strokeRect(56, 56, s - 112, s - 112);
    g.fillStyle = "#a77b52";
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      const cx = 120 + i * 68, cy = 120 + j * 68; g.globalAlpha = (i + j) % 2 ? 0.85 : 0.35;
      g.beginPath(); g.moveTo(cx, cy - 26); g.lineTo(cx + 26, cy); g.lineTo(cx, cy + 26); g.lineTo(cx - 26, cy); g.fill();
    }
    g.globalAlpha = 1; speckle(g, s, s, 4000, ["#d8c9ad", "#fff"], 2, 0.25);
  });
  const tMarble = mk(512, (g, s) => {
    g.fillStyle = "#f6f4ee"; g.fillRect(0, 0, s, s);
    g.strokeStyle = "rgba(120,125,130,0.28)";
    for (let i = 0; i < 14; i++) { g.lineWidth = rr(0.6, 2.2); g.beginPath(); let x = rnd() * s, y = 0; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += rr(-60, 60); y += s / 6; g.lineTo(x, y); } g.stroke(); }
  }, { repeat: true });
  const tSubway = mk(512, (g, s) => {
    g.fillStyle = "#cfcfc8"; g.fillRect(0, 0, s, s);
    const rows = 8, rh = s / rows, cw = s / 4;
    for (let r = 0; r < rows; r++) for (let c = -1; c < 5; c++) {
      g.fillStyle = `hsl(40,${10 + rnd() * 6}%,${93 + rnd() * 4}%)`; g.fillRect(c * cw + (r % 2 ? cw / 2 : 0) + 2, r * rh + 2, cw - 4, rh - 4);
    }
  }, { repeat: true });
  const tStone = mk(512, (g, s) => {
    g.fillStyle = "#8c8576"; g.fillRect(0, 0, s, s);
    const rows = 6, rh = s / rows;
    for (let r = 0; r < rows; r++) { let x = -rnd() * 80; while (x < s) { const w = rr(70, 150); g.fillStyle = `hsl(${30 + rnd() * 12},${8 + rnd() * 8}%,${48 + rnd() * 16}%)`; g.fillRect(x + 3, r * rh + 3, w - 6, rh - 6); x += w; } }
    speckle(g, s, s, 2500, ["#5d584c", "#c9c2b0"], 2, 0.3);
  }, { repeat: true });
  const tBrick = mk(512, (g, s) => {
    g.fillStyle = "#b9a98f"; g.fillRect(0, 0, s, s);
    const rows = 12, rh = s / rows, cw = s / 5;
    for (let r = 0; r < rows; r++) for (let c = -1; c < 6; c++) {
      g.fillStyle = `hsl(${12 + rnd() * 10},${38 + rnd() * 12}%,${40 + rnd() * 10}%)`; g.fillRect(c * cw + (r % 2 ? cw / 2 : 0) + 2, r * rh + 2, cw - 4, rh - 4);
    }
  }, { repeat: true });
  const tFabric = mk(256, (g, s) => {
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, s, s);
    g.strokeStyle = "rgba(0,0,0,0.1)"; g.lineWidth = 1;
    for (let i = 0; i < s; i += 3) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(s, i); g.stroke(); }
  }, { repeat: true, srgb: false });
  tFabric.repeat.set(3, 3);
  const art = (bg, c1, c2, sd) => mk(512, (g, s) => {
    g.fillStyle = bg; g.fillRect(0, 0, s, s); let q = sd;
    const r2 = () => { q = (q * 16807) % 2147483647; return q / 2147483647; };
    for (let i = 1; i <= 16; i++) {
      g.beginPath();
      for (let k = 0; k <= 90; k++) { const a = (k / 90) * Math.PI * 2, w = 1 + 0.12 * Math.sin(3 * a + i * 0.6 + sd) + 0.07 * Math.sin(5 * a + i); const x = s * 0.5 + Math.cos(a) * i * 15 * w, y = s * 0.55 + Math.sin(a) * i * 13 * w; k ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.closePath(); g.strokeStyle = i % 4 === 0 ? c2 : c1; g.lineWidth = i % 4 === 0 ? 5 : 2.2; g.stroke();
    }
    g.fillStyle = c2; g.beginPath(); g.arc(s * (0.7 + r2() * 0.1), s * 0.22, 26, 0, 7); g.fill();
  });
  const tArt = [art("#f1e9d8", "#173d32", "#a77b52", 3), art("#173d32", "#d5b28d", "#f1e9d8", 7), art("#e7ddc7", "#a77b52", "#173d32", 11)];
  const tTv = mk(512, (g, s) => {
    const gr = g.createLinearGradient(0, 0, s, s); gr.addColorStop(0, "#1b4d40"); gr.addColorStop(1, "#d5b28d"); g.fillStyle = gr; g.fillRect(0, 0, s, s);
    g.strokeStyle = "rgba(255,255,255,.25)"; g.lineWidth = 2;
    for (let i = 1; i < 18; i++) { g.beginPath(); for (let k = 0; k <= 60; k++) { const x = (k / 60) * s, y = s * 0.2 + i * 18 + Math.sin(k / 6 + i) * 18; k ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
  });
  const tSign = mk(1024, (g, s) => {
    g.fillStyle = "#173d32"; g.fillRect(0, 0, s, s); g.strokeStyle = "#a77b52"; g.lineWidth = 8; g.strokeRect(24, 24, s - 48, s - 48);
    g.fillStyle = "#f4efe3"; g.textAlign = "center"; g.font = "italic 190px Georgia, serif"; g.fillText("Mahto", s / 2, s * 0.5);
    g.fillStyle = "#d5b28d"; g.font = "bold 62px Arial, sans-serif"; g.fillText("REAL ESTATE AGENCY", s / 2, s * 0.68);
  });
  const radial = (inner, outer, size = 128) => mk(size, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, s, s); });
  const tBlob = radial("rgba(0,0,0,0.42)", "rgba(0,0,0,0)");
  const tGlow = radial("rgba(255,214,150,0.95)", "rgba(255,190,100,0)");
  const tMote = radial("rgba(255,244,214,0.9)", "rgba(255,244,214,0)", 64);
  const tCloud = mk(256, (g, s) => { g.clearRect(0, 0, s, s); for (let i = 0; i < 14; i++) { const x = s * (0.2 + rnd() * 0.6), y = s * (0.4 + rnd() * 0.2), r = s * (0.12 + rnd() * 0.16); const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, "rgba(255,255,255,0.55)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, s, s); } });
  const tShaft = mk(64, (g, s) => { const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, "rgba(255,236,190,0.0)"); gr.addColorStop(0.15, "rgba(255,236,190,0.8)"); gr.addColorStop(1, "rgba(255,236,190,0)"); g.fillStyle = gr; g.fillRect(0, 0, s, s); const gx = g.createLinearGradient(0, 0, s, 0); gx.addColorStop(0, "rgba(0,0,0,1)"); gx.addColorStop(0.25, "rgba(0,0,0,0)"); gx.addColorStop(0.75, "rgba(0,0,0,0)"); gx.addColorStop(1, "rgba(0,0,0,1)"); g.globalCompositeOperation = "destination-out"; g.fillStyle = gx; g.fillRect(0, 0, s, s); });
  const tTuft = mk(128, (g, s) => { g.clearRect(0, 0, s, s); for (let i = 0; i < 16; i++) { const x = rr(14, s - 14), h = rr(s * 0.45, s * 0.95); g.strokeStyle = `hsl(${78 + rnd() * 30},${30 + rnd() * 20}%,${38 + rnd() * 18}%)`; g.lineWidth = rr(2, 4); g.beginPath(); g.moveTo(x, s); g.quadraticCurveTo(x + rr(-14, 14), s - h * 0.5, x + rr(-22, 22), s - h); g.stroke(); } });

  /* ---------- Materials ---------- */
  const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });
  const rep = (t, x, y) => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(x, y); c.wrapS = c.wrapT = THREE.RepeatWrapping; return c; };
  const mWall = M(0xffffff, { map: rep(tSiding, 1, 1), bumpMap: rep(tSiding, 1, 1), bumpScale: 0.8 });
  const mIn = M(0xf3ede0, { roughness: 0.95 });
  const mTrim = M(0xf7f3ea, { roughness: 0.55 });
  const mForest = M(FOREST, { roughness: 0.55 });
  const mBrass = M(BRASS, { roughness: 0.35, metalness: 0.7 });
  const mWood = M(0xc9ad84, { roughness: 0.7 });
  const mDark = M(0x24262a, { roughness: 0.6 });
  const mWhite = M(0xf7f4ec, { roughness: 0.5 });
  const mGlass = new THREE.MeshStandardMaterial({ color: 0xdceaf0, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.2, envMapIntensity: 1.6, depthWrite: false });
  const mGlow = new THREE.MeshStandardMaterial({ color: 0xffe9bf, emissive: 0xffc46b, emissiveIntensity: 2.4 });
  const mFabricG = M(0x2f6150, { roughness: 1, bumpMap: tFabric, bumpScale: 0.4 });
  const mFabricC = M(0xe6dcc6, { roughness: 1, bumpMap: tFabric, bumpScale: 0.4 });
  const mFloor = M(0xffffff, { map: rep(tWood, 3.4, 2.6), roughness: 0.55, bumpMap: rep(tWood, 3.4, 2.6), bumpScale: 0.3 });
  const mRoof = M(0xffffff, { map: tShingle, bumpMap: tShingle, bumpScale: 1.6, roughness: 1, transparent: true, envMapIntensity: 0.25 });
  const mCeil = M(0xfaf6ec, { transparent: true, side: THREE.DoubleSide, roughness: 1 });
  const mStone = M(0xffffff, { map: rep(tStone, 3, 1), roughness: 1 });
  const mBlob = new THREE.MeshBasicMaterial({ map: tBlob, transparent: true, depthWrite: false });

  const add = (parent, geo, mat, x = 0, y = 0, z = 0, cast = true, receive = true) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = receive; parent.add(m); return m;
  };
  const rbox = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 6, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
  const cyl = (rt, rb, h, seg = 32) => new THREE.CylinderGeometry(rt, rb, h, seg);
  const blob = (parent, x, z, w, d, y = 0.012) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mBlob); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); parent.add(m); };

  /* ---------- Lights ---------- */
  const hemi = new THREE.HemisphereLight(0xfff4de, 0xb9c4a8, 0.55); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d6, 3.0);
  sun.position.set(30, 38, 46);
  sun.castShadow = true;
  sun.shadow.mapSize.set(TIER[tier].shadow, TIER[tier].shadow);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 8, far: 130 });
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const sunDir = sun.position.clone().normalize().negate();

  /* ---------- Sky + clouds ---------- */
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x4a86c8) }, hor: { value: new THREE.Color(0xd4e4ee) }, sunDir: { value: sun.position.clone().normalize() } },
    vertexShader: "varying vec3 v;void main(){v=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: "varying vec3 v;uniform vec3 top,hor,sunDir;void main(){float h=clamp(v.y,0.,1.);vec3 c=mix(hor,top,pow(h,.62));float s=max(dot(normalize(v),sunDir),0.);c+=vec3(1.,.9,.7)*(pow(s,600.)*2.+pow(s,8.)*.18);gl_FragColor=vec4(c,1.);}"
  }));
  scene.add(sky);
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tCloud, transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
    s.position.set(rr(-200, 200), rr(90, 140), rr(-220, 20)); s.scale.set(rr(70, 130), rr(30, 50), 1); scene.add(s); clouds.push(s);
  }

  /* ---------- Ground, plot, path ---------- */
  const ground = add(scene, new THREE.CircleGeometry(900, 96), M(0xffffff, { map: tGround, roughness: 1 }), 0, 0, 0, false);
  ground.rotation.x = -Math.PI / 2;
  { /* macro variation: soft light/dark patches break the texture repeat */
    const tm = mk(512, (g, sz) => { g.clearRect(0, 0, sz, sz); for (let i = 0; i < 120; i++) { const x = rnd() * sz, y = rnd() * sz, r = rr(30, 110), d = rnd() < 0.55; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, d ? "rgba(30,55,20,0.16)" : "rgba(210,205,120,0.2)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); } }, { repeat: true });
    tm.repeat.set(9, 9);
    const mac = add(scene, new THREE.CircleGeometry(900, 64), new THREE.MeshBasicMaterial({ map: tm, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }), 0, 0.006, 0, false, false); mac.rotation.x = -Math.PI / 2; }
  const lawn = add(scene, new THREE.PlaneGeometry(36, 32), M(0xffffff, { map: tGrass, roughness: 1 }), 0, 0.012, 0, false);
  lawn.rotation.x = -Math.PI / 2;
  const gravel = add(scene, new THREE.PlaneGeometry(2.4, 12), M(0xcfc6b0, { roughness: 1 }), 0, 0.016, 11.2, false);
  gravel.rotation.x = -Math.PI / 2;
  const pav = new THREE.InstancedMesh(rbox(1.4, 0.06, 0.8, 0.02), M(0xd9d2c0, { roughness: 0.9 }), 12), tmp = new THREE.Object3D();
  for (let i = 0; i < 12; i++) { tmp.position.set(rr(-0.06, 0.06), 0.04, 5.9 + i * 0.95); tmp.rotation.y = rr(-0.05, 0.05); tmp.updateMatrix(); pav.setMatrixAt(i, tmp.matrix); }
  pav.receiveShadow = true; scene.add(pav);
  const drive = add(scene, new THREE.PlaneGeometry(3.4, 12), M(0xc9c4b8, { roughness: 1 }), 9.8, 0.016, 10.4, false);
  drive.rotation.x = -Math.PI / 2;

  /* Fence around the plot, with a gate where the path enters. */
  const POST = new THREE.InstancedMesh(rbox(0.14, 1.15, 0.14, 0.02), mWood, 140);
  let pc = 0;
  const fenceSide = (x0, z0, x1, z1, skip) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 1.5), ang = -Math.atan2(z1 - z0, x1 - x0);
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = lerp(x0, x1, t), z = lerp(z0, z1, t);
      if (skip && skip(x, z)) continue;
      tmp.position.set(x, 0.575, z); tmp.rotation.set(0, 0, 0); tmp.updateMatrix(); POST.setMatrixAt(pc++, tmp.matrix);
    }
    const seg = (a, b) => {
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 0.1) return;
      [0.4, 0.85].forEach(y => { const r = add(scene, new THREE.BoxGeometry(l, 0.07, 0.05), mWood, (a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2); r.rotation.y = ang; });
    };
    if (skip) { const mid = (x0 + x1) / 2; seg([x0, z0], [mid - 1.2, z0]); seg([mid + 1.2, z0], [x1, z1]); } else seg([x0, z0], [x1, z1]);
  };
  fenceSide(-18, -16, 18, -16); fenceSide(-18, -16, -18, 16); fenceSide(18, -16, 18, 16);
  fenceSide(-18, 16, 18, 16, (x) => Math.abs(x) < 1.3);
  POST.count = pc; POST.castShadow = true; scene.add(POST);
  const gateL = new THREE.Group(), gateR = new THREE.Group();
  [[gateL, -1.2, 1], [gateR, 1.2, -1]].forEach(([g, x, s]) => {
    g.position.set(x, 0, 16); scene.add(g);
    add(g, new THREE.BoxGeometry(1.15, 0.07, 0.05), mWood, s * 0.6, 0.4, 0); add(g, new THREE.BoxGeometry(1.15, 0.07, 0.05), mWood, s * 0.6, 0.85, 0);
    for (let i = 0; i < 4; i++) add(g, new THREE.BoxGeometry(0.06, 0.95, 0.05), mWood, s * (0.1 + i * 0.35), 0.5, 0);
    g.userData.anim = true;
  });
  /* Mailbox, lamp posts. */
  const mail = new THREE.Group(); mail.position.set(2.2, 0, 16.6); scene.add(mail);
  add(mail, new THREE.BoxGeometry(0.1, 1.1, 0.1), mWood, 0, 0.55, 0); add(mail, rbox(0.32, 0.26, 0.5, 0.08), mForest, 0, 1.2, 0);
  add(mail, new THREE.BoxGeometry(0.04, 0.2, 0.06), mBrass, 0.2, 1.3, 0.05, false);
  [[-1.5, 13.5], [1.5, 10], [-1.5, 7]].forEach(([x, z]) => {
    const lp = new THREE.Group(); lp.position.set(x, 0, z); scene.add(lp);
    add(lp, cyl(0.04, 0.06, 1.2, 8), mDark, 0, 0.6); add(lp, rbox(0.22, 0.3, 0.22, 0.04), mGlow, 0, 1.35, 0, false);
    add(lp, new THREE.ConeGeometry(0.2, 0.14, 4), mDark, 0, 1.58, 0);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tGlow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.45 })); sp.position.set(0, 1.35, 0); sp.scale.setScalar(1.4); lp.add(sp);
  });
  /* Agency sign. */
  const sign = new THREE.Group(); sign.position.set(-4.4, 0, 17.2); sign.rotation.y = 0.2; scene.add(sign);
  add(sign, new THREE.BoxGeometry(0.14, 2.3, 0.14), mWood, -1.4, 1.15, 0); add(sign, new THREE.BoxGeometry(0.14, 2.3, 0.14), mWood, 1.4, 1.15, 0);
  const boardMats = [mForest, mForest, mForest, mForest, M(0xffffff, { map: tSign, roughness: 0.55 }), mForest];
  add(sign, new THREE.BoxGeometry(3.3, 1.75, 0.1), boardMats, 0, 1.65, 0);
  add(sign, new THREE.BoxGeometry(3.45, 0.08, 0.16), mBrass, 0, 2.56, 0, false);
  /* Surveyor's pegs at the plot corners. */
  [[-18, -16], [18, -16], [18, 16], [-18, 16]].forEach(([x, z]) => { add(scene, new THREE.BoxGeometry(0.2, 0.9, 0.2), mBrass, x, 0.45, z); add(scene, new THREE.BoxGeometry(0.22, 0.12, 0.22), M(0xffffff), x, 0.96, z, false); });

  /* ---------- House shell ---------- */
  const W = 12, D = 9, WH = 3.2, T = 0.26, DW = 1.5, DH = 2.3;
  const house = new THREE.Group(); scene.add(house);
  function wall(width, holes, mat, depth = T, zoff = -T / 2) {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0); shape.lineTo(width / 2, 0); shape.lineTo(width / 2, WH); shape.lineTo(-width / 2, WH); shape.closePath();
    holes.forEach(([cx, y0, w, h]) => { const p = new THREE.Path(); p.moveTo(cx - w / 2, y0); p.lineTo(cx + w / 2, y0); p.lineTo(cx + w / 2, y0 + h); p.lineTo(cx - w / 2, y0 + h); p.closePath(); shape.holes.push(p); });
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }); geo.translate(0, 0, zoff);
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m;
  }
  /* Outside faces get siding; interior gets plaster via a second, slightly inset shell. */
  function wallPair(width, holes) {
    const g = new THREE.Group();
    g.add(wall(width, holes, mWall));
    const inner = wall(width, holes, mIn, 0.03, -T / 2 - 0.03); inner.castShadow = false; g.add(inner);
    return g;
  }
  const F_WIN = [[-3.7, 0.9, 1.9, 1.4], [3.7, 0.9, 1.9, 1.4]];
  const front = wallPair(W, [[0, 0, DW, DH], ...F_WIN]); front.position.z = D / 2; house.add(front);
  const back = wallPair(W, [[0, 0.9, 3.4, 1.4]]); back.position.z = -D / 2; back.rotation.y = Math.PI; house.add(back);
  [-1, 1].forEach(sx => { const s = wallPair(D, []); s.rotation.y = sx * Math.PI / 2; s.position.x = sx * W / 2; house.add(s); });

  /* Windows: frame, mullions, sill, glass; shutters and curtains on the front. */
  function windowAt(g, cx, y0, w, h, z, { shutters = false, curtains = false, flip = 1 } = {}) {
    const f = 0.08, d = T + 0.08;
    add(g, new THREE.PlaneGeometry(w, h), mGlass, cx, y0 + h / 2, z, false, false);
    [[0, h / 2, w + f * 2, f], [0, -h / 2, w + f * 2, f]].forEach(([, oy, ww, hh]) => add(g, new THREE.BoxGeometry(ww, hh, d), mTrim, cx, y0 + h / 2 + oy, z, true));
    [[-w / 2, 0], [w / 2, 0]].forEach(([ox]) => add(g, new THREE.BoxGeometry(f, h, d), mTrim, cx + ox, y0 + h / 2, z, true));
    add(g, new THREE.BoxGeometry(0.04, h, 0.05), mTrim, cx, y0 + h / 2, z, false); add(g, new THREE.BoxGeometry(w, 0.04, 0.05), mTrim, cx, y0 + h * 0.62, z, false);
    add(g, new THREE.BoxGeometry(w + 0.3, 0.07, d + 0.18), mTrim, cx, y0 - 0.04, z + 0.05 * flip, true);
    add(g, new THREE.BoxGeometry(w + 0.34, 0.1, d + 0.1), mTrim, cx, y0 + h + 0.1, z, true);
    if (shutters) [-1, 1].forEach(sd => {
      const sh = add(g, new THREE.BoxGeometry(0.5, h + 0.1, 0.06), mForest, cx + sd * (w / 2 + 0.38), y0 + h / 2, z + 0.1 * flip, true);
      for (let i = 0; i < 9; i++) add(sh, new THREE.BoxGeometry(0.42, 0.02, 0.05), mForest, 0, -h / 2 + 0.12 + i * (h / 9), 0.04 * flip, false);
    });
    if (curtains) [-1, 1].forEach(sd => add(g, new THREE.BoxGeometry(w * 0.34, h + 0.9, 0.07), mFabricC, cx + sd * (w * 0.42), y0 + h / 2 + 0.2, z - 0.2 * flip, false));
    if (curtains) add(g, cyl(0.02, 0.02, w + 0.6, 8), mBrass, cx, y0 + h + 0.58, z - 0.2 * flip, false).rotation.z = Math.PI / 2;
  }
  windowAt(house, -3.7, 0.9, 1.9, 1.4, D / 2, { shutters: true, curtains: true }); windowAt(house, 3.7, 0.9, 1.9, 1.4, D / 2, { shutters: true, curtains: true });
  windowAt(house, 0, 0.9, 3.4, 1.4, -D / 2, { curtains: true, flip: -1 });

  /* Foundation, porch, columns, railings, steps. */
  add(house, new THREE.BoxGeometry(W + 0.5, 0.5, D + 0.5), mStone, 0, -0.23, 0);
  add(house, new THREE.BoxGeometry(5.2, 0.2, 2.2), mWood, 0, 0.05, D / 2 + 1.2);
  [-2.4, 2.4].forEach(x => { add(house, cyl(0.1, 0.12, WH - 0.2, 12), mTrim, x, 1.6, D / 2 + 2.1); add(house, new THREE.BoxGeometry(0.34, 0.16, 0.34), mTrim, x, 0.28, D / 2 + 2.1); add(house, new THREE.BoxGeometry(0.3, 0.12, 0.3), mTrim, x, WH - 0.08, D / 2 + 2.1); });
  add(house, new THREE.BoxGeometry(5.4, 0.16, 0.22), mTrim, 0, WH + 0.02, D / 2 + 2.1);
  const porchRoof = add(house, new THREE.BoxGeometry(5.6, 0.12, 2.6), mRoof, 0, WH + 0.34, D / 2 + 1.25); porchRoof.rotation.x = 0.12;
  const bal = new THREE.InstancedMesh(new THREE.BoxGeometry(0.04, 0.6, 0.04), mTrim, 30); let bc = 0;
  [[-1.8, -0.5, 0.95], [0.5, 1.8, 0.95]].forEach(([a, b]) => { for (let x = a; x <= b; x += 0.18) { tmp.position.set(x, 0.65, D / 2 + 2.1); tmp.rotation.set(0, 0, 0); tmp.updateMatrix(); bal.setMatrixAt(bc++, tmp.matrix); } add(house, new THREE.BoxGeometry(b - a + 0.1, 0.06, 0.08), mTrim, (a + b) / 2, 0.98, D / 2 + 2.1, false); add(house, new THREE.BoxGeometry(b - a + 0.1, 0.05, 0.06), mTrim, (a + b) / 2, 0.38, D / 2 + 2.1, false); });
  bal.count = bc; house.add(bal);
  for (let i = 0; i < 3; i++) add(house, new THREE.BoxGeometry(2.4 - i * 0.1, 0.17, 0.4), M(0xd8d2c2), 0, -0.02 - i * 0.17 + 0.09, D / 2 + 2.45 + i * 0.4);
  add(house, rbox(1.1, 0.03, 0.7, 0.01), M(0x6a5a45, { roughness: 1 }), 0, 0.17, D / 2 + 1.0, false).rotation.y = 0;

  /* Roof with shingles, fascia, ridge cap, gable vents, gutters, chimney. */
  const rise = 2.4, half = D / 2 + 0.8, slope = Math.hypot(half, rise), ang = Math.atan2(rise, half);
  const roofs = []; const UP = 3.3, roofG = new THREE.Group(); roofG.position.y = UP; house.add(roofG);
  [-1, 1].forEach(s => {
    const tex = rep(tShingle, (W + 1.4) / 1.2, slope / 1.2);
    const mat = mRoof.clone(); mat.map = tex; mat.needsUpdate = true; roofs.push(mat);
    const r = add(roofG, new THREE.BoxGeometry(W + 1.4, 0.2, slope), mat, 0, WH + rise / 2 + 0.05, s * half / 2, false); r.rotation.x = s * ang;
    const fas = add(roofG, new THREE.BoxGeometry(W + 1.45, 0.22, 0.08), mTrim, 0, WH - 0.06 + 0.02, s * (half - 0.02), false);
    const gut = add(roofG, cyl(0.05, 0.05, W + 1.4, 8), M(0xcfcac0, { roughness: 0.4, metalness: 0.5 }), 0, WH - 0.12, s * (half + 0.04), false); gut.rotation.z = Math.PI / 2;
  });
  add(roofG, new THREE.BoxGeometry(W + 1.5, 0.14, 0.4), roofs[0], 0, WH + rise + 0.06, 0, false);
  [-1, 1].forEach(s => {
    const gs = new THREE.Shape(); gs.moveTo(-D / 2, 0); gs.lineTo(D / 2, 0); gs.lineTo(0, rise - 0.05); gs.closePath();
    const gable = add(roofG, new THREE.ShapeGeometry(gs), M(0xffffff, { map: rep(tSiding, 1, 1), side: THREE.DoubleSide }), s * (W / 2 - 0.02), WH, 0);
    gable.rotation.y = s * Math.PI / 2;
    const vent = add(roofG, cyl(0.38, 0.38, 0.06, 20), mTrim, s * (W / 2 + 0.03), WH + 1.0, 0, false); vent.rotation.z = Math.PI / 2;
    const vin = add(roofG, cyl(0.28, 0.28, 0.07, 20), mDark, s * (W / 2 + 0.05), WH + 1.0, 0, false); vin.rotation.z = Math.PI / 2;
  });
  const mChim = M(0xffffff, { map: rep(tBrick, 1, 2) }); const chim = add(roofG, new THREE.BoxGeometry(0.95, 3.0, 0.95), mChim, 3.6, WH + 1.9, -1.4);
  add(roofG, new THREE.BoxGeometry(1.15, 0.14, 1.15), mStone, 3.6, WH + 3.42, -1.4, false);
  [-0.2, 0.2].forEach(o => add(roofG, cyl(0.12, 0.12, 0.34, 10), M(0x7a4a36), 3.6 + o, WH + 3.65, -1.4, false));
  /* ---------- Mansion: brick upper storey, two grand wings, two-storey portico ---------- */
  const brickFaces = [];
  const brickBox = (w, h, d, fade = false) => {
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    const mats = dims.map(([a, b], i) => {
      const top = i === 2, bot = i === 3;
      const m = M(top || bot ? 0x4a4540 : 0xb98a74, { roughness: 1, transparent: fade });
      if (fade) { m.opacity = 0.1; m.depthWrite = false; roofs.push(m); }
      if (!top && !bot) brickFaces.push({ m, a, b });
      return m;
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats); mesh.castShadow = !fade; mesh.receiveShadow = true; return mesh;
  };
  const upper = brickBox(W + T, UP, D + T, true); upper.position.set(0, WH + UP / 2, 0); house.add(upper);
  [-1.6, 1.6].forEach(() => {});
  [-4.5, -1.35, 1.35, 4.5].forEach(x => windowAt(house, x, WH + 0.55, 1.2, 1.9, D / 2 + 0.16, { shutters: true, curtains: false }));
  [-4, 0, 4].forEach(x => windowAt(house, x, WH + 0.55, 1.3, 1.9, -D / 2 - 0.16, { flip: -1 }));
  /* Grand portico: tall columns, balcony slab, balustrade, entablature and pediment. */
  const PZ = D / 2 + 2.1;
  [-2.4, 2.4].forEach(x => {
    add(house, cyl(0.27, 0.31, WH + UP - 0.4, 32), mTrim, x, (WH + UP) / 2, PZ);
    add(house, new THREE.BoxGeometry(0.8, 0.22, 0.8), mTrim, x, 0.3, PZ); add(house, new THREE.BoxGeometry(0.76, 0.2, 0.76), mTrim, x, WH + UP - 0.3, PZ);
  });
  add(house, new THREE.BoxGeometry(5.8, 0.16, 2.7), mTrim, 0, WH - 0.02, D / 2 + 1.35);
  add(house, new THREE.BoxGeometry(6.6, 0.5, 0.7), mTrim, 0, WH + UP + 0.0, PZ);
  { const ps = new THREE.Shape(); ps.moveTo(-3.5, 0); ps.lineTo(3.5, 0); ps.lineTo(0, 1.4); ps.closePath(); const pg = add(house, new THREE.ExtrudeGeometry(ps, { depth: 0.6, bevelEnabled: false }), mTrim, 0, WH + UP + 0.25, PZ - 0.3); pg.castShadow = true; }
  { const bl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.8, 0.05), mTrim, 60); let n = 0; for (let x = -2.7; x <= 2.71; x += 0.2) { tmp.position.set(x, WH + 0.5, PZ + 0.5); tmp.updateMatrix(); bl.setMatrixAt(n++, tmp.matrix); } for (let z = D / 2 + 0.3; z <= PZ + 0.5; z += 0.25) { [-2.7, 2.7].forEach(x => { tmp.position.set(x, WH + 0.5, z); tmp.updateMatrix(); bl.setMatrixAt(n++, tmp.matrix); }); } bl.count = n; house.add(bl); }
  add(house, new THREE.BoxGeometry(5.5, 0.07, 0.09), mTrim, 0, WH + 0.92, PZ + 0.5); [-2.7, 2.7].forEach(x => add(house, new THREE.BoxGeometry(0.09, 0.07, 2.2), mTrim, x, WH + 0.92, D / 2 + 1.4));
  /* Wings. */
  const WWD = 8, WDD = 8, WHH = 6.2, WZ = -1;
  [-1, 1].forEach(sx => {
    const wing = brickBox(WWD, WHH, WDD); wing.position.set(sx * (W / 2 + WWD / 2), WHH / 2, WZ); house.add(wing);
    add(house, new THREE.BoxGeometry(WWD + 0.5, 0.5, WDD + 0.5), mStone, sx * (W / 2 + WWD / 2), -0.23, WZ);
    add(house, new THREE.BoxGeometry(WWD + 0.3, 0.22, WDD + 0.3), mTrim, sx * (W / 2 + WWD / 2), WHH - 0.1, WZ);
    add(house, new THREE.BoxGeometry(WWD + 0.3, 0.14, WDD + 0.3), mTrim, sx * (W / 2 + WWD / 2), 3.15, WZ, false);
    const rm = mRoof.clone(); rm.transparent = false; rm.map = rep(tShingle, 6, 3); rm.needsUpdate = true;
    const cg = new THREE.ConeGeometry((WWD + 1.4) / Math.SQRT2, 3.4, 4); cg.rotateY(Math.PI / 4);
    add(house, cg, rm, sx * (W / 2 + WWD / 2), WHH + 1.7, WZ);
    const ch = add(house, new THREE.BoxGeometry(0.9, 3.2, 0.9), mChim, sx * (W / 2 + WWD - 1.2), WHH + 1.4, WZ - 2); ch.material = mChim;
    add(house, new THREE.BoxGeometry(1.1, 0.14, 1.1), mStone, sx * (W / 2 + WWD - 1.2), WHH + 3.05, WZ - 2, false);
    const fz = WZ + WDD / 2 + 0.16, cx0 = sx * (W / 2 + WWD / 2);
    [-2.1, 2.1].forEach(dx => { windowAt(house, cx0 + dx, 0.8, 1.4, 1.8, fz, { shutters: true, curtains: true }); windowAt(house, cx0 + dx, WH + 0.55, 1.4, 1.8, fz, { shutters: true }); });
    const g = new THREE.Group(); g.position.set(sx * (W / 2 + WWD) + sx * 0.16, 0, WZ); g.rotation.y = sx * Math.PI / 2; house.add(g);
    [-2, 2].forEach(c => { windowAt(g, c * sx, 0.8, 1.4, 1.8, 0, { flip: sx }); windowAt(g, c * sx, WH + 0.55, 1.4, 1.8, 0, { flip: sx }); });
  });
  /* Interior ceiling plane (fades with the roof for the dollhouse view). */
  const ceil = add(house, new THREE.PlaneGeometry(W - 0.2, D - 0.2), mCeil, 0, WH - 0.04, 0, false, false); ceil.rotation.x = Math.PI / 2;

  /* Floor, skirting, crown, beams, downlights. */
  const floor = add(house, new THREE.PlaneGeometry(W - 0.2, D - 0.2), mFloor, 0, 0.03, 0, false, true); floor.rotation.x = -Math.PI / 2;
  const iw = W / 2 - 0.14, id = D / 2 - 0.14;
  [[0, -id, W - 0.3, 0.04, 0], [-iw, 0, D - 0.3, 0.04, Math.PI / 2], [iw, 0, D - 0.3, 0.04, Math.PI / 2]].forEach(([x, z, l, , ry]) => {
    const s = add(house, new THREE.BoxGeometry(l, 0.16, 0.04), mTrim, x, 0.11, z, false); s.rotation.y = ry;
    const c = add(house, new THREE.BoxGeometry(l, 0.1, 0.07), mTrim, x, WH - 0.1, z, false); c.rotation.y = ry;
  });
  [[-3.3, 4.7], [3.3, 4.7]].forEach(([a, b]) => { add(house, new THREE.BoxGeometry(5.1, 0.16, 0.04), mTrim, -3.45, 0.11, id, false); add(house, new THREE.BoxGeometry(5.1, 0.16, 0.04), mTrim, 3.45, 0.11, id, false); });
  for (let i = 0; i < 5; i++) add(house, new THREE.BoxGeometry(0.2, 0.24, D - 0.3), M(0x9b7a55, { roughness: 0.8 }), -4.8 + i * 2.4, WH - 0.14, 0, false, false);
  const dl = new THREE.InstancedMesh(cyl(0.1, 0.1, 0.03, 16), mGlow, 12);
  for (let i = 0; i < 12; i++) { tmp.position.set(-4.5 + (i % 4) * 3, WH - 0.2, -3 + Math.floor(i / 4) * 3); tmp.rotation.set(0, 0, 0); tmp.updateMatrix(); dl.setMatrixAt(i, tmp.matrix); }
  house.add(dl);

  /* Front door: panels, glass lite, knocker, kickplate, number, lantern. */
  const doorPivot = new THREE.Group(); doorPivot.position.set(-DW / 2, 0, D / 2); house.add(doorPivot); doorPivot.userData.anim = true;
  add(doorPivot, new THREE.BoxGeometry(DW - 0.04, DH - 0.03, 0.09), mForest, DW / 2, DH / 2, 0);
  [[0.32, 0.75], [0.32, 1.65], [DW - 0.32, 0.75]].forEach(([x, y]) => add(doorPivot, new THREE.BoxGeometry(0.46, 0.7, 0.03), M(0x1f5342, { roughness: 0.5 }), x, y, 0.06, false));
  add(doorPivot, new THREE.BoxGeometry(0.46, 0.7, 0.03), mGlass, DW - 0.32, 1.65, 0.06, false, false);
  add(doorPivot, new THREE.SphereGeometry(0.055, 14, 14), mBrass, DW - 0.17, 1.05, 0.1, false);
  add(doorPivot, new THREE.TorusGeometry(0.07, 0.015, 8, 16), mBrass, DW / 2, 1.6, 0.07, false);
  add(doorPivot, new THREE.BoxGeometry(DW - 0.2, 0.22, 0.03), mBrass, DW / 2, 0.12, 0.06, false);
  [[-1, 0], [1, 0]].forEach(([s]) => add(house, new THREE.BoxGeometry(0.1, DH + 0.1, T + 0.1), mTrim, s * (DW / 2 + 0.05), DH / 2, D / 2, true));
  add(house, new THREE.BoxGeometry(DW + 0.34, 0.12, T + 0.1), mTrim, 0, DH + 0.06, D / 2, true);
  const lan = add(house, rbox(0.2, 0.34, 0.2, 0.04), mGlow, -1.35, 2.0, D / 2 + 0.2, false);
  const lanGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tGlow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 })); lanGlow.position.copy(lan.position); lanGlow.scale.setScalar(1.6); house.add(lanGlow);

  /* ---------- Interior ---------- */
  const lampLights = [];
  const lamp = (x, y, z, k = 18) => { const l = new THREE.PointLight(0xffd59a, k, 12, 2); l.position.set(x, y, z); l.userData.k = k; lampLights.push(l); house.add(l); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tGlow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 })); sp.position.set(x, y, z); sp.scale.setScalar(1.2); house.add(sp); };
  lamp(-3.4, 2.5, 0.6, 16); lamp(3.2, 2.5, -0.6, 16); lamp(3.6, 1.2, 3.3, 7);
  { const tvl = new THREE.PointLight(0x9fd0ff, 3, 5, 2); tvl.position.set(-3.5, 1.3, -3.4); tvl.userData.k = 3; lampLights.push(tvl); house.add(tvl); }

  const swaps = [];
  function chair(parent, x, z, ry) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g);
    add(g, rbox(0.46, 0.06, 0.46, 0.02), mWood, 0, 0.46); add(g, rbox(0.46, 0.5, 0.05, 0.02), mWood, 0, 0.74, -0.2);
    [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]].forEach(([a, b]) => add(g, cyl(0.02, 0.02, 0.45, 8), mDark, a, 0.22, b));
    blob(g, 0, 0, 0.8, 0.8);
  }
  function plant(parent, x, z, s = 1, pot = 0xe7dccb) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); parent.add(g);
    add(g, cyl(0.2, 0.15, 0.4, 16), M(pot, { roughness: 0.9 }), 0, 0.2); add(g, cyl(0.19, 0.19, 0.02, 16), M(0x3a2c20), 0, 0.4, 0, false);
    add(g, cyl(0.02, 0.03, 0.9, 6), M(0x5a4a30), 0, 0.85, 0);
    for (let i = 0; i < 12; i++) { const leaf = add(g, new THREE.SphereGeometry(0.2, 24, 16), M(new THREE.Color().setHSL(0.33 + rnd() * 0.05, 0.4, 0.22 + rnd() * 0.12), { roughness: 0.7 }), rr(-0.28, 0.28), 0.8 + rnd() * 0.7, rr(-0.28, 0.28)); leaf.scale.set(1, 0.18, 0.7); leaf.rotation.set(rr(-0.6, 0.6), rnd() * 6, rr(-0.5, 0.5)); }
    blob(g, 0, 0, 0.8, 0.8); swaps.push({ g, file: "DiffuseTransmissionPlant", h: 1.5 });
  }
  function framed(parent, x, y, z, ry, w, h, tex) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g);
    add(g, new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.05), mBrass, 0, 0, 0, false); add(g, new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), 0, 0, 0.03, false, false);
  }

  /* Living zone (left): L-shaped sofa, rug, coffee table, console + TV, bookshelf, armchair, lamp, plants. */
  const living = new THREE.Group(); house.add(living);
  const rug = add(living, new THREE.PlaneGeometry(4.0, 3.0), M(0xffffff, { map: tRug, roughness: 1 }), -3.5, 0.045, -0.2, false, true); rug.rotation.x = -Math.PI / 2;
  const sofa = new THREE.Group(); sofa.position.set(-3.5, 0, 1.15); sofa.rotation.y = Math.PI; living.add(sofa);
  add(sofa, rbox(2.7, 0.3, 1.05, 0.08), mFabricG, 0, 0.3); add(sofa, rbox(2.7, 0.7, 0.3, 0.1), mFabricG, 0, 0.62, -0.4);
  [-1.2, 1.2].forEach(x => add(sofa, rbox(0.3, 0.55, 1.05, 0.1), mFabricG, x, 0.5)); [-0.8, 0, 0.8].forEach(x => { add(sofa, rbox(0.8, 0.2, 0.82, 0.09), mFabricG, x, 0.56, 0.05); add(sofa, rbox(0.78, 0.5, 0.22, 0.09), mFabricG, x, 0.86, -0.22).rotation.x = -0.18; });
  [[-1.0, 0.25], [0.95, -0.2]].forEach(([x, r]) => { const p = add(sofa, rbox(0.42, 0.42, 0.14, 0.06), x < 0 ? mBrass : mFabricC, x, 0.85, 0.2); p.rotation.set(-0.2, r, 0.2); });
  [[-1.2, 0.4], [1.2, 0.4], [-1.2, -0.4], [1.2, -0.4]].forEach(([x, z]) => add(sofa, cyl(0.03, 0.025, 0.16, 8), mDark, x, 0.08, z));
  blob(sofa, 0, 0, 3.2, 1.6); swaps.push({ g: sofa, file: "GlamVelvetSofa", h: 0.95 });
  const ct = new THREE.Group(); ct.position.set(-3.5, 0, -0.55); living.add(ct);
  add(ct, rbox(1.3, 0.05, 0.7, 0.02), mWood, 0, 0.4); add(ct, rbox(1.1, 0.03, 0.5, 0.01), mWood, 0, 0.18);
  [[-0.58, -0.28], [0.58, -0.28], [-0.58, 0.28], [0.58, 0.28]].forEach(([x, z]) => add(ct, cyl(0.025, 0.02, 0.38, 8), mDark, x, 0.19, z));
  add(ct, rbox(0.34, 0.05, 0.26, 0.01), mForest, -0.25, 0.46, 0); add(ct, rbox(0.3, 0.04, 0.22, 0.01), mBrass, -0.25, 0.505, 0.01);
  add(ct, cyl(0.07, 0.09, 0.2, 14), mWhite, 0.3, 0.52, 0); for (let i = 0; i < 3; i++) { const b = add(ct, cyl(0.012, 0.012, 0.5, 5), M(0x5a6a3a), 0.3 + i * 0.03 - 0.03, 0.88, 0); b.rotation.z = (i - 1) * 0.3; add(ct, new THREE.SphereGeometry(0.05, 8, 8), M(0xd88a8a), 0.3 + (i - 1) * 0.15, 1.12, 0, false); }
  blob(ct, 0, 0, 1.8, 1.1);
  const cons = new THREE.Group(); cons.position.set(-3.5, 0, -4.1); living.add(cons);
  add(cons, rbox(2.2, 0.5, 0.45, 0.03), mWood, 0, 0.35); [-0.95, 0.95].forEach(x => add(cons, cyl(0.02, 0.02, 0.1, 8), mDark, x, 0.05));
  add(cons, rbox(1.7, 0.95, 0.06, 0.02), mDark, 0, 1.2, 0.0); add(cons, new THREE.PlaneGeometry(1.6, 0.86), new THREE.MeshStandardMaterial({ map: tTv, emissive: 0xffffff, emissiveMap: tTv, emissiveIntensity: 0.55, roughness: 0.3 }), 0, 1.2, 0.04, false, false);
  add(cons, cyl(0.02, 0.02, 0.4, 8), mDark, 0, 0.73); blob(cons, 0, 0.1, 2.4, 0.9);
  const shelf = new THREE.Group(); shelf.position.set(-5.65, 0, 0); shelf.rotation.y = Math.PI / 2; living.add(shelf);
  add(shelf, new THREE.BoxGeometry(0.04, 2.1, 0.32), mWood, -0.88, 1.05); add(shelf, new THREE.BoxGeometry(0.04, 2.1, 0.32), mWood, 0.88, 1.05); add(shelf, new THREE.BoxGeometry(1.8, 2.1, 0.03), M(0xb89f7a), 0, 1.05, -0.15);
  const books = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M(0xffffff, { roughness: 0.8 }), 90); let bk = 0;
  [0.04, 0.5, 0.95, 1.4, 1.85].forEach((y, i) => {
    add(shelf, new THREE.BoxGeometry(1.8, 0.035, 0.32), mWood, 0, y, 0, false);
    if (i === 4) return; let x = -0.82;
    while (x < 0.7 && bk < 88) { const w = rr(0.035, 0.09), h = rr(0.24, 0.38); tmp.position.set(x + w / 2, y + 0.02 + h / 2, 0); tmp.scale.set(w, h, 0.22); tmp.rotation.set(0, 0, rnd() < 0.06 ? 0.2 : 0); tmp.updateMatrix(); books.setMatrixAt(bk, tmp.matrix); books.setColorAt(bk++, new THREE.Color().setHSL(rnd() < 0.5 ? 0.38 + rnd() * 0.05 : 0.07 + rnd() * 0.04, 0.35, 0.2 + rnd() * 0.35)); x += w + 0.005; }
    tmp.scale.set(1, 1, 1); tmp.rotation.set(0, 0, 0);
  });
  books.count = bk; shelf.add(books); tmp.scale.set(1, 1, 1);
  const arm = new THREE.Group(); arm.position.set(-5.0, 0, -2.6); arm.rotation.y = Math.PI / 2 + 0.5; living.add(arm);
  add(arm, rbox(0.85, 0.3, 0.85, 0.09), mFabricC, 0, 0.3); add(arm, rbox(0.85, 0.6, 0.2, 0.09), mFabricC, 0, 0.62, -0.32); add(arm, rbox(0.2, 0.45, 0.85, 0.08), mFabricC, -0.33, 0.5); add(arm, rbox(0.2, 0.45, 0.85, 0.08), mFabricC, 0.33, 0.5); add(arm, rbox(0.55, 0.15, 0.6, 0.07), mFabricC, 0, 0.5, 0.05);
  [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]].forEach(([x, z]) => add(arm, cyl(0.025, 0.02, 0.15, 8), mWood, x, 0.07, z)); blob(arm, 0, 0, 1.4, 1.4);
  const fl = new THREE.Group(); fl.position.set(-5.3, 0, 3.3); living.add(fl);
  add(fl, cyl(0.17, 0.2, 0.03, 20), mBrass, 0, 0.015); add(fl, cyl(0.014, 0.014, 1.5, 8), mBrass, 0, 0.76); add(fl, new THREE.CylinderGeometry(0.2, 0.28, 0.32, 20, 1, true), M(0xf7e8c6, { side: THREE.DoubleSide, emissive: 0xffc46b, emissiveIntensity: 0.9 }), 0, 1.62, 0, false);
  plant(living, -5.3, 3.6, 1.35); plant(living, -2.0, -3.9, 0.9, 0xcfb89a);
  framed(living, -3.5, 2.05, -4.28, 0, 1.3, 0.9, tArt[0]); framed(living, -4.9, 2.05, -4.28, 0, 0.6, 0.8, tArt[2]);

  /* Kitchen + dining (right/back). */
  const kit = new THREE.Group(); house.add(kit);
  const counterZ = -D / 2 + 0.45;
  for (let i = 0; i < 6; i++) { const x = 2.1 + i * 0.62; add(kit, rbox(0.6, 0.86, 0.66, 0.02), mWhite, x, 0.46, counterZ); add(kit, new THREE.BoxGeometry(0.5, 0.74, 0.02), M(0xe9e4d6, { roughness: 0.6 }), x, 0.46, counterZ + 0.34, false); add(kit, cyl(0.012, 0.012, 0.16, 8), mBrass, x, 0.72, counterZ + 0.37, false).rotation.z = Math.PI / 2; }
  add(kit, new THREE.BoxGeometry(3.9, 0.05, 0.74), M(0xffffff, { map: tMarble, roughness: 0.25 }), 3.75, 0.93, counterZ + 0.03);
  add(kit, new THREE.PlaneGeometry(3.9, 0.7), M(0xffffff, { map: rep(tSubway, 3, 1), roughness: 0.3 }), 3.75, 1.3, -D / 2 + 0.15, false, false);
  for (let i = 0; i < 5; i++) { const x = 2.2 + i * 0.7; add(kit, rbox(0.66, 0.8, 0.36, 0.02), mWhite, x, 2.05, -D / 2 + 0.32); add(kit, cyl(0.012, 0.012, 0.18, 8), mBrass, x, 1.78, -D / 2 + 0.52, false); }
  add(kit, rbox(0.5, 0.06, 0.4, 0.02), mDark, 3.4, 0.97, counterZ + 0.03); const fau = add(kit, cyl(0.015, 0.015, 0.3, 8), mBrass, 3.4, 1.1, counterZ - 0.2, false); add(kit, new THREE.TorusGeometry(0.1, 0.015, 8, 14, Math.PI), mBrass, 3.4, 1.26, counterZ - 0.1, false).rotation.set(0, Math.PI / 2, 0);
  [[4.2, 0], [4.55, 0]].forEach(([x]) => add(kit, cyl(0.1, 0.1, 0.01, 18), mDark, x, 0.97, counterZ + 0.03, false)); add(kit, new THREE.BoxGeometry(0.8, 0.5, 0.45), M(0xb9b6ae, { roughness: 0.3, metalness: 0.7 }), 4.4, 1.9, -D / 2 + 0.42); add(kit, new THREE.BoxGeometry(0.28, 1.0, 0.28), M(0xb9b6ae, { roughness: 0.3, metalness: 0.7 }), 4.4, 2.65, -D / 2 + 0.3);
  const fr = add(kit, rbox(0.95, 1.95, 0.8, 0.03), M(0xc9c9c6, { roughness: 0.3, metalness: 0.7 }), 5.45, 0.98, -3.95); [-0.1, 0.1].forEach(o => add(kit, cyl(0.014, 0.014, 0.6, 8), mDark, 5.45 + o * 0 + (o < 0 ? -0.38 : -0.38), 1.35 + o * 1.5, -3.52 + 0, false));
  const isl = new THREE.Group(); isl.position.set(4.0, 0, -1.55); kit.add(isl);
  add(isl, rbox(2.3, 0.86, 0.95, 0.02), mWhite, 0, 0.46); add(isl, new THREE.BoxGeometry(2.5, 0.06, 1.15), M(0xffffff, { map: tMarble, roughness: 0.25 }), 0, 0.93, 0.05);
  [-0.7, 0, 0.7].forEach(x => add(isl, new THREE.BoxGeometry(0.58, 0.7, 0.02), M(0xe9e4d6), x, 0.46, 0.49, false));
  [-0.75, 0, 0.75].forEach(x => { add(isl, cyl(0.17, 0.17, 0.05, 18), mWood, x, 0.66, 0.95); add(isl, cyl(0.02, 0.02, 0.62, 8), mDark, x, 0.33, 0.95); add(isl, cyl(0.15, 0.15, 0.02, 18), mDark, x, 0.01, 0.95, false); });
  add(isl, new THREE.SphereGeometry(0.16, 14, 10), M(0xc9693b), -0.4, 1.08, 0.1, false); add(isl, new THREE.SphereGeometry(0.1, 12, 10), M(0x6f9b4f), -0.2, 1.05, 0.15, false); add(isl, cyl(0.2, 0.15, 0.08, 18), mWood, -0.3, 0.99, 0.12, false);
  [-0.75, 0, 0.75].forEach(x => { add(isl, cyl(0.004, 0.004, 1.1, 4), mDark, x, 2.45, 0.05, false); add(isl, new THREE.ConeGeometry(0.22, 0.26, 20, 1, true), M(0xf4ece0, { side: THREE.DoubleSide, emissive: 0xffc46b, emissiveIntensity: 0.55 }), x, 1.85, 0.05, false); add(isl, new THREE.SphereGeometry(0.06, 10, 10), mGlow, x, 1.8, 0.05, false); });
  blob(isl, 0, 0.5, 2.8, 2);
  const dine = new THREE.Group(); dine.position.set(0.7, 0, -1.7); kit.add(dine);
  add(dine, rbox(1.9, 0.06, 0.95, 0.025), mWood, 0, 0.76); [[-0.85, -0.38], [0.85, -0.38], [-0.85, 0.38], [0.85, 0.38]].forEach(([x, z]) => add(dine, cyl(0.04, 0.03, 0.74, 8), mDark, x, 0.37, z));
  [-0.5, 0.5].forEach(x => { add(dine, cyl(0.12, 0.1, 0.012, 20), mWhite, x, 0.8, 0.22, false); add(dine, cyl(0.12, 0.1, 0.012, 20), mWhite, x, 0.8, -0.22, false); });
  add(dine, cyl(0.07, 0.09, 0.22, 14), M(0x3b6b5a, { roughness: 0.2 }), 0, 0.92, 0);
  swaps.push({ g: dine, file: "GlassVaseFlowers", h: 0.55, add: [0, 0.78, 0], hide: false });
  chair(dine, -0.5, 0.75, Math.PI); chair(dine, 0.5, 0.75, Math.PI); chair(dine, -0.5, -0.75, 0); chair(dine, 0.5, -0.75, 0); blob(dine, 0, 0, 2.6, 1.8);
  plant(kit, 5.5, -2.6, 1.0, 0xcfb89a);

  /* Bedroom (right/front). */
  const bed = new THREE.Group(); bed.position.set(4.35, 0, 3.4); bed.rotation.y = -Math.PI / 2; house.add(bed);
  add(bed, rbox(1.7, 0.3, 2.3, 0.05), mWood, 0, 0.2); add(bed, rbox(1.62, 0.28, 2.2, 0.1), M(0xf2ede2, { roughness: 1, bumpMap: tFabric, bumpScale: 0.3 }), 0, 0.5);
  add(bed, rbox(1.66, 0.16, 1.5, 0.08), M(0xf6f2e8, { roughness: 1, bumpMap: tFabric, bumpScale: 0.4 }), 0, 0.68, 0.32); add(bed, rbox(1.68, 0.1, 0.5, 0.05), mFabricG, 0, 0.77, 0.7);
  add(bed, rbox(1.9, 1.15, 0.12, 0.05), mFabricG, 0, 0.85, -1.18); for (let i = 0; i < 3; i++) add(bed, rbox(0.55, 0.14, 0.38, 0.06), i === 1 ? mFabricC : M(0xf3eee4, { roughness: 1 }), -0.5 + i * 0.5, 0.74, -0.85).rotation.x = -0.25;
  blob(bed, 0, 0, 2.4, 2.9);
  const ns = new THREE.Group(); ns.position.set(5.5, 0, 2.28); house.add(ns);
  add(ns, rbox(0.45, 0.5, 0.45, 0.02), mWood, 0, 0.25); add(ns, cyl(0.1, 0.12, 0.04, 14), mBrass, 0, 0.52); add(ns, cyl(0.012, 0.012, 0.28, 8), mBrass, 0, 0.68); add(ns, new THREE.ConeGeometry(0.17, 0.2, 16, 1, true), M(0xf7e8c6, { side: THREE.DoubleSide, emissive: 0xffc46b, emissiveIntensity: 1.0 }), 0, 0.88, 0, false);
  const bedRug = add(house, new THREE.PlaneGeometry(2.2, 1.6), M(0xffffff, { map: tRug, roughness: 1 }), 2.6, 0.04, 3.4, false, true); bedRug.rotation.x = -Math.PI / 2; bedRug.rotation.z = Math.PI / 2;
  framed(house, 5.74, 2.0, 3.6, -Math.PI / 2, 1.0, 0.7, tArt[1]);
  plant(house, -1.3, 3.9, 1.1, 0xe7dccb);
  /* Accent wall, wainscoting, wardrobe, mirror, entry bench and mat. */
  add(house, new THREE.BoxGeometry(3.6, 2.5, 0.03), M(0x8c9187, { roughness: 0.95 }), -3.5, 1.3, -4.33, false);
  [[0, -4.33, 11.6, 0], [-5.83, 0, 8.6, Math.PI / 2], [5.83, 0, 8.6, Math.PI / 2], [-3.3, 4.33, 5.0, 0], [3.3, 4.33, 5.0, 0]].forEach(([x, z, l, ry]) => {
    add(house, new THREE.BoxGeometry(l, 0.85, 0.03), M(0xe9e1cd, { roughness: 0.8 }), x, 0.47, z, false).rotation.y = ry;
    add(house, new THREE.BoxGeometry(l, 0.05, 0.06), mTrim, x, 0.9, z, false).rotation.y = ry;
  });
  const ward = new THREE.Group(); ward.position.set(1.75, 0, 4.1); house.add(ward);
  add(ward, rbox(1.45, 2.15, 0.56, 0.03), mWood, 0, 1.08); add(ward, new THREE.BoxGeometry(0.012, 2.0, 0.02), mDark, 0, 1.08, -0.29, false);
  [-0.12, 0.12].forEach(x => add(ward, cyl(0.012, 0.012, 0.3, 8), mBrass, x, 1.08, -0.31, false)); blob(ward, 0, 0, 2.0, 1.2);
  const mir = add(house, cyl(0.46, 0.46, 0.04, 40), new THREE.MeshStandardMaterial({ color: 0xdfe6e8, metalness: 1, roughness: 0.04 }), -1.75, 1.6, 4.33, false, false); mir.rotation.x = Math.PI / 2;
  const mirF = add(house, new THREE.TorusGeometry(0.47, 0.025, 8, 40), mBrass, -1.75, 1.6, 4.33, false); mirF.rotation.y = 0;
  add(house, rbox(1.0, 0.07, 0.42, 0.02), mWood, -1.75, 0.45, 4.12); [-0.4, 0.4].forEach(x => add(house, new THREE.BoxGeometry(0.05, 0.42, 0.36), mWood, -1.75 + x, 0.22, 4.12));
  add(house, rbox(0.9, 0.025, 0.55, 0.01), M(0x6a5a45, { roughness: 1 }), 0, 0.05, 3.7, false, true);

  /* Sun shafts through the front windows + drifting dust. */
  const shaftMat = new THREE.MeshBasicMaterial({ map: tShaft, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const dirIn = sunDir.clone(), shaftPts = [];
  [-3.7, 3.7, 0].forEach((x, i) => {
    const wz = i === 2 ? -D / 2 : D / 2, wy = 1.6, len = wy / Math.abs(dirIn.y);
    const d = i === 2 ? new THREE.Vector3(dirIn.x, dirIn.y, -dirIn.z) : dirIn;
    if (i === 2) return;
    [0, Math.PI / 2].forEach(rotz => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, len), shaftMat); m.position.set(x + d.x * len / 2, wy + d.y * len / 2, wz + d.z * len / 2);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().negate()); m.rotateY(rotz); house.add(m); shaftPts.push(m.position.clone());
    });
  });
  const MN = TIER[tier].motes, motePos = new Float32Array(MN * 3), moteSeed = [];
  for (let i = 0; i < MN; i++) { motePos.set([rr(-5.5, 5.5), rr(0.3, 3), rr(-4, 4)], i * 3); moteSeed.push(rnd() * 6.28); }
  const motes = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(motePos, 3)), new THREE.PointsMaterial({ map: tMote, size: 0.07, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7, fog: false }));
  house.add(motes);

  /* ---------- Garden: hedges, flowers, tufts, bushes, car, trees ---------- */
  const hedgeG = new THREE.IcosahedronGeometry(0.5, 3), hedge = new THREE.InstancedMesh(hedgeG, M(0xffffff, { roughness: 0.9 }), 70); let hc = 0;
  const hedgeRun = (x0, x1, z) => { for (let x = x0; x <= x1; x += 0.42) { tmp.position.set(x, 0.45, z + rr(-0.08, 0.08)); tmp.scale.set(rr(0.85, 1.1), rr(0.9, 1.25), rr(0.8, 1.0)); tmp.rotation.set(rnd(), rnd(), rnd()); tmp.updateMatrix(); hedge.setMatrixAt(hc, tmp.matrix); hedge.setColorAt(hc++, new THREE.Color().setHSL(0.34 + rnd() * 0.04, 0.4, 0.18 + rnd() * 0.08)); } };
  hedgeRun(-5.7, -1.8, D / 2 + 0.75); hedgeRun(1.8, 5.7, D / 2 + 0.75);
  hedge.count = hc; hedge.castShadow = true; scene.add(hedge); tmp.scale.set(1, 1, 1);
  const flw = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 14, 10), M(0xffffff, { roughness: 0.6 }), 90); let fc = 0;
  const cols = [0xe9a6b4, 0xf5ecd7, 0xd9a05b, 0xb98cc7];
  [[-5.7, -1.8], [1.8, 5.7]].forEach(([a, b]) => { for (let x = a; x <= b; x += 0.2) { if (fc >= 90) break; tmp.position.set(x + rr(-0.05, 0.05), 0.18 + rnd() * 0.18, D / 2 + 1.4 + rr(-0.15, 0.15)); tmp.rotation.set(0, 0, 0); tmp.updateMatrix(); flw.setMatrixAt(fc, tmp.matrix); flw.setColorAt(fc++, new THREE.Color(cols[(rnd() * cols.length) | 0])); } });
  flw.count = fc; scene.add(flw);
  add(scene, rbox(4.0, 0.2, 0.7, 0.04), M(0x5b4632, { roughness: 1 }), -3.75, 0.1, D / 2 + 1.4, false); add(scene, rbox(4.0, 0.2, 0.7, 0.04), M(0x5b4632, { roughness: 1 }), 3.75, 0.1, D / 2 + 1.4, false);
  if (TIER[tier].tufts) {
    const tuft = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.7, 0.55), new THREE.MeshStandardMaterial({ map: tTuft, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 }), TIER[tier].tufts); let tc = 0;
    while (tc < TIER[tier].tufts) { const x = rr(-17, 17), z = rr(-15, 15); if (Math.abs(x) < 7 && z > -5.5) continue; if (Math.abs(x - 9.8) < 2 && z > 4) continue; tmp.position.set(x, 0.26, z); tmp.rotation.set(0, rnd() * 6.28, 0); tmp.scale.setScalar(rr(0.7, 1.4)); tmp.updateMatrix(); tuft.setMatrixAt(tc++, tmp.matrix); }
    scene.add(tuft); tmp.scale.set(1, 1, 1);
  }
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.3, 0), M(0x9a9486, { roughness: 1 }), 24);
  for (let i = 0; i < 24; i++) { tmp.position.set(rr(-16, 16), 0.08, rr(-14, 14)); if (Math.abs(tmp.position.x) < 7 && tmp.position.z > -5.5) tmp.position.x += 9; tmp.scale.set(rr(0.5, 1.4), rr(0.4, 0.8), rr(0.5, 1.2)); tmp.rotation.set(rnd(), rnd(), rnd()); tmp.updateMatrix(); rocks.setMatrixAt(i, tmp.matrix); }
  rocks.castShadow = true; scene.add(rocks); tmp.scale.set(1, 1, 1);

  const car = new THREE.Group(); car.position.set(9.8, 0, 11.5); car.rotation.y = 0.04; scene.add(car);
  const mCar = M(0x8a5a3a, { roughness: 0.3, metalness: 0.5 });
  add(car, rbox(1.85, 0.6, 4.2, 0.14), mCar, 0, 0.62); add(car, rbox(1.62, 0.55, 2.2, 0.16), mCar, 0, 1.12, -0.2);
  add(car, rbox(1.64, 0.4, 2.0, 0.12), new THREE.MeshStandardMaterial({ color: 0x1b2a30, roughness: 0.08, metalness: 0.4 }), 0, 1.14, -0.2, false);
  [[-0.95, 1.3], [0.95, 1.3], [-0.95, -1.3], [0.95, -1.3]].forEach(([x, z]) => { const w = add(car, cyl(0.36, 0.36, 0.26, 20), mDark, x, 0.36, z); w.rotation.z = Math.PI / 2; const h = add(car, cyl(0.2, 0.2, 0.28, 12), M(0xcfcfcf, { metalness: 0.9, roughness: 0.3 }), x, 0.36, z, false); h.rotation.z = Math.PI / 2; });
  [-0.6, 0.6].forEach(x => { add(car, rbox(0.34, 0.14, 0.06, 0.02), mGlow, x, 0.72, 2.12, false); add(car, rbox(0.34, 0.12, 0.06, 0.02), M(0x9a1b1b, { emissive: 0x500000 }), x, 0.72, -2.12, false); });
  blob(car, 0, 0, 2.6, 5.2);

  /* Pond with rim stones and lily pads. */
  const pond = add(scene, new THREE.CircleGeometry(3.2, 40), new THREE.MeshStandardMaterial({ color: 0x7fb3c4, roughness: 0.04, metalness: 0.6 }), -12.5, 0.03, 12, false, false); pond.rotation.x = -Math.PI / 2;
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; const st = add(scene, new THREE.DodecahedronGeometry(rr(0.22, 0.4), 0), M(0x9a9486, { roughness: 1 }), -12.5 + Math.cos(a) * 3.3, 0.12, 12 + Math.sin(a) * 3.3); st.rotation.set(rnd(), rnd(), rnd()); }
  for (let i = 0; i < 6; i++) { const lp = add(scene, cyl(0.28, 0.28, 0.01, 14), M(0x5f8a4f, { roughness: 0.7 }), -12.5 + rr(-1.8, 1.8), 0.05, 12 + rr(-1.8, 1.8), false, false); }
  /* Chimney smoke and birds. */
  const tSmoke = radial("rgba(238,238,236,0.6)", "rgba(238,238,236,0)");
  const smoke = []; for (let i = 0; i < 12; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tSmoke, transparent: true, depthWrite: false, opacity: 0.4 })); scene.add(sp); smoke.push(sp); }
  const birds = []; const wingMat = new THREE.MeshBasicMaterial({ color: 0x2a3a34, side: THREE.DoubleSide, fog: false });
  for (let i = 0; i < 7; i++) { const g = new THREE.Group(), wl = new THREE.Group(), wr = new THREE.Group(); [wl, wr].forEach((w, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.28), wingMat); m.position.x = (k ? 0.45 : -0.45); w.add(m); g.add(w); }); g.add(new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 6), wingMat)).rotation.x = Math.PI / 2; g.userData = { wl, wr, i }; g.scale.setScalar(1.4); scene.add(g); birds.push(g); }
  /* Trees: broadleaf (tapered trunk, branches, dark core, hundreds of alpha leaf cards) and layered conifers. */
  const NT = TIER[tier].trees, nB = Math.round(NT * 0.5), nC = NT - nB;
  const CARDS = tier === 2 ? 130 : tier === 1 ? 90 : 55;
  const tLeaf = mk(256, (g, sz) => {
    g.clearRect(0, 0, sz, sz);
    for (let i = 0; i < 22; i++) {
      const x = rr(30, sz - 30), y = rr(30, sz - 30), a = rnd() * 6.28, l = rr(22, 38), w = l * rr(0.38, 0.55);
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = `hsl(${88 + rnd() * 32},${38 + rnd() * 22}%,${22 + rnd() * 22}%)`;
      g.beginPath(); g.moveTo(-l, 0); g.quadraticCurveTo(0, -w * 1.7, l, 0); g.quadraticCurveTo(0, w * 1.7, -l, 0); g.fill();
      g.strokeStyle = "rgba(235,245,190,0.3)"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-l, 0); g.lineTo(l * 0.9, 0); g.stroke();
      g.restore();
    }
  });
  const treeBump = mk(256, (g, sz) => { g.fillStyle = "#888"; g.fillRect(0, 0, sz, sz); speckle(g, sz, sz, 5000, ["#444", "#ccc"], 3, 0.8); }, { repeat: true });
  const coreGeo = new THREE.IcosahedronGeometry(1, 4); { const pp = coreGeo.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < pp.count; i++) { v.fromBufferAttribute(pp, i); const n = 1 + 0.18 * Math.sin(v.x * 4.1 + v.y * 3.3) * Math.cos(v.z * 4.7) + 0.06 * Math.sin(v.y * 13 + v.z * 11); pp.setXYZ(i, v.x * n, v.y * n * 0.85, v.z * n); } coreGeo.computeVertexNormals(); }
  const trunkM = new THREE.InstancedMesh(cyl(0.12, 0.3, 3, 20), M(0x5b4632, { roughness: 1, bumpMap: treeBump, bumpScale: 3 }), nB + nC);
  const branchG = cyl(0.03, 0.1, 1, 8); branchG.translate(0, 0.5, 0);
  const branchM = new THREE.InstancedMesh(branchG, M(0x5b4632, { roughness: 1 }), nB * 5);
  const core = new THREE.InstancedMesh(coreGeo, M(0xffffff, { roughness: 1 }), nB * 3);
  const foliage = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshStandardMaterial({ map: tLeaf, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, envMapIntensity: 0.4 }), nB * CARDS);
  const coneA = new THREE.InstancedMesh(new THREE.ConeGeometry(1.5, 1.9, 28, 2), M(0xffffff, { roughness: 1, bumpMap: treeBump, bumpScale: 4 }), nC * 8);
  let ti = 0, fi = 0, ci = 0, bi = 0, ki = 0, tries = 0; const col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), q = new THREE.Quaternion();
  const okPos = (x, z) => !(Math.abs(x) < 21 && Math.abs(z) < 19) && !(Math.abs(x) < 8 && z > 8 && z < 60);
  while (ti < nB + nC && tries++ < 4000) {
    const a = rnd() * Math.PI * 2, r = 24 + Math.pow(rnd(), 0.7) * 150, x = Math.cos(a) * r, z = Math.sin(a) * r; if (!okPos(x, z)) continue;
    const s = rr(0.8, 1.7), broad = ti < nB;
    tmp.position.set(x, 1.5 * s, z); tmp.scale.setScalar(s); tmp.rotation.set(0, rnd() * 6, 0); tmp.updateMatrix(); trunkM.setMatrixAt(ti, tmp.matrix);
    if (broad) {
      const cy = 4.5 * s, hue = 0.24 + rnd() * 0.08;
      for (let k = 0; k < 5; k++) { const ba = (k / 5) * 6.28 + rnd(), len = rr(1.3, 2.0) * s; dir.set(Math.cos(ba) * 0.7, 0.8, Math.sin(ba) * 0.7).normalize(); q.setFromUnitVectors(up, dir); tmp.position.set(x, 2.6 * s + rnd() * 0.6 * s, z); tmp.quaternion.copy(q); tmp.scale.set(s, len, s); tmp.updateMatrix(); branchM.setMatrixAt(bi++, tmp.matrix); }
      tmp.quaternion.identity();
      for (let k = 0; k < 3; k++) { tmp.position.set(x + rr(-0.9, 0.9) * s, cy + rr(-0.5, 0.7) * s, z + rr(-0.9, 0.9) * s); tmp.scale.setScalar(rr(1.2, 1.7) * s); tmp.rotation.set(0, rnd() * 6, 0); tmp.updateMatrix(); core.setMatrixAt(ki, tmp.matrix); core.setColorAt(ki++, col.setHSL(hue, 0.4, 0.1 + rnd() * 0.05)); }
      for (let k = 0; k < CARDS; k++) {
        const u = rnd() * 6.283, v = Math.acos(2 * rnd() - 1), rad = Math.cbrt(rnd());
        tmp.position.set(x + Math.sin(v) * Math.cos(u) * 2.5 * rad * s, cy + Math.cos(v) * 1.9 * rad * s, z + Math.sin(v) * Math.sin(u) * 2.5 * rad * s);
        tmp.scale.setScalar(rr(0.85, 1.5) * s); tmp.rotation.set(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28); tmp.updateMatrix(); foliage.setMatrixAt(fi, tmp.matrix);
        foliage.setColorAt(fi++, col.setHSL(hue + rr(-0.03, 0.03), rr(0.35, 0.6), 0.5 + Math.cos(v) * 0.14 + rr(-0.08, 0.08)));
      }
    } else {
      const hue = 0.37 + rnd() * 0.05;
      for (let k = 0; k < 8; k++) { const f = k / 7; tmp.position.set(x, (1.9 + k * 1.05) * s, z); tmp.scale.set((1.25 - f * 0.95) * s, 0.95 * s, (1.25 - f * 0.95) * s); tmp.rotation.set(0, rnd() * 6, 0); tmp.updateMatrix(); coneA.setMatrixAt(ci, tmp.matrix); coneA.setColorAt(ci++, col.setHSL(hue, 0.3, 0.07 + f * 0.04 + rnd() * 0.03)); }
    }
    ti++;
  }
  trunkM.count = ti; foliage.count = fi; coneA.count = ci; branchM.count = bi; core.count = ki;
  [trunkM, branchM, core, coneA].forEach(m => { m.castShadow = true; }); foliage.castShadow = false; [trunkM, branchM, core, foliage, coneA].forEach(m => { m.frustumCulled = false; scene.add(m); }); tmp.scale.set(1, 1, 1); tmp.quaternion.identity();

  /* Grass: thousands of curved, tapered, wind-swayed blades. */
  const windU = { value: 0 };
  const NBL = [0, 4500, 12000][tier];
  if (NBL) {
    const sg = 4, vs = [], cs = [], ix = [];
    for (let i = 0; i <= sg; i++) { const t = i / sg, y = t * 0.5, w = 0.022 * (1 - t * 0.9), bz = t * t * 0.14, c = 0.4 + 0.6 * t; vs.push(-w, y, bz, w, y, bz); cs.push(c * 0.7, c, c * 0.55, c * 0.7, c, c * 0.55); }
    for (let i = 0; i < sg; i++) { const o = i * 2; ix.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
    const bg = new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.Float32BufferAttribute(vs, 3)); bg.setAttribute("color", new THREE.Float32BufferAttribute(cs, 3)); bg.setIndex(ix); bg.computeVertexNormals();
    const bm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide, envMapIntensity: 0.3 });
    bm.onBeforeCompile = sh => { sh.uniforms.uTime = windU; sh.vertexShader = "uniform float uTime;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n float hh = position.y; transformed.x += sin(uTime * 1.7 + instanceMatrix[3].x * 0.6 + instanceMatrix[3].z * 0.4) * 0.07 * hh * 2.0; transformed.z += cos(uTime * 1.3 + instanceMatrix[3].z * 0.5) * 0.04 * hh * 2.0;"); };
    const blades = new THREE.InstancedMesh(bg, bm, NBL); let n = 0, g = 0;
    while (n < NBL && g++ < NBL * 6) {
      const inLawn = rnd() < 0.8, x = inLawn ? rr(-17, 17) : rr(-26, 26), z = inLawn ? rr(-15, 15) : rr(-24, 24);
      if (Math.abs(x) < 14.8 && z > -5.4 && z < 5.4) continue; if (Math.abs(x) < 1.5 && z > 4) continue; if (x > 8.4 && x < 11.4 && z > 4) continue;
      if (Math.hypot(x + 12.5, z - 12) < 3.4) continue;
      tmp.position.set(x, 0, z); tmp.rotation.set(rr(-0.15, 0.15), rnd() * 6.28, rr(-0.15, 0.15)); tmp.scale.set(rr(0.8, 1.3), rr(0.3, 0.6), 1); tmp.updateMatrix(); blades.setMatrixAt(n, tmp.matrix);
      blades.setColorAt(n++, col.setHSL(rr(0.2, 0.27), rr(0.35, 0.55), rr(0.28, 0.5)));
    }
    blades.count = n; blades.frustumCulled = false; scene.add(blades); tmp.scale.set(1, 1, 1); tmp.rotation.set(0, 0, 0);
  }

  /* Freeze static transforms; ceiling/roof shouldn't block sun through windows. */
  scene.traverse(o => { if (o.isMesh || o.isGroup) { let anim = false, p = o; while (p) { if (p.userData && p.userData.anim) anim = true; p = p.parent; } if (!anim && !o.isSprite) { o.updateMatrix(); o.matrixAutoUpdate = false; } } });
  scene.updateMatrixWorld(true);
  [ceil].forEach(m => { m.castShadow = false; });
  roofs.forEach(() => {});
  house.traverse(o => { if (o.isMesh && o.material && (roofs.includes(o.material) || o.material === mRoof)) o.castShadow = false; });

  /* ---------- Photographic PBR textures + HDR lighting (async; procedural versions are the fallback) ---------- */
  const TL = new THREE.TextureLoader();
  const ld = (f, rx, ry, srgb = true) => TL.load("assets/tex/" + f, t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), tier > 0 ? 16 : 4); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; });
  const apply = (mat, o) => { Object.assign(mat, o); mat.needsUpdate = true; };
  try {
    new THREE.TextureLoader().load("assets/tex/brick.jpg", bt => {
      bt.colorSpace = THREE.SRGBColorSpace; bt.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), tier > 0 ? 16 : 4); bt.wrapS = bt.wrapT = THREE.RepeatWrapping;
      brickFaces.forEach(({ m, a, b }) => { const t = bt.clone(); t.needsUpdate = true; t.repeat.set(a / 1.7, b / 1.7); m.map = t; m.color.set(0xe8d6c8); m.needsUpdate = true; });
      const tw = bt.clone(); tw.needsUpdate = true; tw.repeat.set(1 / 1.7, 1 / 1.7); mWall.map = tw; mWall.bumpMap = null; mWall.color.set(0xe8d6c8); mWall.needsUpdate = true;
    });
    apply(mFloor, { color: new THREE.Color(0xc4b294), map: ld("wood.jpg", 9, 11), bumpMap: ld("wood_b.jpg", 9, 11, false), bumpScale: 0.6, roughnessMap: ld("wood_r.jpg", 9, 11, false), roughness: 1, envMapIntensity: 0.5 });
    apply(mChim, { map: ld("brick.jpg", 1.4, 3), bumpMap: ld("brick_b.jpg", 1.4, 3, false), bumpScale: 2 });
    apply(ground.material, { map: ld("grass.jpg", 420, 420), color: new THREE.Color(0xe6ebc2), roughness: 1 });
    apply(lawn.material, { map: ld("grass.jpg", 9, 8), color: new THREE.Color(0xffffee), roughness: 1 });
    new RGBELoader().load("assets/tex/sky.hdr", hdr => { hdr.mapping = THREE.EquirectangularReflectionMapping; scene.environment = pmrem.fromEquirectangular(hdr).texture; scene.environmentIntensity = 0.5; hdr.dispose(); });
  } catch (_) { /* keep procedural look */ }

  /* Real (photographed/authored) glTF furniture replaces the procedural stand-ins once loaded. */
  swaps.push({ g: living, file: "SpecularSilkPouf", h: 0.38, add: [-1.8, 0, 0.9], hide: false, tint: 0xe0c2b0 });
  if (tier >= 1) {
    const gl = new GLTFLoader(), cache = {};
    const place = (sw, src) => {
      const m = src.clone(true); const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
      const k = sw.h / Math.max(0.01, size.y); m.scale.setScalar(k); m.position.set(-ctr.x * k, -box.min.y * k, -ctr.z * k);
      const w = new THREE.Group(); w.add(m); if (sw.add) w.position.set(...sw.add);
      w.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (sw.tint) { o.material = o.material.clone(); o.material.color.set(sw.tint); } } });
      if (sw.hide !== false) sw.g.children.forEach(c => { c.visible = false; });
      sw.g.add(w);
    };
    [...new Set(swaps.map(x => x.file))].forEach(f => gl.load("assets/models/" + f + ".glb", gltf => { cache[f] = gltf.scene; swaps.filter(x => x.file === f).forEach(sw => { try { place(sw, gltf.scene); } catch (_) { /* keep stand-in */ } }); }, undefined, () => { /* keep stand-in */ }));
  }

  /* ---------- Post-processing (high tier): ambient occlusion + soft bloom ---------- */
  let composer = null, gtao = null, bloom = null;
  function makeComposer() {
    try {
      const w = sticky.clientWidth || 800, h = sticky.clientHeight || 500;
      composer = new EffectComposer(renderer); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
      composer.addPass(new RenderPass(scene, camera));
            bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.1, 0.5, 0.96); composer.addPass(bloom);
      composer.addPass(new OutputPass());
    } catch (e) { composer = null; }
  }
  if (tier === 2) makeComposer();

  /* ---------- Camera path ---------- */
  const keys = [
    [0.00, [8, 48, 46], [0, 0, 2]],
    [0.12, [36, 27, 42], [0, 1.5, 0]],
    [0.22, [22, 8, 32], [0, 2, 3]],
    [0.30, [4.5, 3.0, 27], [0, 1.6, 8]],
    [0.38, [0.5, 1.7, 14.5], [0, 1.6, 4]],
    [0.45, [0, 1.7, 7.6], [0, 1.6, 3]],
    [0.51, [0, 1.6, 4.5], [0, 1.5, 0]],
    [0.58, [0, 1.6, 2.4], [-3.2, 1.0, -0.8]],
    [0.68, [-1.4, 1.6, 1.4], [-4.8, 0.9, -2.8]],
    [0.76, [-0.2, 1.6, -0.2], [2.4, 1.0, -2.6]],
    [0.85, [1.8, 1.6, -0.2], [5.0, 1.0, -2.8]],
    [0.93, [2.0, 1.6, 1.8], [5.2, 0.8, 3.4]],
    [1.00, [0.4, 1.7, 1.0], [-3.7, 1.7, 4.5]]
  ];
  const posCurve = new THREE.CatmullRomCurve3(keys.map(k => new THREE.Vector3(...k[1])), false, "centripetal");
  const tgtCurve = new THREE.CatmullRomCurve3(keys.map(k => new THREE.Vector3(...k[2])), false, "centripetal");
  const toU = p => { for (let i = 0; i < keys.length - 1; i++) if (p <= keys[i + 1][0]) return (i + (p - keys[i][0]) / (keys[i + 1][0] - keys[i][0])) / (keys.length - 1); return 1; };

  /* ---------- Overlay ---------- */
  const caps = Array.from(section.querySelectorAll(".walk-cap"));
  const steps = Array.from(section.querySelectorAll(".walk-steps li"));
  const cards = Array.from(section.querySelectorAll(".room-card"));
  const head = section.querySelector(".walk-head");
  const cardRanges = [[0.56, 0.69], [0.69, 0.80], [0.80, 0.90], [0.90, 1.01]];

  let vw = 0, vh = 0, baseFov = 50, mx = 0, my = 0, tx = 0, ty = 0;
  window.addEventListener("pointermove", e => { if (e.pointerType === "touch") return; tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; }, { passive: true });
  const hint = document.createElement("div"); hint.className = "walk-hint"; hint.setAttribute("aria-hidden", "true"); hint.innerHTML = "<span>Scroll to enter</span><i></i>"; sticky.appendChild(hint);
  function resize(force) {
    const w = sticky.clientWidth, h = sticky.clientHeight;
    if (!w || !h) return;
    if (!force && w === vw && Math.abs(h - vh) < 140) return;
    vw = w; vh = h;
    renderer.setSize(w, h, false); if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
    const asp = w / h;
    camera.aspect = asp; baseFov = asp >= 1.6 ? 50 : Math.min(82, 50 + (1.6 - asp) * 32); camera.fov = baseFov; camera.updateProjectionMatrix();
  }
  new ResizeObserver(() => resize(false)).observe(sticky);
  window.addEventListener("orientationchange", () => setTimeout(() => resize(true), 250));
  resize(true);

  const progressNow = () => { const r = section.getBoundingClientRect(); return clamp(-r.top / Math.max(1, section.offsetHeight - window.innerHeight)); };
  let visible = true;
  new IntersectionObserver(e => { visible = e[0].isIntersecting; }, { rootMargin: "120px" }).observe(section);

  /* Frame-time governor: if the device can't keep up, step quality down, then give up. */
  let slow = 0, frames = 0, ema = 16, healthDone = false;
  function downgrade() {
    if (tier === 0) { fallback("too slow"); return; }
    tier--; slow = 0; if (composer && tier < 2) { composer = null; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, TIER[tier].dpr)); resize(true);
    if (tier === 0) { sun.castShadow = false; renderer.shadowMap.enabled = false; scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); }); }
  }
  function checkBlank() {
    const gl = renderer.getContext(), W2 = gl.drawingBufferWidth, H2 = gl.drawingBufferHeight, px = new Uint8Array(4), seen = new Set();
    for (let i = 1; i < 6; i++) for (let j = 1; j < 6; j++) { gl.readPixels((W2 * i / 6) | 0, (H2 * j / 6) | 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); seen.add(px[0] + "," + px[1] + "," + px[2]); }
    return seen.size < 3;
  }

  const C_T0 = new THREE.Color(0x4a86c8), C_T1 = new THREE.Color(0x5a79b0), C_H0 = new THREE.Color(0xd4e4ee), C_H1 = new THREE.Color(0xf1c796), C_S0 = new THREE.Color(0xfff0d6), C_S1 = new THREE.Color(0xffc589);
  const F0 = new THREE.Color(0x9fae9c), F1 = new THREE.Color(0xb8a68c);
  const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3();
  let current = progressNow(), last = performance.now();
  function frame(now) {
    if (dead) return;
    requestAnimationFrame(frame);
    if (!visible) { last = now; return; }
    try {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      current += (progressNow() - current) * (1 - Math.exp(-dt * 6));
      const p = current, u = toU(p);
      posCurve.getPoint(u, camPos); tgtCurve.getPoint(u, camTgt);
      const sway = smooth(0.48, 0.56, p) * 0.016;
      camPos.y += Math.sin(now / 900) * sway; camPos.x += Math.cos(now / 1300) * sway;
      mx += (tx - mx) * (1 - Math.exp(-dt * 3)); my += (ty - my) * (1 - Math.exp(-dt * 3));
      const pk = lerp(5, 0.35, smooth(0.3, 0.5, p));
      camTgt.x += mx * pk; camTgt.y -= my * pk * 0.6;
      camera.position.copy(camPos); camera.lookAt(camTgt);
      const kick = Math.sin(Math.PI * smooth(0.36, 0.5, p)) * 9;
      const fv = baseFov + kick; if (Math.abs(camera.fov - fv) > 0.02) { camera.fov = fv; camera.updateProjectionMatrix(); }

      doorPivot.rotation.y = smooth(0.38, 0.46, p) * 1.85;
      gateL.rotation.y = -smooth(0.24, 0.31, p) * 1.6; gateR.rotation.y = smooth(0.24, 0.31, p) * 1.6;
      const solid = 0.1 + 0.9 * smooth(0.1, 0.26, p);
      roofs.forEach(m => { m.opacity = solid; m.depthWrite = solid > 0.98; }); mRoof.opacity = solid; mCeil.opacity = solid;
      const inside = smooth(0.46, 0.52, p);
      scene.fog.near = lerp(60, 40, inside); scene.fog.far = lerp(260, 90, inside);
      clouds.forEach((c, i) => { c.position.x += dt * (1.2 + i * 0.15); if (c.position.x > 230) c.position.x = -230; });
      const mp = motes.geometry.attributes.position; for (let i = 0; i < MN; i++) { mp.setY(i, mp.getY(i) + Math.sin(now / 2000 + moteSeed[i]) * 0.0008); mp.setX(i, mp.getX(i) + Math.cos(now / 2600 + moteSeed[i]) * 0.0006); } mp.needsUpdate = true;
      let nd = 99; shaftPts.forEach(v => { nd = Math.min(nd, camera.position.distanceTo(v)); }); shaftMat.opacity = 0.07 * smooth(1.6, 4.5, nd);
      const gold = smooth(0.0, 1.0, p), night = smooth(0.44, 0.7, p);
      renderer.toneMappingExposure = lerp(0.84, 0.94, night); hint.style.opacity = (1 - smooth(0.0, 0.05, p)).toFixed(3);
      sky.material.uniforms.top.value.lerpColors(C_T0, C_T1, gold); sky.material.uniforms.hor.value.lerpColors(C_H0, C_H1, gold); scene.fog.color.copy(sky.material.uniforms.hor.value);
      sun.color.lerpColors(C_S0, C_S1, gold); sun.intensity = lerp(2.6, 2.1, gold); hemi.intensity = lerp(0.38, 0.3, gold);
      lampLights.forEach(l => { l.intensity = l.userData.k * (0.3 + 0.6 * night); });
      smoke.forEach((sp, i) => { const t = ((now / 7000 + i / smoke.length) % 1); sp.position.set(3.6 + t * 1.6 + Math.sin(i) * 0.15, WH + 3.9 + t * 5, -1.4 + t * 0.6); sp.scale.setScalar(0.6 + t * 3.2); sp.material.opacity = 0.42 * Math.sin(t * Math.PI) * (1 - t * 0.4); });
      birds.forEach(b => { const i = b.userData.i, a = now / (9000 + i * 900) * Math.PI * 2 + i * 0.9, R = 30 + i * 3.5; b.position.set(Math.cos(a) * R, 17 + i * 1.6 + Math.sin(now / 1100 + i) * 0.6, Math.sin(a) * R * 0.8); b.rotation.y = -a; const f = Math.sin(now / 90 + i * 2) * 0.7; b.userData.wl.rotation.z = f; b.userData.wr.rotation.z = -f; b.visible = p < 0.4; });
      windU.value = now / 1000;
      lanGlow.material.opacity = 0.5 + Math.sin(now / 700) * 0.06;

      if (composer) composer.render(dt); else renderer.render(scene, camera);

      frames++; if (frames === 3) canvas.classList.add("is-ready");
      if (frames > 4 && !healthDone) { healthDone = true; if (checkBlank()) { fallback("blank render"); return; } }
      if (frames > 20 && !window.__WALK3D_TEST) { ema = ema * 0.94 + (dt * 1000) * 0.06; if (ema > 38) { if (++slow > 50) downgrade(); } else slow = Math.max(0, slow - 2); }

      if (head) head.style.opacity = (1 - smooth(0.1, 0.2, p)).toFixed(3);
      caps.forEach(c => { const a = +c.dataset.in, b = +c.dataset.out, o = smooth(a, a + 0.04, p) * (1 - smooth(b - 0.04, b, p)); c.style.opacity = o.toFixed(3); c.style.transform = `translate3d(0,${((1 - o) * 24).toFixed(1)}px,0)`; });
      const edges = [0, 0.3, 0.5, 0.56];
      steps.forEach((li, i) => li.classList.toggle("is-active", p >= edges[i] && (i === 3 || p < edges[i + 1])));
      cards.forEach((card, i) => {
        const [a, b] = cardRanges[i], o = smooth(a, a + 0.035, p) * (1 - smooth(b - 0.035, b, p));
        card.style.opacity = o.toFixed(3); card.style.visibility = o < 0.01 ? "hidden" : "visible"; card.style.pointerEvents = o > 0.6 ? "auto" : "none";
        card.style.transform = `translate3d(${((1 - o) * (i % 2 ? 1 : -1) * 40).toFixed(1)}px,0,0)`;
      });
    } catch (e) { fallback(e && e.message ? e.message : "frame error"); }
  }
  requestAnimationFrame(frame);
}
