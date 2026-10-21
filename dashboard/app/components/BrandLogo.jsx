export default function BrandLogo({ className = '', wordmark = true }) {
  return <span className={`brand ${className}`}><img src="/axiom-ai.svg" width="42" height="42" alt=""/>{wordmark && <span>AXIOM<span className="brand-ai">.AI</span><small>UNIFIED AI GATEWAY</small></span>}</span>;
}
