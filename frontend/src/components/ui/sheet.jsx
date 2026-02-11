import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cva } from 'class-variance-authority';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
SheetOverlay.displayName = 'SheetOverlay';

const sheetContentVariants = cva(
  cn(
    'fixed z-50 bg-background shadow-lg border',
    'data-[state=open]:animate-in data-[state=closed]:animate-out',
    'transition ease-in-out'
  ),
  {
    variants: {
      side: {
        left: cn(
          'inset-y-0 left-0 h-full w-3/4 sm:max-w-sm',
          'data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left'
        ),
        right: cn(
          'inset-y-0 right-0 h-full w-3/4 sm:max-w-sm',
          'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right'
        ),
        top: cn(
          'inset-x-0 top-0 w-full',
          'data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top'
        ),
        bottom: cn(
          'inset-x-0 bottom-0 w-full',
          'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom'
        ),
      },
    },
    defaultVariants: { side: 'right' },
  }
);

const SheetContent = React.forwardRef(({ side = 'right', className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(sheetContentVariants({ side }), className)}
      {...props}
    >
      {children}

      <DialogPrimitive.Close
        className={cn(
          'absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background',
          'transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'disabled:pointer-events-none'
        )}
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = 'SheetContent';

function SheetHeader({ className, ...props }) {
  return <div className={cn('flex flex-col space-y-1.5 p-4 border-b', className)} {...props} />;
}

function SheetFooter({ className, ...props }) {
  return <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 p-4', className)} {...props} />;
}

const SheetTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
));
SheetTitle.displayName = 'SheetTitle';

const SheetDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
SheetDescription.displayName = 'SheetDescription';

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};