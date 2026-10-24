import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  if (!request.cookies.has('lms_session')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // `t/`: a test's share link opens signed out, to sign in or register there (M04b, TP-01). `v/`: anyone checks a
    // certificate (TP-12). `m/`: a meeting guest's personal link (M03c T4).
    '/((?!login|forgot-password|reset-password|t/|v/|m/|api/|_next/|favicon.ico|icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
