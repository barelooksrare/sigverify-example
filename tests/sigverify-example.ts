import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SigverifyExample } from "../target/types/sigverify_example";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import nacl, * as tweetnacl from "tweetnacl";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);

const createSigVerifyInstruction = (message: Buffer, keypair: anchor.web3.Keypair, signature: Buffer | Uint8Array | undefined = undefined) => {
  signature = signature ?? tweetnacl.sign.detached(message, keypair.secretKey);
  return anchor.web3.Ed25519Program.createInstructionWithPublicKey({
    publicKey: keypair.publicKey.toBytes(),
    signature,
    message: message,
    // this specifies the instructionIndex, can be checked inside the instruction
    // instructionIndex: 0
  });
};

const createWrongInstruction = (sender: anchor.web3.PublicKey) => {
  return anchor.web3.SystemProgram.transfer({
    fromPubkey: sender,
    toPubkey: anchor.web3.Keypair.generate().publicKey,
    lamports: 1000,
  });
};

describe("sigverify-example", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SigverifyExample as Program<SigverifyExample>;
  const keypairToVerify = anchor.web3.Keypair.generate();
  // should always use a random nonce for several reasons, but for test this is constant
  const message = Buffer.from("fock it");
  // replace with wallet methods or w/e

  it("runs when everything is ok", async () => {
    await expect(
      program.methods
        .conditionalMethod(message)
        .accounts({
          instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          sigverifyDude: keypairToVerify.publicKey,
        })
        .preInstructions([createSigVerifyInstruction(message, keypairToVerify)])
        .rpc()
    ).to.be.fulfilled;
  });

  it("Fails on wrong program in instruction 0", async () => {
    await expect(
      program.methods
        .conditionalMethod(message)
        .accounts({
          sigverifyDude: keypairToVerify.publicKey,
          instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .preInstructions([createWrongInstruction(provider.publicKey)])
        .rpc()
    ).to.be.rejectedWith("WrongProgram");
  });

  it("Fails on message mismatch", async () => {
    const differentMessage = Buffer.from("I am a different message from what's verified");
    await expect(
      program.methods
        .conditionalMethod(differentMessage)
        .accounts({
          sigverifyDude: keypairToVerify.publicKey,
          instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .preInstructions([createSigVerifyInstruction(message, keypairToVerify)])
        .rpc()
    ).to.be.rejectedWith("WrongMessage");
  });

  // the account to sigverify has to be passed in or the sigverify fails anyway
  it("Fails on signature mismatch (fake account needs to be passed in)", async () => {
    const fakeSigner = anchor.web3.Keypair.generate();
    const fakeSig = tweetnacl.sign.detached(message, fakeSigner.secretKey);
    await expect(
      program.methods
        .conditionalMethod(message)
        .accounts({
          sigverifyDude: keypairToVerify.publicKey,
          instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .remainingAccounts([{pubkey: fakeSigner.publicKey, isWritable: false, isSigner: false}])
        .preInstructions([createSigVerifyInstruction(message, fakeSigner, fakeSig)])
        .rpc()
    ).to.be.rejectedWith("WrongPubkey");
  });
});
