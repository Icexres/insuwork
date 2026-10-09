use anchor_lang::prelude::*;

declare_id!("BOND111111111111111111111111111111111111111");

#[program]
pub mod insuwork_bond {
    use super::*;

    // Scaffold stub: real instructions land in T-10 (SPEC-onchain).
    pub fn init_vault(_ctx: Context<InitVault>, _min_bond: u64) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitVault<'info> {
    #[account(init, payer = voucher, space = 8 + BondVault::SIZE)]
    pub vault: Account<'info, BondVault>,
    #[account(mut)]
    pub voucher: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct BondVault {
    pub voucher: Pubkey,
    pub deposited: u64,  // USDC base units (6 decimals)
    pub allocated: u64,  // sum of backing caps, 1:1 leverage (allocated <= deposited)
    pub _reserved: [u8; 64],
}

impl BondVault {
    pub const SIZE: usize = 32 + 8 + 8 + 64;
}
