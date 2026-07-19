import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import type { Location } from "react-router";
import { z } from "zod";
import { useAuth } from "../context/AuthContext";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

export function SignInPage() {
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  if (session) {
    const from =
      (location.state as { from?: Location })?.from?.pathname ?? "/dashboard";
    return <Navigate to={from} replace />;
  }

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    const { error } = await signIn(values.email, values.password);
    if (error) {
      setFormError(error);
      return;
    }
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>Sign in</h1>
        <p className="subtitle">Access your restaurant's P&amp;L dashboard</p>

        {formError && <p className="form-error">{formError}</p>}

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
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
              autoComplete="current-password"
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
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="auth-switch">
          <Link to="/forgot-password">Forgot password?</Link>
        </p>
        <p className="auth-switch">
          Don't have an account? <Link to="/sign-up">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
