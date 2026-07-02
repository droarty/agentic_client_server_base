import * as React from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';

const Accordion = AccordionPrimitive.Root;

function AccordionItem({ ref, className, ...props }: React.ComponentPropsWithRef<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      ref={ref}
      className={['accord-item', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}
AccordionItem.displayName = 'AccordionItem';

function AccordionTrigger({ ref, className, children, ...props }: React.ComponentPropsWithRef<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="accord-header">
      <AccordionPrimitive.Trigger
        ref={ref}
        className={['accord-trigger', className].filter(Boolean).join(' ')}
        {...props}
      >
        {children}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="accord-trigger-icon"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName;

function AccordionContent({ ref, className, children, ...props }: React.ComponentPropsWithRef<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      ref={ref}
      className="accord-content"
      {...props}
    >
      <div className={['accord-content-inner', className].filter(Boolean).join(' ')}>{children}</div>
    </AccordionPrimitive.Content>
  );
}
AccordionContent.displayName = AccordionPrimitive.Content.displayName;

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
