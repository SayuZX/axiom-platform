import styles from './skeleton.module.css';

export default function Skeleton({ rows = 3, variant = 'text', label = 'Memuat…' }) {
  return <span className={`${styles.skeleton} ${styles[variant] || styles.text}`} role="status">
    <span className={styles.srOnly}>{label}</span>
    {Array.from({ length: rows }, (_, index) => <span className={styles.line} aria-hidden="true" key={index} />)}
  </span>;
}
