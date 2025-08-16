export function getChain(rpcUrl) {
  return {
    id: 10143,
    name: 'Monad Testnet',
    nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] }, public: { http: [rpcUrl] } },
    blockExplorers: {
      default: { name: 'MonVision', url: 'https://testnet.monadexplorer.com' }
    },
    testnet: true
  };
}