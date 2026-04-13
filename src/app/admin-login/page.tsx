"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useMemo, useState } from "react";
import styles from "./page.module.css";

function toSafeNextPath(input: string) {
  const value = input.trim();
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

function addAdminMode(path: string) {
  const [pathname, search = ""] = path.split("?");
  const params = new URLSearchParams(search);
  params.set("admin", "1");
  const nextQuery = params.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

async function readResponseMessage(response: Response) {
  try {
    const parsed = (await response.json()) as { message?: string };
    if (parsed.message?.trim()) {
      return parsed.message.trim();
    }
  } catch {
    // Ignore and fallback.
  }
  return `Request failed with ${response.status}`;
}

function AdminLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(
    () => toSafeNextPath(searchParams.get("next") ?? "/"),
    [searchParams],
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMessage("Enter superadmin email and password.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/admin-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
        }),
      });

      if (!response.ok) {
        setErrorMessage(await readResponseMessage(response));
        return;
      }

      router.replace(addAdminMode(nextPath));
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to complete admin login.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1 className={styles.title}>Admin Login</h1>
        <p className={styles.subtitle}>
          Login with superadmin email/password to enable drag-and-reorder on favorites.
        </p>

        <form onSubmit={handleSubmit}>
          <div className={styles.fields}>
            <div className={styles.field}>
              <label htmlFor="admin-username" className={styles.label}>
                Superadmin Email
              </label>
              <input
                id="admin-username"
                type="text"
                className={styles.input}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder="Enter superadmin email"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="admin-password" className={styles.label}>
                Password
              </label>
              <input
                id="admin-password"
                type="password"
                className={styles.input}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder="Enter password"
              />
            </div>
          </div>

          {errorMessage ? <div className={styles.error}>{errorMessage}</div> : null}

          <div className={styles.actions}>
            <span className={styles.nextPath}>Next: {nextPath}</span>
            <button type="submit" className={styles.submit} disabled={isSubmitting}>
              {isSubmitting ? "Logging in..." : "Login"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginContent />
    </Suspense>
  );
}
