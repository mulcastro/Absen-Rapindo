import logoUrl from '../../assets/logo-lpk-rapindo.svg';
import styles from './Shell.module.css';

export function BrandLogo() {
  return (
    <img
      className={styles.brandLogo}
      src={logoUrl}
      alt="Logo LPK Rapindo"
      width="44"
      height="48"
    />
  );
}
