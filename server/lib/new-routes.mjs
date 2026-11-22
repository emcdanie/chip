// The routes behind New › Project. Each one that reads dropped text or writes a record refuses other websites:
// a POST or DELETE needs an Origin that is one of CHIP's own (a tool with no Origin is refused too), and a GET
// from another site is refused as well. server/test/new-routes.test.mjs proves it.
import express from 'express';
import { createProject, listFolders, readDropped, readFolder, removeProject, setupPlan } from './project-read.mjs';

export function newRoutes({ origins, ids = () => [], changed = () => {} }) {
  const r = express.Router();
  const ok = (req, res, write) => {
    const o = req.get('origin');
    if (o ? !origins.has(o) : write) {
      res.status(403).json({ error: 'Not from CHIP' });
      return false;
    }
    return true;
  };
  const guarded = (write, fn) => (req, res) => {
    if (!ok(req, res, write)) return;
    try {
      res.status(fn.status ?? 200).json(fn(req));
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message, message: e.message });
    }
  };
  r.post('/projects/read', express.json({ limit: '300kb' }), guarded(true, (req) => {
    const { text, name, folder } = req.body ?? {};
    return typeof folder === 'string' ? readFolder(folder) : readDropped(text, typeof name === 'string' ? name.slice(0, 120) : '');
  }));
  r.get('/projects/folders', guarded(false, (req) => listFolders(typeof req.query.dir === 'string' ? req.query.dir : '')));
  r.post('/projects/plan', express.json(), guarded(true, (req) => setupPlan(req.body?.fields)));
  r.post('/projects', express.json(), (req, res) => {
    if (!ok(req, res, true)) return;
    try {
      const rec = createProject(req.body?.fields ?? {}, ids());
      changed();
      res.status(201).json(rec);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  r.delete('/projects/:id', (req, res) => {
    if (!ok(req, res, true)) return;
    try {
      const out = removeProject(String(req.params.id));
      changed();
      res.json(out);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  return r;
}
