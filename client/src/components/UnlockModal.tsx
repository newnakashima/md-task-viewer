import { type FormEvent, type ReactElement, useState } from "react";

export function UnlockModal({
  busy,
  errorMessage,
  onUnlock
}: {
  busy: boolean;
  errorMessage: string | null;
  onUnlock: (key: string) => void;
}): ReactElement {
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed) {
      onUnlock(trimmed);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="unlock-modal-title">
      <form className="modal modal-unlock" onSubmit={handleSubmit}>
        <h2 id="unlock-modal-title">Unlock tasks</h2>
        <p>Paste the decryption key shared with you to view the tasks.</p>
        <label>
          <span>Decryption key</span>
          <input
            type="password"
            autoFocus
            autoComplete="off"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="base64url key"
          />
        </label>
        {errorMessage ? <p className="notice notice--error" role="alert">{errorMessage}</p> : null}
        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={busy || !value.trim()}>
            Unlock
          </button>
        </div>
      </form>
    </div>
  );
}
