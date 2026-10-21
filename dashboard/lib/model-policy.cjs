// JavaScript, model-policy.cjs, Node.js 24/browser: shared API-key model permissions.
'use strict';

function parseModelList(value) {
  if (value == null) return [];
  const list = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(list) || list.length > 200 || list.some(item => typeof item !== 'string' || !item.trim() || item.length > 300 || /[\s\u0000-\u001f\u007f]/.test(item.trim()))) {
    throw new TypeError('Model policy must contain model IDs or wildcard patterns, not display names.');
  }
  return [...new Set(list.map(item => item.trim()))];
}

function modelMatches(rule, model) {
  if (typeof model !== 'string' || !model.trim()) return false;
  rule = rule.trim().toLowerCase();
  model = model.trim().toLowerCase();
  if (rule === '*') return true;
  if (rule.includes('*')) {
    const pattern = rule.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return new RegExp(`^${pattern}$`).test(model);
  }
  return model === rule || model.endsWith('/' + rule);
}

function policyAllowsModel(policy, model) {
  try {
    const allowed = parseModelList(policy.allowedModels);
    const blocked = parseModelList(policy.blockedModels);
    return !blocked.some(rule => modelMatches(rule, model)) && (!allowed.length || allowed.some(rule => modelMatches(rule, model)));
  } catch {
    return false;
  }
}

module.exports = { parseModelList, modelMatches, policyAllowsModel };
