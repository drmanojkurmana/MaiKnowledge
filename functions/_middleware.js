// Root middleware: make maiknowledge.com the primary domain.
// 301-redirects the .in hosts (and the www.com variant) to the apex .com,
// preserving path + query string. Runs before functions/pitch/_middleware.js.
//
// SAFETY: only deploy this AFTER maiknowledge.com is attached to the Pages
// project and serving — otherwise .in redirects to a dead .com.
const PRIMARY = 'maiknowledge.com';
const REDIRECT_HOSTS = new Set([
  'maiknowledge.in',
  'www.maiknowledge.in',
  'www.maiknowledge.com',
]);

export const onRequest = async (context) => {
  const url = new URL(context.request.url);
  if (REDIRECT_HOSTS.has(url.hostname)) {
    url.hostname = PRIMARY;
    url.protocol = 'https:';
    url.port = '';
    return Response.redirect(url.toString(), 301);
  }
  return context.next();
};
