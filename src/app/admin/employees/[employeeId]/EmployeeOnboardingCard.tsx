import {
  buildOnboardingTrackPresentation,
  type OnboardingStatusLite,
} from "@/lib/admin/employee-directory-data";
import { buildOnboardingEntryLink } from "@/lib/admin/onboarding-invite";
import CopyOnboardingLinkButton from "@/app/admin/employees/CopyOnboardingLinkButton";
import {
  resendOnboardingInviteEmailAction,
  resendOnboardingInviteSmsAction,
} from "@/app/admin/employees/actions";

type Props = {
  employeeId: string;
  onboardingStatus: (OnboardingStatusLite & { applicant_id?: string }) | null;
};

function fmt(dt?: string | null) {
  if (!dt) return "—";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const btnSecondary =
  "inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50";

export default function EmployeeOnboardingCard({ employeeId, onboardingStatus }: Props) {
  const track = buildOnboardingTrackPresentation(onboardingStatus);
  const link = buildOnboardingEntryLink(employeeId);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
        Onboarding portal
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${track.badgeClass}`}
        >
          {track.label}
        </span>
        {track.percent !== null ? (
          <span className="text-sm font-medium text-slate-600">{track.percent}%</span>
        ) : null}
      </div>

      <dl className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Invite sent
          </dt>
          <dd className="mt-0.5 text-slate-800">{fmt(onboardingStatus?.onboarding_invite_sent_at)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Via</dt>
          <dd className="mt-0.5 text-slate-800">
            {onboardingStatus?.onboarding_invite_last_channel
              ? String(onboardingStatus.onboarding_invite_last_channel).toUpperCase()
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Started</dt>
          <dd className="mt-0.5 text-slate-800">{fmt(onboardingStatus?.onboarding_started_at)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Last activity
          </dt>
          <dd className="mt-0.5 text-slate-800">{fmt(onboardingStatus?.onboarding_last_activity_at)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Completed</dt>
          <dd className="mt-0.5 text-slate-800">{fmt(onboardingStatus?.onboarding_completed_at)}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <CopyOnboardingLinkButton link={link} className={btnSecondary} />
        <form action={resendOnboardingInviteSmsAction}>
          <input type="hidden" name="applicantId" value={employeeId} />
          <button type="submit" className={btnSecondary}>
            Resend text
          </button>
        </form>
        <form action={resendOnboardingInviteEmailAction}>
          <input type="hidden" name="applicantId" value={employeeId} />
          <button type="submit" className={btnSecondary}>
            Resend email
          </button>
        </form>
      </div>
    </div>
  );
}
