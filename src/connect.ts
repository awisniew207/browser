import { LitNodeClient } from '@lit-protocol/lit-node-client';

export const connectToLit = async () => {
    try {
      const litNodeClient = new LitNodeClient({
        litNetwork: 'datil-dev',
        debug: false
      });

      await litNodeClient.connect();
      console.log('Connected to Lit Network');
    } catch (error) {
      console.error('Failed to connect to Lit Network:', error);
    }
  };