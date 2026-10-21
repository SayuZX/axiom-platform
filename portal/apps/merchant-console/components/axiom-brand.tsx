import styles from './axiom-brand.module.css';

export function AxiomBrand() {
  return (
    <span className={styles.brand}>
      <span className={styles.monogram} aria-hidden="true">a.</span>
      <span className={styles.wordmark}>
        Axiom
        <span className={styles.secondary}>Payment</span>
      </span>
    </span>
  );
}
