import fs from "node:fs";
import vm from "node:vm";
import { Box3, Euler, Matrix4, Quaternion, Vector3 } from "three";

// Dezelfde lokale JS-decoder als de browser; alleen geometrie, geen texturen.
const decoderFactory = vm.runInNewContext(
  fs.readFileSync(new URL("../../node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.js", import.meta.url), "utf8") + "\nDracoDecoderModule;",
  { console, setTimeout, clearTimeout }
);
const draco = await decoderFactory();

// Zestien steunlijnen geven een kleine, omsluitende botsingsvorm. Anders dan
// punten weglaten uit een hull snijdt dit geen stukken van het model af.
export function coarseOutline(points) {
  const count = 16;
  const planes = Array.from({ length: count }, (_, i) => {
    const angle = i * Math.PI * 2 / count;
    return { x: Math.cos(angle), z: Math.sin(angle), d: -Infinity };
  });
  for (const p of points) for (const n of planes) n.d = Math.max(n.d, p.x * n.x + p.z * n.z);
  if (!planes.every(n => Number.isFinite(n.d))) return [];
  return planes.map((a, i) => {
    const b = planes[(i + 1) % count];
    const determinant = a.x * b.z - a.z * b.x;
    return { x: (a.d * b.z - a.z * b.d) / determinant, z: (a.x * b.d - a.d * b.x) / determinant };
  }).filter((p, i, all) => Math.hypot(p.x - all[(i + 1) % count].x, p.z - all[(i + 1) % count].z) > 1e-7);
}

export function readModelCollision(data) {
  if (data.toString("utf8", 0, 4) !== "glTF") throw new Error("Invalid GLB");
  let json, binary;
  for (let offset = 12; offset + 8 <= data.length;) {
    const length = data.readUInt32LE(offset);
    const type = data.readUInt32LE(offset + 4);
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    if (chunk.length !== length) throw new Error("Incomplete GLB");
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8"));
    if (type === 0x004e4942) binary = chunk;
    offset += 8 + length;
  }
  if (!json || !binary) throw new Error("Missing GLB geometry");
  const points = [];
  const bounds = new Box3();
  const vertex = new Vector3();
  const viewBytes = (id) => {
    const view = json.bufferViews[id];
    if (view.buffer !== 0) throw new Error("External geometry buffer");
    return binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
  };
  const add = (x, y, z, matrix) => {
    vertex.set(x, y, z).applyMatrix4(matrix);
    if (![vertex.x, vertex.y, vertex.z].every(Number.isFinite)) throw new Error("Invalid vertex");
    bounds.expandByPoint(vertex);
    points.push({ x: vertex.x, z: vertex.z });
  };
  const visit = (id, parent, ancestors = new Set()) => {
    if (ancestors.has(id)) throw new Error("Cyclic GLB nodes");
    const node = json.nodes[id];
    const matrix = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(
      new Vector3().fromArray(node.translation || [0, 0, 0]),
      new Quaternion().fromArray(node.rotation || [0, 0, 0, 1]),
      new Vector3().fromArray(node.scale || [1, 1, 1])
    );
    matrix.premultiply(parent);
    for (const primitive of json.meshes?.[node.mesh]?.primitives || []) {
      const compressed = primitive.extensions?.KHR_draco_mesh_compression;
      if (compressed) {
        const decoder = new draco.Decoder();
        const mesh = new draco.Mesh();
        const buffer = new draco.DecoderBuffer();
        const values = new draco.DracoFloat32Array();
        let status;
        try {
          const bytes = viewBytes(compressed.bufferView);
          buffer.Init(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), bytes.length);
          status = decoder.DecodeBufferToMesh(buffer, mesh);
          if (!status.ok()) throw new Error(status.error_msg());
          const attribute = decoder.GetAttributeByUniqueId(mesh, compressed.attributes.POSITION);
          if (!attribute?.ptr || !decoder.GetAttributeFloatForAllPoints(mesh, attribute, values)) throw new Error("Missing Draco positions");
          for (let i = 0; i < mesh.num_points(); i++) add(values.GetValue(i * 3), values.GetValue(i * 3 + 1), values.GetValue(i * 3 + 2), matrix);
        } finally {
          for (const object of [status, values, buffer, mesh, decoder]) if (object) draco.destroy(object);
        }
      } else {
        const accessor = json.accessors?.[primitive.attributes?.POSITION];
        if (!accessor) continue;
        // Ongebruikelijke/sparse encodings blijven veilig op hun accessor-grenzen.
        if (accessor.componentType !== 5126 || accessor.sparse || accessor.bufferView === undefined) {
          if (!accessor.min || !accessor.max) throw new Error("Missing position bounds");
          for (const x of [accessor.min[0], accessor.max[0]]) for (const y of [accessor.min[1], accessor.max[1]]) for (const z of [accessor.min[2], accessor.max[2]]) add(x, y, z, matrix);
        } else {
          const bytes = viewBytes(accessor.bufferView);
          const stride = json.bufferViews[accessor.bufferView].byteStride || 12;
          for (let i = 0; i < accessor.count; i++) {
            const offset = (accessor.byteOffset || 0) + i * stride;
            add(bytes.readFloatLE(offset), bytes.readFloatLE(offset + 4), bytes.readFloatLE(offset + 8), matrix);
          }
        }
      }
    }
    const next = new Set(ancestors).add(id);
    for (const child of node.children || []) visit(child, matrix, next);
  };
  for (const id of json.scenes?.[json.scene || 0]?.nodes || []) visit(id, new Matrix4());
  const outline = coarseOutline(points);
  return outline.length >= 3 ? { points: outline, minY: bounds.min.y, maxY: bounds.max.y } : null;
}

export function transformModelCollision(shape, transform = {}) {
  if (!shape?.points?.length) return null;
  const p = transform.position || {}, r = transform.rotation || {}, s = transform.scale || {};
  const radians = Math.PI / 180;
  const matrix = new Matrix4().compose(new Vector3(p.x || 0, p.y || 0, p.z || 0),
    new Quaternion().setFromEuler(new Euler((r.x || 0) * radians, (r.y || 0) * radians, (r.z || 0) * radians)),
    new Vector3(s.x ?? 1, s.y ?? 1, s.z ?? 1));
  const points = [];
  for (const point of shape.points) for (const y of [shape.minY, shape.maxY]) points.push(new Vector3(point.x, y, point.z).applyMatrix4(matrix));
  // Geen tweede vereenvoudiging bij gewone Y-rotatie: behoud de contour exact.
  if (!r.x && !r.z) return points.filter((_, i) => i % 2 === 0).map(({ x, z }) => ({ x, z }));
  return coarseOutline(points);
}
