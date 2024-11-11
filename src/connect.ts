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
      // More information about the available Lit Networks: https://developer.litprotocol.com/category/networks
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
      
      const sessionSignatures = await litNodeClient.getSessionSigs({
        chain: "ethereum",
        expiration: new Date(Date.now() + 1000 * 60 * 10 ).toISOString(), // 10 minutes
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
          const toSign = await createSiweMessage({
            domain: "https://testing-b6rpw8uz3-awisniew207s-projects.vercel.app/",
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
    } catch (error) {
      console.error('Failed to connect to Lit Network:', error);
    }
  };
