    use anchor_lang::prelude::*;
    use anchor_lang::solana_program::sysvar::instructions::get_instruction_relative;


    declare_id!("seHtQtXsNYkE6qd8C197kbjmovMU8bVA22kRELQ4NNZ");

    #[error_code]
    pub enum ExampleErrors {
        #[msg("wrong program in sigverify instruction")]
        WrongProgram,
        #[msg("message doesn't match the message passed into sigverify")]
        WrongMessage,
        #[msg("pubkey doesn't match the pubkey passed into sigverify")]
        WrongPubkey,
    }

    #[program]
    pub mod sigverify_example {
        use super::*;
        
        pub fn conditional_method(ctx: Context<Initialize>, message_input: Vec<u8>) -> Result<()> {
            // can technically test any offset, this assumes the instruction directly before this one is sigverify

            let previous_instruction = get_instruction_relative(-1, &ctx.accounts.instructions_sysvar)?;
            
            // check the sigverify program
            if !anchor_lang::solana_program::ed25519_program::check_id(&previous_instruction.program_id){
                return err!(ExampleErrors::WrongProgram)
            }

            let sigverify_data = previous_instruction.data;
            // we assume there's 1 signature, but this can verify multiple signatures too, could also deserialize
            let _num_signatures = sigverify_data[0];
            // signatures don't really matter at this point

            // offsets according to https://docs.solana.com/developing/runtime-facilities/programs#ed25519-program
            let [public_key_start, 
                message_data_start, 
                message_size] 
                = [6,10,12]
                .map(|start| u16::from_le_bytes(sigverify_data[start..start+2].try_into().unwrap()) as usize);

            let pubkeys_are_equal = Pubkey::try_from_slice(
                &sigverify_data[public_key_start..public_key_start+32])
                .unwrap().eq(ctx.accounts.sigverify_dude.key);

            let messages_are_equal = message_input.eq(
                &sigverify_data[message_data_start..message_data_start+message_size]);

            if !pubkeys_are_equal{
                return err!(ExampleErrors::WrongPubkey)
            }
            if !messages_are_equal{
                return err!(ExampleErrors::WrongMessage)
            }
            Ok(())
        }
    }

    #[derive(Accounts)]
    pub struct Initialize<'info>{
        /// CHECK: signer verified by ed25519_program
        pub sigverify_dude: UncheckedAccount<'info>,
        /// CHECK: this is thing
        #[account(address = anchor_lang::solana_program::sysvar::instructions::id())]
        pub instructions_sysvar: UncheckedAccount<'info>,
    }
