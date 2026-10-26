export async function onRequest(context) {
 const response = await context.next();
 const headers = new Headers(response.headers);
 headers.set("X-Content-Type-Options", "nosniff");
 headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
 headers.set("X-Frame-Options", "DENY");
 headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
 if (!headers.has("Content-Security-Policy")) headers.set("Content-Security-Policy", "default-src 'self' https: data: blob:; script-src 'self' https://typace.ace-base.cc 'unsafe-inline'; style-src 'self' https://typace.ace-base.cc 'unsafe-inline'; img-src 'self' https: data:; font-src 'self' https://typace.ace-base.cc data:; connect-src 'self' https://api.resend.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://wa.me");
 return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}
