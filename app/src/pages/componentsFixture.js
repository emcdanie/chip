// FIXTURE, not CHIP data: Figma's own example (CHIP Dashboard, Components ·
// content 612:57549: CodeBlock and its four parts) for the stories, which run
// without CHIP's server. The page reads /data/bella.json and /gaps.
import { componentsModel } from './componentsModel.js';

const codeBlock = {
  name: 'CodeBlock',
  category: 'Data',
  parts: [
    { key: 'bar', n: 1, title: 'Title bar', detail: 'File name of the snippet' },
    { key: 'copy', n: 2, title: 'Copy button', detail: 'Copies the code; says so when it fails' },
    { key: 'numbers', n: 3, title: 'Line numbers', detail: 'One per line' },
    { key: 'line', n: 4, title: 'Code line', detail: 'Syntax colours from tokens' },
  ],
};
const others = ['Button', 'Card', 'Tag', 'Tabs'].map((name) => ({ name, category: 'Actions', parts: [] }));
export const figmaModel = componentsModel({ components: [codeBlock, ...others], gaps: { dsds: { CodeBlock: {} }, story: { Tag: {} } }, commit: '0.3.0' });
