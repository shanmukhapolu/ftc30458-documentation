# FTC 30458 Documentation

The engineering log uses Firebase Firestore for team profiles, practice records, attendance, and member logs.

## Central sign-in

Authentication is handled by the central **30458 ID** portal at `https://bookish-carnival-4rr7p57999rcjqpw-3000.app.github.dev`. The sign-in page at `https://log.ftc30458.com` redirects members to that portal. After successful authentication, the central service verifies the member's email against an active document in the Firestore `users` collection, then returns a one-time PKCE-protected authorization code. This app exchanges it for a Firebase custom token and signs in to Firebase Authentication.

Firebase Authentication remains enabled as the custom-token session bridge. Members no longer use the old Firebase email/password form. Firestore remains the database and existing member document IDs are retained as Firebase UIDs.

## Deployment

Deploy this repository to Firebase Hosting with the existing project `ftcdocumentation-53b62`. The central portal is currently being tested from a public GitHub Codespaces forwarded port at `https://bookish-carnival-4rr7p57999rcjqpw-3000.app.github.dev`; this URL is temporary and should be replaced with `https://auth.ftc30458.com` for production and configured with the exact callback:

`https://log.ftc30458.com/auth-callback.html`

The central portal also needs Firebase Admin credentials for this same Firebase project. Do not place service-account credentials in this repository or browser code.

## Firestore security

The Firestore rules allow signed-in members to read team profiles and practice records, while limiting profile, attendance, and log writes to the appropriate user. Central identity metadata, server sessions, and one-time OAuth codes are not accessible to browser clients. Deploy the updated `firestore.rules` with `firebase deploy --only firestore:rules`.
