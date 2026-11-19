// CHIP / Pages / Playground: the page's states for CHIP's own Storybook
// (locked to the Chip theme). Ready for when code-track sets that Storybook
// up; it is not wired anywhere yet.
//
// The page reads CHIP's server; here a decorator answers those calls.
// FIXTURE, not CHIP data: project and page names below are shaped like
// /projects and /play/pages answers (Figma 612:138756 draws the page, not
// these lists). The live page in the frame is a blank stand-in.
import { userEvent, within } from 'storybook/test';
import Playground from './Playground.jsx';

const PROJECTS = { projects: [{ id: 'chip', name: 'CHIP' }, { id: 'bella', name: 'BELLA' }] };
const PAGES = { project: 'chip', pages: [{ route: '#/not-again', label: 'Not again' }, { route: '#/playground', label: 'Playground' }] };
const RUNNING = { name: 'CHIP', proxy: 'about:blank', run: { state: 'running', url: 'http://127.0.0.1:3100' } };
const STOPPED = { name: 'BELLA', proxy: null, run: { state: 'stopped', url: 'http://127.0.0.1:6006', command: 'npm run storybook' } };

/** Answers CHIP's server calls for one story. `fail` makes every call fail. */
const withServer = ({ map = RUNNING, pages = PAGES, fail = false } = {}) =>
  function Server(Story) {
    window.fetch = async (url) => {
      const u = String(url);
      if (fail) throw new Error('down');
      const body = u.startsWith('/projects') ? PROJECTS : u.startsWith('/play/pages') ? pages : u.startsWith('/play/map') ? map : {};
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    return <Story />;
  };

export default {
  title: 'CHIP / Pages / Playground',
  component: Playground,
  parameters: { layout: 'fullscreen', theme: 'chip-light' },
};

export const Default = { decorators: [withServer()] };

export const NotesOpen = {
  decorators: [withServer()],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(await c.findByRole('button', { name: 'Mark up' }));
  },
};

export const ProjectNotRunning = { decorators: [withServer({ map: STOPPED })] };

export const NoPages = { decorators: [withServer({ pages: { project: 'chip', pages: [] } })] };

export const ServerDown = { decorators: [withServer({ fail: true })] };
