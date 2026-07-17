import { FormEvent, useState } from "react";

import { login, type AuthUser } from "./authClient";

export function LoginPage({ onSuccess, message }: { onSuccess: (user: AuthUser) => void; message?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      onSuccess(await login(email.trim(), password));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo iniciar sesión.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <p className="dashboard-eyebrow">Finanzas personales</p>
        <h1 id="login-title">Iniciar sesión</h1>
        <p className="auth-description">Accede para revisar y gestionar tus finanzas.</p>
        {message ? <p className="auth-error" role="alert">{message}</p> : null}
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <form onSubmit={handleSubmit}>
          <label className="auth-field">
            Correo electrónico
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required disabled={isSubmitting} />
          </label>
          <label className="auth-field">
            Contraseña
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required disabled={isSubmitting} />
          </label>
          <button className="auth-submit" type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting ? "Iniciando sesión..." : "Iniciar sesión"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default LoginPage;
