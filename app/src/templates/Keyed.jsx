// A sentence with the keyword marker on the few words that say what changed, the number or the outcome
// (CHIP rules, 22 Nov; the words come from templates/keyPhrase.js). Shared by History and the audit reading view.
import Marker from '@bella/components/Marker/Marker';
import { keyPhrases } from './keyPhrase.js';

export default function Keyed({ text, names }) {
  const t = String(text ?? '');
  const marks = keyPhrases(t, { names });
  if (!marks.length) return t;
  const out = [];
  let from = 0;
  marks.forEach((m, i) => {
    out.push(t.slice(from, m.at), <Marker key={i}>{m.text}</Marker>);
    from = m.at + m.text.length;
  });
  out.push(t.slice(from));
  return <>{out}</>;
}
