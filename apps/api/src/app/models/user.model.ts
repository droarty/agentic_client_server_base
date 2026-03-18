import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface ISsoProvider {
  provider: string;
  providerId: string;
  email: string;
  displayName?: string;
}

export interface IUser extends Document {
  email: string;
  password?: string;
  roles: string[];
  ssoProviders: ISsoProvider[];
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const ssoProviderSchema = new Schema<ISsoProvider>(
  {
    provider: { type: String, required: true },
    providerId: { type: String, required: true },
    email: { type: String, required: true },
    displayName: { type: String },
  },
  { _id: false }
);

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      minlength: 6,
    },
    roles: {
      type: [String],
      enum: ['user', 'author', 'admin'],
      default: ['user'],
    },
    ssoProviders: {
      type: [ssoProviderSchema],
      default: [],
    },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.model<IUser>('User', userSchema);
