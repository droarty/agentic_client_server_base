import { User, IUser } from '../models/user.model';

export async function getAllUsers(): Promise<IUser[]> {
  return User.find({}, { password: 0 }).sort({ createdAt: -1 });
}

export async function getUserById(id: string): Promise<IUser | null> {
  return User.findById(id, { password: 0 });
}

export async function updateUser(
  id: string,
  updates: { email?: string; currentPassword?: string; newPassword?: string }
): Promise<IUser> {
  const user = await User.findById(id);
  if (!user) {
    const err = new Error('User not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  if (updates.email) {
    const existing = await User.findOne({ email: updates.email.toLowerCase(), _id: { $ne: id } });
    if (existing) {
      const err = new Error('Email already in use') as Error & { statusCode: number };
      err.statusCode = 409;
      throw err;
    }
    user.email = updates.email;
  }

  if (updates.newPassword) {
    if (!updates.currentPassword) {
      const err = new Error('Current password is required') as Error & { statusCode: number };
      err.statusCode = 400;
      throw err;
    }
    const isValid = await user.comparePassword(updates.currentPassword);
    if (!isValid) {
      const err = new Error('Current password is incorrect') as Error & { statusCode: number };
      err.statusCode = 400;
      throw err;
    }
    user.password = updates.newPassword;
  }

  await user.save();
  return user;
}
