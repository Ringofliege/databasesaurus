'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/projects');
  }, [router]);

  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-[var(--muted)]">Redirecting to projects...</p>
    </div>
  );
}
