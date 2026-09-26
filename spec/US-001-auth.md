# US-001 — Auth & Registration

## User story

As a new or returning user, I want to register and log in to Fugleramme with an email and password, so that my session is persisted and the app knows whether to show me onboarding.

## Acceptance criteria

1. A `/login` route renders a clean login form with email and password fields and a submit button.
2. A `/register` route renders a registration form with email, password, and password-confirm fields and a submit button.
3. Submitting the registration form with a valid, unique email and matching passwords creates a new user account and redirects to onboarding.
4. Submitting the registration form with a duplicate email displays an inline error: "An account with this email already exists."
5. Submitting the registration form with non-matching passwords displays an inline error: "Passwords do not match."
6. Submitting the login form with correct credentials issues a session token (JWT or equivalent) stored in a secure, httpOnly cookie and redirects to the dashboard.
7. Submitting the login form with incorrect credentials displays an inline error: "Invalid email or password." No detail about which field is wrong is exposed.
8. An authenticated user who visits `/login` or `/register` is redirected to the dashboard.
9. An unauthenticated user who visits any protected route is redirected to `/login`.
10. A "Log out" action clears the session token and redirects to `/login`.
11. Password is stored as a salted hash (bcrypt or argon2). Plain-text passwords never enter logs or the database.
12. The login and register forms are accessible: all fields have labels, focus order is logical, and error messages are announced to screen readers.

## Non-goals

- OAuth / social login (Google, GitHub, etc.) — deferred.
- Email verification flow — deferred.
- Password reset / forgot-password flow — deferred.
- Two-factor authentication — deferred.
- Admin user management — not in scope for this story.

## Owner

`@Backend` (session logic, password hashing, JWT issuance, protected-route middleware)
`@Web` (login/register UI, form validation, redirect behaviour)

> **Note to Manager:** this story has a backend half and a frontend half. Dispatch `@Contract` first to define the auth endpoints (`POST /auth/register`, `POST /auth/login`, `POST /auth/logout`) and the JWT shape, then dispatch `@Backend` and `@Web` sequentially against that contract.
