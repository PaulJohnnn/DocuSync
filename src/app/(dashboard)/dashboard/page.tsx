"use client";
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function DashboardRedirect() {
    const router = useRouter();
    const searchParams = useSearchParams();

    useEffect(() => {
        if (searchParams.get('role') === 'admin') {
            router.replace('/dashboard/admin/control-panel');
        } else {
            router.replace('/dashboard/user/my-drive');
        }
    }, [router, searchParams]);

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
            <span className="text-zinc-500 animate-pulse">Redirecting...</span>
        </div>
    );
}

export default function DocuSyncDashboard() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center"><span className="text-zinc-500 animate-pulse">Loading...</span></div>}>
            <DashboardRedirect />
        </Suspense>
    );
}
