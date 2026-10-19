import { NextResponse, type NextRequest } from "next/server";

const USER_COOKIE = "fw_uid";

/** Give every visitor an anonymous id, visible to the very request that creates it. */
export function proxy(request: NextRequest) {
  if (request.cookies.get(USER_COOKIE)) return NextResponse.next();
  const id = crypto.randomUUID();
  request.cookies.set(USER_COOKIE, id);
  const res = NextResponse.next({ request: { headers: request.headers } });
  res.cookies.set(USER_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return res;
}

export const config = {
  matcher: ["/((?!_next/|api/blob/|worlds/|favicon|icon).*)"],
};
