import { deflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const OPENPOSE_EDGES = [
  ['neck', 'rShoulder', [255, 85, 0]], ['rShoulder', 'rElbow', [255, 170, 0]], ['rElbow', 'rWrist', [255, 255, 0]],
  ['neck', 'lShoulder', [170, 255, 0]], ['lShoulder', 'lElbow', [85, 255, 0]], ['lElbow', 'lWrist', [0, 255, 0]],
  ['neck', 'rHip', [0, 255, 85]], ['rHip', 'rKnee', [0, 255, 170]], ['rKnee', 'rAnkle', [0, 255, 255]],
  ['neck', 'lHip', [0, 170, 255]], ['lHip', 'lKnee', [0, 85, 255]], ['lKnee', 'lAnkle', [0, 0, 255]],
  ['neck', 'nose', [85, 0, 255]], ['nose', 'rEye', [170, 0, 255]], ['rEye', 'rEar', [255, 0, 255]],
  ['nose', 'lEye', [255, 0, 170]], ['lEye', 'lEar', [255, 0, 85]],
];
const BODY_EDGES = OPENPOSE_EDGES.slice(0, 12).map(([a, b]) => [a, b]);
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1);
    raw[row] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, row + 1);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function createRaster(width, height) {
  const rgba = new Uint8Array(width * height * 4);
  for (let offset = 3; offset < rgba.length; offset += 4) rgba[offset] = 255;
  return rgba;
}

function setPixel(rgba, width, height, x, y, color) {
  const ix = Math.round(x); const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= width || iy >= height) return;
  const offset = (iy * width + ix) * 4;
  rgba[offset] = color[0];
  rgba[offset + 1] = color[1];
  rgba[offset + 2] = color[2];
  rgba[offset + 3] = 255;
}

function drawCircle(rgba, width, height, cx, cy, radius, color) {
  const r = Math.max(1, radius);
  const minX = Math.floor(cx - r); const maxX = Math.ceil(cx + r);
  const minY = Math.floor(cy - r); const maxY = Math.ceil(cy + r);
  const rr = r * r;
  for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
    if ((x - cx) ** 2 + (y - cy) ** 2 <= rr) setPixel(rgba, width, height, x, y, color);
  }
}

function drawLine(rgba, width, height, x0, y0, x1, y1, thickness, color) {
  const dx = x1 - x0; const dy = y1 - y0;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  const radius = Math.max(0.75, thickness / 2);
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    drawCircle(rgba, width, height, x0 + dx * t, y0 + dy * t, radius, color);
  }
}

function pointToPixel(point, width, height) {
  if (!point || point.visible === false || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined;
  if (point.x < -0.15 || point.x > 1.15 || point.y < -0.15 || point.y > 1.15) return undefined;
  return { x: point.x * (width - 1), y: point.y * (height - 1) };
}

function fallbackPoseFromLineart(controls) {
  return (controls?.lineart ?? []).map((actor) => {
    const head = actor.head;
    const center = actor.center;
    const feet = actor.feet;
    const halfShoulder = 0.035;
    const halfHip = 0.02;
    const make = (x, y, visible = true) => ({ x, y, visible, cameraDepthM: 0 });
    return {
      actorId: actor.actorId,
      keypoints: {
        nose: make(head.x, head.y, head.visible), neck: make(center.x, (head.y + center.y) / 2, head.visible || center.visible),
        rShoulder: make(center.x + halfShoulder, center.y - 0.08, center.visible), rElbow: make(center.x + halfShoulder * 1.5, center.y + 0.04, center.visible), rWrist: make(center.x + halfShoulder * 1.6, center.y + 0.17, center.visible),
        lShoulder: make(center.x - halfShoulder, center.y - 0.08, center.visible), lElbow: make(center.x - halfShoulder * 1.5, center.y + 0.04, center.visible), lWrist: make(center.x - halfShoulder * 1.6, center.y + 0.17, center.visible),
        rHip: make(center.x + halfHip, center.y + 0.13, center.visible), rKnee: make(center.x + halfHip, (center.y + feet.y) * 0.62, center.visible || feet.visible), rAnkle: make(feet.x + halfHip, feet.y, feet.visible),
        lHip: make(center.x - halfHip, center.y + 0.13, center.visible), lKnee: make(center.x - halfHip, (center.y + feet.y) * 0.62, center.visible || feet.visible), lAnkle: make(feet.x - halfHip, feet.y, feet.visible),
        rEye: make(head.x + 0.008, head.y - 0.006, head.visible), lEye: make(head.x - 0.008, head.y - 0.006, head.visible),
        rEar: make(head.x + 0.018, head.y, head.visible), lEar: make(head.x - 0.018, head.y, head.visible),
      },
    };
  });
}

function projectedActors(controls) {
  return Array.isArray(controls?.pose2d) && controls.pose2d.length ? controls.pose2d : fallbackPoseFromLineart(controls);
}

function actorDepthIntensity(controls, actorId) {
  const depth = (controls?.depth ?? []).find((item) => item.actorId === actorId);
  const normalized = Math.min(1, Math.max(0, Number(depth?.normalized ?? 0.5)));
  return Math.round(245 - normalized * 190);
}

function renderPose(controls, width, height) {
  const rgba = createRaster(width, height);
  const thickness = Math.max(2, Math.round(Math.min(width, height) * 0.007));
  const jointRadius = Math.max(2, Math.round(thickness * 0.65));
  for (const actor of projectedActors(controls)) {
    for (const [fromId, toId, color] of OPENPOSE_EDGES) {
      const from = pointToPixel(actor.keypoints?.[fromId], width, height);
      const to = pointToPixel(actor.keypoints?.[toId], width, height);
      if (from && to) drawLine(rgba, width, height, from.x, from.y, to.x, to.y, thickness, color);
    }
    for (const point of Object.values(actor.keypoints ?? {})) {
      const pixel = pointToPixel(point, width, height);
      if (pixel) drawCircle(rgba, width, height, pixel.x, pixel.y, jointRadius, [255, 255, 255]);
    }
  }
  return encodePng(width, height, rgba);
}

function renderDepth(controls, width, height) {
  const rgba = createRaster(width, height);
  const bodyThickness = Math.max(10, Math.round(Math.min(width, height) * 0.035));
  for (const actor of projectedActors(controls)) {
    const value = actorDepthIntensity(controls, actor.actorId);
    const color = [value, value, value];
    for (const [fromId, toId] of BODY_EDGES) {
      const from = pointToPixel(actor.keypoints?.[fromId], width, height);
      const to = pointToPixel(actor.keypoints?.[toId], width, height);
      if (from && to) drawLine(rgba, width, height, from.x, from.y, to.x, to.y, bodyThickness, color);
    }
    const nose = pointToPixel(actor.keypoints?.nose, width, height);
    const neck = pointToPixel(actor.keypoints?.neck, width, height);
    if (nose) drawCircle(rgba, width, height, nose.x, nose.y, bodyThickness * 0.75, color);
    if (neck) drawCircle(rgba, width, height, neck.x, neck.y, bodyThickness * 0.6, color);
  }
  return encodePng(width, height, rgba);
}

function renderLineart(controls, width, height) {
  const rgba = createRaster(width, height);
  const thickness = Math.max(1.5, Math.min(width, height) * 0.004);
  const white = [255, 255, 255];
  for (const actor of projectedActors(controls)) {
    for (const [fromId, toId] of BODY_EDGES) {
      const from = pointToPixel(actor.keypoints?.[fromId], width, height);
      const to = pointToPixel(actor.keypoints?.[toId], width, height);
      if (from && to) drawLine(rgba, width, height, from.x, from.y, to.x, to.y, thickness, white);
    }
    const nose = pointToPixel(actor.keypoints?.nose, width, height);
    const neck = pointToPixel(actor.keypoints?.neck, width, height);
    if (nose && neck) {
      const headRadius = Math.max(3, Math.hypot(nose.x - neck.x, nose.y - neck.y) * 0.55);
      const segments = 28;
      let previous;
      for (let i = 0; i <= segments; i += 1) {
        const angle = (i / segments) * Math.PI * 2;
        const current = { x: nose.x + Math.cos(angle) * headRadius, y: nose.y + Math.sin(angle) * headRadius };
        if (previous) drawLine(rgba, width, height, previous.x, previous.y, current.x, current.y, thickness, white);
        previous = current;
      }
    }
    const rs = pointToPixel(actor.keypoints?.rShoulder, width, height); const ls = pointToPixel(actor.keypoints?.lShoulder, width, height);
    const rh = pointToPixel(actor.keypoints?.rHip, width, height); const lh = pointToPixel(actor.keypoints?.lHip, width, height);
    if (rs && ls) drawLine(rgba, width, height, rs.x, rs.y, ls.x, ls.y, thickness, white);
    if (rh && lh) drawLine(rgba, width, height, rh.x, rh.y, lh.x, lh.y, thickness, white);
    if (rs && rh) drawLine(rgba, width, height, rs.x, rs.y, rh.x, rh.y, thickness, white);
    if (ls && lh) drawLine(rgba, width, height, ls.x, ls.y, lh.x, lh.y, thickness, white);
  }
  return encodePng(width, height, rgba);
}

export function renderStageControlMaps(controls, width, height) {
  const safeWidth = Math.min(4096, Math.max(64, Math.round(Number(width) || 1280)));
  const safeHeight = Math.min(4096, Math.max(64, Math.round(Number(height) || 720)));
  return {
    width: safeWidth,
    height: safeHeight,
    pose: renderPose(controls, safeWidth, safeHeight),
    depth: renderDepth(controls, safeWidth, safeHeight),
    lineart: renderLineart(controls, safeWidth, safeHeight),
  };
}
