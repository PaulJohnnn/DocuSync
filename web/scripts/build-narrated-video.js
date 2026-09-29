/**
 * Turns the two raw device recordings into one narrated demo video.
 *
 *   - both devices side by side, each labelled, so a viewer sees the edit
 *     leave one screen and arrive on the other
 *   - a caption bar naming the current step
 *   - a spoken narration track, synthesised with the Windows speech engine
 *     and placed against the scene offsets the recorder wrote out
 *
 * Needs a full ffmpeg (the one Playwright bundles is deliberately minimal:
 * no hstack, drawtext, libx264 or audio encoders).
 *
 * Run: node scripts/build-narrated-video.js [dir]
 */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const DIR = process.argv[2] || path.join(__dirname, '..', '..', 'demo-video');
const OUT = path.join(DIR, 'DocuSync-Demo-Narrated.mp4');
const WORK = path.join(DIR, '.work');

// ── locate a capable ffmpeg ─────────────────────────────────────────────
function findFfmpeg() {
  const guesses = [];
  const wg = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
  if (fs.existsSync(wg)) {
    for (const d of fs.readdirSync(wg).filter(x => x.startsWith('Gyan.FFmpeg'))) {
      const root = path.join(wg, d);
      for (const sub of fs.readdirSync(root)) {
        guesses.push(path.join(root, sub, 'bin', 'ffmpeg.exe'));
      }
    }
  }
  guesses.push('ffmpeg');
  for (const g of guesses) {
    try { execFileSync(g, ['-version'], { stdio: 'ignore' }); return g; } catch { /* next */ }
  }
  throw new Error('No capable ffmpeg found. Install with: winget install Gyan.FFmpeg');
}
const FFMPEG = findFfmpeg();

// ── narration copy, keyed to the recorder's scene ids ───────────────────
const SCRIPT = {
  signin:  "DocuSync is a collaborative document editor for devices that may go offline. Two collaborators sign in on separate devices, and an administrator signs in on a third.",
  create:  "Paul creates a sync room, and the system generates a six character invite code.",
  join:    "Zyra joins from the second device using that code. Both devices are now peers in the same room.",
  open:    "They open the same document. Each device keeps its own copy in local storage, so editing carries on even when the network does not.",
  syncAB:  "Paul types. The edit is held briefly, stamped with a logical clock, and pushed. It reaches Zyra's device in well under a second.",
  syncBA:  "Zyra replies, and her text travels back the same way. The coloured label is her live cursor, shown on Paul's screen as she moves.",
  history: "Every edit is appended to a log rather than overwriting the document, so any earlier version can be restored.",
  metrics: "Now the evaluation dashboard. Notice that both devices show the same percentages. That is deliberate, not a fault. Consistency, resolution accuracy and conflict detection are counted on the server for the whole room, because they describe the shared document's sync session rather than any one machine. Each card is marked room-wide for that reason. Latency is the exception: it is timed on each device separately, from sending an edit to the server confirming it, so the two screens legitimately show different figures there.",
};

const psQuote = (s) => "'" + String(s).replace(/'/g, "''") + "'";

/** Synthesises one line to a WAV with the Windows speech engine. */
function speak(text, outFile) {
  const ps = [
    'Add-Type -AssemblyName System.Speech;',
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;',
    // Zira reads a touch clearer than David at a slowed rate.
    'try { $s.SelectVoice("Microsoft Zira Desktop") } catch {};',
    '$s.Rate = -2;',
    `$s.SetOutputToWaveFile(${psQuote(outFile)});`,
    `$s.Speak(${psQuote(text)});`,
    '$s.Dispose();',
  ].join(' ');
  execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore' });
}

const probeDuration = (f) => {
  const out = execFileSync(FFMPEG, ['-i', f], { stdio: ['ignore', 'pipe', 'pipe'] , encoding: 'latin1'})
    .toString() + '';
  return out;
};

function durationOf(file) {
  let stderr = '';
  try { execFileSync(FFMPEG, ['-i', file], { stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { stderr = (e.stderr || '').toString(); }
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  if (!m) return 0;
  return (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
}

(async () => {
  const vA = path.join(DIR, 'DocuSync-Demo-Device1-Paul.webm');
  const vB = path.join(DIR, 'DocuSync-Demo-Device2-Zyra.webm');
  const vC = path.join(DIR, 'DocuSync-Demo-Device3-Admin.webm');
  const tlPath = path.join(DIR, 'timeline.json');
  for (const f of [vA, vB, vC, tlPath]) {
    if (!fs.existsSync(f)) throw new Error('missing ' + f + ' — run record-demo-video.js first');
  }
  const tl = JSON.parse(fs.readFileSync(tlPath, 'utf8'));
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });

  const videoLen = durationOf(vA);
  console.log('video length:', videoLen.toFixed(1), 's');

  // ── 1. synthesise each line ──────────────────────────────────────────
  console.log('Synthesising narration...');
  const clips = [];
  for (const sc of tl.scenes) {
    const text = SCRIPT[sc.id];
    if (!text) continue;
    const wav = path.join(WORK, `${sc.id}.wav`);
    speak(text, wav);
    const d = durationOf(wav);
    clips.push({ ...sc, wav, dur: d });
    console.log(`  ${sc.id.padEnd(8)} @${sc.at.toFixed(1)}s  ${d.toFixed(1)}s`);
  }

  // Captions are pinned to the recorded scene offsets and never move — they
  // label what is on screen. Narration keeps its own `audioAt`, which may
  // slip slightly to stop two lines overlapping, but a line that still runs
  // long simply spills into the next scene the way a person narrating would.
  clips.forEach(c => { c.audioAt = c.at; });
  for (let i = 0; i < clips.length - 1; i++) {
    const end = clips[i].audioAt + clips[i].dur;
    if (end > clips[i + 1].audioAt) {
      clips[i + 1].audioAt = end + 0.4;
      const over = clips[i + 1].audioAt - clips[i + 1].at;
      if (over > 0.5) console.log(`  note: ${clips[i + 1].id} narration starts ${over.toFixed(1)}s late`);
    }
  }
  const narrationEnd = clips.length ? clips[clips.length - 1].audioAt + clips[clips.length - 1].dur : 0;
  const finalLen = Math.max(videoLen, narrationEnd + 1.5);
  console.log('final length:', finalLen.toFixed(1), 's');

  // ── 2. one audio track: each clip delayed to its scene ───────────────
  const audioInputs = clips.flatMap(c => ['-i', c.wav]);
  const delays = clips.map((c, i) =>
    `[${i}:a]aresample=44100,adelay=${Math.round(c.audioAt * 1000)}|${Math.round(c.audioAt * 1000)}[a${i}]`
  ).join(';');
  const mixIn = clips.map((_, i) => `[a${i}]`).join('');
  const narration = path.join(WORK, 'narration.wav');
  console.log('Building narration track...');
  execFileSync(FFMPEG, [
    '-y', ...audioInputs,
    '-filter_complex', `${delays};${mixIn}amix=inputs=${clips.length}:normalize=0:dropout_transition=0[out]`,
    '-map', '[out]', '-t', String(finalLen), narration,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  // ── 3. caption track: one drawtext per scene window ──────────────────
  const font = 'C\\:/Windows/Fonts/segoeui.ttf';
  const fontB = 'C\\:/Windows/Fonts/segoeuib.ttf';
  const esc = (t) => t.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\\\\\'").replace(/,/g, '\\,');
  const captions = clips.map((c, i) => {
    const from = c.at;
    const to = i + 1 < clips.length ? clips[i + 1].at : finalLen;
    return `drawtext=fontfile='${font}':text='${esc(c.caption)}':fontcolor=0xE8EDF7:fontsize=26:` +
           `x=(w-text_w)/2:y=h-38:enable='between(t,${from.toFixed(2)},${to.toFixed(2)})'`;
  }).join(',');

  // ── 4. compose ───────────────────────────────────────────────────────
  // Each 1280x720 device is scaled to 960x540 and padded to leave a header
  // strip for its label; the pair is stacked side by side, then a footer
  // band carries the caption.
  // Three panels: the two collaborating devices and the administrator.
  // Each 1280x720 capture is scaled to 640x360 with a header strip for its
  // label, so the row lands at 1920 wide without cropping anything.
  const panelFilter = (idx, label, colour) =>
    `[${idx}:v]scale=640:360,pad=640:404:0:44:color=0x141A2E,` +
    `drawtext=fontfile='${fontB}':text='${label}':fontcolor=${colour}:fontsize=17:x=16:y=13`;
  const extraTail = Math.max(0, finalLen - videoLen);
  const holdTail = extraTail > 0.2 ? `,tpad=stop_mode=clone:stop_duration=${extraTail.toFixed(2)}` : '';
  const filter =
    `${panelFilter(0, 'DEVICE 1 — PAUL', '0x17B3A3')}[a];` +
    `${panelFilter(1, 'DEVICE 2 — ZYRA', '0x17B3A3')}[b];` +
    `${panelFilter(2, 'ADMINISTRATOR', '0xE8A33D')}[c];` +
    // Narration can outlast the footage (the closing explanation is long),
    // and without this the video stream simply ends while the audio keeps
    // going — a silent black tail. Hold the final frame instead.
    `[a][b][c]hstack=inputs=3${holdTail},pad=1920:476:0:0:color=0x141A2E,${captions},` +
    `drawtext=fontfile='${fontB}':text='DocuSync — Hybrid File Synchronization Engine':` +
    `fontcolor=0x7C88A8:fontsize=16:x=w-text_w-20:y=13[v]`;

  console.log('Composing final video...');
  try {
    execFileSync(FFMPEG, [
      '-y', '-i', vA, '-i', vB, '-i', vC, '-i', narration,
      '-filter_complex', filter,
      '-map', '[v]', '-map', '3:a',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p', '-r', '25',
      '-c:a', 'aac', '-b:a', '160k',
      '-t', String(finalLen),
      '-movflags', '+faststart',
      OUT,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    console.error('compose failed:\n' + (e.stderr || '').toString().slice(-1800));
    process.exitCode = 1;
    return;
  }

  fs.rmSync(WORK, { recursive: true, force: true });
  const kb = Math.round(fs.statSync(OUT).size / 1024);
  console.log(`\nwrote ${OUT} (${kb} KB, ${finalLen.toFixed(0)}s)`);
})();
