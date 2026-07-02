import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

function Button({ className, variant = 'default', size = 'default', asChild = false, ref, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  const classes = ['btn', `btn--${variant}`, size !== 'default' ? `btn--${size}` : '', className]
    .filter(Boolean)
    .join(' ');
  return <Comp className={classes} ref={ref} {...props} />;
}

export { Button };
