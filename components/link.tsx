'use client';

import NextLink, { useLinkStatus } from 'next/link';
import type { ComponentProps } from 'react';

function Pending() {
  const { pending } = useLinkStatus();
  return <span className={pending ? 'link-pending on' : 'link-pending'} aria-hidden="true" />;
}

/** next/link plus a loading state: the link dims and shows a spinner until the next page appears. */
export default function Link({ children, ...props }: ComponentProps<typeof NextLink>) {
  return (
    <NextLink {...props}>
      {children}
      <Pending />
    </NextLink>
  );
}
