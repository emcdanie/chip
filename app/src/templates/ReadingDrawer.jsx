// The one reading drawer (Elleta, 23 Nov 2026: "all of these are missing the padding"; the audit, Drift, Push, Fix and
// Needs you drawers each arranged their parts differently). It wraps BELLA's Drawer and never restyles it.
// BELLA's Drawer Head is 24 at the sides and its Body 8 (Figma Body, 21 Nov publish; specs/components/Drawer.spec.yaml:
// paddingLeft/Right spacing/8), because a ListRow brings its own 16. So anything that is not a row (headings, text,
// bars, cards) takes the 16 here (Flow inset) and lands on the title's 24 edge; rows sit bare, as they are.
// The standard order, top to bottom:
//   title + status (the Drawer head, from `label` and `status`/`subtitle`)
//   lead     one plain line saying what this is
//   picture  the chart or bars first
//   children bullets, sections and rows, in the page's own order (ReadingSection for a headed group of rows)
//   footer   the action at the right edge (BELLA's Drawer footer)
import Drawer from '@bella/components/Drawer/Drawer';
import SectionHead from '@bella/components/SectionHead/SectionHead';
import TextStack from '@bella/components/TextStack/TextStack';
import Flow from './Flow.jsx';

/** A headed group: the heading takes the inset, the rows under it sit bare. */
export function ReadingSection({ title, description, icon, iconTone, rows }) {
  return (
    <Flow gap={8}>
      <Flow inset>
        <SectionHead icon={icon} iconTone={iconTone} title={title} description={description} showInfo={false} />
      </Flow>
      {rows}
    </Flow>
  );
}

/** Non-row content: 16 in at the sides, on the title's edge. */
export function Inset({ gap = 16, children }) {
  return (
    <Flow inset gap={gap}>
      {children}
    </Flow>
  );
}

export default function ReadingDrawer({ lead, picture, children, gap = 24, ...drawer }) {
  return (
    <Drawer side="right" size="lg" {...drawer}>
      <Flow gap={gap}>
        {lead || picture ? (
          <Inset gap={16}>
            {lead ? <TextStack body={lead} /> : null}
            {picture}
          </Inset>
        ) : null}
        {children}
      </Flow>
    </Drawer>
  );
}
