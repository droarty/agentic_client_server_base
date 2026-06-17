import React from 'react';

interface Props {
  children?: React.ReactNode;
  leftWidth?: string;
}

export function TwoColumnLayout({ children, leftWidth }: Props) {
  const childArray = React.Children.toArray(children);
  return (
    <div className="flex w-full h-full overflow-hidden gap-0">
      <div className="flex flex-col overflow-y-auto border-r border-border" style={{ width: leftWidth ?? '40%' }}>
        {childArray[0]}
      </div>
      <div className="flex-1 overflow-y-auto">
        {childArray[1]}
      </div>
    </div>
  );
}
