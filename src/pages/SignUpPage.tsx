import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate } from "react-router";
import { z } from "zod";
import { useAuth } from "../context/AuthContext";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type FormValues = z.infer<typeof schema>;

export function SignUpPage() {
  const { session, signUp } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  if (session) return <Navigate to="/dashboard" replace />;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const { error, needsEmailConfirmation } = await signUp(
      values.email,
      values.password,
    );
    if (error) {
      setFormError(error);
      return;
    }
    if (needsEmailConfirmation) {
      setConfirmationSent(true);
      return;
    }
    navigate("/onboarding", { replace: true });
  });

  if (confirmationSent) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1>Check your email</h1>
          <p className="subtitle">
            We sent a confirmation link — follow it, then sign in below.
          </p>
          <Link to="/sign-in" className="btn btn-primary" style={{ width: "100%", textAlign: "center", display: "block" }}>
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>Create an account</h1>
        <p className="subtitle">Set up your restaurant's P&amp;L dashboard</p>

        {formError && <p className="form-error">{formError}</p>}

        <form onSubmit={onSubmit} noValidate>
          <label className="auth-field">
            Email
            <input type="email" autoComplete="email" {...register("email")} />
            {errors.email && (
              <span className="form-error">{errors.email.message}</span>
            )}
          </label>

          <label className="auth-field">
            Password
            <input
              type="password"
              autoComplete="new-password"
              {...register("password")}
            />
            {errors.password && (
              <span className="form-error">{errors.password.message}</span>
            )}
          </label>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%" }}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating account…" : "Sign up"}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account? <Link to="/sign-in">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
