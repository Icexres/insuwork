use anchor_lang::prelude::*;

declare_id!("ESCR11111111111111111111111111111111111111");

#[program]
pub mod insuwork_escrow {
    use super::*;

    // Scaffold stub: real instructions land in T-11..T-16 (SPEC-onchain).
    pub fn create_commitment(_ctx: Context<CreateCommitment>, _freelancer_ref: [u8; 32]) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateCommitment<'info> {
    #[account(init, payer = client, space = 8 + Commitment::SIZE)]
    pub commitment: Account<'info, Commitment>,
    #[account(mut)]
    pub client: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Commitment {
    pub client: Pubkey,
    pub freelancer_ref: [u8; 32], // hash only, no PII on-chain
    pub partner: Pubkey,          // release destination must equal registered partner
    pub _reserved: [u8; 64],
}

impl Commitment {
    pub const SIZE: usize = 32 + 32 + 32 + 64;
}
