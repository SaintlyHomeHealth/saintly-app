import { KeypadDialerLazy } from "./KeypadDialerLazy";
import { supabaseAdmin } from "@/lib/admin";
import { staffMayDialOutbound } from "@/lib/phone/staff-phone-policy";
import { isValidE164 } from "@/lib/softphone/phone-number";
import { loadAssignedTwilioNumberForUser } from "@/lib/twilio/twilio-phone-number-repo";
import type { StaffProfile } from "@/lib/staff-profile";

type Props = {
  staff: StaffProfile;
  staffDisplayName: string;
  dialerKey: string;
  initialDigits?: string;
  autoPlaceCall: boolean;
};

export async function KeypadOutboundDialSection({
  staff,
  staffDisplayName,
  dialerKey,
  initialDigits,
  autoPlaceCall,
}: Props) {
  let crmAssignedVoiceE164: string | null = null;
  try {
    const row = await loadAssignedTwilioNumberForUser(supabaseAdmin, staff.user_id);
    const pn = row?.phone_number?.trim() ?? "";
    if (pn && isValidE164(pn) && row?.voice_enabled !== false) {
      crmAssignedVoiceE164 = pn;
    }
  } catch {
    crmAssignedVoiceE164 = null;
  }
  const dialCtx = { crmAssignedVoiceE164 };

  const outboundOk = staffMayDialOutbound(staff, dialCtx);

  return (
    <>
      {!outboundOk ? (
        <div className="mt-4 rounded-2xl border border-sky-200/90 bg-sky-50/95 px-4 py-4 text-sm text-sky-950">
          <p className="font-semibold">Outbound calling is not enabled</p>
          <p className="mt-2 leading-relaxed text-sky-900/95">
            Your role does not include placing calls from this keypad (number assignment or shared-line outbound may
            be missing). Ask an admin to review Staff Access → Phone permissions or assign a Twilio line in Admin →
            Phone Numbers.
          </p>
        </div>
      ) : (
        <div className="mt-1 flex min-h-0 w-full shrink-0 flex-col gap-3 sm:mt-3 lg:mx-auto lg:max-w-[min(100%,60rem)] lg:flex-row lg:items-start lg:justify-center lg:gap-8">
          <div className="flex w-full max-w-[560px] shrink-0 flex-col p-0 sm:rounded-2xl sm:border sm:border-sky-100/60 sm:bg-white sm:p-5 sm:shadow-sm lg:max-w-[620px] lg:p-4 lg:shadow-[0_8px_30px_-12px_rgba(30,58,138,0.08)]">
            <KeypadDialerLazy
              key={dialerKey}
              staffDisplayName={staffDisplayName}
              variant="keypad"
              initialDigits={initialDigits}
              autoPlaceCall={autoPlaceCall && Boolean(initialDigits)}
            />
          </div>
          <aside className="hidden w-full max-w-[320px] shrink-0 rounded-2xl border border-sky-100/70 bg-gradient-to-b from-white to-sky-50/35 p-5 text-sm text-slate-600 shadow-sm shadow-sky-100/40 lg:block lg:w-[320px] lg:flex-none lg:p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Tips</p>
            <ul className="mt-3 list-inside list-disc space-y-2 leading-relaxed">
              <li>Tap a number on the pad once to unlock ringtone audio on mobile browsers.</li>
              <li>Use the large blue Call button — it stays easy to hit while you are moving.</li>
              <li>Patient and lead actions elsewhere can deep-link you here with a number ready to dial.</li>
            </ul>
          </aside>
        </div>
      )}
    </>
  );
}
