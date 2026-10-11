/**
 * Composes the hybrid recording (desktop + web + admin) into one captioned
 * video, from the three synchronised frame sequences.
 *
 * Panel labels name the PLATFORM, because that is the point of this cut:
 * one collaborator is on the desktop application and the other is in a
 * browser, in the same room.
 *
 * No voice-over — the presenter narrates from DocuSync-Demo-Script.md.
 *
 * Run: node scripts/build-demo-hybrid.js [dir]
 */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const DIR = process.argv[2]
  || path.join('C:', 'Users', 'Paul John Palamara', 'Downloads', 'DocuSync-Defense', 'demo-video-hybrid');
const FRAMES = path.join(DIR, 'frames');
const OUT = path.join(DIR, 'DocuSync-Demo-Desktop-and-Web.mp4');

function findFfmpeg() {
  const guesses = [];
  for (const root of ['C:/Program Files', 'C:/ProgramData/chocolatey/bin', process.env.LOCALAPPDATA || '']) {
    if (!root) continue;
    try {
      for (const sub of fs.readdirSync(root)) {
        if (/ffmpeg/i.test(sub)) guesses.push(path.join(root, sub, 'bin', 'ffmpeg.exe'));
      }
    } catch { }
  }
  guesses.push('ffmpeg');
  for (const g of guesses) {
    try { execFileSync(g, ['-version'], { stdio: 'ignore' }); return g; } catch { }
  }
  throw new Error('No capable ffmpeg found.');
}
const FFMPEG = findFfmpeg();

(async () => {
  const meta = JSON.parse(fs.readFileSync(path.join(DIR, 'timeline.json'), 'utf8'));
  const fps = meta.fps || 2.25;
  const scenes = meta.scenes;
  const total = meta.totalSeconds;
  console.log(`${meta.frames} frames · ${fps.toFixed(2)} fps · ${total.toFixed(1)}s · ${scenes.length} scenes`);

  const font = 'C\\:/Windows/Fonts/segoeui.ttf';
  const fontB = 'C\\:/Windows/Fonts/segoeuib.ttf';
  const esc = (t) => t
    .replace(/\\/g, '\\\\').replace(/:/g, '\\:')
    .replace(/'/g, "\\\\\\'").replace(/,/g, '\\,')
    .replace(/[—–]/g, '-');

  const captions = scenes.map((c, i) => {
    const from = c.at;
    const to = i + 1 < scenes.length ? scenes[i + 1].at : total;
    return `drawtext=fontfile='${font}':text='${esc(c.caption)}':fontcolor=0xE8EDF7:fontsize=25:`
      + `x=(w-text_w)/2:y=h-40:enable='between(t,${from.toFixed(2)},${to.toFixed(2)})'`;
  }).join(',');

  const counters = scenes.map((c, i) => {
    const from = c.at;
    const to = i + 1 < scenes.length ? scenes[i + 1].at : total;
    return `drawtext=fontfile='${fontB}':text='${i + 1}/${scenes.length}':fontcolor=0x7C88A8:fontsize=17:`
      + `x=24:y=h-44:enable='between(t,${from.toFixed(2)},${to.toFixed(2)})'`;
  }).join(',');

  // The label is the platform. A viewer must be able to tell at a glance
  // which panel is the installed application and which is a browser tab.
  const panel = (idx, label, colour) =>
    `[${idx}:v]scale=640:360,pad=640:404:0:44:color=0x141A2E,`
    + `drawtext=fontfile='${fontB}':text='${esc(label)}':fontcolor=${colour}:fontsize=17:x=16:y=13`;

  const filter =
    `${panel(0, 'PAUL - DESKTOP APP (Windows)', '0x5BC8F5')}[a];`
    + `${panel(1, 'ZYRA - WEB APP (browser)', '0x17B3A3')}[b];`
    + `${panel(2, 'ADMINISTRATOR - web console', '0xE8A33D')}[c];`
    + `[a][b][c]hstack=inputs=3,pad=1920:480:0:0:color=0x141A2E,${captions},${counters},`
    + `drawtext=fontfile='${fontB}':text='DocuSync - one room, two platforms':`
    + `fontcolor=0x7C88A8:fontsize=16:x=w-text_w-20:y=13[v]`;

  const seq = (name) => path.join(FRAMES, name, '%05d.jpg');
  console.log('Composing...');
  try {
    execFileSync(FFMPEG, [
      '-y',
      '-framerate', String(fps), '-i', seq('paul'),
      '-framerate', String(fps), '-i', seq('zyra'),
      '-framerate', String(fps), '-i', seq('admin'),
      '-filter_complex', filter,
      '-map', '[v]',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '21',
      '-pix_fmt', 'yuv420p', '-r', '25',
      '-movflags', '+faststart',
      OUT,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    console.error('compose failed:\n' + (e.stderr || '').toString().slice(-2000));
    process.exitCode = 1;
    return;
  }

  const mb = fs.statSync(OUT).size / 1048576;
  console.log(`\nwrote ${OUT} (${mb.toFixed(1)} MB, ${total.toFixed(0)}s)`);

  const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const chapters = scenes.map((c) => `${mmss(c.at)}  ${c.caption}`).join('\n');
  fs.writeFileSync(path.join(DIR, 'chapters.txt'), chapters + '\n');
  console.log('\n' + chapters);
})();
