import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assetUrl } from '../src/lib/asset.js';

test('assetUrl: both args present returns correct path', () => {
  assert.equal(assetUrl('myscript', 'assets/img.png'), '/content/myscript/assets/img.png');
});

test('assetUrl: undefined scriptId returns undefined', () => {
  assert.equal(assetUrl(undefined, 'assets/img.png'), undefined);
});

test('assetUrl: null path returns undefined', () => {
  assert.equal(assetUrl('myscript', null), undefined);
});

test('assetUrl: undefined path returns undefined', () => {
  assert.equal(assetUrl('myscript', undefined), undefined);
});

test('assetUrl: both undefined returns undefined', () => {
  assert.equal(assetUrl(undefined, undefined), undefined);
});

test('assetUrl: empty string scriptId returns undefined', () => {
  assert.equal(assetUrl('', 'img.png'), undefined);
});

test('assetUrl: empty string path returns undefined', () => {
  assert.equal(assetUrl('myscript', ''), undefined);
});

test('assetUrl: encodes special chars in scriptId', () => {
  assert.equal(assetUrl('my script', 'img.png'), '/content/my%20script/img.png');
});

test('assetUrl: standard path with multiple segments', () => {
  assert.equal(assetUrl('danshui', 'assets/scenes/scene_crime.webp'), '/content/danshui/assets/scenes/scene_crime.webp');
});
