import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { GoogleProvider, LitAuthClient } from "@lit-protocol/lit-auth-client";
import { ProviderType, AuthMethodScope } from "@lit-protocol/constants";
import { LitContracts } from "@lit-protocol/contracts-sdk";
import { PKPEthersWallet } from "@lit-protocol/pkp-ethers";
import { LitAbility, LitActionResource } from "@lit-protocol/auth-helpers"
import { AuthCallbackParams, AuthMethod } from "@lit-protocol/types"
import { ethers } from 'ethers';
import { 
  SafeAccountV0_2_0 as SafeAccount, 
  SocialRecoveryModule
} from "abstractionkit";


const LIT_API_KEY = "api";
const REDIRECT_URI = "https//localhost:5173/";
const JSON_RPC_NODE_PROVIDER = "https://rpc2.sepolia.org";
const BUNDLER_URL = "https://sepolia.voltaire.candidewallet.com/rpc";
const OWNER_PUBLIC_ADDRESS = "please add"
const NEW_OWNER_PUBLIC_ADDRESS = "please add"

export const work = async() =>{
  const initalizeClientsAndProvider = async() =>{
    // Connect to the Lit Network through the LitNodeClient
    const litNodeClient = new LitNodeClient({
        litNetwork: "datil-dev",
        debug: true,
      });
    await litNodeClient.connect();
    
    // Use LitAuthClient to handle authentication through the Lit login
    const litAuthClient = new LitAuthClient({
      litRelayConfig: {
        relayApiKey: LIT_API_KEY,
      },
      litNodeClient,
    });

    //await litContractsClient.connect();
    console.log("connected to the contracts client")

    // Initialize a GoogleProvider instance through the LitAuthClient
    // Specifying the redirectUri after successful authentication
    const provider = litAuthClient.initProvider<GoogleProvider>(
      ProviderType.Google,
      {
        //redirectUri: REDIRECT_URI, temporarily commented out for dev
      }
    );

    // Return the LitNodeClient, LitAuthClient, and GoogleProvider objects
    return {litNodeClient, litAuthClient, provider};
  }

  const { litNodeClient, litAuthClient, provider } = await initalizeClientsAndProvider();

  const generateAuthMethod = async() => {
      // Get the current URL
      const url = new URL(window.location.href);

      // If the 'provider' parameter is not present, that indicates Google sign-in 
      // has not yet happened. We will open a sign in window for the user.
      if (!url.searchParams.get("provider")) {
        console.log("Signing in with Google...");
        provider.signIn((url: string) => {
          window.location.href = url;
        });
      }
      
      // Otherwise, the user has already authenticated with Google and we can
      // generate an AuthMethod, save it to local storage, and use it to mint
      // a PKP. After minting, we can fetch the PKP using the same AuthMethod.
      else if (url.searchParams.get("provider") === "google") {
          const authMethod = await provider.authenticate();
          console.log("AuthMethod generated:", authMethod);
          localStorage.setItem('google', JSON.stringify(authMethod));
          return authMethod;
      }
  }

  const authMethod = await generateAuthMethod();
  if (!authMethod) {
    return;
  }

  const mintWithGoogle = async (authMethod: AuthMethod) => {
    const mintTx = provider.mintPKPThroughRelayer(authMethod, {permittedAuthMethodScopes: [[AuthMethodScope.SignAnything]]});
    const pkp = await provider.fetchPKPsThroughRelayer(authMethod);
    return pkp;
  };

  const pkp = await mintWithGoogle(authMethod);
  console.log("PKP:", pkp);

  const authNeededCallback = async (params: AuthCallbackParams) => {
    const response = await litNodeClient.signSessionKey({
      statement: params.statement,
      authMethods: [authMethod],
      expiration: params.expiration,
      resources: params.resources,
      chainId: 1,
    });
    return response.authSig;
  };
  
  const guardianSigner = new PKPEthersWallet({litNodeClient,
    authContext: {
      getSessionSigsProps: {
        chain: 'ethereum',
        expiration: new Date(Date.now() + 60_000 * 60).toISOString(),
        resourceAbilityRequests: [
          {
            resource: new LitActionResource("*"),
            ability: LitAbility.PKPSigning
          }
        ],
        authNeededCallback: authNeededCallback
      }
    },
    pkpPubKey: pkp[pkp.length - 1].publicKey,
    rpc: "https://vesuvius-rpc.litprotocol.com"
  });
  console.log("guardianSigner:", guardianSigner)
  
  if (!guardianSigner) {
    throw new Error("Guardian Signer is undefined.");
  }

  const smartAccount = SafeAccount.initializeNewAccount([OWNER_PUBLIC_ADDRESS]);
      
  const srm = new SocialRecoveryModule();
  const enableModuleTx = srm.createEnableModuleMetaTransaction(
      smartAccount.accountAddress
  );
  const addGuardianTx = srm.createAddGuardianWithThresholdMetaTransaction(
      smartAccount.accountAddress, 
      guardianSigner.address, // Lit Guardian Address
      1n //threshold
  );
  
  let userOperation = await smartAccount.createUserOperation(
      [enableModuleTx, addGuardianTx],
      process.env.JSON_RPC_NODE_PROVIDER,
      process.env.BUNDLER_URL,
  );

  const initiateRecoveryMetaTx = srm.createConfirmRecoveryMetaTransaction(
      smartAccount.accountAddress, 
      [NEW_OWNER_PUBLIC_ADDRESS],
      1, // new threshold
      true, // whether to auto-start execution of recovery
  );

  // make sure to fund the guardian address on lit
  const sendTx1 = await guardianSigner.sendTransaction({
      to: initiateRecoveryMetaTx.to,
      data: initiateRecoveryMetaTx.data,
      value: 0,
  });

  const finalizeRecoveryMetaTx = srm.createFinalizeRecoveryMetaTransaction(smartAccount.accountAddress)

  // Anyone can call the finilize function after the grace period is over
  const sendTx2 = await guardianSigner.sendTransaction({
  to: finalizeRecoveryMetaTx.to,
  data: finalizeRecoveryMetaTx.data,
  })
}