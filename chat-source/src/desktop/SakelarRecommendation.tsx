import { UIIcon as I } from '../components/UIIcon';

export function SakelarRecommendation() {
  return <section className="d-sakelar-recommendation" aria-label="Akun AXIOM AI">
    <div className="d-sakelar-heading"><span>A</span><div><small>AKUN</small><h3>AXIOM AI</h3></div></div>
    <p>Kelola key dan penggunaan melalui dashboard AXIOM AI.</p>
    <a href="/dashboard" target="_top">Dashboard AXIOM AI <I name="expand" size={16}/></a>
    <small>Model mengikuti akses akun Anda.</small>
  </section>;
}
