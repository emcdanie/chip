// CHIP's shared pieces, ported from the approved mock (chip-mock-03): one
// table, one set of chips, one sheet, one segmented control, so every page
// rebuild reuses them instead of inventing its own. Styles in kit.css.
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import Button from '@bella/components/Button/Button';
import './kit.css';

const cx = (...c) => c.filter(Boolean).join(' ');

/* Buttons are BELLA's Button (@bella/components/Button/Button), in the mock's
   blue through tokens.css. The one exception is a disclosure toggle, which
   needs aria-expanded that BELLA's Button doesn't take: <Toggle>. */
export function Toggle({ expanded, className, children, ...rest }) {
  return (
    <button type="button" className={cx('k-toggle', className)} aria-expanded={expanded} {...rest}>
      {children}
    </button>
  );
}

export function LinkButton({ className, children, ...rest }) {
  return (
    <button type="button" className={cx('k-link', className)} {...rest}>
      {children}
    </button>
  );
}

/* ---------- status pill: red fail, yellow needs you, green pass, ink text on every fill ---------- */
const MARK = { pass: '✓', fail: '!', needs: '●' };
// badge: the taller form that sits beside an H1 (the mock's .badge)
export function StatusPill({ tone = 'neutral', badge, children }) {
  return (
    <span className={cx('k-pill', tone !== 'neutral' && tone, badge && 'k-badge')}>
      {MARK[tone] && <span aria-hidden="true">{MARK[tone]} </span>}
      {children}
    </span>
  );
}

/* ---------- page header: meta or a breadcrumb, the H1 with status badges
   beside it, a lede, actions on the right ---------- */
export function PageHeader({ meta, title, tags, lede, actions }) {
  const h1 = (
    <h1 className="k-h1" tabIndex={-1}>
      {title}
    </h1>
  );
  return (
    <div className="k-head">
      <div>
        {meta && <p className="k-meta">{meta}</p>}
        {tags ? (
          <div className="k-tline">
            {h1}
            {tags}
          </div>
        ) : (
          h1
        )}
        {lede && <p className="k-lede">{lede}</p>}
      </div>
      {actions && <div className="k-head-acts">{actions}</div>}
    </div>
  );
}

/* ---------- card with head: title and sub on the left, a control top right ---------- */
export function Card({ title, sub, action, children, className }) {
  const id = useId();
  return (
    <section className={cx('k-card', className)} aria-labelledby={title ? id : undefined}>
      {title && (
        <div className="k-card-head">
          <div>
            <h2 className="k-card-t" id={id}>
              {title}
            </h2>
            {sub && <p className="k-card-s">{sub}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/* ---------- filter chips: one pressed at a time, each with its count ---------- */
export function Chips({ label, items, value, onChange }) {
  return (
    <div className="k-chips" role="group" aria-label={label}>
      {items.map((c) => (
        <button key={c.id} type="button" className="k-chip" aria-pressed={c.id === value} onClick={() => onChange(c.id)}>
          {c.label}
          {c.count != null && <span className="n">{c.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- segmented control: the tabs pattern. Arrow keys, Home and End move
   and select; only the selected tab is in the tab order. Pair each panel with
   segPanelProps(id, item). With panels={false} it picks a value instead (the
   Playground's width and mode): a radio group, same look, same keys ---------- */
export const segPanelProps = (id, item, value) => ({
  role: 'tabpanel',
  id: `${id}-p-${item}`,
  'aria-labelledby': `${id}-t-${item}`,
  hidden: item !== value,
});

export function Segmented({ id, label, items, value, onChange, panels = true }) {
  const ref = useRef(null);
  function onKeyDown(e) {
    const i = items.findIndex((t) => t.id === value);
    const n = { ArrowRight: i + 1, ArrowDown: panels ? undefined : i + 1, ArrowLeft: i - 1, ArrowUp: panels ? undefined : i - 1, Home: 0, End: items.length - 1 }[e.key];
    if (n === undefined) return;
    e.preventDefault();
    const next = items[(n + items.length) % items.length];
    onChange(next.id);
    ref.current.querySelector(`#${CSS.escape(`${id}-t-${next.id}`)}`)?.focus();
  }
  const on = (t) => (panels ? { role: 'tab', 'aria-controls': `${id}-p-${t.id}`, 'aria-selected': t.id === value } : { role: 'radio', 'aria-checked': t.id === value });
  return (
    <div className="k-seg" role={panels ? 'tablist' : 'radiogroup'} aria-label={label} ref={ref} onKeyDown={onKeyDown}>
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          id={`${id}-t-${t.id}`}
          {...on(t)}
          tabIndex={t.id === value ? 0 : -1}
          onClick={() => onChange(t.id)}
        >
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------- side sheet: a modal <dialog>. Esc, the backdrop and Close all
   close it, and focus goes back to whatever opened it.
   Every sheet that explains something reads the same way, top to bottom:
     kicker + title   what kind of thing this is, and its name
     <SheetPart label="What this is">       one or two sentences
     <SheetPart label="State" pill={…}>     the state, with the evidence
     <SheetPart label="Why it matters" source="…">   names the rule or source
     <SheetPart label="What to do" fix>     the recommended fix
     actions=[{ label, onClick, changes, undo }]   the buttons in the footer;
                                            what each changes and its undo close the body
   Where a fact isn't measured, say so with <NotMeasured />; don't pad. ---------- */
export const NotMeasured = ({ what = 'Not measured' }) => <span className="k-nm">{what}</span>;

export function SheetPart({ label, pill, source, fix, children }) {
  const id = useId();
  return (
    <section className={cx('k-part', fix && 'k-part-fix')} aria-labelledby={id}>
      <div className="k-part-h">
        <h3 id={id}>{label}</h3>
        {pill}
      </div>
      {children}
      {source ? (
        <p className="k-part-src">
          <span>Source</span> {source}
        </p>
      ) : null}
    </section>
  );
}

// label/value rows for the evidence; a null value says Not measured
export function Facts({ rows }) {
  const list = rows.filter(Boolean);
  if (!list.length) return null;
  return (
    <dl className="k-facts">
      {list.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt>{k}</dt>
          <dd>{v ?? <NotMeasured />}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

// the actions: the buttons sit in the footer, always in reach; what each one
// changes and how to undo it closes the body, so a long consequence never
// pushes the sheet's content off screen
const actKey = (a, i) => a.key ?? (typeof a.label === 'string' ? a.label : i);
function SheetActionTerms({ actions }) {
  const told = actions.filter((a) => a.changes || a.undo);
  if (!told.length) return null;
  return (
    <SheetPart label={told.length === 1 ? 'What the button does' : 'What the buttons do'}>
      <dl className="k-facts k-terms">
        {told.map((a, i) => (
          <React.Fragment key={actKey(a, i)}>
            <dt>{a.label}</dt>
            <dd>
              {a.changes ? (
                <span>
                  <b>Changes</b> {a.changes}
                </span>
              ) : null}
              {a.undo ? (
                <span>
                  <b>Undo</b> {a.undo}
                </span>
              ) : null}
            </dd>
          </React.Fragment>
        ))}
      </dl>
    </SheetPart>
  );
}

export function Sheet({ open, title, kicker, onClose, children, footer, actions, className, keepMounted, onCancel, head }) {
  const ref = useRef(null);
  const back = useRef(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (open && !d.open) {
      back.current = document.activeElement;
      d.showModal();
      // start on the title, not the Close button: the screen reader reads
      // what opened, and Tab goes on to Close, then the body, then the actions.
      // A working panel (k-wide: OBI, Claude, the terminal) keeps its own focus
      if (!d.classList.contains('k-wide')) d.querySelector('.k-sheet-h h2')?.focus();
    } else if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    const closed = () => {
      onClose?.();
      if (back.current?.isConnected) back.current.focus();
      back.current = null;
    };
    d.addEventListener('close', closed);
    return () => d.removeEventListener('close', closed);
  }, [onClose]);
  return (
    <dialog ref={ref} className={cx('k-sheet', className)} aria-labelledby={id} onCancel={onCancel} onClick={(e) => e.target === ref.current && ref.current.close()}>
      <div className="k-sheet-h">
        <div className="k-sheet-t">
          {kicker ? <p className="k-sheet-k">{kicker}</p> : null}
          <h2 id={id} tabIndex={-1}>
            {title}
          </h2>
        </div>
        {head}
        <button type="button" className="k-iconbtn" onClick={() => ref.current.close()}>
          <span aria-hidden="true">✕</span> Close
        </button>
      </div>
      <div className="k-sheet-b">
        {(open || keepMounted) && children}
        {open && actions?.length ? <SheetActionTerms actions={actions} /> : null}
      </div>
      {footer ? (
        <div className="k-sheet-f">{footer}</div>
      ) : actions?.length ? (
        <div className="k-sheet-f">
          {actions.map((a, i) => (
            <Button key={actKey(a, i)} variant={a.variant ?? (i ? 'secondary' : 'primary')} onClick={a.onClick} disabled={a.disabled} ariaLabel={a.ariaLabel}>
              {a.label}
            </Button>
          ))}
        </div>
      ) : null}
    </dialog>
  );
}

/* ---------- drawer: the sheet holding filters, with Apply and Clear all ---------- */
export function Drawer({ open, title = 'Filters', onClose, onApply, applyLabel = 'Show results', onClear, children }) {
  return (
    <Sheet
      open={open}
      title={title}
      onClose={onClose}
      className="k-drawer"
      footer={
        <>
          <Button variant="primary" onClick={onApply}>
            {applyLabel}
          </Button>
          {onClear && <LinkButton onClick={onClear}>Clear all</LinkButton>}
        </>
      }
    >
      {children}
    </Sheet>
  );
}

export function Checkbox({ checked, onChange, children, count }) {
  return (
    <label className="k-chk">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {children}
      {count != null && <span className="n">{count}</span>}
    </label>
  );
}

// one group of filter checkboxes in a drawer
export function FilterGroup({ legend, options, selected, onChange }) {
  const toggle = (id, on) => onChange(on ? [...selected, id] : selected.filter((x) => x !== id));
  return (
    <fieldset>
      <legend>{legend}</legend>
      {options.map((o) => (
        <Checkbox key={o.id} checked={selected.includes(o.id)} count={o.count} onChange={(on) => toggle(o.id, on)}>
          {o.label}
        </Checkbox>
      ))}
    </fieldset>
  );
}

/* ---------- data table: one table for every list of things. Filter, chips,
   sort by any column, hide columns, sticky head, scrolls inside itself, and a
   row opens a sheet through onRow.
   cols: { key, label, render(row), sortVal(row), sort: false, open: true
   (the cell is the row's button), end: true (right-aligned), hideLabel,
   prio: 2 or 3 (drops when the table is narrow, 3 first; the row's sheet
   still has it), pin: true (an action column: sticks to the right edge) }.
   The first column sticks to the left; a shadow marks the edge that has
   more table past it.
   chips: [{ id, label, test(row) }], the first one shows everything ---------- */
const SORT_ICON = {
  none: { d: 'M8 9l4-4 4 4M8 15l4 4 4-4', w: 2.6 },
  ascending: { d: 'M12 19V5M6 11l6-6 6 6', w: 2.8 },
  descending: { d: 'M12 5v14M6 13l6 6 6-6', w: 2.8 },
};
const text = (v) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export function DataTable({ label, cols, rows, chips, onRow, search = true, rowKey = (r, i) => i }) {
  const [q, setQ] = useState('');
  const [chip, setChip] = useState(chips?.[0].id);
  const [sort, setSort] = useState({ i: null, dir: 1 });
  const KEY = `chip-dt-${label}`;
  const [off, setOff] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{}').off ?? [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ off }));
    } catch {}
  }, [KEY, off]);
  const [colsOpen, setColsOpen] = useState(false);
  const colsRef = useRef(null);
  // which edges have more table past them: k-ovl / k-ovr draw the shadow
  const dtRef = useRef(null);
  useEffect(() => {
    const el = dtRef.current;
    if (!el) return;
    const edge = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.classList.toggle('k-ovl', el.scrollLeft > 1);
      el.classList.toggle('k-ovr', max - el.scrollLeft > 1);
    };
    edge();
    el.addEventListener('scroll', edge, { passive: true });
    const ro = new ResizeObserver(edge);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', edge);
      ro.disconnect();
    };
  }, []);
  useEffect(() => {
    if (!colsOpen) return;
    const away = (e) => !colsRef.current?.contains(e.target) && setColsOpen(false);
    document.addEventListener('click', away);
    return () => document.removeEventListener('click', away);
  }, [colsOpen]);

  const vis = cols.map((c, i) => [c, i]).filter(([, i]) => !i || !off.includes(i));
  const chipTest = (id) => chips?.find((c) => c.id === id)?.test ?? (() => true);
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let l = rows.filter((r) => chipTest(chip)(r) && (!ql || text(Object.values(r)).toLowerCase().includes(ql)));
    if (sort.i !== null) {
      const c = cols[sort.i];
      const val = c.sortVal ?? ((r) => r[c.key]);
      l = [...l].sort((a, b) => {
        const x = val(a);
        const y = val(b);
        return (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
      });
    }
    return l;
  }, [rows, q, chip, sort, cols]);

  const openRow = (e) => {
    if (!onRow || e.target.closest('button, a, input, select, label')) return;
    const b = e.currentTarget.querySelector('.k-rowbtn');
    b?.focus();
    b?.click();
  };
  const cell = (c, r) => {
    const v = c.render ? c.render(r) : text(r[c.key]);
    return c.open && onRow ? (
      <button type="button" className="k-rowbtn" onClick={() => onRow(r)}>
        {v}
      </button>
    ) : (
      v
    );
  };

  return (
    <div className="k-dtwrap">
      <div className="k-tbar">
        {search && (
          <label className="k-search">
            <span className="k-vh">Filter {label}</span>
            <input placeholder={`Filter ${label}…`} autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        )}
        {chips && <Chips label="Show" value={chip} onChange={setChip} items={chips.map((c) => ({ ...c, count: rows.filter(c.test).length }))} />}
        <span className="k-count" aria-live="polite">
          {list.length} of {rows.length}
        </span>
        <div
          className="k-cols"
          ref={colsRef}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && colsOpen) {
              setColsOpen(false);
              colsRef.current.querySelector('button').focus();
            }
          }}
        >
          <Toggle expanded={colsOpen} onClick={() => setColsOpen((o) => !o)}>
            Columns <span className="n">{off.length ? `· ${off.length} hidden` : ''}</span>
          </Toggle>
          <div className="k-colsp" hidden={!colsOpen}>
            <p className="k-sub">Show these columns</p>
            {cols.map((c, i) =>
              i && !c.hideLabel ? (
                <Checkbox key={i} checked={!off.includes(i)} onChange={(on) => setOff((o) => (on ? o.filter((x) => x !== i) : [...o, i]))}>
                  {c.label}
                </Checkbox>
              ) : null,
            )}
            <LinkButton onClick={() => setOff([])}>Show all</LinkButton>
          </div>
        </div>
      </div>
      <div className="k-dt" tabIndex={0} role="region" aria-label={label} ref={dtRef}>
        <table>
          <thead>
            <tr>
              {vis.map(([c, i]) => {
                const s = c.sort === false ? null : sort.i === i ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none';
                const lab = c.hideLabel ? <span className="k-vh">{c.label}</span> : c.label;
                return (
                  <th key={i} scope="col" aria-sort={s ?? undefined} className={cx(c.end && 'k-end', c.pin && 'k-pin')} data-prio={c.prio}>
                    {s ? (
                      <button type="button" onClick={() => setSort((p) => ({ i, dir: p.i === i ? -p.dir : 1 }))}>
                        {lab}
                        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={SORT_ICON[s].w} strokeLinecap="round" strokeLinejoin="round">
                          <path d={SORT_ICON[s].d} />
                        </svg>
                      </button>
                    ) : (
                      <span>{lab}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {list.length ? (
              list.map((r) => (
                <tr key={rowKey(r, rows.indexOf(r))} className={onRow ? 'k-rowlink' : undefined} onClick={openRow}>
                  {vis.map(([c, i]) => (
                    <td key={i} className={cx(c.end && 'k-end', c.pin && 'k-pin') || undefined} data-prio={c.prio}>
                      {cell(c, r)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="k-empty" colSpan={vis.length}>
                  Nothing matches.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
