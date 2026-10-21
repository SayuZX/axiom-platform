// Shared pure retail calculations; actual prices come from the router's AXIOM retail JSON.
const valid = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export function priceForModel(model, catalog) {
  const level = catalog?.models?.[model?.id];
  const rate = catalog?.tiers?.[level];
  const configured = catalog?.currency === 'IDR' && catalog?.unit === '1M_tokens' && valid(rate?.input) && valid(rate?.output);
  return {
    priceTier: configured ? level : null, inputPriceIdr: configured ? rate.input : null,
    outputPriceIdr: configured ? rate.output : null, currency: 'IDR', priceUnit: 'million_tokens',
    pricingSource: configured ? 'axiom-retail' : null, priceVersion: configured ? catalog.version : null
  };
}
export function estimateWeighted(pkg, model, values) {
  if (!valid(model?.inputPriceIdr) || !valid(model?.outputPriceIdr) || !Number.isSafeInteger(pkg?.price) || pkg.price <= 0 ||
      !Number.isSafeInteger(pkg?.tokenLimit) || pkg.tokenLimit <= 0 ||
      !['input','output','requests'].every(k => Number.isSafeInteger(values?.[k]) && values[k] >= 0)) return null;
  const perRequestCost = (values.input * model.inputPriceIdr + values.output * model.outputPriceIdr) / 1000000;
  const debitTokensPerRequest = Math.ceil(perRequestCost * pkg.tokenLimit / pkg.price);
  const workloadDebitTokens = debitTokensPerRequest * values.requests;
  if (![perRequestCost, debitTokensPerRequest, workloadDebitTokens].every(Number.isFinite) || workloadDebitTokens > Number.MAX_SAFE_INTEGER) return null;
  return { perRequestCost, workloadCost: perRequestCost * values.requests, debitTokensPerRequest,
    workloadDebitTokens, remaining: pkg.tokenLimit - workloadDebitTokens,
    quotaShare: workloadDebitTokens / pkg.tokenLimit * 100,
    requestCapacity: debitTokensPerRequest === 0 ? null : Math.floor(pkg.tokenLimit / debitTokensPerRequest) };
}
