import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { GoogleProvider, LitAuthClient } from "@lit-protocol/lit-auth-client";
import { ProviderType, AuthMethodScope } from "@lit-protocol/constants";
import { PKPEthersWallet } from "@lit-protocol/pkp-ethers";
import { LitAbility, LitActionResource } from "@lit-protocol/auth-helpers"
import { AuthCallbackParams, AuthMethod } from "@lit-protocol/types"
import { 
  SafeAccountV0_2_0 as SafeAccount, 
  SocialRecoveryModule,
  CandidePaymaster,
} from "abstractionkit";

const ownerPublicAddress = import.meta.env.VITE_OWNER_PUBLIC_ADDRESS;
const newOwnerPublicAddress = import.meta.env.VITE_NEW_OWNER_PUBLIC_ADDRESS;
const jsonRpcNodeProvider = import.meta.env.VITE_JSON_RPC_NODE_PROVIDER;
const bundlerUrl = import.meta.env.VITE_BUNDLER_URL;

export const addGuardian = async () => {
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
        relayApiKey: import.meta.env.VITE_LIT_API_KEY,
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
        //redirectUri: VITE_REDIRECT_URI, temporarily commented out for dev
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

  const smartAccount = SafeAccount.initializeNewAccount([ownerPublicAddress]);
  console.log("Smart Account Address: ", smartAccount.accountAddress);
  
  // Add Lit Guardian
  const srm = new SocialRecoveryModule();

  const enableModuleTx = srm.createEnableModuleMetaTransaction(
      smartAccount.accountAddress
  );

  const addGuardianTx = srm.createAddGuardianWithThresholdMetaTransaction(
      smartAccount.accountAddress, 
      guardianSigner.address, // Lit Guardian Address
      1n //threshold
  );

  // Prepare userOperation
  let userOperation = await smartAccount.createUserOperation(
    [enableModuleTx, addGuardianTx],
    jsonRpcNodeProvider,
    bundlerUrl,
  );

  // Add gas sponsorship info using paymaster
  const paymasterUrl = import.meta.env.VITE_PAYMASTER_URL
	const paymaster: CandidePaymaster = new CandidePaymaster(paymasterUrl);
	userOperation = await paymaster.createSponsorPaymasterUserOperation(
		userOperation,
		bundlerUrl,
	);

  // Sign userOperation
  userOperation.signature = smartAccount.signUserOperation(
    userOperation,
    [import.meta.env.VITE_OWNER_PRIVATE_KEY],
    import.meta.env.VITE_CHAIN_ID
  );

  // Submit userOperation
  const sendUserOperationResponse = await smartAccount.sendUserOperation(
    userOperation,
    bundlerUrl,
  );

  // Monitor and wait for receipt
  console.log("Useroperation sent. Waiting to be included ......");
  const userOperationReceiptResult = await sendUserOperationResponse.included();
  console.log(userOperationReceiptResult);

  // check for success or error
	if (userOperationReceiptResult.success) {
		console.log(
			"Successful Useroperation. The transaction hash is : " +
				userOperationReceiptResult.receipt.transactionHash,
		);
		const isGuardian = await srm.isGuardian(
			jsonRpcNodeProvider,
			smartAccount.accountAddress,
			guardianSigner.address,
		);
		if (isGuardian) {
			console.log(
				"Guardian added confirmed. Guardian address is : " +
        guardianSigner.address,
			);
		} else {
			console.log("Adding guardian failed.");
		}
	} else {
		console.log("Useroperation execution failed");
	}
};


export const recoverAccount = async () => {
  const smartAccount = SafeAccount.createAccountAddressAndInitCode([ownerPublicAddress]);
  const smartAccountAddress = smartAccount[0];
  
  // Prepare Recovery tx
  const srm = new SocialRecoveryModule();
  const initiateRecoveryMetaTx = srm.createConfirmRecoveryMetaTransaction(
      smartAccountAddress,
      [newOwnerPublicAddress],
      1, // new threshold
      true, // whether to auto-start execution of recovery
  );

  // Send Transaction using guardian signer
  // const confirmRecoveryTx = await guardianSigner.sendTransaction({
  //     to: initiateRecoveryMetaTx.to,
  //     data: initiateRecoveryMetaTx.data,
  //     value: 0,
  // });

  // console.log(confirmRecoveryTx, "confirmRecoveryTx")
}

// Can only finilize after grace period is over
export const finilizeRecovery = async () => {
  const smartAccount = SafeAccount.createAccountAddressAndInitCode([ownerPublicAddress]);
  const smartAccountAddress = smartAccount[0];

  const srm = new SocialRecoveryModule();
  const finalizeRecoveryMetaTx = srm.createFinalizeRecoveryMetaTransaction(smartAccountAddress);

  // Anyone can call the finilize function after the grace period is over
  // const finilizeRecoveryTx = await guardianSigner.sendTransaction({
  //   to: finalizeRecoveryMetaTx.to,
  //   data: finalizeRecoveryMetaTx.data,
  // });

  // console.log(finilizeRecoveryTx, "finilizeRecoveryTx");
} 