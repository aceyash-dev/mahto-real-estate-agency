/* Geometry batcher: collects many primitives, merges them per material into a few draw calls.
   UVs are generated in local space so textures keep a true metric scale (material.userData.tile, metres). */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const KEEP = ["position", "normal", "uv"];
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();

function localUV(g, tile) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) { u = p.getX(i); v = p.getZ(i); }
    else if (nx >= nz) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

export class Builder {
  constructor() { this.map = new Map(); this.stack = [new THREE.Matrix4()]; }

  /* Run fn with a nested transform applied to everything added inside. */
  at(t, fn) {
    const m = new THREE.Matrix4().compose(_p.set(t.x || 0, t.y || 0, t.z || 0), _q.setFromEuler(_e.set(t.rx || 0, t.ry || 0, t.rz || 0)), _s.set(1, 1, 1));
    this.stack.push(this.stack[this.stack.length - 1].clone().multiply(m));
    fn(this);
    this.stack.pop();
  }

  add(geo, mat, o = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    Object.keys(g.attributes).forEach(k => { if (!KEEP.includes(k)) g.deleteAttribute(k); });
    if (mat.userData.tile) localUV(g, mat.userData.tile);
    const local = new THREE.Matrix4().compose(
      _p.set(o.x || 0, o.y || 0, o.z || 0), _q.setFromEuler(_e.set(o.rx || 0, o.ry || 0, o.rz || 0)), _s.set(o.sx || 1, o.sy || 1, o.sz || 1));
    g.applyMatrix4(this.stack[this.stack.length - 1].clone().multiply(local));
    if (!this.map.has(mat)) this.map.set(mat, []);
    this.map.get(mat).push(g);
    return this;
  }
  box(w, h, d, mat, o) { return this.add(new THREE.BoxGeometry(w, h, d), mat, o); }
  rbox(w, h, d, r, mat, o) { return this.add(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)), mat, o); }
  cyl(rt, rb, h, seg, mat, o) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), mat, o); }
  sph(r, mat, o, ws = 12, hs = 8) { return this.add(new THREE.SphereGeometry(r, ws, hs), mat, o); }
  cone(r, h, seg, mat, o) { return this.add(new THREE.ConeGeometry(r, h, seg), mat, o); }
  plane(w, h, mat, o) { return this.add(new THREE.PlaneGeometry(w, h), mat, o); }
  tor(r, t, mat, o) { return this.add(new THREE.TorusGeometry(r, t, 8, 20), mat, o); }

  build(parent) {
    const meshes = [];
    this.map.forEach((arr, mat) => {
      const merged = mergeGeometries(arr, false);
      if (!merged) return;
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = !mat.userData.noShadow;
      m.receiveShadow = true;
      parent.add(m);
      meshes.push(m);
    });
    this.map.clear();
    return meshes;
  }
}
