import React from 'react';

interface Props {
  children?: React.ReactNode;
}

export function TwoColumnLayout({ children }: Props) {
  const childArray = React.Children.toArray(children);
  return (
    <div className="flex w-full gap-0">
      <div className="flex flex-col w-2/5 border-r border-border">
        {childArray[0]}
      </div>
      <div className="flex-1">
        {childArray[1]}
      </div>
    </div>
  );
}
