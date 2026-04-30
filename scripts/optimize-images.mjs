import { spawn } from 'node:child_process';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imageRoot = path.join(root, 'public', 'images');
const optimizedRoot = path.join(imageRoot, '_optimized');
const widths = [360, 640, 800, 1200];
const extensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const force = process.argv.includes('--force');

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (fullPath.startsWith(optimizedRoot)) continue;

    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else if (extensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}\n${stderr}`));
    });
  });
}

async function shouldSkip(input, output) {
  if (force) return false;

  try {
    const [inputStat, outputStat] = await Promise.all([stat(input), stat(output)]);
    return outputStat.mtimeMs >= inputStat.mtimeMs;
  } catch {
    return false;
  }
}

async function optimizeFile(input) {
  const relative = path.relative(imageRoot, input);
  const parsed = path.parse(relative);
  const outputDir = path.join(optimizedRoot, parsed.dir);
  await mkdir(outputDir, { recursive: true });

  for (const width of widths) {
    const output = path.join(outputDir, `${parsed.name}-${width}.webp`);
    if (await shouldSkip(input, output)) continue;

    await run('ffmpeg', [
      '-y',
      '-v',
      'error',
      '-i',
      input,
      '-vf',
      `scale=${width}:-2`,
      '-frames:v',
      '1',
      '-c:v',
      'libwebp',
      '-quality',
      '78',
      '-compression_level',
      '5',
      output,
    ]);
  }
}

const files = await walk(imageRoot);
let completed = 0;

for (const file of files) {
  await optimizeFile(file);
  completed += 1;
  if (completed % 20 === 0 || completed === files.length) {
    console.log(`Optimized ${completed}/${files.length}`);
  }
}

console.log(`Done. Optimized variants are in ${path.relative(root, optimizedRoot)}.`);
