use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("7DpVomUkF1FfXxsf6gcdvmpFcAZBS7cTm7TvhNSjbKE1");

pub const ESCROW_AUTHORITY_SEED: &[u8] = b"escrow_authority";
pub const DISPUTES_AUTHORITY_SEED: &[u8] = b"disputes_authority";

#[program]
pub mod insuwork_bond {
    use super::*;

    pub fn init_config(ctx: Context<InitConfig>, params: ConfigParams) -> Result<()> {
        ctx.accounts.config.set_inner(BondConfig {
            admin: ctx.accounts.admin.key(),
            usdc_mint: ctx.accounts.usdc_mint.key(),
            escrow_program: params.escrow_program,
            disputes_program: params.disputes_program,
            min_bond: params.min_bond,
            paused: false,
            bump: ctx.bumps.config,
            _reserved: [0; 64],
        });
        Ok(())
    }

    pub fn set_paused(ctx: Context<AdminConfig>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
        emit!(PausedSet { paused });
        Ok(())
    }

    pub fn init_vault(ctx: Context<InitVault>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.voucher = ctx.accounts.voucher.key();
        vault.bump = ctx.bumps.vault;
        vault.ata_bump = ctx.bumps.vault_ata;
        emit!(VaultInitialized { vault: vault.key(), voucher: vault.voucher });
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        let cfg = &ctx.accounts.config;
        require!(!cfg.paused, BondError::Paused);
        let vault = &mut ctx.accounts.vault;
        let new_total = vault.deposited.checked_add(amount).ok_or(BondError::Overflow)?;
        // Owner 2026-10-10: min_bond applies only to the first deposit into an empty vault.
        require!(vault.deposited > 0 || amount >= cfg.min_bond, BondError::BelowMinBond);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.voucher_ata.to_account_info(),
                    to: ctx.accounts.vault_ata.to_account_info(),
                    authority: ctx.accounts.voucher.to_account_info(),
                },
            ),
            amount,
        )?;
        vault.deposited = new_total;
        emit!(Deposited { vault: vault.key(), amount, deposited: new_total });
        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        let min_bond = ctx.accounts.config.min_bond;
        let vault = &ctx.accounts.vault;
        let remaining = vault.deposited.checked_sub(amount).ok_or(BondError::InsufficientUnallocated)?;
        require!(remaining >= vault.allocated, BondError::InsufficientUnallocated);
        require!(remaining == 0 || remaining >= min_bond, BondError::BelowMinBond);

        vault_transfer(
            &ctx.accounts.vault,
            &ctx.accounts.vault_ata,
            &ctx.accounts.voucher_ata,
            &ctx.accounts.token_program,
            amount,
        )?;
        let vault = &mut ctx.accounts.vault;
        vault.deposited = remaining;
        emit!(Withdrawn { vault: vault.key(), amount, deposited: remaining });
        Ok(())
    }

    pub fn create_backing(ctx: Context<CreateBacking>, freelancer_ref: [u8; 32], cap: u64) -> Result<()> {
        require!(!ctx.accounts.config.paused, BondError::Paused);
        let vault = &mut ctx.accounts.vault;
        let allocated = vault.allocated.checked_add(cap).ok_or(BondError::Overflow)?;
        require!(allocated <= vault.deposited, BondError::ExceedsLeverage);
        vault.allocated = allocated;
        vault.backings_count = vault.backings_count.checked_add(1).ok_or(BondError::Overflow)?;

        let backing = &mut ctx.accounts.backing;
        backing.vault = vault.key();
        backing.freelancer_ref = freelancer_ref;
        backing.cap = cap;
        backing.active = true;
        backing.created_ts = Clock::get()?.unix_timestamp;
        backing.bump = ctx.bumps.backing;
        emit!(BackingCreated { vault: vault.key(), backing: backing.key(), freelancer_ref, cap });
        Ok(())
    }

    pub fn update_cap(ctx: Context<VoucherBacking>, new_cap: u64) -> Result<()> {
        let backing = &mut ctx.accounts.backing;
        let vault = &mut ctx.accounts.vault;
        require!(backing.active, BondError::BackingInactive);
        require!(new_cap >= backing.locked, BondError::CapBelowLocked);
        let allocated = vault
            .allocated
            .checked_sub(backing.cap)
            .and_then(|a| a.checked_add(new_cap))
            .ok_or(BondError::Overflow)?;
        require!(allocated <= vault.deposited, BondError::ExceedsLeverage);
        vault.allocated = allocated;
        backing.cap = new_cap;
        emit!(BackingCapUpdated { backing: backing.key(), cap: new_cap });
        Ok(())
    }

    pub fn close_backing(ctx: Context<VoucherBacking>) -> Result<()> {
        let backing = &mut ctx.accounts.backing;
        let vault = &mut ctx.accounts.vault;
        require!(backing.active, BondError::BackingInactive);
        require!(backing.locked == 0, BondError::BackingLocked);
        // OQ-7 (owner, 2026-10-10): blocked while any commitment using this backing is live.
        require!(backing.active_commitments == 0, BondError::BackingInUse);
        vault.allocated = vault.allocated.checked_sub(backing.cap).ok_or(BondError::Overflow)?;
        backing.cap = 0;
        backing.active = false;
        emit!(BackingClosed { backing: backing.key() });
        Ok(())
    }

    // ---- escrow_authority CPIs ----

    pub fn attach_commitment(ctx: Context<EscrowCall>) -> Result<()> {
        let backing = &mut ctx.accounts.backing;
        require!(backing.active, BondError::BackingInactive);
        backing.active_commitments = backing.active_commitments.checked_add(1).ok_or(BondError::Overflow)?;
        emit!(CommitmentAttached { backing: backing.key(), active_commitments: backing.active_commitments });
        Ok(())
    }

    pub fn detach_commitment(ctx: Context<EscrowCall>) -> Result<()> {
        let backing = &mut ctx.accounts.backing;
        backing.active_commitments = backing.active_commitments.checked_sub(1).ok_or(BondError::Overflow)?;
        emit!(CommitmentDetached { backing: backing.key(), active_commitments: backing.active_commitments });
        Ok(())
    }

    // OQ-1: the lock *amount* is chosen by escrow; bond only enforces the cap.
    pub fn lock(ctx: Context<EscrowCall>, amount: u64) -> Result<()> {
        let backing = &mut ctx.accounts.backing;
        let vault = &mut ctx.accounts.vault;
        let locked = backing.locked.checked_add(amount).ok_or(BondError::Overflow)?;
        require!(locked <= backing.cap, BondError::ExceedsCap);
        backing.locked = locked;
        vault.locked = vault.locked.checked_add(amount).ok_or(BondError::Overflow)?;
        emit!(BackingLocked { backing: backing.key(), amount, locked });
        Ok(())
    }

    pub fn unlock(ctx: Context<EscrowCall>, amount: u64) -> Result<()> {
        let backing = &mut ctx.accounts.backing;
        let vault = &mut ctx.accounts.vault;
        backing.locked = backing.locked.checked_sub(amount).ok_or(BondError::ExceedsLocked)?;
        vault.locked = vault.locked.checked_sub(amount).ok_or(BondError::ExceedsLocked)?;
        emit!(BackingUnlocked { backing: backing.key(), amount, locked: backing.locked });
        Ok(())
    }

    pub fn record_premium(ctx: Context<EscrowCall>, amount: u64) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.premiums_earned = vault.premiums_earned.checked_add(amount).ok_or(BondError::Overflow)?;
        Ok(())
    }

    /// escrow CPI on a freelancer-side withdrawal (E-34): the voucher pays a penalty from
    /// the backing's free (unlocked) capacity to the client. Counted as a claim on the bond record.
    pub fn pay_penalty(ctx: Context<PayPenalty>, amount: u64) -> Result<()> {
        let free = ctx.accounts.backing.cap - ctx.accounts.backing.locked;
        require!(amount <= free, BondError::ExceedsCap);
        vault_transfer(
            &ctx.accounts.vault,
            &ctx.accounts.vault_ata,
            &ctx.accounts.recipient_ata,
            &ctx.accounts.token_program,
            amount,
        )?;
        let backing = &mut ctx.accounts.backing;
        let vault = &mut ctx.accounts.vault;
        // amount <= cap - locked <= allocated <= deposited
        backing.cap -= amount;
        vault.allocated -= amount;
        vault.deposited -= amount;
        vault.claims_paid = vault.claims_paid.checked_add(amount).ok_or(BondError::Overflow)?;
        emit!(PenaltyPaid { vault: vault.key(), backing: backing.key(), amount, recipient: ctx.accounts.recipient_ata.key() });
        Ok(())
    }

    // ---- disputes_authority CPI ----

    pub fn pay_claim(ctx: Context<PayClaim>, amount: u64) -> Result<()> {
        require!(amount <= ctx.accounts.backing.locked, BondError::ExceedsLocked);
        vault_transfer(
            &ctx.accounts.vault,
            &ctx.accounts.vault_ata,
            &ctx.accounts.recipient_ata,
            &ctx.accounts.token_program,
            amount,
        )?;
        let backing = &mut ctx.accounts.backing;
        let vault = &mut ctx.accounts.vault;
        // amount <= backing.locked <= cap <= allocated <= deposited, and vault.locked >= backing.locked
        backing.locked -= amount;
        backing.cap -= amount;
        vault.locked -= amount;
        vault.allocated -= amount;
        vault.deposited -= amount;
        vault.claims_paid = vault.claims_paid.checked_add(amount).ok_or(BondError::Overflow)?;
        emit!(ClaimPaid {
            vault: vault.key(),
            backing: backing.key(),
            amount,
            recipient: ctx.accounts.recipient_ata.key(),
        });
        Ok(())
    }
}

fn vault_transfer<'info>(
    vault: &Account<'info, BondVault>,
    from: &Account<'info, TokenAccount>,
    to: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    amount: u64,
) -> Result<()> {
    let seeds: &[&[u8]] = &[b"vault", vault.voucher.as_ref(), &[vault.bump]];
    token::transfer(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            Transfer { from: from.to_account_info(), to: to.to_account_info(), authority: vault.to_account_info() },
            &[seeds],
        ),
        amount,
    )
}

// ---------------- accounts ----------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ConfigParams {
    pub escrow_program: Pubkey,
    pub disputes_program: Pubkey,
    pub min_bond: u64,
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(init, payer = admin, space = 8 + BondConfig::INIT_SPACE, seeds = [b"bond_config"], bump)]
    pub config: Account<'info, BondConfig>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut)]
    pub admin: Signer<'info>,
    /// Only the upgrade authority may initialise the config.
    #[account(constraint = program.programdata_address()? == Some(program_data.key()))]
    pub program: Program<'info, crate::program::InsuworkBond>,
    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ BondError::Unauthorized)]
    pub program_data: Account<'info, ProgramData>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminConfig<'info> {
    #[account(mut, seeds = [b"bond_config"], bump = config.bump, has_one = admin @ BondError::Unauthorized)]
    pub config: Account<'info, BondConfig>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitVault<'info> {
    #[account(seeds = [b"bond_config"], bump = config.bump)]
    pub config: Account<'info, BondConfig>,
    #[account(init, payer = voucher, space = 8 + BondVault::INIT_SPACE, seeds = [b"vault", voucher.key().as_ref()], bump)]
    pub vault: Account<'info, BondVault>,
    #[account(
        init, payer = voucher, seeds = [b"vault_ata", vault.key().as_ref()], bump,
        token::mint = usdc_mint, token::authority = vault,
    )]
    pub vault_ata: Account<'info, TokenAccount>,
    #[account(address = config.usdc_mint)]
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut)]
    pub voucher: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(seeds = [b"bond_config"], bump = config.bump)]
    pub config: Account<'info, BondConfig>,
    #[account(mut, seeds = [b"vault", voucher.key().as_ref()], bump = vault.bump, has_one = voucher)]
    pub vault: Account<'info, BondVault>,
    #[account(mut, seeds = [b"vault_ata", vault.key().as_ref()], bump = vault.ata_bump)]
    pub vault_ata: Account<'info, TokenAccount>,
    #[account(mut, token::mint = config.usdc_mint, token::authority = voucher)]
    pub voucher_ata: Account<'info, TokenAccount>,
    pub voucher: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(seeds = [b"bond_config"], bump = config.bump)]
    pub config: Account<'info, BondConfig>,
    #[account(mut, seeds = [b"vault", voucher.key().as_ref()], bump = vault.bump, has_one = voucher)]
    pub vault: Account<'info, BondVault>,
    #[account(mut, seeds = [b"vault_ata", vault.key().as_ref()], bump = vault.ata_bump)]
    pub vault_ata: Account<'info, TokenAccount>,
    #[account(mut, token::mint = config.usdc_mint, token::authority = voucher)]
    pub voucher_ata: Account<'info, TokenAccount>,
    pub voucher: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(freelancer_ref: [u8; 32])]
pub struct CreateBacking<'info> {
    #[account(seeds = [b"bond_config"], bump = config.bump)]
    pub config: Account<'info, BondConfig>,
    #[account(mut, seeds = [b"vault", voucher.key().as_ref()], bump = vault.bump, has_one = voucher)]
    pub vault: Account<'info, BondVault>,
    #[account(
        init, payer = voucher, space = 8 + Backing::INIT_SPACE,
        seeds = [b"backing", vault.key().as_ref(), freelancer_ref.as_ref()], bump,
    )]
    pub backing: Account<'info, Backing>,
    #[account(mut)]
    pub voucher: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VoucherBacking<'info> {
    #[account(mut, seeds = [b"vault", voucher.key().as_ref()], bump = vault.bump, has_one = voucher)]
    pub vault: Account<'info, BondVault>,
    #[account(mut, seeds = [b"backing", vault.key().as_ref(), backing.freelancer_ref.as_ref()], bump = backing.bump, has_one = vault)]
    pub backing: Account<'info, Backing>,
    pub voucher: Signer<'info>,
}

#[derive(Accounts)]
pub struct EscrowCall<'info> {
    #[account(seeds = [b"bond_config"], bump = config.bump)]
    pub config: Account<'info, BondConfig>,
    #[account(
        constraint = escrow_authority.key()
            == Pubkey::find_program_address(&[ESCROW_AUTHORITY_SEED], &config.escrow_program).0
            @ BondError::UnauthorizedCaller
    )]
    pub escrow_authority: Signer<'info>,
    #[account(mut, seeds = [b"vault", vault.voucher.as_ref()], bump = vault.bump)]
    pub vault: Account<'info, BondVault>,
    #[account(mut, seeds = [b"backing", vault.key().as_ref(), backing.freelancer_ref.as_ref()], bump = backing.bump, has_one = vault)]
    pub backing: Account<'info, Backing>,
}

#[derive(Accounts)]
pub struct PayPenalty<'info> {
    #[account(seeds = [b"bond_config"], bump = config.bump)]
    pub config: Account<'info, BondConfig>,
    #[account(
        constraint = escrow_authority.key()
            == Pubkey::find_program_address(&[ESCROW_AUTHORITY_SEED], &config.escrow_program).0
            @ BondError::UnauthorizedCaller
    )]
    pub escrow_authority: Signer<'info>,
    #[account(mut, seeds = [b"vault", vault.voucher.as_ref()], bump = vault.bump)]
    pub vault: Account<'info, BondVault>,
    #[account(mut, seeds = [b"vault_ata", vault.key().as_ref()], bump = vault.ata_bump)]
    pub vault_ata: Account<'info, TokenAccount>,
    #[account(mut, seeds = [b"backing", vault.key().as_ref(), backing.freelancer_ref.as_ref()], bump = backing.bump, has_one = vault)]
    pub backing: Account<'info, Backing>,
    #[account(mut, token::mint = config.usdc_mint)]
    pub recipient_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct PayClaim<'info> {
    #[account(seeds = [b"bond_config"], bump = config.bump)]
    pub config: Account<'info, BondConfig>,
    #[account(
        constraint = disputes_authority.key()
            == Pubkey::find_program_address(&[DISPUTES_AUTHORITY_SEED], &config.disputes_program).0
            @ BondError::UnauthorizedCaller
    )]
    pub disputes_authority: Signer<'info>,
    #[account(mut, seeds = [b"vault", vault.voucher.as_ref()], bump = vault.bump)]
    pub vault: Account<'info, BondVault>,
    #[account(mut, seeds = [b"vault_ata", vault.key().as_ref()], bump = vault.ata_bump)]
    pub vault_ata: Account<'info, TokenAccount>,
    #[account(mut, seeds = [b"backing", vault.key().as_ref(), backing.freelancer_ref.as_ref()], bump = backing.bump, has_one = vault)]
    pub backing: Account<'info, Backing>,
    #[account(mut, token::mint = config.usdc_mint)]
    pub recipient_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

// ---------------- state ----------------

#[account]
#[derive(InitSpace)]
pub struct BondConfig {
    pub admin: Pubkey,
    pub usdc_mint: Pubkey,
    pub escrow_program: Pubkey,
    pub disputes_program: Pubkey,
    pub min_bond: u64,
    pub paused: bool,
    pub bump: u8,
    pub _reserved: [u8; 64],
}

#[account]
#[derive(InitSpace)]
pub struct BondVault {
    pub voucher: Pubkey,
    pub deposited: u64,
    pub allocated: u64,
    pub locked: u64,
    pub claims_paid: u64,
    pub premiums_earned: u64,
    pub backings_count: u32,
    pub bump: u8,
    pub ata_bump: u8,
    pub _reserved: [u8; 64],
}

#[account]
#[derive(InitSpace)]
pub struct Backing {
    pub vault: Pubkey,
    pub freelancer_ref: [u8; 32],
    pub cap: u64,
    pub locked: u64,
    pub active: bool,
    pub created_ts: i64,
    /// Live commitments using this backing (OQ-7: blocks close_backing).
    pub active_commitments: u32,
    pub bump: u8,
    pub _reserved: [u8; 64],
}

// ---------------- events ----------------

#[event]
pub struct PausedSet { pub paused: bool }
#[event]
pub struct VaultInitialized { pub vault: Pubkey, pub voucher: Pubkey }
#[event]
pub struct Deposited { pub vault: Pubkey, pub amount: u64, pub deposited: u64 }
#[event]
pub struct Withdrawn { pub vault: Pubkey, pub amount: u64, pub deposited: u64 }
#[event]
pub struct BackingCreated { pub vault: Pubkey, pub backing: Pubkey, pub freelancer_ref: [u8; 32], pub cap: u64 }
#[event]
pub struct BackingCapUpdated { pub backing: Pubkey, pub cap: u64 }
#[event]
pub struct BackingClosed { pub backing: Pubkey }
#[event]
pub struct CommitmentAttached { pub backing: Pubkey, pub active_commitments: u32 }
#[event]
pub struct CommitmentDetached { pub backing: Pubkey, pub active_commitments: u32 }
#[event]
pub struct BackingLocked { pub backing: Pubkey, pub amount: u64, pub locked: u64 }
#[event]
pub struct BackingUnlocked { pub backing: Pubkey, pub amount: u64, pub locked: u64 }
#[event]
pub struct PenaltyPaid { pub vault: Pubkey, pub backing: Pubkey, pub amount: u64, pub recipient: Pubkey }
#[event]
pub struct ClaimPaid { pub vault: Pubkey, pub backing: Pubkey, pub amount: u64, pub recipient: Pubkey }

#[error_code]
pub enum BondError {
    #[msg("Below min_bond (first deposit, or withdraw leaving a non-zero remainder)")]
    BelowMinBond,
    #[msg("Program is paused")]
    Paused,
    #[msg("Withdrawal would leave deposited below allocated")]
    InsufficientUnallocated,
    #[msg("Backing caps would exceed deposited (1:1 leverage)")]
    ExceedsLeverage,
    #[msg("New cap is below the locked amount")]
    CapBelowLocked,
    #[msg("Backing has locked funds")]
    BackingLocked,
    #[msg("Backing is used by a live commitment")]
    BackingInUse,
    #[msg("Backing is not active")]
    BackingInactive,
    #[msg("Caller is not the expected authority PDA")]
    UnauthorizedCaller,
    #[msg("Lock would exceed the backing cap")]
    ExceedsCap,
    #[msg("Amount exceeds locked funds")]
    ExceedsLocked,
    #[msg("Signer is not the admin / upgrade authority")]
    Unauthorized,
    #[msg("Arithmetic overflow")]
    Overflow,
}
