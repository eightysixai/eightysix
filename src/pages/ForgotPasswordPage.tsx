import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { z } from "zod";
import { supabase } from "../lib/supabase";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
});
type FormValues = z.infer<typeof schema>;

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(
      values.email,
      { redirectTo: `${window.location.origin}/reset-password` },
    );
    if (error) {
      setFormError(error.message);
      return;
    }
    setSent(true);
  });

  if (sent) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1>Check your email</h1>
          <p className="subtitle">
            If an account exists for that address, we sent a link to reset
            your password.
          </p>
          <Link
            to="/sign-in"
            className="btn btn-primary"
            style={{ width: "100%", textAlign: "center", display: "block" }}
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>Reset your password</h1>
        <p className="subtitle">
          Enter your email and we'll send you a reset link.
        </p>

        {formError && <p className="form-error">{formError}</p>}

        <form onSubmit={onSubmit} noValidate>
          <label className="auth-field">
            Email
            <input type="email" autoComplete="email" {...register("email")} />
            {errors.email && (
              <span className="form-error">{errors.email.message}</span>
            )}
          </label>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%" }}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Sending…" : "Send reset link"}
          </button>
        </form>

        <p className="auth-switch">
          <Link to="/sign-in">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
