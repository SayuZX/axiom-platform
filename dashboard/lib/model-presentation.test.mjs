import assert from 'node:assert/strict';
import { presentModel } from './model-presentation.mjs';
const model = { id: 'ax/Atria-Dawn-Preview', name: 'ax/Atria-Dawn-Preview', provider: 'ax' };
assert.deepEqual(presentModel(model), { ...model, name: 'Atria Dawn Preview', provider: 'Atria' });
assert.equal(presentModel({ id: 'ax/gpt-5.4-mini', provider: 'ax' }).name, 'GPT 5.4 Mini');
assert.equal(presentModel({ id: 'ax/glm-5.3', provider: 'ax' }).provider, 'Z.ai');
assert.equal(presentModel({ id: 'custom/Unknown', provider: 'custom' }).provider, 'custom');
console.log('Model presentation checks passed');
