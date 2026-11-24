// Only CHIP's own page may read its server (Elleta, 9 Nov). A browser marks a
// request from another site with its Origin, and a site rebound to 127.0.0.1
// with the wrong Host. Tools with no Origin (the chip CLI, curl) carry on.
// Every route sits behind this, /ask included; server/test/origin.test.mjs proves it.
export function appOrigins(port) {
  return new Set([
    'http://127.0.0.1:5173', 'http://localhost:5173', `http://127.0.0.1:${port}`, `http://localhost:${port}`,
    `http://chip.localhost:${port}`,
  ]);
}

export function onlyChip(origins) {
  const hosts = new Set([...origins].map((o) => new URL(o).host));
  return (req, res, next) => {
    const origin = req.get('origin');
    if ((origin && !origins.has(origin)) || !hosts.has(req.get('host'))) {
      return res.status(403).json({ error: 'origin not allowed' });
    }
    next();
  };
}
