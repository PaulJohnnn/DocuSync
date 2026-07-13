const fs = require('fs');
const path = require('path');

async function testRtf() {
    const filePath = path.join(__dirname, 'real_test.rtf');
    const rawRtf = await fs.promises.readFile(filePath, 'utf-8');
    
    let extracted = '';
    let i = 0;
    let groupDepth = 0;
    let ignoreDepth = -1;
    const ignoreGroups = ['fonttbl', 'colortbl', 'stylesheet', 'info', 'generator', 'picw', 'pich'];

    while (i < rawRtf.length) {
      const c = rawRtf[i];
      if (c === '{') {
        groupDepth++;
        i++;
        continue;
      }
      if (c === '}') {
        if (ignoreDepth !== -1 && groupDepth === ignoreDepth) {
          ignoreDepth = -1;
        }
        groupDepth--;
        i++;
        continue;
      }
      if (ignoreDepth !== -1 && groupDepth >= ignoreDepth) {
        i++;
        continue;
      }

      if (c === '\\') {
        const next = rawRtf[i + 1];
        if (!next) { i++; continue; }
        if (next === '\\' || next === '{' || next === '}' || next === '~' || next === '-' || next === '_') {
          if (next === '~') extracted += ' ';
          else if (next === '-' || next === '_') extracted += '-';
          else extracted += next;
          i += 2;
          continue;
        }
        if (next === "'") {
          const hex = rawRtf.substring(i + 2, i + 4);
          extracted += String.fromCharCode(parseInt(hex, 16) || 32);
          i += 4;
          continue;
        }
        if (next === '*') {
          if (ignoreDepth === -1) ignoreDepth = groupDepth;
          i += 2;
          continue;
        }

        i++;
        let word = '';
        while (i < rawRtf.length && /[a-zA-Z]/.test(rawRtf[i])) {
          word += rawRtf[i];
          i++;
        }
        while (i < rawRtf.length && /[-0-9]/.test(rawRtf[i])) {
          i++;
        }
        if (i < rawRtf.length && rawRtf[i] === ' ') {
          i++;
        }

        if (ignoreGroups.includes(word)) {
          if (ignoreDepth === -1) ignoreDepth = groupDepth;
        } else if (word === 'par' || word === 'line') {
          extracted += '\n';
        } else if (word === 'tab') {
          extracted += '\t';
        } else if (word === 'emdash' || word === 'endash') {
          extracted += '-';
        }
        continue;
      }

      if (c !== '\r' && c !== '\n') {
        extracted += c;
      }
      i++;
    }

    let finalContent = extracted.trim();
    
    console.log("=== EXTRACTED RTF CONTENT ===");
    console.log(finalContent);
    console.log("=============================");
}

testRtf();
