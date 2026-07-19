import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { z } from "zod";
import { supabase } from "../lib/supabase";

const schema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
type FormValues = z.infer<typeof schema>;

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    // Supabase's client parses the recovery token out of the URL hash and
    // establishes a temporary session automatically; PASSWORD_RECOVERY fires
    // once that's done.
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "PASSWORD_RECOVERY") setReady(true);
      },
    );
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const { error } = await supabase.auth.updateUser({
      password: values.password,
    });
    if (error) {
      setFormError(error.message);
      return;
    }
    navigate("/dashboard", { replace: true });
  });

  if (!ready) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1>Reset your password</h1>
          <p className="subtitle">
            Waiting for the reset link to finish loading — if this doesn't
            resolve, request a new link from the sign-in page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>Choose a new password</h1>

        {formError && <p className="form-error">{formError}</p>}

        <form onSubmit={onSubmit} noValidate>
          <label className="auth-field">
            New Password
            <input
              type="password"
              autoComplete="new-password"
              {...register("password")}
            />
            {errors.password && (
              <span className="form-error">{errors.password.message}</span>
            )}
          </label>
          <label className="auth-field">
            Confirm Password
            <input
              type="password"
              autoComplete="new-password"
              {...register("confirmPassword")}
            />
            {errors.confirmPassword && (
              <span className="form-error">
                {errors.confirmPassword.message}
              </span>
            )}
          </label>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%" }}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
