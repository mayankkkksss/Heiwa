import assert from 'assert';
import fs from 'fs';

console.log('Testing Credits modal and UI configuration...');

// Check index.html contains Credits buttons
const html = fs.readFileSync('index.html', 'utf8');
assert(html.includes('id="btn-credits"'), 'index.html must have #btn-credits');
assert(html.includes('id="btn-pause-credits"'), 'index.html must have #btn-pause-credits');

// Check style.css contains credits styles
const css = fs.readFileSync('src/style.css', 'utf8');
assert(css.includes('.credits-panel'), 'style.css must have .credits-panel');
assert(css.includes('.credits-link'), 'style.css must have .credits-link');
assert(css.includes('.settings-nav-bar'), 'style.css must have .settings-nav-bar');

// Check UISystem.js has openCreditsModal and appropriate credits text
const uiJs = fs.readFileSync('src/systems/UISystem.js', 'utf8');
assert(uiJs.includes('openCreditsModal'), 'UISystem must have openCreditsModal');
assert(uiJs.includes('Mayank Suthar'), 'UISystem must credit Mayank Suthar');
assert(uiJs.includes('https://github.com/mayankkkksss/'), 'UISystem must have github link');
assert(uiJs.includes('Antigravity'), 'UISystem must credit Antigravity');
assert(uiJs.includes('ChatGPT'), 'UISystem must credit ChatGPT');

// Check README.md
const readme = fs.readFileSync('README.md', 'utf8');
assert(readme.includes('## 🌸 Credits'), 'README must have Credits section');
assert(readme.includes('Mayank Suthar'), 'README must credit Mayank Suthar');
assert(readme.includes('https://github.com/mayankkkksss/'), 'README must link github profile');
assert(readme.includes('Antigravity'), 'README must credit Antigravity');
assert(readme.includes('ChatGPT'), 'README must credit ChatGPT');

// Check Japanese language rule across all src/ and index.html
const filesToCheck = ['index.html', 'src/systems/UISystem.js', 'src/style.css'];
for (const f of filesToCheck) {
  const content = fs.readFileSync(f, 'utf8');
  // Remove allowed '平和'
  const stripped = content.replace(/平和/g, '');
  // Match any other kanji or kana
  const jpMatch = stripped.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/);
  if (jpMatch) {
    console.error(`Forbidden Japanese character found in ${f}: ${jpMatch[0]}`);
    process.exit(1);
  }
}

console.log('All Credits checks passed successfully!');
