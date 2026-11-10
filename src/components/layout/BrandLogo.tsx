import styles from './Shell.module.css';

export function BrandLogo() {
  return (
    <img
      className={styles.brandLogo}
      src="/logo-lpk-rapindo.svg"
      alt="Logo LPK Rapindo"
      width="44"
      height="48"
    />
  );
}
