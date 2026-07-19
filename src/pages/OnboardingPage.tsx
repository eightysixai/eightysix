import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useNavigate } from "react-router";
import { z } from "zod";
import { useOrganization } from "../context/OrganizationContext";

const schema = z.object({
  organizationName: z.string().min(1, "Restaurant name is required"),
  locationName: z.string().min(1, "Location name is required"),
});

type FormValues = z.infer<typeof schema>;

export function OnboardingPage() {
  const {
    loading,
    organizationId,
    locationId,
    pendingInvites,
    createOrganization,
    acceptInvite,
    declineInvite,
  } = useOrganization();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { locationName: "Main Location" },
  });

  if (!loading && organizationId && locationId) {
    return <Navigate to="/dashboard" replace />;
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const { error } = await createOrganization(
      values.organizationName,
      values.locationName,
    );
    if (error) {
      setFormError(error);
      return;
    }
    navigate("/dashboard", { replace: true });
  });

  async function handleAccept(orgId: string) {
    setInviteError(null);
    const { error } = await acceptInvite(orgId);
    if (error) setInviteError(error);
  }

  async function handleDecline(orgId: string) {
    setInviteError(null);
    const { error } = await declineInvite(orgId);
    if (error) setInviteError(error);
  }

  return (
    <div className="auth-shell">
      <div className="auth-card" style={{ width: 440 }}>
        {pendingInvites.length > 0 && (
          <>
            <h1>You've been invited</h1>
            <p className="subtitle">
              Accept an invite to join an existing restaurant, or create your
              own below.
            </p>
            {inviteError && <p className="form-error">{inviteError}</p>}
            <div style={{ marginBottom: 20 }}>
              {pendingInvites.map((invite) => (
                <div
                  key={invite.organizationId}
                  className="panel"
                  style={{ margin: "0 0 12px", padding: "14px 16px" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <strong>{invite.organizationName}</strong>
                      <div className="subtitle" style={{ fontSize: 12 }}>
                        Invited as {invite.role}
                      </div>
                    </div>
                    <div className="modal-actions">
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleDecline(invite.organizationId)}
                      >
                        Decline
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={() => handleAccept(invite.organizationId)}
                      >
                        Accept
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {(pendingInvites.length === 0 || showCreateForm) && (
          <>
            <h1>Set up your restaurant</h1>
            <p className="subtitle">
              Create your restaurant workspace to start tracking invoices,
              recipes, and P&amp;L.
            </p>

            {formError && <p className="form-error">{formError}</p>}

            <form onSubmit={onSubmit} noValidate>
              <label className="auth-field">
                Restaurant name
                <input
                  type="text"
                  placeholder="e.g. Sunset Diner"
                  {...register("organizationName")}
                />
                {errors.organizationName && (
                  <span className="form-error">
                    {errors.organizationName.message}
                  </span>
                )}
              </label>

              <label className="auth-field">
                Location name
                <input type="text" {...register("locationName")} />
                {errors.locationName && (
                  <span className="form-error">
                    {errors.locationName.message}
                  </span>
                )}
              </label>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: "100%" }}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Creating…" : "Create restaurant"}
              </button>
            </form>
          </>
        )}

        {pendingInvites.length > 0 && !showCreateForm && (
          <button
            className="btn btn-secondary"
            style={{ width: "100%", marginTop: 14 }}
            onClick={() => setShowCreateForm(true)}
          >
            Or create a new restaurant instead
          </button>
        )}
      </div>
    </div>
  );
}
