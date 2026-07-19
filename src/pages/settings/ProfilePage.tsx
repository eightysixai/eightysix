import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

const profileSchema = z.object({
  fullName: z.string().min(1, "Name is required"),
});
type ProfileFormValues = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
type PasswordFormValues = z.infer<typeof passwordSchema>;

export function ProfilePage() {
  const { user } = useAuth();
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: "" },
  });

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        profileForm.reset({ fullName: data?.full_name ?? "" });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const onSaveProfile = profileForm.handleSubmit(async (values) => {
    if (!user) return;
    setProfileError(null);
    setProfileSaved(false);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: values.fullName })
      .eq("id", user.id);
    if (error) setProfileError(error.message);
    else setProfileSaved(true);
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onChangePassword = passwordForm.handleSubmit(async (values) => {
    setPasswordError(null);
    setPasswordSaved(false);
    const { error } = await supabase.auth.updateUser({
      password: values.password,
    });
    if (error) setPasswordError(error.message);
    else {
      setPasswordSaved(true);
      passwordForm.reset({ password: "", confirmPassword: "" });
    }
  });

  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h2>Profile</h2>
        </div>
        {profileError && <p className="form-error">{profileError}</p>}
        <form onSubmit={onSaveProfile} noValidate>
          <div className="form-row">
            <label>
              Email
              <input type="email" value={user?.email ?? ""} disabled />
            </label>
            <label>
              Display Name
              <input type="text" {...profileForm.register("fullName")} />
            </label>
          </div>
          <div className="modal-footer" style={{ border: "none", padding: 0 }}>
            <div />
            <div className="modal-actions">
              {profileSaved && (
                <span style={{ color: "var(--under)", fontSize: 13 }}>
                  Saved
                </span>
              )}
              <button
                type="submit"
                className="btn btn-primary"
                disabled={profileForm.formState.isSubmitting}
              >
                Save
              </button>
            </div>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Change Password</h2>
        </div>
        {passwordError && <p className="form-error">{passwordError}</p>}
        <form onSubmit={onChangePassword} noValidate>
          <div className="form-row">
            <label>
              New Password
              <input type="password" {...passwordForm.register("password")} />
              {passwordForm.formState.errors.password && (
                <span className="form-error">
                  {passwordForm.formState.errors.password.message}
                </span>
              )}
            </label>
            <label>
              Confirm Password
              <input
                type="password"
                {...passwordForm.register("confirmPassword")}
              />
              {passwordForm.formState.errors.confirmPassword && (
                <span className="form-error">
                  {passwordForm.formState.errors.confirmPassword.message}
                </span>
              )}
            </label>
          </div>
          <div className="modal-footer" style={{ border: "none", padding: 0 }}>
            <div />
            <div className="modal-actions">
              {passwordSaved && (
                <span style={{ color: "var(--under)", fontSize: 13 }}>
                  Password updated
                </span>
              )}
              <button
                type="submit"
                className="btn btn-primary"
                disabled={passwordForm.formState.isSubmitting}
              >
                Update Password
              </button>
            </div>
          </div>
        </form>
      </section>
    </>
  );
}
