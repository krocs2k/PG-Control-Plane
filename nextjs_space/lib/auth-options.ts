import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from './db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { UserRole, UserStatus } from '@prisma/client';

// TOTP verification functions
function base32Decode(str: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleanStr = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < cleanStr.length; i++) {
    value = (value << 5) | alphabet.indexOf(cleanStr[i]);
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

function generateTOTP(secret: string, counter: number): string {
  const secretBuffer = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  for (let i = 7; i >= 0; i--) {
    counterBuffer[i] = counter & 0xff;
    counter = Math.floor(counter / 256);
  }

  const hmac = crypto.createHmac('sha1', secretBuffer);
  hmac.update(counterBuffer);
  const hmacResult = hmac.digest();

  const offset = hmacResult[hmacResult.length - 1] & 0xf;
  const binary =
    ((hmacResult[offset] & 0x7f) << 24) |
    ((hmacResult[offset + 1] & 0xff) << 16) |
    ((hmacResult[offset + 2] & 0xff) << 8) |
    (hmacResult[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

function verifyTOTP(secret: string, token: string, window: number = 1): boolean {
  const counter = Math.floor(Date.now() / 30000);
  for (let i = -window; i <= window; i++) {
    if (generateTOTP(secret, counter + i) === token) {
      return true;
    }
  }
  return false;
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        mfaToken: { label: 'MFA Token', type: 'text' },
        mfaBackupCode: { label: 'Backup Code', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { organization: true },
        });

        if (!user) {
          // Log failed attempt (no user found)
          return null;
        }

        // Check account status
        if (user.status === 'DISABLED') {
          throw new Error('ACCOUNT_DISABLED');
        }

        if (user.status === 'LOCKED' || (user.lockedUntil && new Date(user.lockedUntil) > new Date())) {
          throw new Error('ACCOUNT_LOCKED');
        }

        const isPasswordValid = await bcrypt.compare(credentials.password, user.passwordHash);

        if (!isPasswordValid) {
          // Increment failed attempts
          const newFailedAttempts = (user.failedAttempts || 0) + 1;
          const updateData: { failedAttempts: number; status?: UserStatus; lockedUntil?: Date } = {
            failedAttempts: newFailedAttempts,
          };

          // Lock account after 5 failed attempts
          if (newFailedAttempts >= 5) {
            updateData.status = UserStatus.LOCKED;
            updateData.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 min lock
          }

          await prisma.user.update({
            where: { id: user.id },
            data: updateData,
          });

          // Log failed login
          await prisma.loginHistory.create({
            data: {
              userId: user.id,
              success: false,
              reason: 'Invalid password',
            },
          });

          return null;
        }

        // Check MFA if enabled
        if (user.mfaEnabled && user.mfaSecret) {
          const mfaToken = credentials.mfaToken;
          const mfaBackupCode = credentials.mfaBackupCode;

          if (!mfaToken && !mfaBackupCode) {
            throw new Error('MFA_REQUIRED');
          }

          // Verify TOTP
          if (mfaToken) {
            const isValidToken = verifyTOTP(user.mfaSecret, mfaToken);
            if (!isValidToken) {
              await prisma.loginHistory.create({
                data: {
                  userId: user.id,
                  success: false,
                  reason: 'Invalid MFA token',
                  mfaUsed: true,
                },
              });
              throw new Error('INVALID_MFA_TOKEN');
            }
          }

          // Verify backup code
          if (mfaBackupCode && !mfaToken) {
            const codeIndex = user.mfaBackupCodes.indexOf(mfaBackupCode.toUpperCase());
            if (codeIndex === -1) {
              await prisma.loginHistory.create({
                data: {
                  userId: user.id,
                  success: false,
                  reason: 'Invalid backup code',
                  mfaUsed: true,
                },
              });
              throw new Error('INVALID_BACKUP_CODE');
            }

            // Remove used backup code
            const newBackupCodes = [...user.mfaBackupCodes];
            newBackupCodes.splice(codeIndex, 1);
            await prisma.user.update({
              where: { id: user.id },
              data: { mfaBackupCodes: newBackupCodes },
            });
          }
        }

        // Success - reset failed attempts and update last login
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedAttempts: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
          },
        });

        // Log successful login
        await prisma.loginHistory.create({
          data: {
            userId: user.id,
            success: true,
            mfaUsed: user.mfaEnabled,
          },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          orgId: user.orgId,
          mfaEnabled: user.mfaEnabled,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.orgId = (user as any).orgId;
        token.mfaEnabled = (user as any).mfaEnabled;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).orgId = token.orgId;
        (session.user as any).mfaEnabled = token.mfaEnabled;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
};

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      role: UserRole;
      orgId?: string | null;
      mfaEnabled?: boolean;
    };
  }

  interface User {
    role: UserRole;
    orgId?: string | null;
    mfaEnabled?: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: UserRole;
    orgId?: string | null;
    mfaEnabled?: boolean;
  }
}
