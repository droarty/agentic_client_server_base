import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { User } from '../models/user.model';
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
          const googleEmail = profile.emails?.[0]?.value?.toLowerCase();
          const displayName = profile.displayName;

          // Check if a user already has this Google provider linked
          let user = await User.findOne({
            ssoProviders: {
              $elemMatch: { provider: 'google', providerId: profile.id },
            },
          });

          if (user) {
            return done(null, user);
          }

          // Check if a user exists with the same email (link the provider)
          if (googleEmail) {
            user = await User.findOne({ email: googleEmail });
            if (user) {
              user.ssoProviders.push({
                provider: 'google',
                providerId: profile.id,
                email: googleEmail,
                displayName,
              });
              await user.save();
              return done(null, user);
            }
          }

          // Create a new user
          user = new User({
            email: googleEmail,
            ssoProviders: [
              {
                provider: 'google',
                providerId: profile.id,
                email: googleEmail,
                displayName,
              },
            ],
          });
          await user.save();
          return done(null, user);
        } catch (err) {
          return done(err as Error);
        }
      }
    )
  );
}
