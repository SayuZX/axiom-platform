import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSdkLayerOrder } from '../scripts/checkSdkStyles.mjs';

test('production style guard rejects SDK components emitted before the base reset', () => {
  assert.doesNotThrow(() => assertSdkLayerOrder('@layer theme,base,components,utilities; @layer components{.Button{padding:12px}}'));
  assert.doesNotThrow(() => assertSdkLayerOrder('@layer properties{} @layer theme{} @layer base{} @layer components; @layer utilities{} @layer components{.Button{padding:12px}}'));
  assert.throws(() => assertSdkLayerOrder('@layer components{.Button{padding:12px}} @layer theme,base,components,utilities; @layer base{button{padding:0}}'), /layer order/);
});
