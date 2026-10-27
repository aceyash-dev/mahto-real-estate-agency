/* The scene: plain, plot, garden, house, interior. Everything is procedural. */
import * as THREE from "three";
import { Builder } from "./builder.js";
import { makeTextures, rnd, rr, pick } from "./textures.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const clamp = (v, a = 0, b = 1) => Math.min(Math.max(v, a), b);
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

export function buildWorld({ scene, renderer, tier }) {
  const hi = tier === "high";
  const T = makeTextures(tier);
  const root = new THREE.Group();
  scene.add(root);

  /* ---------- Materials ---------- */
  const mk = (color, o = {}) => {
    const common = { color, map: o.map || null, transparent: !!o.transparent, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide, depthWrite: o.depthWrite ?? true };
    let m;
    if (hi) {
      m = new THREE.MeshStandardMaterial({ ...common, roughness: o.rough ?? 0.85, metalness: o.metal ?? 0, bumpMap: o.bump || null, bumpScale: o.bumpScale ?? 1.4, emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1 });
    } else {
      m = new THREE.MeshLambertMaterial({ ...common, emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1 });
    }
    if (o.tile) m.userData.tile = o.tile;
    if (o.noShadow) m.userData.noShadow = true;
    return m;
  };
  const M = {
    plaster: mk(0xf5f0e4, { map: T.plaster, bump: T.plasterB, tile: 2, rough: 0.95 }),
    brick: mk(0xffffff, { map: T.brick, bump: T.brickB, tile: 1, rough: 0.9 }),
    stone: mk(0xffffff, { map: T.stone, bump: T.stoneB, tile: 1.4, rough: 0.9 }),
    roof: mk(0xffffff, { map: T.roof, bump: T.roofB, tile: 1.2, rough: 0.6, transparent: true }),
    ceil: mk(0xfaf6ec, { transparent: true, side: THREE.DoubleSide }),
    trim: mk(0xfaf7f0, { rough: 0.5 }),
    forest: mk(0x173d32, { rough: 0.5 }),
    shutter: mk(0x2f6150, { rough: 0.7 }),
    brass: mk(0xb58a5a, { metal: 0.7, rough: 0.35 }),
    wood: mk(0xc2a883, { rough: 0.6 }),
    woodDark: mk(0x6b4f35, { rough: 0.7 }),
    floor: mk(0xffffff, { map: T.wood, bump: T.woodB, tile: 2.2, rough: 0.55, bumpScale: 0.8 }),
    metal: mk(0x8f9893, { metal: 0.6, rough: 0.4 }),
    dark: mk(0x1b1f1f, { rough: 0.4 }),
    glass: mk(0xcfe4ea, { transparent: true, opacity: 0.24, rough: 0.05, metal: 0.1, noShadow: true, depthWrite: false }),
    glow: mk(0xffe2a8, { emissive: 0xffc46b, ei: 2.2, noShadow: true }),
    lamp: mk(0xfff0cf, { emissive: 0xffd9a0, ei: 0.9, noShadow: true }),
    white: mk(0xf7f4ec, { rough: 0.45 }),
    quartz: mk(0xf1eee6, { rough: 0.25 }),
    tile: mk(0xf3f1ec, { rough: 0.3 }),
    soil: mk(0x4a3826, { rough: 1 }),
    leaf: mk(0xffffff, { map: T.leaf, tile: 1.2, rough: 1 }),
    plant: mk(0x3f7a4f, { rough: 0.8 }),
    plant2: mk(0x5d9467, { rough: 0.8 }),
    pot: mk(0xc9b79a, { rough: 0.7 }),
    pot2: mk(0x2c5d4d, { rough: 0.6 }),
    sofa: mk(0x2f6150, { map: T.fabric, tile: 0.5, rough: 1 }),
    cream: mk(0xefe6d3, { map: T.fabric, tile: 0.5, rough: 1 }),
    mustard: mk(0xc79a5e, { map: T.fabric, tile: 0.5, rough: 1 }),
    linen: mk(0xf6f3ec, { map: T.fabric, tile: 0.5, rough: 1 }),
    curtain: mk(0xe8dfca, { map: T.fabric, tile: 0.5, rough: 1, side: THREE.DoubleSide }),
    rug: mk(0xffffff, { map: T.rug, rough: 1 }),
    runner: mk(0x2c5d4d, { map: T.fabric, tile: 0.5, rough: 1 }),
    tv: mk(0x101416, { rough: 0.15, emissive: 0x0a1a22, ei: 0.6 }),
    silver: mk(0xd7dcdc, { metal: 0.8, rough: 0.25 }),
    mirror: mk(0xdfe9ec, { metal: 0.9, rough: 0.08 }),
    orange: mk(0xe58a3a, { rough: 0.6 }),
    apple: mk(0x7aa13d, { rough: 0.6 }),
    f1: mk(0xf4efe3, { rough: 0.7 }), f2: mk(0xd9694a, { rough: 0.7 }), f3: mk(0xc9a0dc, { rough: 0.7 }), f4: mk(0xe9c36a, { rough: 0.7 }),
    bk: [0x173d32, 0xa77b52, 0xd5b28d, 0x8b3a2f, 0x2f6150, 0xe9e0cc, 0x36507a].map(c => mk(c, { rough: 0.8 }))
  };

  /* ---------- Sky, fog, sun ---------- */
  const horizon = new THREE.Color(0xeee6d2), zenith = new THREE.Color(0xbcd3d8);
  scene.fog = new THREE.Fog(horizon, 90, 340);
  const sunPos = new THREE.Vector3(34, 52, 38);
  const sunDir = sunPos.clone().normalize();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: zenith }, horizon: { value: horizon }, sunDir: { value: sunDir }, sunColor: { value: new THREE.Color(0xfff1d2) } },
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float h = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(horizon, top, pow(h, 0.5));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        c += sunColor * (pow(s, 900.0) * 4.0 + pow(s, 28.0) * 0.28);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);

  /* Lights. */
  scene.add(new THREE.HemisphereLight(0xfff4de, 0xb9c4a8, hi ? 0.75 : 1.05));
  const sun = new THREE.DirectionalLight(0xfff0d6, hi ? 2.6 : 1.9);
  sun.position.copy(sunPos);
  if (hi) {
    sun.castShadow = true;
    const ms = window.innerWidth < 800 ? 1024 : 2048;
    sun.shadow.mapSize.set(ms, ms);
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 10, far: 150 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  }
  scene.add(sun);

  if (hi) { /* Reflections of our own sky on glass and metal. */
    try {
      const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene();
      es.add(new THREE.Mesh(new THREE.SphereGeometry(100, 24, 12), skyMat));
      scene.environment = pm.fromScene(es, 0.04).texture;
      scene.environmentIntensity = 0.45;
      pm.dispose();
    } catch (_) { /* reflections are optional */ }
  }

  /* ---------- Ground, hills, road ---------- */
  const ground = new THREE.Mesh(new THREE.CircleGeometry(300, 72), hi ? new THREE.MeshStandardMaterial({ map: T.ground, roughness: 1 }) : new THREE.MeshLambertMaterial({ map: T.ground }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; root.add(ground);

  const scaleUV = (g, u, v) => { const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * u, a.getY(i) * v); return g; };
  const lawnMat = hi ? new THREE.MeshStandardMaterial({ map: T.lawn, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }) : new THREE.MeshLambertMaterial({ map: T.lawn, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(36, 32), lawnMat);
  lawn.rotation.x = -Math.PI / 2; lawn.position.y = 0.04; lawn.receiveShadow = true; root.add(lawn);

  const roadTex = T.dirt.clone(); roadTex.needsUpdate = true;
  const road = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(4.2, 140), 1.1, 36), hi ? new THREE.MeshStandardMaterial({ map: roadTex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }) : new THREE.MeshLambertMaterial({ map: roadTex }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0.03, 87.5); road.receiveShadow = true; root.add(road);

  [[236, 30, 0x9eb3a3, 1], [212, 14, 0xb3c4b2, 2], [196, 7, 0xc5d1bd, 3]].forEach(([r, h, col, k]) => {
    const N = 120, pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const hh = h * (0.45 + 0.55 * Math.abs(Math.sin(a * (3 + k) + k) * 0.6 + Math.sin(a * (7 + k) + k * 2) * 0.4));
      pos.push(Math.cos(a) * r, -2, Math.sin(a) * r, Math.cos(a) * (r + h * 1.2), hh, Math.sin(a) * (r + h * 1.2));
      if (i < N) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    root.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: col, side: THREE.DoubleSide })));
  });

  /* Clouds drift slowly. */
  const clouds = new THREE.Group(); root.add(clouds);
  const cloudMat = new THREE.SpriteMaterial({ map: T.cloud, transparent: true, opacity: 0.6, depthWrite: false, fog: false });
  for (let i = 0; i < (hi ? 34 : 16); i++) {
    const s = new THREE.Sprite(cloudMat), a = rnd() * 6.283, r = rr(90, 300);
    s.position.set(Math.cos(a) * r, rr(85, 150), Math.sin(a) * r); s.scale.set(rr(50, 110), rr(18, 34), 1); clouds.add(s);
  }

  /* ---------- Trees, grass, rocks (instanced) ---------- */
  const colored = (g, hex) => {
    g = g.toNonIndexed(); g.deleteAttribute("uv");
    const c = new THREE.Color(hex), n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    return g;
  };
  const place = (g, x, y, z, sx = 1, sy = 1, sz = 1) => g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)));
  const ico = (r, hex, x, y, z, sy = 0.85) => { const g = colored(new THREE.IcosahedronGeometry(r, hi ? 1 : 0), hex); place(g, x, y, z, 1, sy, 1); return g; };
  const trunk = (h, hex = 0x6b4f35) => { const g = colored(new THREE.CylinderGeometry(0.18, 0.3, h, 6), hex); place(g, 0, h / 2, 0); return g; };
  const decid = mergeGeometries([trunk(2.4), ico(1.8, 0x4f8a55, 0, 3.7, 0), ico(1.3, 0x5d9a62, 1.1, 3.2, 0.4), ico(1.4, 0x447c4d, -1.0, 3.4, -0.5), ico(1.15, 0x6aa96b, 0.2, 4.7, 0.2)]);
  const pine = mergeGeometries([trunk(1.4), (() => { const g = colored(new THREE.ConeGeometry(1.9, 2.8, 7), 0x2c5d46); place(g, 0, 2.7, 0); return g; })(), (() => { const g = colored(new THREE.ConeGeometry(1.5, 2.4, 7), 0x336a50); place(g, 0, 4.0, 0); return g; })(), (() => { const g = colored(new THREE.ConeGeometry(1.0, 2.1, 7), 0x3a7557); place(g, 0, 5.2, 0); return g; })()]);
  const treeMat = hi ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }) : new THREE.MeshLambertMaterial({ vertexColors: true });
  const scatter = (geo, n, plotTrees = []) => {
    const im = new THREE.InstancedMesh(geo, treeMat, n + plotTrees.length), d = new THREE.Object3D(), col = new THREE.Color();
    let k = 0;
    const put = (x, z, s) => {
      d.position.set(x, 0, z); d.scale.setScalar(s); d.rotation.y = rnd() * 6.28; d.updateMatrix(); im.setMatrixAt(k, d.matrix);
      col.setHSL(rr(-0.02, 0.03) + 0.0, 0, 0).setRGB(rr(0.82, 1.12), rr(0.86, 1.1), rr(0.8, 1.05)); im.setColorAt(k, col); k++;
    };
    plotTrees.forEach(([x, z, s]) => put(x, z, s));
    while (k < n + plotTrees.length) {
      const a = rnd() * 6.283, r = 26 + rnd() * 140, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) < 24 && Math.abs(z) < 22) continue;
      if (Math.abs(x) < 8 && z > 8) continue;
      put(x, z, 0.8 + rnd() * 1.1);
    }
    im.castShadow = true; im.receiveShadow = false; root.add(im);
  };
  scatter(decid, hi ? 70 : 26, [[-12.5, -3, 1.7], [13, 7, 1.4], [-10.5, 10.5, 1.1], [10.5, -9.5, 1.3], [-13, -11.5, 1.2]]);
  scatter(pine, hi ? 90 : 34);

  const tufts = new THREE.InstancedMesh(new THREE.ConeGeometry(0.07, 0.4, 3), hi ? new THREE.MeshStandardMaterial({ roughness: 1 }) : new THREE.MeshLambertMaterial(), hi ? 2400 : 450);
  {
    const d = new THREE.Object3D(), col = new THREE.Color(), cols = [0x8fa863, 0x9bb06d, 0xb1b56f, 0x7f9a59, 0xc2b87a];
    for (let i = 0, k = 0; k < tufts.count; i++) {
      const a = rnd() * 6.283, r = 4 + rnd() * 52, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) < 19 && Math.abs(z) < 17) continue;
      if (Math.abs(x) < 2.6 && z > 10) continue;
      d.position.set(x, 0.18, z); d.scale.set(1, rr(0.7, 1.7), 1); d.rotation.set(rr(-0.2, 0.2), rnd() * 3, rr(-0.2, 0.2)); d.updateMatrix();
      tufts.setMatrixAt(k, d.matrix); tufts.setColorAt(k, col.setHex(pick(cols))); k++;
    }
    root.add(tufts);
  }
  {
    const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.4, 0), hi ? new THREE.MeshStandardMaterial({ color: 0xb4ab9a, roughness: 1, flatShading: true }) : new THREE.MeshLambertMaterial({ color: 0xb4ab9a, flatShading: true }), 40);
    const d = new THREE.Object3D();
    for (let k = 0; k < 40; k++) {
      let x, z; do { const a = rnd() * 6.283, r = 20 + rnd() * 60; x = Math.cos(a) * r; z = Math.sin(a) * r; } while ((Math.abs(x) < 20 && Math.abs(z) < 18) || (Math.abs(x) < 3 && z > 10));
      d.position.set(x, 0.1, z); d.scale.set(rr(0.5, 1.6), rr(0.4, 1), rr(0.5, 1.4)); d.rotation.y = rnd() * 3; d.updateMatrix(); rocks.setMatrixAt(k, d.matrix);
    }
    rocks.castShadow = true; root.add(rocks);
  }

  /* ---------- House ---------- */
  const W = 12, D = 9, WH = 3.2, TH = 0.26, RISE = 2.3, HALF = D / 2 + 0.7;
  const SLOPE = Math.hypot(HALF, RISE), ANG = Math.atan2(RISE, HALF);
  const house = new THREE.Group(); root.add(house);
  const bx = new Builder();   /* exterior shell */
  const bi = new Builder();   /* interior */
  const bg = new Builder();   /* garden */

  const wallShape = (width, holes) => {
    const s = new THREE.Shape();
    s.moveTo(-width / 2, 0); s.lineTo(width / 2, 0); s.lineTo(width / 2, WH); s.lineTo(-width / 2, WH); s.closePath();
    holes.forEach(([cx, y0, w, h]) => { const p = new THREE.Path(); p.moveTo(cx - w / 2, y0); p.lineTo(cx + w / 2, y0); p.lineTo(cx + w / 2, y0 + h); p.lineTo(cx - w / 2, y0 + h); p.closePath(); s.holes.push(p); });
    const g = new THREE.ExtrudeGeometry(s, { depth: TH, bevelEnabled: false }); g.translate(0, 0, -TH / 2); return g;
  };

  /* Window unit: origin at the bottom centre of the opening, wall plane at z = 0, outside is +z. */
  function windowUnit(b, w, h, { shutters = true, planter = false } = {}) {
    const f = 0.07, d = TH + 0.06;
    b.box(w + 0.14, f, d, M.trim, { y: 0 }); b.box(w + 0.14, f, d, M.trim, { y: h });
    b.box(f, h + f, d, M.trim, { x: -w / 2, y: h / 2 }); b.box(f, h + f, d, M.trim, { x: w / 2, y: h / 2 });
    b.box(0.045, h, TH + 0.02, M.trim, { y: h / 2 }); b.box(w, 0.045, TH + 0.02, M.trim, { y: h * 0.55 });
    b.plane(w, h, M.glass, { y: h / 2 });
    b.box(w + 0.36, 0.07, 0.3, M.trim, { y: -0.05, z: TH / 2 + 0.1 });
    b.box(w + 0.22, 0.04, 0.2, M.trim, { y: -0.02, z: -TH / 2 - 0.06 });
    b.box(w + 0.36, 0.16, 0.14, M.trim, { y: h + 0.14, z: TH / 2 + 0.03 });
    b.box(0.22, 0.1, 0.16, M.trim, { y: h + 0.27, z: TH / 2 + 0.04 });
    if (shutters) [-1, 1].forEach(s => {
      const x = s * (w / 2 + 0.4);
      b.box(0.5, h + 0.05, 0.05, M.shutter, { x, y: h / 2, z: TH / 2 + 0.04 });
      if (hi) for (let k = 0; k < Math.floor(h / 0.1); k++) b.box(0.44, 0.022, 0.05, M.shutter, { x, y: 0.1 + k * 0.1, z: TH / 2 + 0.075, rx: 0.5 });
    });
    /* Curtains and rod on the inside. */
    [-1, 1].forEach(s => b.box(0.34, h + 0.5, 0.06, M.curtain, { x: s * (w / 2 + 0.2), y: h / 2 + 0.1, z: -TH / 2 - 0.16 }));
    b.cyl(0.014, 0.014, w + 0.95, 8, M.brass, { y: h + 0.38, z: -TH / 2 - 0.16, rz: Math.PI / 2 });
    [-1, 1].forEach(s => b.sph(0.03, M.brass, { x: s * (w / 2 + 0.5), y: h + 0.38, z: -TH / 2 - 0.16 }, 8, 6));
    if (planter) {
      b.box(w + 0.1, 0.2, 0.24, M.woodDark, { y: -0.3, z: TH / 2 + 0.2 });
      const n = hi ? 9 : 4;
      for (let k = 0; k < n; k++) {
        const x = -w / 2 + (w * (k + 0.5)) / n;
        b.sph(0.1, M.plant, { x, y: -0.12, z: TH / 2 + 0.2, sy: 0.8 }, 8, 6);
        if (hi) b.sph(0.045, pick([M.f1, M.f2, M.f3, M.f4]), { x: x + rr(-0.05, 0.05), y: -0.03, z: TH / 2 + 0.26 }, 6, 5);
      }
    }
  }

  const DW = 1.5, DH = 2.3, HOLE_H = 2.9;
  /* Walls. */
  const front = wallShape(W, [[0, 0, DW, HOLE_H], [-3.7, 0.9, 1.9, 1.4], [3.7, 0.9, 1.9, 1.4]]);
  bx.add(front, M.plaster, { z: D / 2 });
  bx.add(wallShape(W, [[0, 0.9, 3.4, 1.4]]), M.plaster, { z: -D / 2, ry: Math.PI });
  [-1, 1].forEach(sx => {
    bx.add(wallShape(D, [[-1.8, 0.9, 1.6, 1.4], [1.8, 0.9, 1.6, 1.4]]), M.plaster, { x: sx * W / 2, ry: sx * Math.PI / 2 });
    [-1.8, 1.8].forEach(c => bx.at({ x: sx * W / 2, z: c, ry: sx * Math.PI / 2 }, b => windowUnit(b, 1.6, 1.4, { shutters: true })));
  });
  bx.at({ z: D / 2 }, b => { windowUnit(b, 1.9, 1.4, { planter: true, shutters: true }); });
  bx.at({ x: -3.7, z: D / 2 }, b => windowUnit(b, 1.9, 1.4, { planter: true }));
  bx.at({ x: 3.7, z: D / 2 }, b => windowUnit(b, 1.9, 1.4, { planter: true }));
  bx.at({ z: -D / 2, ry: Math.PI }, b => windowUnit(b, 3.4, 1.4, { shutters: false }));

  /* Door frame, transom and furniture. */
  bx.at({ z: D / 2 }, b => {
    b.box(0.12, HOLE_H + 0.1, TH + 0.06, M.trim, { x: -DW / 2 - 0.03, y: HOLE_H / 2 }); b.box(0.12, HOLE_H + 0.1, TH + 0.06, M.trim, { x: DW / 2 + 0.03, y: HOLE_H / 2 });
    b.box(DW + 0.24, 0.12, TH + 0.06, M.trim, { y: HOLE_H });
    b.box(DW, 0.07, TH + 0.06, M.trim, { y: DH + 0.03 });
    b.plane(DW - 0.04, HOLE_H - DH - 0.08, M.glass, { y: DH + 0.04 + (HOLE_H - DH - 0.08) / 2 });
    b.box(0.04, HOLE_H - DH - 0.08, TH, M.trim, { y: DH + 0.04 + (HOLE_H - DH - 0.08) / 2 });
    b.box(DW + 0.1, 0.05, 0.5, M.stone, { y: 0.03, z: 0.12 });
    b.box(DW + 0.5, 0.18, 0.14, M.trim, { y: HOLE_H + 0.16, z: TH / 2 + 0.03 });
    b.box(0.3, 0.12, 0.16, M.trim, { y: HOLE_H + 0.31, z: TH / 2 + 0.04 });
    b.box(0.22, 0.14, 0.02, M.brass, { x: 1.35, y: 1.55, z: TH / 2 + 0.01 });
    b.sph(0.03, M.brass, { x: -1.15, y: 1.25, z: TH / 2 + 0.02 }, 8, 6);
    [-1, 1].forEach(s => { b.box(0.14, 0.18, 0.14, M.metal, { x: s * 1.25, y: 2.45, z: TH / 2 + 0.12 }); b.box(0.1, 0.22, 0.1, M.lamp, { x: s * 1.25, y: 2.27, z: TH / 2 + 0.12 }); });
  });

  /* Plinth, corner boards, frieze, gable ends. */
  const PL = 0.55;
  bx.box(5.55, PL, 0.3, M.brick, { x: -3.525, y: PL / 2, z: D / 2 + 0.06 }); bx.box(5.55, PL, 0.3, M.brick, { x: 3.525, y: PL / 2, z: D / 2 + 0.06 });
  bx.box(W + 0.6, PL, 0.3, M.brick, { y: PL / 2, z: -D / 2 - 0.06 });
  [-1, 1].forEach(s => bx.box(0.3, PL, D + 0.6, M.brick, { x: s * (W / 2 + 0.06), y: PL / 2 }));
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => bx.box(0.16, WH, 0.16, M.trim, { x: sx * (W / 2 + 0.1), y: WH / 2, z: sz * (D / 2 + 0.1) }));
  bx.box(W + 0.5, 0.18, TH + 0.1, M.trim, { y: WH - 0.09, z: D / 2 }); bx.box(W + 0.5, 0.18, TH + 0.1, M.trim, { y: WH - 0.09, z: -D / 2 });
  [-1, 1].forEach(s => bx.box(TH + 0.1, 0.18, D + 0.5, M.trim, { x: s * W / 2, y: WH - 0.09 }));
  [-1, 1].forEach(s => {
    const gs = new THREE.Shape(); gs.moveTo(-D / 2 - 0.2, 0); gs.lineTo(D / 2 + 0.2, 0); gs.lineTo(0, RISE - 0.02); gs.closePath();
    bx.add(new THREE.ShapeGeometry(gs), new THREE.MeshBasicMaterial(), {}); /* placeholder removed below */
    bx.map.delete([...bx.map.keys()].pop());
    bx.add(new THREE.ShapeGeometry(gs), M.plaster, { x: s * (W / 2 - 0.02), y: WH, ry: s * Math.PI / 2 });
    bx.cyl(0.38, 0.38, 0.06, 20, M.trim, { x: s * (W / 2 + 0.03), y: WH + 1.05, rz: Math.PI / 2 });
    bx.cyl(0.3, 0.3, 0.07, 20, M.dark, { x: s * (W / 2 + 0.04), y: WH + 1.05, rz: Math.PI / 2 });
    for (let k = -2; k <= 2; k++) bx.box(0.08, 0.02, 0.5, M.trim, { x: s * (W / 2 + 0.07), y: WH + 1.05 + k * 0.1 });
  });

  /* Roof: slabs, ridge, fascia, rakes, gutters, downspouts, chimney, vane. */
  [-1, 1].forEach(s => {
    bx.box(W + 1.2, 0.2, SLOPE, M.roof, { y: WH + RISE / 2, z: s * HALF / 2, rx: s * ANG });
    bx.box(W + 1.3, 0.22, 0.07, M.trim, { y: WH - 0.02, z: s * (HALF + 0.02) });
    bx.cyl(0.06, 0.06, W + 1.3, 10, M.metal, { y: WH - 0.2, z: s * (HALF + 0.1), rz: Math.PI / 2 });
    [-1, 1].forEach(sx => {
      bx.box(0.07, 0.22, SLOPE + 0.1, M.trim, { x: sx * (W / 2 + 0.6), y: WH + RISE / 2, z: s * HALF / 2, rx: s * ANG });
      bx.cyl(0.045, 0.045, WH - 0.3, 8, M.metal, { x: sx * (W / 2 + 0.28), y: (WH - 0.3) / 2, z: s * (D / 2 + 0.28) });
      bx.cyl(0.04, 0.04, HALF + 0.1 - D / 2 - 0.28, 8, M.metal, { x: sx * (W / 2 + 0.28), y: WH - 0.25, z: s * ((HALF + 0.1 + D / 2 + 0.28) / 2), rx: Math.PI / 2 });
    });
  });
  bx.box(W + 1.35, 0.14, 0.34, M.roof, { y: WH + RISE + 0.03 });
  bx.box(0.9, 2.6, 0.9, M.brick, { x: 3.6, y: WH + 1.6, z: -1.2 });
  bx.box(1.1, 0.12, 1.1, M.stone, { x: 3.6, y: WH + 2.95, z: -1.2 });
  [-0.2, 0.2].forEach(dx => bx.cyl(0.1, 0.12, 0.35, 10, M.pot, { x: 3.6 + dx, y: WH + 3.18, z: -1.2 }));
  bx.cyl(0.015, 0.015, 1.2, 6, M.brass, { x: -3, y: WH + RISE + 0.7 }); bx.box(0.5, 0.06, 0.03, M.brass, { x: -3, y: WH + RISE + 1.15 }); bx.cone(0.07, 0.2, 4, M.brass, { x: -2.7, y: WH + RISE + 1.15, rz: -Math.PI / 2 });

  /* Porch with canopy, columns, steps. */
  const PH = 2.95, RP = 0.9, HW = 2.0, SLP = Math.hypot(HW, RP), AP = Math.atan2(RP, HW);
  bx.box(3.9, 0.12, 2.4, M.stone, { y: 0.06, z: D / 2 + 1.35 });
  bx.box(3.5, 0.09, 0.5, M.stone, { y: 0.045, z: D / 2 + 2.75 }); bx.box(3.2, 0.06, 0.5, M.stone, { y: 0.03, z: D / 2 + 3.2 });
  [-1, 1].forEach(s => {
    bx.box(SLP, 0.12, 2.6, M.roof, { x: s * HW / 2, y: PH + RP / 2, z: D / 2 + 1.25, rz: -s * AP });
    bx.cyl(0.09, 0.11, PH, 14, M.trim, { x: s * 1.65, y: PH / 2 + 0.06, z: D / 2 + 2.35 });
    bx.box(0.26, 0.09, 0.26, M.trim, { x: s * 1.65, y: 0.1, z: D / 2 + 2.35 }); bx.box(0.22, 0.08, 0.22, M.trim, { x: s * 1.65, y: PH + 0.05, z: D / 2 + 2.35 });
    bx.cyl(0.2, 0.17, 0.3, 14, M.pot2, { x: s * 2.3, y: 0.27, z: D / 2 + 2.2 }); bx.sph(0.3, M.plant, { x: s * 2.3, y: 0.62, z: D / 2 + 2.2, sy: 0.9 }, 10, 8);
  });
  bx.box(3.7, 0.14, 0.14, M.trim, { y: PH + 0.1, z: D / 2 + 2.35 });
  { const ts = new THREE.Shape(); ts.moveTo(-HW + 0.05, 0); ts.lineTo(HW - 0.05, 0); ts.lineTo(0, RP - 0.05); ts.closePath(); bx.add(new THREE.ShapeGeometry(ts), M.trim, { y: PH + 0.06, z: D / 2 + 2.52 }); }
  bx.box(1.5, 0.02, 0.9, M.forest, { y: 0.13, z: D / 2 + 1.6 });
  for (let k = 0; k < 6; k++) bx.box(1.5, 0.022, 0.05, M.brass, { y: 0.14, z: D / 2 + 1.2 + k * 0.15 });

  /* Foundation slab hidden under the floor. */
  bx.box(W + 0.9, 0.3, D + 0.9, M.stone, { y: -0.14 });

  /* Door leaf: its own group so it can swing. */
  const doorPivot = new THREE.Group(); doorPivot.position.set(-DW / 2, 0, D / 2); house.add(doorPivot);
  {
    const bd = new Builder();
    bd.box(DW - 0.04, DH - 0.03, 0.08, M.forest, { x: DW / 2, y: DH / 2 });
    [-1, 1].forEach(sz => {
      [0.3, 1.55].forEach((y, r) => [0.4, 1.1].forEach(x => bd.box(0.5, r ? 0.55 : 0.85, 0.02, M.shutter, { x: x, y: y + (r ? 0.3 : 0.55), z: sz * 0.045 })));
      bd.cyl(0.012, 0.012, 0.16, 8, M.brass, { x: DW - 0.17, y: 1.1, z: sz * 0.085, rz: Math.PI / 2 });
      bd.box(0.04, 0.2, 0.012, M.brass, { x: DW - 0.1, y: 1.1, z: sz * 0.05 });
    });
    bd.tor(0.07, 0.012, M.brass, { x: DW / 2, y: 1.85, z: 0.06 }); bd.box(0.24, 0.05, 0.015, M.brass, { x: DW / 2, y: 1.5, z: 0.05 });
    bd.sph(0.016, M.brass, { x: DW / 2, y: 1.7, z: 0.06 }, 6, 5);
    [0.3, 1.1, 2.0].forEach(y => bd.cyl(0.02, 0.02, 0.1, 8, M.brass, { x: 0.02, y, z: 0 }));
    bd.build(doorPivot);
  }

  /* ---------- Garden ---------- */
  /* Pavers from the porch to the gate. */
  for (let i = 0; i < 14; i++) bg.box(0.95, 0.07, 0.58, M.stone, { x: rr(-0.06, 0.06), y: 0.06, z: D / 2 + 3.9 + i * 0.72, ry: rr(-0.05, 0.05) });
  /* Low stone wall, pillars, gate. */
  const WZ = 16.5;
  [[-9.5, 16], [9.5, 16]].forEach(([cx, len]) => bg.box(len, 0.85, 0.35, M.stone, { x: cx - Math.sign(cx) * 0.5 - (Math.sign(cx) * (len - 16)) / 2, y: 0.425, z: WZ }));
  [-1.7, 1.7, -17.6, -12, -6, 6, 12, 17.6].forEach(x => {
    bg.box(0.55, 1.15, 0.55, M.stone, { x, y: 0.575, z: WZ }); bg.box(0.7, 0.1, 0.7, M.trim, { x, y: 1.2, z: WZ });
  });
  [-1.7, 1.7].forEach(x => { bg.sph(0.16, M.lamp, { x, y: 1.4, z: WZ }, 12, 8); });
  [-1, 1].forEach(s => {
    bg.at({ x: s * 1.45, z: WZ, ry: s * 1.05 }, b => {
      b.box(0.05, 0.9, 0.05, M.forest, { x: -s * 0.0, y: 0.5, z: 0 });
      for (let k = 0; k < 9; k++) b.box(0.025, 0.85, 0.025, M.forest, { x: -s * (0.14 + k * 0.14), y: 0.5 });
      b.box(1.3, 0.05, 0.04, M.forest, { x: -s * 0.7, y: 0.9 }); b.box(1.3, 0.05, 0.04, M.forest, { x: -s * 0.7, y: 0.15 });
    });
  });
  /* Hedges at the sides and back. */
  [-17.6, 17.6].forEach(x => bg.box(0.9, 1.1, WZ * 2 - 1.2, M.leaf, { x, y: 0.55, z: 0 }));
  bg.box(36, 1.2, 0.9, M.leaf, { y: 0.6, z: -15.6 });
  /* Flower beds, shrubs, boxwood balls. */
  [-1, 1].forEach(s => {
    const cx = s * 3.9;
    bg.box(3.8, 0.22, 0.8, M.soil, { x: cx, y: 0.11, z: D / 2 + 0.95 });
    const n = hi ? 46 : 16;
    for (let k = 0; k < n; k++) {
      const x = cx + rr(-1.85, 1.85), z = D / 2 + 0.95 + rr(-0.35, 0.35);
      bg.sph(rr(0.05, 0.08), pick([M.f1, M.f2, M.f3, M.f4]), { x, y: rr(0.3, 0.55), z }, 6, 5);
      if (hi) bg.cyl(0.006, 0.006, 0.3, 4, M.plant, { x, y: 0.28, z });
    }
    for (let k = 0; k < (hi ? 5 : 3); k++) bg.sph(rr(0.28, 0.42), k % 2 ? M.plant : M.plant2, { x: cx + (k - 2) * 0.72, y: 0.4, z: D / 2 + 0.75, sy: 0.85 }, 10, 8);
  });
  for (let i = 0; i < 6; i++) [-1, 1].forEach(s => { bg.cyl(0.14, 0.12, 0.2, 10, M.pot, { x: s * 1.15, y: 0.1, z: D / 2 + 4.2 + i * 2.1 }); bg.sph(0.34, M.plant, { x: s * 1.15, y: 0.45, z: D / 2 + 4.2 + i * 2.1 }, 10, 8); });
  /* Lamp posts along the path. */
  [-1, 1].forEach(s => [10.5, 13.5].forEach(z => { bg.cyl(0.04, 0.05, 1.1, 8, M.forest, { x: s * 1.75, y: 0.55, z }); bg.sph(0.12, M.lamp, { x: s * 1.75, y: 1.2, z }, 12, 8); bg.cone(0.17, 0.14, 8, M.forest, { x: s * 1.75, y: 1.38, z }); }));
  /* Bench, bird bath, mailbox. */
  bg.at({ x: -9, y: 0, z: 9.2, ry: 0.35 }, b => { b.box(1.5, 0.06, 0.45, M.wood, { y: 0.45 }); b.box(1.5, 0.5, 0.05, M.wood, { y: 0.75, z: -0.2, rx: -0.15 }); [-0.65, 0.65].forEach(x => b.box(0.06, 0.45, 0.45, M.forest, { x, y: 0.22 })); });
  bg.cyl(0.12, 0.18, 0.7, 12, M.stone, { x: 9.5, y: 0.35, z: 10.5 }); bg.cyl(0.42, 0.18, 0.12, 16, M.stone, { x: 9.5, y: 0.76, z: 10.5 });
  bg.box(0.34, 0.24, 0.18, M.forest, { x: 1.7, y: 0.95, z: WZ + 0.3 });
  /* Sign by the gate and survey pegs. */
  bg.at({ x: -4.6, z: WZ + 2.2, ry: 0.2 }, b => { [-1.3, 1.3].forEach(x => b.box(0.14, 2.2, 0.14, M.woodDark, { x, y: 1.1 })); b.box(3.2, 1.7, 0.1, M.forest, { y: 1.6 }); });
  [[-18.5, -16.9], [18.5, -16.9], [18.5, 16.9], [-18.5, 16.9]].forEach(([x, z]) => { bg.box(0.12, 1.1, 0.12, M.brass, { x, y: 0.55, z }); bg.box(0.4, 0.26, 0.02, M.f2, { x: x + 0.22, y: 1.0, z }); });

  /* ---------- Interior ---------- */
  const floor = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(W - 0.2, D - 0.2), (W - 0.2) / 2.2, (D - 0.2) / 2.2), M.floor);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.03; floor.receiveShadow = true; house.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, D - 0.2), M.ceil);
  ceil.rotation.x = Math.PI / 2; ceil.position.y = WH - 0.02; house.add(ceil);
  [-3.6, 0, 3.6].forEach(x => bi.box(0.18, 0.22, D - 0.5, M.woodDark, { x, y: WH - 0.13 }));

  /* Skirting, crown, wainscot. */
  const IN = TH / 2 + 0.015;
  [[-3.4, 1], [3.4, 1]].forEach(([x]) => { bi.box(5.1, 0.12, 0.03, M.trim, { x: x * 1.0 + (x < 0 ? -0.3 : 0.3), y: 0.09, z: D / 2 - IN }); });
  bi.box(W - 0.4, 0.12, 0.03, M.trim, { y: 0.09, z: -D / 2 + IN });
  [-1, 1].forEach(s => bi.box(0.03, 0.12, D - 0.4, M.trim, { x: s * (W / 2 - IN), y: 0.09 }));
  bi.box(W - 0.4, 0.09, 0.05, M.trim, { y: WH - 0.07, z: -D / 2 + IN }); bi.box(W - 0.4, 0.09, 0.05, M.trim, { y: WH - 0.07, z: D / 2 - IN });
  [-1, 1].forEach(s => bi.box(0.05, 0.09, D - 0.4, M.trim, { x: s * (W / 2 - IN), y: WH - 0.07 }));
  bi.box(W - 0.5, 0.82, 0.03, M.cream, { y: 0.5, z: -D / 2 + IN + 0.015 }); bi.box(W - 0.5, 0.045, 0.06, M.trim, { y: 0.93, z: -D / 2 + IN + 0.02 });
  if (hi) for (let k = 0; k < 22; k++) bi.box(0.03, 0.82, 0.035, M.trim, { x: -W / 2 + 0.6 + k * 0.5, y: 0.5, z: -D / 2 + IN + 0.03 });

  const art = (parent, i, w, h) => {
    const m = new THREE.MeshStandardMaterial({ map: T.art[i], roughness: 0.7 });
    const mm = hi ? m : new THREE.MeshLambertMaterial({ map: T.art[i] });
    parent.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), mm)); return mm;
  };
  const frameAt = (x, y, z, ry, i, w = 0.7, h = 0.9) => {
    bi.at({ x, y, z, ry }, b => { b.box(w + 0.1, h + 0.1, 0.04, M.woodDark, { z: 0 }); });
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; const p = new THREE.Group(); p.position.z = 0.025; g.add(p); art(p, i, w, h); house.add(g);
  };
  frameAt(-5.82, 1.75, -3.55, Math.PI / 2, 0); frameAt(-5.82, 1.75, -2.8 - 3.2 + 6.9 - 1.4, Math.PI / 2, 2, 0.55, 0.7); frameAt(5.82, 1.6, 3.45, -Math.PI / 2, 1, 0.9, 0.7);
  frameAt(0.9, 1.8, -D / 2 + 0.17, 0, 1, 0.5, 0.65);

  /* Hall: runner, console, mirror, lamp. */
  bi.plane(1.2, 3.2, M.runner, { y: 0.045, z: 2.9, rx: -Math.PI / 2 });
  bi.at({ x: -1.75, z: D / 2 - 0.4 }, b => {
    b.rbox(1.2, 0.05, 0.34, 0.015, M.wood, { y: 0.8 }); b.box(1.1, 0.03, 0.28, M.wood, { y: 0.25 });
    [[-0.5, -0.12], [0.5, -0.12], [-0.5, 0.12], [0.5, 0.12]].forEach(([x, z]) => b.cyl(0.014, 0.01, 0.78, 6, M.wood, { x, y: 0.4, z }));
    b.cyl(0.07, 0.06, 0.16, 12, M.pot2, { x: -0.35, y: 0.9 }); b.sph(0.13, M.plant, { x: -0.35, y: 1.08, sy: 1.1 }, 8, 6);
    b.cyl(0.05, 0.07, 0.2, 12, M.brass, { x: 0.35, y: 0.92 }); b.cone(0.13, 0.17, 14, M.lamp, { x: 0.35, y: 1.12 });
  });
  bi.at({ x: -1.75, y: 1.7, z: D / 2 - IN - 0.02, ry: Math.PI }, b => { b.cyl(0.36, 0.36, 0.03, 28, M.mirror, { rx: Math.PI / 2 }); b.tor(0.37, 0.025, M.brass, {}); });

  /* Living: rug, sofa, armchair, table, lamp, TV, bookshelf, plants. */
  bi.plane(3.8, 2.6, M.rug, { x: -3.4, y: 0.045, z: 0.4, rx: -Math.PI / 2 });
  bi.at({ x: -3.5, z: 1.75 }, b => {
    b.rbox(2.7, 0.4, 1.0, 0.08, M.sofa, { y: 0.4 });
    [-1, 0, 1].forEach(i => { b.rbox(0.88, 0.2, 0.86, 0.07, M.sofa, { x: i * 0.9, y: 0.68, z: -0.02 }); b.rbox(0.84, 0.5, 0.2, 0.09, M.sofa, { x: i * 0.9, y: 1.02, z: 0.3, rx: -0.2 }); });
    b.rbox(2.7, 0.66, 0.26, 0.1, M.sofa, { y: 0.9, z: 0.45 });
    [-1, 1].forEach(s => b.rbox(0.26, 0.6, 1.0, 0.09, M.sofa, { x: s * 1.22, y: 0.7 }));
    [[-1.02, 1.0, 0.12, 0.3, M.mustard], [-0.7, 0.95, 0.14, -0.35, M.cream], [1.0, 0.98, 0.12, -0.25, M.mustard]].forEach(([x, y, z, r, m]) => b.rbox(0.42, 0.4, 0.12, 0.05, m, { x, y, z, ry: r, rz: 0.15 }));
    b.rbox(0.9, 0.05, 0.5, 0.02, M.cream, { x: 1.22, y: 1.03, z: -0.05, rz: 0.1 });
    [[-1.2, -0.4], [1.2, -0.4], [-1.2, 0.4], [1.2, 0.4]].forEach(([x, z]) => b.cyl(0.03, 0.02, 0.18, 6, M.wood, { x, y: 0.09, z }));
  });
  bi.at({ x: -3.5, z: -0.2 }, b => {
    b.rbox(1.25, 0.05, 0.7, 0.02, M.wood, { y: 0.42 }); b.box(1.1, 0.03, 0.56, M.wood, { y: 0.14 });
    [[-0.55, -0.28], [0.55, -0.28], [-0.55, 0.28], [0.55, 0.28]].forEach(([x, z]) => b.box(0.04, 0.4, 0.04, M.woodDark, { x, y: 0.2, z }));
    b.box(0.32, 0.04, 0.23, M.bk[1], { x: -0.35, y: 0.47, z: 0.05, ry: 0.2 }); b.box(0.27, 0.035, 0.2, M.bk[4], { x: -0.35, y: 0.51, z: 0.05, ry: -0.1 });
    b.cyl(0.06, 0.05, 0.17, 12, M.white, { x: 0.35, y: 0.53, z: -0.05 }); for (let k = 0; k < 5; k++) b.cyl(0.004, 0.004, 0.3, 4, M.plant, { x: 0.35 + rr(-0.03, 0.03), y: 0.76, z: -0.05 + rr(-0.03, 0.03), rz: rr(-0.4, 0.4) });
    b.cyl(0.13, 0.13, 0.015, 16, M.brass, { x: 0.1, y: 0.455, z: 0.18 }); b.cyl(0.04, 0.04, 0.06, 10, M.white, { x: 0.1, y: 0.49, z: 0.18 });
  });
  bi.at({ x: -1.15, z: -0.6, ry: 1.2 }, b => {
    b.rbox(0.9, 0.36, 0.9, 0.08, M.mustard, { y: 0.34 }); b.rbox(0.8, 0.18, 0.78, 0.07, M.mustard, { y: 0.6, z: -0.02 });
    b.rbox(0.9, 0.7, 0.2, 0.09, M.mustard, { y: 0.85, z: 0.38, rx: -0.12 }); [-1, 1].forEach(s => b.rbox(0.18, 0.5, 0.88, 0.07, M.mustard, { x: s * 0.4, y: 0.6 }));
    [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]].forEach(([x, z]) => b.cyl(0.03, 0.02, 0.16, 6, M.woodDark, { x, y: 0.08, z }));
  });
  bi.at({ x: -1.35, z: -2.0 }, b => { b.cyl(0.26, 0.26, 0.04, 18, M.wood, { y: 0.55 }); b.cyl(0.03, 0.03, 0.55, 8, M.brass, { y: 0.27 }); b.cyl(0.18, 0.2, 0.03, 18, M.brass, { y: 0.02 }); b.cyl(0.04, 0.05, 0.22, 10, M.brass, { x: 0.05, y: 0.68 }); b.cone(0.12, 0.17, 14, M.lamp, { x: 0.05, y: 0.86 }); });
  bi.at({ x: -5.25, z: 0.9 }, b => { b.cyl(0.16, 0.18, 0.03, 16, M.brass, { y: 0.02 }); b.cyl(0.018, 0.018, 1.5, 8, M.brass, { y: 0.78 }); b.cyl(0.2, 0.26, 0.3, 18, M.lamp, { y: 1.6 }); });
  bi.at({ x: -3.5, z: -D / 2 + 0.55 }, b => {
    b.rbox(2.4, 0.5, 0.45, 0.03, M.wood, { y: 0.32 }); [-0.8, 0, 0.8].forEach(x => b.box(0.74, 0.34, 0.012, M.woodDark, { x, y: 0.32, z: 0.23 }));
    [-1.05, 1.05].forEach(x => b.cyl(0.025, 0.015, 0.1, 6, M.dark, { x, y: 0.03 }));
    b.box(1.45, 0.82, 0.04, M.tv, { y: 1.52, z: -0.17 }); b.box(1.0, 0.07, 0.1, M.dark, { y: 0.62, z: 0.04 });
    b.cyl(0.09, 0.07, 0.16, 12, M.pot, { x: -1.0, y: 0.65 }); for (let k = 0; k < 4; k++) b.sph(0.1, M.plant2, { x: -1.0 + rr(-0.07, 0.07), y: 0.78 + k * 0.05, z: rr(-0.05, 0.05), sy: 1.2 }, 8, 6);
  });
  const fiddle = (b, x, z, s = 1) => { b.cyl(0.2 * s, 0.16 * s, 0.4 * s, 14, M.pot2, { x, y: 0.2 * s, z }); b.cyl(0.02, 0.025, 1.3 * s, 6, M.woodDark, { x, y: 1.0 * s, z });
    for (let k = 0; k < (hi ? 14 : 7); k++) b.sph(0.17 * s, M.plant, { x: x + rr(-0.3, 0.3) * s, y: (0.9 + rnd() * 0.9) * s, z: z + rr(-0.3, 0.3) * s, sx: 1, sy: 0.2, sz: 0.75, ry: rnd() * 6, rz: rr(-0.5, 0.5) }, 8, 6); };
  fiddle(bi, -5.35, -3.85, 1.15); fiddle(bi, 5.4, 0.6, 0.9);
  bi.at({ x: -5.72, z: 3.45, ry: Math.PI / 2 }, b => {
    const sw = 1.5, sh = 2.1;
    [-1, 1].forEach(s => b.box(0.04, sh, 0.36, M.wood, { x: s * sw / 2, y: sh / 2 })); b.box(sw, sh, 0.02, M.woodDark, { y: sh / 2, z: -0.17 });
    for (let k = 0; k < 6; k++) b.box(sw, 0.03, 0.34, M.wood, { y: 0.05 + k * 0.4 });
    for (let k = 0; k < 5; k++) { let x = -sw / 2 + 0.06; while (x < sw / 2 - 0.12) { const w = rr(0.03, 0.06), h = rr(0.22, 0.34); b.box(w, h, 0.22, pick(M.bk), { x: x + w / 2, y: 0.065 + k * 0.4 + h / 2, z: 0 }); x += w + 0.004; if (rnd() > 0.93) x += 0.18; } }
  });

  /* Kitchen. */
  const KZ = -D / 2 + IN;
  bi.box(3.1, 0.88, 0.62, M.white, { x: 3.5, y: 0.47, z: KZ + 0.33 }); bi.box(3.18, 0.05, 0.68, M.quartz, { x: 3.5, y: 0.92, z: KZ + 0.35 });
  bi.box(3.1, 0.55, 0.02, M.tile, { x: 3.5, y: 1.22, z: KZ + 0.015 });
  for (let k = 0; k < 5; k++) { bi.box(0.55, 0.7, 0.02, M.cream, { x: 2.2 + k * 0.6, y: 0.5, z: KZ + 0.65 }); bi.cyl(0.012, 0.012, 0.14, 8, M.brass, { x: 2.2 + k * 0.6, y: 0.8, z: KZ + 0.68, rz: Math.PI / 2 }); }
  [-1, 1].forEach(s => { [-0.15, 0.15].forEach(dz => bi.cyl(0.11, 0.11, 0.015, 16, M.dark, { x: 3.4 + s * 0.17, y: 0.95, z: KZ + 0.35 + dz })); });
  bi.box(0.55, 0.025, 0.4, M.dark, { x: 2.35, y: 0.945, z: KZ + 0.35 }); bi.cyl(0.015, 0.015, 0.28, 8, M.silver, { x: 2.35, y: 1.08, z: KZ + 0.15 }); bi.cyl(0.012, 0.012, 0.16, 8, M.silver, { x: 2.35, y: 1.2, z: KZ + 0.23, rx: Math.PI / 2 });
  [[2.5, 0.9], [4.6, 0.95]].forEach(([x, w]) => bi.box(w, 0.8, 0.36, M.cream, { x, y: 1.95, z: KZ + 0.2 }));
  bi.box(0.75, 0.1, 0.5, M.silver, { x: 3.4, y: 1.55, z: KZ + 0.3 }); bi.box(0.25, 1.1, 0.25, M.silver, { x: 3.4, y: 2.3, z: KZ + 0.2 });
  bi.box(0.75, 1.95, 0.7, M.silver, { x: 5.45, y: 0.98, z: KZ + 0.4 }); bi.box(0.02, 0.5, 0.03, M.dark, { x: 5.07, y: 1.1, z: KZ + 0.75 });
  bi.at({ x: 3.4, z: -1.5 }, b => {
    b.rbox(2.3, 0.88, 0.95, 0.03, M.cream, { y: 0.46 }); b.rbox(2.55, 0.05, 1.15, 0.015, M.quartz, { y: 0.93 });
    for (let k = 0; k < 4; k++) b.box(0.52, 0.65, 0.012, M.white, { x: -0.85 + k * 0.57, y: 0.46, z: -0.48 });
    b.cyl(0.14, 0.09, 0.07, 16, M.wood, { x: -0.4, y: 1.0 }); [[0, 0, M.orange], [0.08, 0.03, M.apple], [-0.07, 0.02, M.orange], [0.02, -0.06, M.apple]].forEach(([x, z, m]) => b.sph(0.045, m, { x: -0.4 + x, y: 1.07, z }, 8, 6));
    b.box(0.35, 0.02, 0.22, M.woodDark, { x: 0.5, y: 0.97, z: 0.1 }); b.cyl(0.07, 0.08, 0.14, 12, M.silver, { x: 0.9, y: 1.03, z: -0.2 });
    [-0.7, 0, 0.7].forEach(x => { b.cyl(0.19, 0.19, 0.06, 16, M.wood, { x, y: 0.64, z: 0.85 }); [[-1, -1], [1, -1], [0, 1]].forEach(([a, c]) => b.cyl(0.012, 0.012, 0.62, 5, M.brass, { x: x + a * 0.1, y: 0.31, z: 0.85 + c * 0.1 })); });
    [-0.7, 0, 0.7].forEach(x => { b.cyl(0.004, 0.004, 1.0, 4, M.dark, { x, y: 2.75 }); b.cone(0.2, 0.3, 18, M.forest, { x, y: 2.1 }); b.sph(0.07, M.glow, { x, y: 2.02 }, 8, 6); });
  });

  /* Bedroom: divider, bed, nightstand, bench, rug. */
  for (let k = 0; k < 24; k++) bi.box(0.04, 2.6, 0.07, M.wood, { x: 2.35, y: 1.35, z: 0.9 + k * 0.145 });
  bi.box(0.09, 0.08, 3.5, M.woodDark, { x: 2.35, y: 2.7, z: 2.65 }); bi.box(0.09, 0.08, 3.5, M.woodDark, { x: 2.35, y: 0.06, z: 2.65 });
  bi.plane(2.8, 2.4, M.cream, { x: 4.2, y: 0.045, z: 3.4, rx: -Math.PI / 2 });
  bi.at({ x: 4.75, z: 3.4 }, b => {
    b.rbox(2.25, 0.3, 1.7, 0.03, M.woodDark, { y: 0.28 }); b.rbox(2.1, 0.24, 1.6, 0.06, M.linen, { x: -0.04, y: 0.55 });
    b.rbox(1.45, 0.13, 1.66, 0.06, M.sofa, { x: -0.28, y: 0.72 }); b.rbox(0.45, 0.07, 1.68, 0.03, M.mustard, { x: -0.72, y: 0.78 });
    [-0.4, 0.4].forEach(z => b.rbox(0.36, 0.13, 0.6, 0.06, M.linen, { x: 0.75, y: 0.72, z, rz: 0.12 }));
    b.rbox(0.12, 1.05, 1.95, 0.04, M.sofa, { x: 1.14, y: 0.78 });
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, c]) => b.cyl(0.03, 0.02, 0.14, 6, M.woodDark, { x: a * 1.05, y: 0.07, z: c * 0.78 }));
  });
  bi.at({ x: 5.55, z: 2.0 }, b => { b.rbox(0.38, 0.5, 0.42, 0.02, M.wood, { y: 0.27 }); b.cyl(0.05, 0.07, 0.2, 12, M.brass, { y: 0.62 }); b.cone(0.12, 0.16, 14, M.lamp, { y: 0.8 }); b.box(0.2, 0.03, 0.15, M.bk[2], { x: 0, y: 0.53, z: 0.1 }); });
  bi.at({ x: 3.2, z: 3.4 }, b => { b.rbox(0.42, 0.18, 1.4, 0.05, M.sofa, { y: 0.36 }); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, c]) => b.cyl(0.025, 0.018, 0.27, 6, M.woodDark, { x: a * 0.15, y: 0.13, z: c * 0.6 })); });

  /* Interior lights: bulbs and point lights. */
  const bulbs = [[-3.2, 2.7, 0.4], [3.4, 2.3, -1.4], [4.6, 1.3, 3.0], [0, 2.7, 2.9]];
  bulbs.forEach(([x, y, z], i) => { if (i === 1) return; bi.sph(0.13, M.glow, { x, y, z }, 12, 8); if (y > 2.4) bi.cyl(0.004, 0.004, WH - y, 4, M.dark, { x, y: y + (WH - y) / 2, z }); });
  const lights = [];
  (hi ? bulbs : bulbs.slice(0, 2)).forEach(([x, y, z], i) => {
    const l = new THREE.PointLight(0xffd59a, i === 2 ? 9 : 22, 13, 2); l.position.set(x, y, z); house.add(l); lights.push(l);
  });

  /* Contact shadows ground the furniture where real shadows are unavailable. */
  const blobMat = new THREE.MeshBasicMaterial({ map: T.blob, transparent: true, opacity: 0.8, depthWrite: false, fog: false });
  const blobs = new THREE.Group(); house.add(blobs);
  [[-3.5, 1.75, 3.1, 1.6], [-3.5, -0.2, 1.6, 1.0], [-1.15, -0.6, 1.3, 1.3], [3.4, -1.5, 2.8, 1.5], [4.75, 3.4, 2.6, 2.1], [3.5, -4.0, 3.5, 1.0], [-3.5, -3.9, 2.6, 0.8], [3.4, -0.65, 2.0, 0.7], [5.45, -3.9, 1.0, 1.0], [-1.75, 4.0, 1.4, 0.6]].forEach(([x, z, w, d]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), blobMat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.055, z); blobs.add(m);
  });
  const baseBlob = new THREE.Mesh(new THREE.PlaneGeometry(W + 7, D + 7), blobMat); baseBlob.rotation.x = -Math.PI / 2; baseBlob.position.y = 0.06; root.add(baseBlob);

  /* Sun shafts through the windows (daylight dust-lit air). */
  const shaftMat = new THREE.MeshBasicMaterial({ map: T.shaft, color: 0xffe2b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const shafts = new THREE.Group(); house.add(shafts);
  if (hi) {
    const up = new THREE.Vector3(0, 1, 0), toWin = sunDir.clone();
    [[-3.7, D / 2, 1.9], [3.7, D / 2, 1.9], [W / 2, -1.8, 1.6], [W / 2, 1.8, 1.6]].forEach(([x, z, w]) => {
      const L = 3.2;
      [0, 1].forEach(k => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, L), shaftMat);
        m.quaternion.setFromUnitVectors(up, toWin); if (k) m.rotateY(Math.PI / 2);
        const c = new THREE.Vector3(x, 1.6, z).addScaledVector(toWin, -L / 2 - 0.2); m.position.copy(c); shafts.add(m);
      });
    });
  }
  /* Dust motes drifting in the light. */
  const dustN = hi ? 110 : 0;
  let dust = null; const dustBase = [];
  if (dustN) {
    const g = new THREE.BufferGeometry(), arr = new Float32Array(dustN * 3);
    for (let i = 0; i < dustN; i++) { const p = [rr(-5, 5), rr(0.3, 2.8), rr(-3.6, 3.8)]; dustBase.push(p); arr.set(p, i * 3); }
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    dust = new THREE.Points(g, new THREE.PointsMaterial({ map: T.dust, size: 0.07, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    house.add(dust);
  }
  /* Chimney smoke. */
  const smoke = []; const smokeMat = new THREE.SpriteMaterial({ map: T.cloud, transparent: true, opacity: 0.4, depthWrite: false, color: 0xe8e8e2 });
  for (let i = 0; i < 9; i++) { const s = new THREE.Sprite(smokeMat.clone()); house.add(s); smoke.push(s); }

  bx.build(house); bi.build(house); bg.build(root);

  /* ---------- Per-frame ---------- */
  function update(p, now, dt, camera) {
    sky.position.copy(camera.position);
    clouds.rotation.y = now * 0.00002;
    doorPivot.rotation.y = smooth(0.33, 0.44, p) * 1.8;
    const solid = 0.14 + 0.86 * smooth(0.12, 0.28, p);
    M.roof.opacity = solid; M.ceil.opacity = solid; M.roof.depthWrite = M.ceil.depthWrite = solid > 0.98;
    shaftMat.opacity = 0.5 * smooth(0.4, 0.52, p) * (1 - smooth(0.9, 1, p) * 0.3);
    if (dust) {
      dust.material.opacity = 0.7 * smooth(0.45, 0.56, p);
      const a = dust.geometry.attributes.position;
      for (let i = 0; i < dustN; i++) { const b = dustBase[i]; a.setXYZ(i, b[0] + Math.sin(now / 3000 + i) * 0.25, b[1] + Math.sin(now / 2300 + i * 1.7) * 0.18, b[2] + Math.cos(now / 3500 + i) * 0.22); }
      a.needsUpdate = true;
    }
    smoke.forEach((s, i) => {
      const t = ((now / 5000 + i / smoke.length) % 1);
      s.position.set(3.6 + t * 2.2 + Math.sin(t * 6 + i) * 0.2, WH + 3.4 + t * 5, -1.2 + Math.cos(t * 5 + i) * 0.2);
      s.scale.setScalar(0.5 + t * 2.4); s.material.opacity = 0.4 * Math.sin(t * Math.PI) * (1 - smooth(0.3, 0.4, p) * 0.5);
    });
  }

  function dispose() {
    root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => { Object.values(m).forEach(v => { if (v && v.isTexture) v.dispose(); }); m.dispose(); }); });
    if (scene.environment) scene.environment.dispose();
    scene.remove(root, sky, sun);
  }
  return { update, dispose, fog: scene.fog, door: doorPivot, lights, hasShadows: hi };
}
