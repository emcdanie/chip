// Measures a rendered specimen and lays out its anatomy: zones, anchors and
// pins in ONE coordinate space (the frame around the specimen), so lines,
// dots and pins stay aligned at any size. Parts come from bella.json; this
// file only measures where their targets are.

const PIN_GAP = 48; // distance of a pin row from the specimen edge, in frame space

export function targetsOf(root, selector) {
  if (!root) return [];
  if (selector === ':scope') return [root];
  return [...root.querySelectorAll(selector)];
}

function unionRect(els, origin) {
  const rs = els.map((el) => el.getBoundingClientRect()).filter((r) => r.width || r.height);
  if (!rs.length) return null;
  const left = Math.min(...rs.map((r) => r.left)) - origin.left;
  const top = Math.min(...rs.map((r) => r.top)) - origin.top;
  const right = Math.max(...rs.map((r) => r.right)) - origin.left;
  const bottom = Math.max(...rs.map((r) => r.bottom)) - origin.top;
  return { left, top, right, bottom };
}

function zoneRect(rect, zone = {}) {
  if (zone.edge === 'bottom') {
    const size = zone.size ?? 8;
    return { left: rect.left, right: rect.right, top: rect.bottom, bottom: rect.bottom + size };
  }
  const n = zone.inset ?? 0;
  return { left: rect.left + n, top: rect.top + n, right: rect.right - n, bottom: rect.bottom - n };
}

/** Returns { width, height, parts: [{...part, zone, anchor, pin, below}] } in frame space, or null. */
export function layout(frame, parts) {
  if (!frame) return null;
  const origin = frame.getBoundingClientRect();
  const root = frame.querySelector('[data-bella-component]');
  const spec = root ? root.getBoundingClientRect() : null;
  if (!root || !spec) return null;
  const specBox = { left: spec.left - origin.left, right: spec.right - origin.left, top: spec.top - origin.top, bottom: spec.bottom - origin.top };

  const measured = parts
    .map((p) => {
      const r = unionRect(targetsOf(root, p.target), origin);
      return r ? { ...p, zone: zoneRect(r, p.zone) } : null;
    })
    .filter(Boolean);

  // rows: bottom-edge zones go below; the rest alternate, top first, in x order
  const byX = [...measured].sort(
    (a, b) => (a.zone.left + a.zone.right) / 2 - (b.zone.left + b.zone.right) / 2 || a.n - b.n
  );
  let flip = false;
  for (const p of byX) {
    p.below = p.zone.top >= specBox.bottom - 1 ? true : flip;
    if (p.zone.top < specBox.bottom - 1) flip = !flip;
  }

  const width = origin.width;
  const height = origin.height;
  for (const row of [byX.filter((p) => !p.below), byX.filter((p) => p.below)]) {
    const span = specBox.right - specBox.left;
    row.forEach((p, i) => {
      const x = specBox.left + ((i + 0.5) * span) / row.length;
      const y = p.below ? specBox.bottom + PIN_GAP : specBox.top - PIN_GAP;
      const ax = Math.min(Math.max(x, p.zone.left + 6), p.zone.right - 6);
      const ay = p.zone.top >= specBox.bottom - 1 ? (p.zone.top + p.zone.bottom) / 2 : p.below ? p.zone.bottom : p.zone.top;
      p.pin = [x, y];
      p.anchor = [ax, ay];
    });
  }
  return { width, height, parts: measured.sort((a, b) => a.n - b.n) };
}
