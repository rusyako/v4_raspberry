import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourceRoot = path.join(__dirname, 'src');
const sourcePages = path.join(sourceRoot, 'pages');
const sourceAssets = path.join(sourceRoot, 'assets');
const distDir = path.join(__dirname, 'dist');
const assetsDir = path.join(distDir, 'assets');

const htmlFiles = ['index.html', 'scan_page.html', 'return_page.html', 'hello_page.html', 'admin.html'];

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
mkdirSync(assetsDir, { recursive: true });

cpSync(path.join(sourceAssets, 'css'), path.join(assetsDir, 'css'), { recursive: true });
cpSync(path.join(sourceAssets, 'js'), path.join(assetsDir, 'js'), { recursive: true });
cpSync(path.join(sourceAssets, 'img'), path.join(assetsDir, 'img'), { recursive: true });

for (const fileName of htmlFiles) {
  const sourcePath = path.join(sourcePages, fileName);
  if (!existsSync(sourcePath)) {
    continue;
  }

  let html = readFileSync(sourcePath, 'utf8');

  html = html.replace(/\{\{\s*url_for\('static',\s*filename='([^']+)'\)\s*\}\}/g, '/assets/$1');
  html = html.replace(/\{#.*?#\}/gs, '');
  html = html.replace(/href="assets\//g, 'href="/assets/');
  html = html.replace(/src="assets\//g, 'src="/assets/');

  if (fileName === 'index.html') {
    html = html.replace(/\{\{\s*laptop_count\s*\}\}/g, '0/0');
  }

  writeFileSync(path.join(distDir, fileName), html);
}

console.log('Frontend build created in frontend/dist');
