import modelPolicy from './model-policy.cjs';
const { parseModelList, policyAllowsModel } = modelPolicy;

const MAX = Number.MAX_SAFE_INTEGER;

export function validCalculatorPackage(pkg) {
  try { parseModelList(pkg?.allowedModels); parseModelList(pkg?.blockedModels); } catch { return false; }
  return pkg && typeof pkg.id === 'string' && pkg.id.length > 0 && typeof pkg.name === 'string'
    && pkg.currency === 'IDR' && Number.isSafeInteger(pkg.price) && pkg.price > 0
    && Number.isSafeInteger(pkg.tokenLimit) && pkg.tokenLimit > 0
    && Number.isSafeInteger(pkg.validDays) && pkg.validDays > 0
    && Number.isSafeInteger(pkg.rpmLimit) && pkg.rpmLimit >= 0
    && Number.isSafeInteger(pkg.tpmLimit) && pkg.tpmLimit >= 0
    && (pkg.allowedModels == null || Array.isArray(pkg.allowedModels))
    && (pkg.blockedModels == null || Array.isArray(pkg.blockedModels));
}

export function packageAllowsModel(pkg, id) {
  return policyAllowsModel(pkg, id);
}

export function estimatePackage(pkg, values) {
  const errors = {};
  const parsed = {};
  for (const key of ['input', 'output', 'requests']) {
    const text = String(values[key] ?? '').trim();
    const value = Number(text);
    if (!text) errors[key] = 'Wajib diisi; gunakan 0 jika tidak ada.';
    else if (!/^\d+$/.test(text) || !Number.isSafeInteger(value) || value < 0) errors[key] = 'Gunakan bilangan bulat 0–9.007.199.254.740.991, tanpa pecahan, tanda, atau notasi eksponen.';
    else parsed[key] = value;
  }
  if (Object.keys(errors).length) return { errors };
  const perRequest = parsed.input + parsed.output;
  if (!Number.isSafeInteger(perRequest)) return { errors: { total: 'Total input + output melampaui batas bilangan bulat aman.' } };
  if (perRequest === 0) return { errors: { total: 'Input + output harus minimal 1 token per request. Salah satunya boleh 0.' } };
  const totalTokens = perRequest * parsed.requests;
  if (!Number.isSafeInteger(totalTokens)) return { errors: { total: 'Total token workload melampaui batas bilangan bulat aman. Kurangi token atau jumlah request.' } };
  if (!validCalculatorPackage(pkg)) return { errors, perRequest, totalTokens };
  const perRequestCost = pkg.price * (perRequest / pkg.tokenLimit);
  const workloadCost = pkg.price * (totalTokens / pkg.tokenLimit);
  if (![perRequestCost, workloadCost].every(value => Number.isFinite(value) && value <= MAX)) return { errors: { total: 'Estimasi biaya melampaui batas angka aman. Kurangi token atau jumlah request.' } };
  return {
    errors, ...parsed, perRequest, totalTokens, perRequestCost, workloadCost,
    perMillionCost: pkg.price * (1_000_000 / pkg.tokenLimit),
    // Integer division avoids rounding a near-integer ratio up at the safe-integer boundary.
    requestCapacity: Number(BigInt(pkg.tokenLimit) / BigInt(perRequest)),
    remaining: pkg.tokenLimit - totalTokens,
    quotaShare: totalTokens / pkg.tokenLimit * 100,
  };
}
