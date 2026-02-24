import "server-only";

export const SELECTED_PROJECT_COOKIE = "selectedProjectId" as const;

export const selectedProjectCookie = {
  name: SELECTED_PROJECT_COOKIE,
  options: {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  },
} as const;
