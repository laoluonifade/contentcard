# UX copy — voice and rules

Short reference for any string the user reads. Apply to toasts, error
messages, form validation, empty states, confirmation dialogs, and
backend `HTTPException(detail=…)` messages.

## Voice

Warm but not jokey. Direct but not curt. We are the user's helpful
co-pilot, not their bouncer.

## Five rules

1. **Tell them what happened, in plain language.** No jargon, no codes,
   no "OAuth state expired".

2. **Tell them how to move forward.** Every error needs a next step:
   "Try again", "Pick a different…", "Reach out if this looks wrong".

3. **No blame, no judgement.** Replace "Invalid", "Failed", "Wrong" with
   "doesn't match", "didn't go through", "we couldn't…". The system has
   the bug, not the user.

4. **Be specific.** "Add the email you want the reset link sent to" beats
   "Email is required". A user who doesn't know what's missing will
   bounce.

5. **Match the action.** Success messages should celebrate the *user's*
   action ("Profile saved", "Review imported"). Avoid robotic confirmations
   ("Operation completed successfully").

## Quick before/after

| ❌ | ✅ |
|---|---|
| Email already registered | An account with this email already exists. Try logging in instead. |
| Invalid email or password | That email and password don't match. Check the spelling, or reset your password if you've forgotten it. |
| Password is required | Confirm your password to delete the account. We ask every time so this can't happen by accident. |
| Industry is required | Pick an industry — that's how the AI matches the right voice and templates. |
| Editor access required | You need editor access for this. Ask the workspace owner to bump up your role. |
| Brand not found | We couldn't find that brand. It may have been removed. |
| Cancellation failed | Cancel didn't go through — your subscription is still active. Try again in a moment. |
| Coming soon | Coming soon — we'll ping you when it's ready. |
| Operation completed successfully | Saved. |

## Length

Toasts should fit on one line on mobile (~40-60 chars). Longer copy
goes in inline form errors or modals where the user has time to read.

## Capitalisation + punctuation

Sentence case. End every full sentence with a period. Toasts that are
just a label ("Saved", "Removed") skip the period.
