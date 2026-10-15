import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { page } from '../workers/boss/src/html.mjs';

const publicCss = fs.readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
const html = page({ title: 'Theme check', body: '', identity: { email: 'hakan@dndr.net' } });
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const tokens = (source) => Object.fromEntries([...source.match(/:root\{([^}]+)/)[1].matchAll(/(--[\w-]+):([^;\n}]+)/g)].map(([, key, value]) => [key, value.trim()]));
const pub = tokens(publicCss), boss = tokens(css);
const value = (name) => boss[name]?.startsWith('var(') ? value(boss[name].slice(4, -1)) : boss[name];

test('Boss neutral/brand/header tokens match the frozen public source without sharing its CSS', () => {
  for (const [target, source] of Object.entries({
    '--bg': '--night', '--bg-2': '--night-2', '--panel': '--card', '--panel-2': '--night-2', '--sunk': '--night',
    '--text': '--ink', '--muted': '--dim', '--faint': '--dim', '--line': '--line', '--line-2': '--line-strong',
    '--accent': '--red', '--accent-strong': '--red', '--accent-hover': '--red-hot', '--accent-text': '--red-hot',
  })) assert.equal(value(target), pub[source], `${target} must follow public ${source}`);
  assert.equal(value('--header'), publicCss.match(/\.site-head\{[^}]*background:([^;]+)/)[1]);
  assert.ok(css.includes('.topbar{position:sticky;top:0;z-index:20;background:var(--header)'));
  assert.ok(html.includes(`name="theme-color" content="${pub['--night']}"`));
  assert.equal(value('--focus'), pub['--red-hot']);
  assert.ok(css.includes('outline:2px solid var(--focus);outline-offset:2px'));
  assert.ok(css.includes('input:focus,select:focus,textarea:focus{outline:none;border-color:var(--focus)'));
});

function rgb(color) {
  if (color.startsWith('#')) {
    const hex = color.length === 4 ? [...color.slice(1)].map((c) => c + c).join('') : color.slice(1);
    return hex.match(/../g).map((c) => parseInt(c, 16));
  }
  return color.match(/[\d.]+/g).map(Number);
}
function composite(fg, bg) {
  const a = fg[3] ?? 1;
  return fg.slice(0, 3).map((c, i) => c * a + bg[i] * (1 - a));
}
function contrast(a, b) {
  const lum = (color) => color.slice(0, 3).map((c) => c / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

test('Boss small text, action states, semantic badges and focus/control boundaries retain sufficient contrast', () => {
  const surfaces = ['--bg', '--bg-2', '--panel'].map((key) => rgb(value(key)));
  surfaces.push(composite(rgb('rgba(142,160,201,.08)'), rgb(value('--panel'))));
  surfaces.push(composite(rgb(value('--header')), rgb(value('--panel'))));
  for (const bg of surfaces) {
    for (const key of ['--text', '--muted', '--faint', '--accent-text']) assert.ok(contrast(rgb(value(key)), bg) >= 4.5, `${key} must meet 4.5:1`);
    for (const key of ['--focus', '--control-line']) assert.ok(contrast(rgb(value(key)), bg) >= 3, `${key} must meet 3:1`);
  }
  for (const key of ['--accent-strong', '--accent-hover']) assert.ok(contrast(rgb(value('--on-accent')), rgb(value(key))) >= 4.5, `${key} action text must meet 4.5:1`);
  for (const semantic of ['ok', 'warn', 'bad', 'info']) {
    const bg = composite(rgb(value(`--${semantic}-soft`)), rgb(value('--panel')));
    assert.ok(contrast(rgb(value(`--${semantic}`)), bg) >= 4.5, `${semantic} badge text must meet 4.5:1`);
  }
  assert.equal(new Set(['ok', 'warn', 'bad', 'info'].map((key) => value(`--${key}`))).size, 4);
  assert.ok(css.includes('button.danger:hover{background:var(--accent-strong);color:var(--on-accent)'));
});
