export const SUPPORT_EMAIL = 'support@getshiftkind.com';
export const SUPPORT_PHONE = '+13475676442';
export const SUPPORT_PHONE_TEXT = '+1 (347) 567-6442';

/** How to reach ShiftKind. Shown on the sign-in screens and the Me tab. */
export default function Help() {
  return (
    <p className="help">
      Need help? Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or call{' '}
      <a href={`tel:${SUPPORT_PHONE}`}>{SUPPORT_PHONE_TEXT}</a>.
    </p>
  );
}
