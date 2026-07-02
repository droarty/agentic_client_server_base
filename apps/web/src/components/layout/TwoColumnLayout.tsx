import React from 'react';

interface Props {
  children?: React.ReactNode;
  leftWidth?: string;
}

export function TwoColumnLayout({ children, leftWidth }: Props) {
  const childArray = React.Children.toArray(children);
  return (
    <div className="two-col">
      <div className="two-col-left" style={{ width: leftWidth ?? '40%' }}>
        {childArray[0]}
      </div>
      <div className="two-col-right">
        {childArray[1]}
      </div>
    </div>
  );
}
