/**
 * A base64 payload cannot close its containing script element or introduce a
 * new one. Keep this encoding boundary separate so hostile notice text is
 * covered without pretending a regular expression can sanitise HTML.
 *
 * @param {string} notices
 * @returns {string}
 */
export function encodeNoticePayload(notices) {
  return Buffer.from(notices, 'utf8').toString('base64');
}
