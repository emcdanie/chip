// Who sees what (Atlas v4): each component and each Facts section has a
// Visible to (Everyone · Editors · Admins) and a Status (Draft · In
// progress · Ready), kept in data/visibility.json. CHIP is local with no
// login, so the role is simulated ("View as", remembered in this browser);
// real auth comes when CHIP is hosted.
import React, { useEffect, useRef, useState } from 'react';
import ActionChip from '@bella/components/ActionChip/ActionChip';
import SegmentedControl from '@bella/components/SegmentedControl/SegmentedControl';
import StatusPill from '@bella/components/StatusPill/StatusPill';

export const ROLES = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'editor', label: 'Editor' },
  { value: 'admin', label: 'Admin' },
];
const VISIBLE = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'editors', label: 'Editors' },
  { value: 'admins', label: 'Admins' },
];
const STATUS = [
  { value: 'draft', label: 'Draft' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'ready', label: 'Ready' },
];
const RANK = { viewer: 0, editor: 1, admin: 2 };
const NEED = { everyone: 0, editors: 1, admins: 2 };
export const statusLabel = (s) => STATUS.find((x) => x.value === s)?.label ?? s;

const ROLE_KEY = 'chip-view-as';
export function useRole() {
  const [role, setRole] = useState(() => {
    try {
      return localStorage.getItem(ROLE_KEY) ?? 'admin';
    } catch {
      return 'admin';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(ROLE_KEY, role);
    } catch {}
  }, [role]);
  return [role, setRole];
}

export const canSee = (role, visibleTo = 'everyone') => RANK[role] >= NEED[visibleTo];
export const canEdit = (role) => RANK[role] >= 1;

export function useVisibility() {
  const [v, setV] = useState({ components: {} });
  useEffect(() => {
    fetch('/visibility')
      .then((r) => r.json())
      .then(setV)
      .catch(() => {});
  }, []);
  const set = async (change) => {
    const r = await fetch('/visibility', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(change) });
    if (r.ok) setV(await r.json());
  };
  return [v, set];
}

/**
 * A component's settings. With nothing recorded, a component with no
 * anatomy is a Draft (its page is not finished) and one with anatomy is
 * Ready; everything is visible to everyone.
 */
export function settingsOf(v, c, section) {
  const rec = v.components?.[c.id] ?? {};
  if (section) return { visibleTo: rec.sections?.[section]?.visibleTo ?? 'everyone', status: rec.sections?.[section]?.status ?? null };
  return { visibleTo: rec.visibleTo ?? 'everyone', status: rec.status ?? (c.parts?.length ? 'ready' : 'draft') };
}

/** Quiet badges for Editors and Admins: what viewers can't see, and anything not Ready. */
export function Badges({ role, settings }) {
  if (!canEdit(role)) return null;
  const hidden = settings.visibleTo !== 'everyone';
  const status = settings.status && settings.status !== 'ready';
  if (!hidden && !status) return null;
  return (
    <span className="badges">
      {hidden ? <StatusPill variant="neutral">{settings.visibleTo === 'admins' ? 'Admins only' : 'Hidden from viewers'}</StatusPill> : null}
      {status ? <StatusPill variant="neutral">{statusLabel(settings.status)}</StatusPill> : null}
    </span>
  );
}

/** The ⋯ menu: Visible to and Status, for Editors and Admins only. */
export function VisMenu({ role, label, settings, onChange, withStatus = true }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => !box.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  if (!canEdit(role)) return null;
  return (
    <span className="vis-menu" ref={box}>
      <ActionChip onClick={() => setOpen((o) => !o)} ariaLabel={`${label}: visibility and status`}>
        ⋯
      </ActionChip>
      {open ? (
        <div className="vis-pop" role="group" aria-label={`${label}: visibility and status`}>
          <p className="label" aria-hidden="true">Visible to</p>
          <SegmentedControl label="Visible to" value={settings.visibleTo} onChange={(visibleTo) => onChange({ visibleTo })} options={VISIBLE} />
          {withStatus ? (
            <>
              <p className="label" aria-hidden="true">Status</p>
              <SegmentedControl label="Status" value={settings.status ?? 'ready'} onChange={(status) => onChange({ status })} options={STATUS} />
            </>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}
