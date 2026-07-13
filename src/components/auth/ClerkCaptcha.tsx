/** Required by Clerk bot protection for custom sign-in / sign-up flows. */
export function ClerkCaptcha() {
  return (
    <div
      id="clerk-captcha"
      className="clerk-captcha my-4 min-h-[65px] w-full"
      data-cl-theme="auto"
      data-cl-size="normal"
    />
  );
}
