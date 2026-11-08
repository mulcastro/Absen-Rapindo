import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';

import styles from './Ui.module.css';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function Input({
  label,
  error,
  hint,
  id: providedId,
  className,
  ...props
}: InputProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const descriptionId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const classes = [styles.input, error && styles.inputError, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        {...props}
        id={id}
        className={classes}
        aria-invalid={error ? true : undefined}
        aria-describedby={descriptionId}
      />
      {error ? (
        <p className={styles.fieldError} id={descriptionId}>
          <span aria-hidden="true">!</span> {error}
        </p>
      ) : (
        hint && (
          <p className={styles.hint} id={descriptionId}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}

type PINInputProps = Omit<
  InputProps,
  'type' | 'inputMode' | 'maxLength' | 'pattern'
>;

export function PINInput(props: PINInputProps) {
  return (
    <Input
      {...props}
      type="password"
      inputMode="numeric"
      autoComplete="current-password"
      maxLength={6}
      pattern="[0-9]{6}"
    />
  );
}
