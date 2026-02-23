'use client'

import '@rainbow-me/rainbowkit/styles.css';
import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, http } from 'wagmi'
import { hardhat } from 'wagmi/chains'
import {getDefaultConfig, RainbowKitProvider,} from '@rainbow-me/rainbowkit';

const config = getDefaultConfig({
  appName: 'EscrowFreelance',
  projectId: 'f6fcfc229b1bcc1ac9246cfe4854bf43',
  chains: [hardhat],
  ssr: true, // If your dApp uses server side rendering (SSR)
  transports: {
    [hardhat.id]: http('http://localhost:3000/'),
  },
})

const queryClient = new QueryClient()

export default function Providers({ children }: { children: React.ReactNode }) {
    return (
     <WagmiProvider config={config}>
       <QueryClientProvider client={queryClient}>
         <RainbowKitProvider>
            { children }
          </RainbowKitProvider>
       </QueryClientProvider>
     </WagmiProvider>
    )
  }