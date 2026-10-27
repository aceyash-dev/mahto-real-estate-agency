/* Scroll-driven WebGL walkthrough: a plot of land, a house, a door, the rooms.
   Source for ../walk3d.js (bundle with: esbuild src/walk3d.src.js --bundle --minify --format=iife --outfile=walk3d.js).
   Progress comes from scroll position inside .walk; the camera flies a spline through the scene. */
import * as THREE from "three";

const section = document.querySelector(".walk");
const sticky = section && section.querySelector(".walk-sticky");
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch (_) { return false; }
}

if (section && sticky && !reduce && hasWebGL()) init();

function init() {
  const html = document.documentElement;
  const clamp = (v, a = 0, b = 1) => Math.min(Math.max(v, a), b);
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const CREAM = 0xede8db, FOREST = 0x173d32, BRASS = 0xa77b52;

  /* Seeded random so the scene is identical on every load. */
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement;
  canvas.className = "walk-canvas";
  canvas.setAttribute("aria-hidden", "true");
  sticky.prepend(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CREAM);
  scene.fog = new THREE.Fog(CREAM, 55, 190);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 400);

  /* ---------- Lights ---------- */
  scene.add(new THREE.HemisphereLight(0xfff4de, 0xb9c4a8, 0.9));
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.4);
  sun.position.set(34, 52, 38);
  sun.castShadow = true;
  const mapSize = window.innerWidth < 800 ? 1024 : 2048;
  sun.shadow.mapSize.set(mapSize, mapSize);
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 10, far: 140 });
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  /* ---------- Textures ---------- */
  const tex = (draw, size = 1024) => {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    draw(c.getContext("2d"), size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };

  /* Topographic contour lines: the brand's land-map motif, used as the ground. */
  const groundTex = tex((g, s) => {
    g.fillStyle = "#e6e0cf"; g.fillRect(0, 0, s, s);
    g.lineWidth = 2;
    for (let i = 1; i <= 46; i++) {
      const r = (i / 46) * (s / 2) * 0.98;
      g.beginPath();
      for (let k = 0; k <= 160; k++) {
        const a = (k / 160) * Math.PI * 2;
        const w = 1 + 0.045 * Math.sin(3 * a + i * 0.5) + 0.03 * Math.sin(5 * a + i * 0.9) + 0.02 * Math.cos(7 * a + i);
        const x = s / 2 + Math.cos(a) * r * w, y = s / 2 + Math.sin(a) * r * w * 0.94;
        k ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath();
      g.strokeStyle = `rgba(23,61,50,${i % 5 === 0 ? 0.3 : 0.14})`;
      g.stroke();
    }
  }, 2048);

  const floorTex = tex((g, s) => {
    g.fillStyle = "#dccdb0"; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 16; i++) {
      g.fillStyle = i % 2 ? "rgba(255,255,255,.05)" : "rgba(60,35,10,.06)";
      g.fillRect(0, (i * s) / 16, s, s / 16);
      g.fillStyle = "rgba(60,35,10,.35)";
      g.fillRect(0, (i * s) / 16, s, 2);
    }
  });

  const signTex = tex((g, s) => {
    g.fillStyle = "#173d32"; g.fillRect(0, 0, s, s);
    g.strokeStyle = "#a77b52"; g.lineWidth = 8; g.strokeRect(24, 24, s - 48, s - 48);
    g.fillStyle = "#f4efe3"; g.textAlign = "center";
    g.font = "italic 190px Georgia, serif"; g.fillText("Mahto", s / 2, s * 0.5);
    g.fillStyle = "#d5b28d"; g.font = "bold 62px Arial, sans-serif";
    g.fillText("REAL ESTATE AGENCY", s / 2, s * 0.68);
  }, 1024);

  /* ---------- Materials ---------- */
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });
  const mWall = std(0xf3eee2), mTrim = std(FOREST), mBrass = std(BRASS, { roughness: 0.5, metalness: 0.4 });
  const mRoof = std(0x1d4a3c, { transparent: true });
  const mCeil = std(0xfaf6ec, { transparent: true, side: THREE.DoubleSide });
  const mGlass = new THREE.MeshStandardMaterial({ color: 0xcfe4ea, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28 });
  const mWood = std(0xc2a883), mSofa = std(0x2c5d4d), mWhite = std(0xf7f4ec);
  const mGlow = new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xffc46b, emissiveIntensity: 2.2 });

  const add = (parent, geo, mat, x = 0, y = 0, z = 0, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow; m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  /* ---------- Ground, plot, path ---------- */
  const ground = add(scene, new THREE.CircleGeometry(170, 96), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }), 0, 0, 0, false);
  ground.rotation.x = -Math.PI / 2;
  const lawn = add(scene, new THREE.PlaneGeometry(36, 32), std(0xdfe3c9), 0, 0.012, 0, false);
  lawn.rotation.x = -Math.PI / 2;
  const path = add(scene, new THREE.PlaneGeometry(1.8, 22), std(0xcfc8b8), 0, 0.02, 15.5, false);
  path.rotation.x = -Math.PI / 2;
  /* Plot boundary: brass pegs joined by a thin line, like a surveyed plot. */
  const corners = [[-18, -16], [18, -16], [18, 16], [-18, 16]];
  corners.forEach(([x, z], i) => {
    add(scene, new THREE.BoxGeometry(0.28, 1.1, 0.28), mBrass, x, 0.55, z);
    const [nx, nz] = corners[(i + 1) % 4];
    const len = Math.hypot(nx - x, nz - z);
    const line = add(scene, new THREE.BoxGeometry(len, 0.04, 0.06), mBrass, (x + nx) / 2, 0.05, (z + nz) / 2, false);
    line.rotation.y = -Math.atan2(nz - z, nx - x);
  });
  /* Agency sign by the path. */
  const sign = new THREE.Group();
  add(sign, new THREE.BoxGeometry(0.14, 2.2, 0.14), mWood, -1.3, 1.1, 0);
  add(sign, new THREE.BoxGeometry(0.14, 2.2, 0.14), mWood, 1.3, 1.1, 0);
  const board = add(sign, new THREE.BoxGeometry(3.2, 1.7, 0.1), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6 }), 0, 1.6, 0);
  board.material = [std(FOREST), std(FOREST), std(FOREST), std(FOREST), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6 }), std(FOREST)];
  sign.position.set(-4.2, 0, 16);
  sign.rotation.y = 0.18;
  scene.add(sign);

  /* ---------- House ---------- */
  const W = 12, D = 9, WH = 3.2, T = 0.26;
  const house = new THREE.Group();
  scene.add(house);

  function wall(width, holes, mat = mWall) {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0); shape.lineTo(width / 2, 0); shape.lineTo(width / 2, WH); shape.lineTo(-width / 2, WH); shape.closePath();
    holes.forEach(([cx, y0, w, h]) => {
      const p = new THREE.Path();
      p.moveTo(cx - w / 2, y0); p.lineTo(cx + w / 2, y0); p.lineTo(cx + w / 2, y0 + h); p.lineTo(cx - w / 2, y0 + h); p.closePath();
      shape.holes.push(p);
    });
    const geo = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false });
    geo.translate(0, 0, -T / 2);
    return new THREE.Mesh(geo, mat);
  }
  function windowAt(group, cx, y0, w, h, z) {
    add(group, new THREE.PlaneGeometry(w, h), mGlass, cx, y0 + h / 2, z, false);
    const f = 0.07;
    add(group, new THREE.BoxGeometry(w + f * 2, f, T + 0.06), mBrass, cx, y0, z, false);
    add(group, new THREE.BoxGeometry(w + f * 2, f, T + 0.06), mBrass, cx, y0 + h, z, false);
    add(group, new THREE.BoxGeometry(f, h, T + 0.06), mBrass, cx - w / 2, y0 + h / 2, z, false);
    add(group, new THREE.BoxGeometry(f, h, T + 0.06), mBrass, cx + w / 2, y0 + h / 2, z, false);
    add(group, new THREE.BoxGeometry(f, h, T + 0.06), mBrass, cx, y0 + h / 2, z, false);
  }
  const DOOR_W = 1.5, DOOR_H = 2.3;
  const front = wall(W, [[0, 0, DOOR_W, DOOR_H], [-3.7, 0.9, 1.9, 1.4], [3.7, 0.9, 1.9, 1.4]]);
  front.position.z = D / 2; house.add(front);
  windowAt(house, -3.7, 0.9, 1.9, 1.4, D / 2); windowAt(house, 3.7, 0.9, 1.9, 1.4, D / 2);
  const back = wall(W, [[0, 0.9, 3.4, 1.4]]);
  back.position.z = -D / 2; back.rotation.y = Math.PI; house.add(back);
  windowAt(house, 0, 0.9, 3.4, 1.4, -D / 2);
  [-1, 1].forEach(sx => {
    const side = wall(D, [[-1.8, 0.9, 1.6, 1.4], [1.8, 0.9, 1.6, 1.4]]);
    side.rotation.y = sx * Math.PI / 2; side.position.x = sx * W / 2; house.add(side);
    [-1.8, 1.8].forEach(c => {
      const g = new THREE.Group(); g.position.x = sx * W / 2; g.rotation.y = Math.PI / 2; house.add(g);
      windowAt(g, c * sx, 0.9, 1.6, 1.4, 0);
    });
  });
  [front, back].forEach(m => { m.castShadow = true; m.receiveShadow = true; });
  house.children.forEach(m => { if (m.isMesh && m.geometry.type === "ExtrudeGeometry") { m.castShadow = true; m.receiveShadow = true; } });

  /* Slab, porch, interior floor. */
  add(house, new THREE.BoxGeometry(W + 0.9, 0.3, D + 0.9), std(0xcfc8b8), 0, -0.14, 0);
  add(house, new THREE.BoxGeometry(3.4, 0.16, 1.6), std(0xd8d2c2), 0, 0.0, D / 2 + 0.9);
  const floor = add(house, new THREE.PlaneGeometry(W - 0.2, D - 0.2), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.6 }), 0, 0.03, 0, false);
  floor.rotation.x = -Math.PI / 2;
  const ceil = add(house, new THREE.PlaneGeometry(W - 0.2, D - 0.2), mCeil, 0, WH - 0.02, 0, false);
  ceil.rotation.x = Math.PI / 2;

  /* Gable roof with overhang and a chimney. */
  const rise = 2.3, half = D / 2 + 0.7, slope = Math.hypot(half, rise), ang = Math.atan2(rise, half);
  [-1, 1].forEach(s => {
    const r = add(house, new THREE.BoxGeometry(W + 1.2, 0.2, slope), mRoof, 0, WH + rise / 2, s * half / 2);
    r.rotation.x = s * ang;
  });
  [-1, 1].forEach(s => {
    const gs = new THREE.Shape(); gs.moveTo(-D / 2, 0); gs.lineTo(D / 2, 0); gs.lineTo(0, rise - 0.05); gs.closePath();
    const g = add(house, new THREE.ShapeGeometry(gs), mWall, s * (W / 2 - 0.02), WH, 0);
    g.rotation.y = s * Math.PI / 2;
    g.material = std(0xf3eee2, { side: THREE.DoubleSide });
  });
  add(house, new THREE.BoxGeometry(0.9, 2.6, 0.9), std(0xb9a98f), 3.6, WH + 1.6, -1.2);

  /* Front door: hinged, swings inward as the camera arrives. */
  const doorPivot = new THREE.Group();
  doorPivot.position.set(-DOOR_W / 2, 0, D / 2);
  house.add(doorPivot);
  add(doorPivot, new THREE.BoxGeometry(DOOR_W - 0.04, DOOR_H - 0.03, 0.09), mTrim, DOOR_W / 2, DOOR_H / 2, 0);
  add(doorPivot, new THREE.SphereGeometry(0.06, 12, 12), mBrass, DOOR_W - 0.18, 1.1, 0.08, false);
  add(house, new THREE.BoxGeometry(DOOR_W + 0.3, 0.1, 0.5), mBrass, 0, DOOR_H + 0.05, D / 2 + 0.1, false);

  /* ---------- Interior ---------- */
  const lamp = (x, y, z, intensity = 22) => {
    const l = new THREE.PointLight(0xffd59a, intensity, 14, 2);
    l.position.set(x, y, z); house.add(l);
    add(house, new THREE.SphereGeometry(0.16, 16, 16), mGlow, x, y, z, false);
  };
  lamp(-3, 2.7, 0.5); lamp(3, 2.7, -0.8); lamp(0.3, 2.7, 2.4, 14);

  /* Living: sofa, rug, table, shelf. */
  add(house, new THREE.BoxGeometry(2.8, 0.5, 1.05), mSofa, -3.6, 0.28, 1.6);
  add(house, new THREE.BoxGeometry(2.8, 0.75, 0.28), mSofa, -3.6, 0.7, 2.05);
  add(house, new THREE.BoxGeometry(0.28, 0.65, 1.05), mSofa, -5.1, 0.55, 1.6);
  add(house, new THREE.BoxGeometry(0.28, 0.65, 1.05), mSofa, -2.1, 0.55, 1.6);
  const rug = add(house, new THREE.PlaneGeometry(3.6, 2.4), std(0xe6d3b6), -3.6, 0.04, 0, false); rug.rotation.x = -Math.PI / 2;
  add(house, new THREE.BoxGeometry(1.4, 0.4, 0.8), mWood, -3.6, 0.22, 0);
  add(house, new THREE.BoxGeometry(3, 2.1, 0.4), mWood, -4.2, 1.05, -D / 2 + 0.35);
  /* Kitchen: counter run and island. */
  add(house, new THREE.BoxGeometry(4.6, 0.95, 0.75), mWhite, 3.2, 0.48, -D / 2 + 0.45);
  add(house, new THREE.BoxGeometry(4.6, 0.06, 0.8), mBrass, 3.2, 0.97, -D / 2 + 0.45);
  add(house, new THREE.BoxGeometry(2.2, 0.95, 1.1), mWhite, 3.4, 0.48, -1.4);
  add(house, new THREE.BoxGeometry(2.3, 0.06, 1.2), mBrass, 3.4, 0.97, -1.4);
  /* Bedroom: bed and headboard. */
  add(house, new THREE.BoxGeometry(2.1, 0.5, 2.4), mWhite, 4.0, 0.3, 2.3);
  add(house, new THREE.BoxGeometry(2.1, 0.55, 0.9), std(0xd6c4a4), 4.0, 0.5, 2.7, true);
  add(house, new THREE.BoxGeometry(2.3, 1.2, 0.14), mTrim, 4.0, 0.9, 3.45);
  /* Framed art in the brand palette. */
  [[-1.8, 2, -D / 2 + 0.16, FOREST], [1.2, 2, -D / 2 + 0.16, BRASS]].forEach(([x, y, z, c]) =>
    add(house, new THREE.BoxGeometry(1.1, 1.4, 0.06), std(c), x, y, z, false));

  /* ---------- Trees ---------- */
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 1.8, 6);
  const leafGeo = new THREE.ConeGeometry(2.0, 5.2, 7);
  const N = 90, trunks = new THREE.InstancedMesh(trunkGeo, std(0x6b4f35), N), leaves = new THREE.InstancedMesh(leafGeo, std(0xffffff), N);
  trunks.castShadow = leaves.castShadow = true;
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  let placed = 0;
  while (placed < N) {
    const a = rnd() * Math.PI * 2, r = 24 + rnd() * 90;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < 24 && Math.abs(z) < 22) continue;
    if (Math.abs(x) < 7 && z > 8) continue;
    const s = 0.7 + rnd() * 0.9;
    dummy.position.set(x, 0.9 * s, z); dummy.scale.setScalar(s); dummy.updateMatrix(); trunks.setMatrixAt(placed, dummy.matrix);
    dummy.position.set(x, (1.8 + 2.4) * s, z); dummy.updateMatrix(); leaves.setMatrixAt(placed, dummy.matrix);
    col.setHSL(0.38 + rnd() * 0.06, 0.28 + rnd() * 0.12, 0.2 + rnd() * 0.1); leaves.setColorAt(placed, col);
    placed++;
  }
  scene.add(trunks, leaves);

  /* ---------- Camera path ---------- */
  const keys = [
    [0.00, [0, 74, 70], [0, 0, 0]],      /* aerial: the plot on the plain */
    [0.16, [26, 30, 40], [0, 1, 2]],     /* descend and circle */
    [0.30, [7, 3.4, 22], [0, 1.8, 0]],   /* low approach along the path */
    [0.40, [0.4, 1.7, 10.5], [0, 1.5, 0]], /* at the porch */
    [0.48, [0, 1.6, 5.6], [0, 1.5, -2]], /* the doorway */
    [0.57, [0, 1.6, 2.6], [-3.4, 1.2, 0.6]], /* inside: look to living */
    [0.70, [-1.8, 1.6, 0.6], [-4.6, 1.0, 1.6]],
    [0.82, [1.6, 1.6, 0.2], [4, 1.1, -2.6]],  /* kitchen */
    [0.92, [2.4, 1.6, 0.6], [4.2, 0.9, 2.4]], /* bedroom */
    [1.00, [0.4, 1.7, 0.6], [-3.7, 1.7, 4.5]] /* window to the plot */
  ];
  const posCurve = new THREE.CatmullRomCurve3(keys.map(k => new THREE.Vector3(...k[1])), false, "centripetal");
  const tgtCurve = new THREE.CatmullRomCurve3(keys.map(k => new THREE.Vector3(...k[2])), false, "centripetal");
  /* Map scroll progress to curve parameter so each keyframe lands at its own scroll position. */
  const toU = p => {
    for (let i = 0; i < keys.length - 1; i++) {
      if (p <= keys[i + 1][0]) return (i + (p - keys[i][0]) / (keys[i + 1][0] - keys[i][0])) / (keys.length - 1);
    }
    return 1;
  };

  /* ---------- Overlay: captions, steps, cards ---------- */
  const caps = Array.from(section.querySelectorAll(".walk-cap"));
  const steps = Array.from(section.querySelectorAll(".walk-steps li"));
  const cards = Array.from(section.querySelectorAll(".room-card"));
  const head = section.querySelector(".walk-head");
  const cardRanges = [[0.56, 0.69], [0.69, 0.80], [0.80, 0.90], [0.90, 1.01]];

  html.classList.add("is-3d");

  function resize() {
    const w = sticky.clientWidth, h = sticky.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.9 ? 72 : 52;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  let target = 0, current = 0, last = performance.now(), visible = true;
  const progressNow = () => {
    const rect = section.getBoundingClientRect();
    return clamp(-rect.top / Math.max(1, section.offsetHeight - window.innerHeight));
  };
  new IntersectionObserver(e => { visible = e[0].isIntersecting; }, { rootMargin: "100px" }).observe(section);

  const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3();
  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    target = progressNow();
    current += (target - current) * (1 - Math.exp(-dt * 6));
    const p = current, u = toU(p);

    posCurve.getPoint(u, camPos); tgtCurve.getPoint(u, camTgt);
    /* A hint of handheld sway keeps the interior feeling alive. */
    const sway = smooth(0.45, 0.55, p) * 0.018;
    camPos.y += Math.sin(now / 900) * sway; camPos.x += Math.cos(now / 1300) * sway;
    camera.position.copy(camPos); camera.lookAt(camTgt);

    doorPivot.rotation.y = smooth(0.33, 0.44, p) * 1.8;
    /* Dollhouse cutaway: the roof is see-through from above, solid as we descend. */
    const solid = 0.14 + 0.86 * smooth(0.12, 0.28, p);
    mRoof.opacity = solid; mCeil.opacity = solid; mRoof.depthWrite = solid > 0.98;
    scene.fog.near = 55 - 30 * smooth(0.42, 0.5, p); scene.fog.far = 190 - 120 * smooth(0.42, 0.5, p);

    renderer.render(scene, camera);

    /* Overlay driven by the same progress. */
    if (head) head.style.opacity = (1 - smooth(0.1, 0.2, p)).toFixed(3);
    caps.forEach(c => {
      const a = +c.dataset.in, b = +c.dataset.out;
      const o = smooth(a, a + 0.04, p) * (1 - smooth(b - 0.04, b, p));
      c.style.opacity = o.toFixed(3);
      c.style.transform = `translate3d(0, ${((1 - o) * 24).toFixed(1)}px, 0)`;
    });
    steps.forEach((li, i) => {
      const edges = [0, 0.3, 0.48, 0.56];
      const on = p >= edges[i] && (i === 3 || p < edges[i + 1]);
      li.classList.toggle("is-active", on);
    });
    cards.forEach((card, i) => {
      const [a, b] = cardRanges[i];
      const o = smooth(a, a + 0.035, p) * (1 - smooth(b - 0.035, b, p));
      card.style.opacity = o.toFixed(3);
      card.style.visibility = o < 0.01 ? "hidden" : "visible";
      card.style.pointerEvents = o > 0.6 ? "auto" : "none";
      const side = i % 2 ? 1 : -1;
      card.style.transform = `translate3d(${((1 - o) * side * 40).toFixed(1)}px, 0, 0)`;
    });
  }
  requestAnimationFrame(frame);
}
