/**
 * Composes the three device recordings into one captioned demo video.
 *
 * No voice-over: the presenter narrates this live from
 * DocuSync-Demo-Script.md, so the video carries on-screen captions and a
 * scene counter instead of speech. Captions come from timeline.json, which
 * record-demo-full.js wrote with the real offset of every scene.
 *
 * Needs a full ffmpeg (the one Playwright bundles has no hstack, drawtext or
 * libx264). Install with: winget install Gyan.FFmpeg
 *
 * Run: node scripts/build-demo-full.js [dir]
 */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const DIR = process.argv[2]
  || path.join('C:', 'Users', 'Paul John Palamara', 'Downloads', 'DocuSync-Defense', 'demo-video-full');
const OUT = path.join(DIR, 'DocuSync-Full-Demo.mp4');

function findFfmpeg() {
  const guesses = [];
  for (const root of ['C:/Program Files', 'C:/ProgramData/chocolatey/bin', process.env.LOCALAPPDATA || '']) {
    if (!root) continue;
    try {
      for (const sub of fs.readdirSync(root)) {
        if (/ffmpeg/i.test(sub)) guesses.push(path.join(root, sub, 'bin', 'ffmpeg.exe'));
      }
    } catch { /* unreadable root */ }
  }
  guesses.push('ffmpeg');
  for (const g of guesses) {
    try { execFileSync(g, ['-version'], { stdio: 'ignore' }); return g; } catch { /* next */ }
  }
  throw new Error('No capable ffmpeg found. Install with: winget install Gyan.FFmpeg');
}
const FFMPEG = findFfmpeg();

const duration = (f) => {
  const out = execFileSync(FFMPEG, ['-i', f], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'latin1' })
    .toString() + '';
  return null; // ffmpeg writes to stderr; handled below
};

function probeSeconds(file) {
  try {
    execFileSync(FFMPEG, ['-i', file], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    const s = (e.stderr || '').toString();
    const m = s.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    if (m) return (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
  }
  return 0;
}

(async () => {
  const vA = path.join(DIR, 'Device1-Paul.webm');
  const vB = path.join(DIR, 'Device2-Zyra.webm');
  const vC = path.join(DIR, 'Device3-Admin.webm');
  for (const f of [vA, vB, vC]) {
    if (!fs.existsSync(f)) throw new Error('missing recording: ' + f);
  }

  const timeline = JSON.parse(fs.readFileSync(path.join(DIR, 'timeline.json'), 'utf8'));
  const scenes = timeline.scenes;
  const videoLen = Math.max(probeSeconds(vA), probeSeconds(vB), probeSeconds(vC));
  console.log('footage:', videoLen.toFixed(1), 's across', scenes.length, 'scenes');

  const font = 'C\\:/Windows/Fonts/segoeui.ttf';
  const fontB = 'C\\:/Windows/Fonts/segoeuib.ttf';
  const esc = (t) => t
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\\\\\'")
    .replace(/,/g, '\\,')
    .replace(/—/g, '-');

  // One caption per scene, shown for that scene's whole window.
  const captions = scenes.map((c, i) => {
    const from = c.at;
    const to = i + 1 < scenes.length ? scenes[i + 1].at : videoLen;
    return `drawtext=fontfile='${font}':text='${esc(c.caption)}':fontcolor=0xE8EDF7:fontsize=25:`
      + `x=(w-text_w)/2:y=h-40:enable='between(t,${from.toFixed(2)},${to.toFixed(2)})'`;
  }).join(',');

  // A small step counter, so a viewer can tell where they are in the flow.
  const counters = scenes.map((c, i) => {
    const from = c.at;
    const to = i + 1 < scenes.length ? scenes[i + 1].at : videoLen;
    return `drawtext=fontfile='${fontB}':text='${i + 1}/${scenes.length}':fontcolor=0x7C88A8:fontsize=17:`
      + `x=24:y=h-44:enable='between(t,${from.toFixed(2)},${to.toFixed(2)})'`;
  }).join(',');

  const panel = (idx, label, colour) =>
    `[${idx}:v]scale=640:360,pad=640:404:0:44:color=0x141A2E,`
    + `drawtext=fontfile='${fontB}':text='${label}':fontcolor=${colour}:fontsize=17:x=16:y=13`;

  const filter =
    `${panel(0, 'DEVICE 1 - PAUL (user)', '0x17B3A3')}[a];`
    + `${panel(1, 'DEVICE 2 - ZYRA (user)', '0x17B3A3')}[b];`
    + `${panel(2, 'ADMINISTRATOR', '0xE8A33D')}[c];`
    + `[a][b][c]hstack=inputs=3,pad=1920:480:0:0:color=0x141A2E,${captions},${counters},`
    + `drawtext=fontfile='${fontB}':text='DocuSync - Hybrid File Synchronization Engine':`
    + `fontcolor=0x7C88A8:fontsize=16:x=w-text_w-20:y=13[v]`;

  console.log('Composing...');
  try {
    execFileSync(FFMPEG, [
      '-y', '-i', vA, '-i', vB, '-i', vC,
      '-filter_complex', filter,
      '-map', '[v]',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p', '-r', '25',
      '-movflags', '+faststart',
      OUT,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    console.error('compose failed:\n' + (e.stderr || '').toString().slice(-2000));
    process.exitCode = 1;
    return;
  }

  const kb = Math.round(fs.statSync(OUT).size / 1024);
  console.log(`\nwrote ${OUT} (${Math.round(kb / 1024)} MB, ${videoLen.toFixed(0)}s)`);

  // A chapter list the presenter can scrub by.
  const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const chapters = scenes.map((c) => `${mmss(c.at)}  ${c.caption}`).join('\n');
  fs.writeFileSync(path.join(DIR, 'chapters.txt'), chapters + '\n');
  console.log('\nchapters:\n' + chapters);
})();
