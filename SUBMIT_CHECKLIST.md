# Submission checklist

Step-by-step. Run top to bottom. Estimated total time: **45–60 minutes** for a clean recording + upload + form. Buffer accordingly.

**Hard deadline:** Monday Apr 27, 02:00 Spain (Sunday 8pm EDT).
**Buffer target:** Sunday 11pm Spain — gives you three hours of slack.

---

## 0. Before you start (5 min)

- [ ] Quiet room. Phone silent. Door closed.
- [ ] One browser window only. Close Cowork, Slack, mail, anything that pings.
- [ ] Theme: light mode for the recording. Looks better on uncalibrated displays.
- [ ] Read VIDEO_SCRIPT.md once end-to-end before recording. Whisper the pods. Notice where the mouse goes.

---

## 1. Open the Bridge (1 min)

```sh
open ~/DEV/chip/docs/artifacts/chip-cockpit-v0/index.html
```

- [ ] Splash renders: *"Morning, Elleta."*
- [ ] **Don't dismiss the splash yet** — the recording starts on it.
- [ ] If anything looks off (theme stuck, broken layout): Cmd+R to refresh, then `localStorage.clear()` in DevTools console, then refresh again.

---

## 2. Start recording (5 min)

**Option A — Loom (recommended, fastest upload):**
1. Go to **loom.com**. Sign up free if you don't have an account.
2. Install the desktop app (free) or use the Chrome extension.
3. Click *New video* → *Screen + Cam* (or *Screen only* if you don't want your face).
4. Audio: **on**. Mic: built-in is fine for a 3-min demo.
5. Recording region: **just the browser window**, not the full screen. Crops out the dock + menubar.
6. Click record.

**Option B — QuickTime (zero-install fallback):**
1. Open QuickTime Player.
2. *File → New Screen Recording*. Audio: select your built-in mic from the chevron next to the record button.
3. Click record. Drag-select the browser window region.
4. Speak.

---

## 3. Run the script (3 min)

- [ ] Follow VIDEO_SCRIPT.md pod by pod.
- [ ] Each pod is 20 seconds. Speak at natural pace, ~150 wpm.
- [ ] Click per the screen-action notes.
- [ ] If you flub a pod, finish the take. Re-record only if the whole video is unrecoverable. Editing one pod is harder than re-doing the whole thing.
- [ ] **Cut at 2:59.** The submission rule is hard.

---

## 4. Get the video URL (5–15 min)

**If Loom:**
1. Stop recording. Loom uploads automatically.
2. Wait for *"Ready to share"* — usually 1–3 min for a 3-min video.
3. Click *Share* → *Copy link*. The URL is `https://www.loom.com/share/<id>`.
4. Open the link in an incognito window to confirm it plays without login. If Loom asks for sign-in, click *Settings* → set sharing to *Public* (no password).

**If QuickTime:**
1. *File → Save*. Pick desktop, name it `chip-demo.mp4`.
2. Go to **youtube.com/upload**. Sign in.
3. Drag the file. Title: *"CHIP — Cockpit for agentic design systems"*. Visibility: **Unlisted** (not Private — judges need the link to work).
4. Wait for processing (3–8 min).
5. Click *Share* → *Copy link*. URL is `https://youtu.be/<id>`.
6. Test in an incognito window before submitting.

---

## 5. Submit the form (5 min)

1. [ ] Open **https://cerebralvalley.ai/e/built-with-4-7-hackathon/hackathon/submit**
2. [ ] Sign in if prompted.
3. [ ] Project name: **`CHIP`**
4. [ ] GitHub URL: **`https://github.com/emcdanie/chip`**
5. [ ] Video URL: paste the Loom or YouTube link from step 4.
6. [ ] Description: open `SUBMISSION_DESCRIPTION.md`, copy the text under the `---` line, paste into the form. Word count is ~190 — within range.
7. [ ] Any optional fields: leave blank unless required. Don't pad.
8. [ ] Read everything once. The description is the line judges scan; the video is what they actually watch.
9. [ ] Click **Submit**.
10. [ ] Screenshot the confirmation page. Save as `submission-confirmation-2026-04-26.png` in `~/Documents/`.

---

## 6. After submitting (5 min)

- [ ] Confirm the GitHub repo is public and reachable in incognito: `https://github.com/emcdanie/chip` should show README + LICENSE + the `docs/artifacts/chip-cockpit-v0/` folder.
- [ ] Confirm the video link plays in incognito.
- [ ] Tell whoever's been holding space for you that you submitted.
- [ ] Eat. Drink water. Don't open the laptop again tonight.

---

## If something is broken when you sit down

| Symptom | Fix |
|---|---|
| Bridge doesn't open | `open ~/DEV/chip/docs/artifacts/chip-cockpit-v0/index.html` from a fresh terminal. If still broken: `git -C ~/DEV/chip log -1` to confirm the commit; the Bridge lives in that commit. |
| Splash stuck on dark / broken layout | DevTools console: `localStorage.clear()`; refresh. |
| GitHub URL 404s | The repo isn't pushed yet. Run: `git -C ~/DEV/chip remote add origin git@github.com:emcdanie/chip.git && git -C ~/DEV/chip push -u origin main`. Confirm public visibility on the GitHub repo settings page. |
| Demo flow doesn't reach Approve | Press <kbd>A</kbd> at the diag banner. If A doesn't fire, click the green Approve button directly. |
| Cmd+K palette doesn't open | Click anywhere in the page first to give it focus, then Cmd+K. |
| Loom fails to upload | Stop the recording, switch to QuickTime. Don't burn time fighting tools. |

---

## What "done" looks like

- [ ] Video file uploaded, URL works in incognito.
- [ ] GitHub repo public at `github.com/emcdanie/chip`.
- [ ] Cerebralvalley submission form filled and submitted.
- [ ] Confirmation page screenshotted.
- [ ] You've stepped away from the laptop.
