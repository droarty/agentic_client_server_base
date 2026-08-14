import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { eq, and } from 'drizzle-orm';
import { users, ssoProviders } from '@agentic-client-server-base/db-schema';
import { getDb } from '../db/connect';
import { env } from './env';

export function configurePassport() {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: env.GOOGLE_CALLBACK_URL,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const db = getDb();
          const googleEmail = profile.emails?.[0]?.value?.toLowerCase();
          const displayName = profile.displayName;

          // Check if a user already has this Google provider linked
          const [linkedProvider] = await db
            .select()
            .from(ssoProviders)
            .where(and(eq(ssoProviders.provider, 'google'), eq(ssoProviders.providerId, profile.id)));
          if (linkedProvider) {
            const [user] = await db.select().from(users).where(eq(users.id, linkedProvider.userId));
            if (user) return done(null, user);
          }

          // Cannot create/link a user without an email
          if (!googleEmail) {
            return done(null, false);
          }

          // Check if a user exists with the same email (link the provider)
          const [existingUser] = await db.select().from(users).where(eq(users.email, googleEmail));
          if (existingUser) {
            await db.insert(ssoProviders).values({
              userId: existingUser.id,
              provider: 'google',
              providerId: profile.id,
              email: googleEmail,
              displayName,
            });
            return done(null, existingUser);
          }

          // Create a new user
          const [newUser] = await db.insert(users).values({ email: googleEmail }).returning();
          await db.insert(ssoProviders).values({
            userId: newUser.id,
            provider: 'google',
            providerId: profile.id,
            email: googleEmail,
            displayName,
          });
          return done(null, newUser);
        } catch (err) {
          return done(err as Error);
        }
      }
    )
  );
}
