
'use client';

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SettingsContent from '@/components/admin/SettingsContent';

const queryClient = new QueryClient();

export default function SettingsPage() {
  return (
    <QueryClientProvider client={queryClient}>
        <SettingsContent />
    </QueryClientProvider>
  );
}
