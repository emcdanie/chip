// The keyword marker marks what matters (CHIP rules, 22 Nov): what changed, the number or the outcome,
// never the part name or the area before a title's colon. Real History titles, with the words marked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyPhrases } from '../../app/src/templates/keyPhrase.js';

const marked = (t, names) => keyPhrases(t, { names }).map((p) => p.text);

test('a title marks what changed, never its part or area', () => {
  assert.deepEqual(marked('Step: the title and its time share one line, and the status tag moves to the right edge', ['Step']), ['share one line', 'moves to the right edge']);
  assert.deepEqual(marked('Charts: the target number sits centred on its line, and the health gauge shows clearly how far it reaches'), ['centred on its line', 'shows clearly how far it reaches']);
  assert.deepEqual(marked('Work panel: going from Ask BELLA back to Needs you no longer blanks the app'), ['no longer blanks the app']);
  assert.deepEqual(marked('Runs: every button that starts an agent run opens its plan first, and a running run has Stop'), ['opens its plan first', 'has Stop']);
});

test('a number wins in its clause', () => {
  assert.deepEqual(marked('Work: the push preview shows the newest 10 commits and opens its shell at the top, in view'), ['10 commits']);
  assert.deepEqual(marked('History: the timeline line runs unbroken, and a decision has no "0 files" line'), ['runs unbroken', '0 files']);
});

test('a short clause that says no is marked whole', () => {
  assert.deepEqual(marked('Reading: key words get the blue Marker everywhere CHIP answers, and no sentence is bold', ['Marker']), ['get the blue Marker everywhere CHIP', 'no sentence is bold']);
});

test('nouns that look like verbs are not taken for the verb', () => {
  assert.deepEqual(marked('History: the record count and Show N records follow your search, chips and filters'), ['follow your search']);
  assert.deepEqual(marked('Data: Gate runs, Stories and the bench show only what was recorded, with its day'), ['show only what was recorded']);
});

test('nothing is marked rather than a part name, a label or half a quote', () => {
  assert.deepEqual(marked('Tag', ['Tag']), []);
  assert.deepEqual(marked('Team: "every ask is answered" only when no ask is open'), []);
  assert.deepEqual(marked('Foundations: the Colour roles table\'s last column is "Parts", a count'), ['"Parts"']);
});

// coordinator check of the 20 newest records, 22 Nov: "finds lands" joined a verb to a list's first item
test('every marked phrase reads as a phrase', () => {
  assert.deepEqual(marked('Reading: the Marker also finds lands, sets, hides and other common verbs, so more titles mark their outcome'), ['mark their outcome']);
  assert.deepEqual(marked('History: the record count and Show N records follow your search, chips and filters'), ['follow your search']);
  // a weak verb keeps the place it names; a count is never joined to a verb; a time is not a count
  assert.deepEqual(marked('Open pull requests sit At the gate while CI runs and in Ready once it passes; Claude Code sessions writing now sit in Agent.'), ['At the gate', 'now sit in Agent']);
  assert.deepEqual(marked('With Secondary picked, the Fill pin reads the white it paints, not the primary blue; See all 38 opens Button’s own history.').slice(-1), ['opens Button’s own history']);
  assert.deepEqual(marked('Each step now reads as one line, "Pairs added · 10:02", with the title in bold'), ['now reads as one line']);
  // nothing inside a bracket, no bare number, no full stop inside the mark
  assert.deepEqual(marked('The label is now centred on the dashed line, and the bar sits in the middle of that line (8 above, 8 below).'), ['now centred on the dashed line', 'in the middle of that line']);
  assert.deepEqual(marked('Reading CHIP gets easier: the one key phrase is bold with a soft underline (new Marker part), slim meta lines (Stat change)'), ['bold']);
  assert.deepEqual(marked('Searching "drawer" now reads 10 of 23 records, not 10 of every record.'), ['10 of 23 records']);
  assert.deepEqual(marked('a marked phrase over four words reads plain.'), ['plain']);
  assert.deepEqual(marked('Foundations: Used by nothing in Cards says every card colour is in use and opens the 25 in the Table'), ['says every card colour']);
});
