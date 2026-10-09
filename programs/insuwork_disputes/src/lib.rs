use anchor_lang::prelude::*;

declare_id!("DISP11111111111111111111111111111111111111");

#[program]
pub mod insuwork_disputes {
    use super::*;

    // Scaffold stub: real instructions land in T-14..T-15 (SPEC-onchain).
    pub fn file_claim(_ctx: Context<FileClaim>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct FileClaim<'info> {
    #[account(init, payer = client, space = 8 + Claim::SIZE)]
    pub claim: Account<'info, Claim>,
    #[account(mut)]
    pub client: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Claim {
    pub commitment: Pubkey,
    pub milestone: u8,
    pub _reserved: [u8; 64],
}

impl Claim {
    pub const SIZE: usize = 32 + 1 + 64;
}
