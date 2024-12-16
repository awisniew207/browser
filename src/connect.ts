import { LitNodeClient } from '@lit-protocol/lit-node-client';
import {
  LitAbility,
  LitAccessControlConditionResource,
  createSiweMessage,
  generateAuthSig,
} from "@lit-protocol/auth-helpers";
import * as ethers from "ethers";

export const connectToLit = async () => {
    try {
      // Check if we're in a browser environment
      if (typeof window === 'undefined' || !window.ethereum) {
        throw new Error('Please install a Web3 wallet like MetaMask');
      }

      const litNodeClient = new LitNodeClient({
        litNetwork: 'datil-dev',
        debug: false
      });

      await litNodeClient.connect();
      console.log('Connected to Lit Network');

      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const ethersSigner = provider.getSigner();
      console.log("Connected account:", await ethersSigner.getAddress());
      
      console.log("Getting session signatures...");
      const sessionSignatures = await litNodeClient.getSessionSigs({
        chain: "ethereum",
        expiration: new Date(Date.now() + 1000 * 60 * 15).toISOString(), // 15 minutes
        resourceAbilityRequests: [
          {
            resource: new LitAccessControlConditionResource("*"),
            ability: LitAbility.AccessControlConditionDecryption,
          },
        ],
        authNeededCallback: async ({
          uri,
          expiration,
          resourceAbilityRequests,
        }) => {
          const domain = typeof window !== 'undefined' 
            ? window.location.origin 
            : 'https://testing-kappa-gray-46.vercel.app';

          const toSign = await createSiweMessage({
            domain,
            statement: "This is a test statement different from the original!",
            uri,
            expiration,
            resources: resourceAbilityRequests,
            walletAddress: await ethersSigner.getAddress(),
            nonce: await litNodeClient.getLatestBlockhash(),
            litNodeClient,
          });
      
          return await generateAuthSig({
            signer: ethersSigner,
            toSign,
          });
        },
      });
      console.log("Session signatures:", sessionSignatures);
      return { litNodeClient, sessionSignatures };
    } catch (error) {
      console.error('Failed to connect to Lit Network:', error);
      throw error;
    }
  };
