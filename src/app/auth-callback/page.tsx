"use client"

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react';
import { trpc } from '../_trpc/client';
import { Loader2 } from 'lucide-react';

const Page = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const origin = searchParams.get('origin');

  const { data, error, isLoading } = trpc.authCallback.useQuery();

  useEffect(() => {
    if (!isLoading && data) {
      if (data.success) {
        router.push(origin ? `/${origin}` : '/dashboard');
      } else {
        router.push('/sign-in');
      }
    }
    if (error) {
      router.push('/sign-in');
    }
  }, [data, error, isLoading, origin, router]);

  return (
    <div className='w-full mt-24 flex justify-center'>
      <div className='flex flex-col items-center gap-2'>
        <Loader2 className='h-8 w-8 animate-spin text-zinc-800' />
        <h3 className='font-semibold text-xl'>Setting up your account...</h3>
        <p>You will be redirected automatically.</p>
      </div>
    </div>
  );
};

export default Page;
