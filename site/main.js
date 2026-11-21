/*
 * Drawnie - a whiteboard for simple, beautiful diagrams.
 * Copyright (C) 2026 Jorge Juarez <contacto@jorgejuarez.net>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * Additional attribution terms apply; see the NOTICE file.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// Website behavior: theme toggle and download links from the latest release.

const REPO = 'JorgeJuarezM/Drawnie';
const THEME_KEY = 'drawnie.site.theme';
const $ = (sel) => document.querySelector(sel);

// ---------- Theme ----------
const media = matchMedia('(prefers-color-scheme: dark)');
const isDark = () => (document.documentElement.dataset.theme || (media.matches ? 'dark' : 'light')) === 'dark';

$('#theme-toggle').addEventListener('click', () => {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch { /* storage unavailable */ }
});

// ---------- Downloads ----------
function detectOS() {
  const p = (navigator.userAgentData?.platform || navigator.platform || navigator.userAgent).toLowerCase();
  if (p.includes('mac')) return 'mac';
  if (p.includes('win')) return 'win';
  return null;
}

const formatSize = (bytes) => `${(bytes / 1024 / 1024).toFixed(0)} MB`;

async function loadRelease() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return res.json();
}

function setDownload(id, asset) {
  const el = document.getElementById(id);
  if (!el || !asset) return;
  el.href = asset.browser_download_url;
  const file = el.querySelector('.dl-file');
  file.textContent = `${file.dataset.default} · ${formatSize(asset.size)}`;
}

(async () => {
  const os = detectOS();
  const primary = $('#cta-primary');
  const label = $('#cta-label');
  if (os === 'mac') label.textContent = 'Download for Mac';
  if (os === 'win') label.textContent = 'Download for Windows';
  if (os) document.getElementById(os === 'mac' ? 'dl-mac-arm64' : 'dl-win')?.classList.add('recommended');

  try {
    const release = await loadRelease();
    const find = (re) => release.assets.find((a) => re.test(a.name));
    const macArm = find(/mac-arm64\.dmg$/);
    const macIntel = find(/mac-x64\.dmg$/);
    const win = find(/Setup-.*\.exe$/);
    setDownload('dl-mac-arm64', macArm);
    setDownload('dl-mac-x64', macIntel);
    setDownload('dl-win', win);
    $('#version-label').textContent = release.tag_name;

    if (os === 'mac' && macArm) {
      primary.href = macArm.browser_download_url;
      $('#cta-note').innerHTML = `${release.tag_name} for Apple Silicon · <a href="${macIntel?.browser_download_url || '#download'}">Intel Mac</a> · <a href="#download">Other platforms</a>`;
    } else if (os === 'win' && win) {
      primary.href = win.browser_download_url;
      $('#cta-note').innerHTML = `${release.tag_name} for Windows (x64 &amp; ARM) · <a href="#download">Other platforms</a>`;
    } else {
      primary.href = '#download';
    }
  } catch {
    // Offline or rate-limited: the links keep pointing to the releases page.
    if (!os) primary.href = '#download';
  }
})();
