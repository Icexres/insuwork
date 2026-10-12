use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use insuwork_bond::program::InsuworkBond;
use insuwork_escrow::{
    program::InsuworkEscrow, window_end, ClaimOutcome, Commitment, EscrowConfig, Milestone, MilestoneStatus,
};

declare_id!("FWEXDMyxY1ie6K9gvvcA8SxeRmE4cohfE4j3xYSci4qj");

pub const DISPUTES_AUTHORITY_SEED: &[u8] = b"disputes_authority";
pub const VOTE_NONE: u8 = 0;
pub const VOTE_UPHELD: u8 = 1;
pub const VOTE_REJECTED: u8 = 2;
pub const VOTE_PARTIAL: u8 = 3;

#[program]
pub mod insuwork_disputes {
    use super::*;

    // ---------------- admin ----------------

    pub fn init_config(ctx: Context<InitConfig>, params: ConfigParams) -> Result<()> {
        ctx.accounts.config.set_inner(DisputesConfig {
            admin: ctx.accounts.admin.key(),
            usdc_mint: ctx.accounts.usdc_mint.key(),
            escrow_program: params.escrow_program,
            bond_program: params.bond_program,
            treasury: params.treasury,
            ruling_secs: params.ruling_secs,
            claim_fee: params.claim_fee,
            paused: false,
            bump: ctx.bumps.config,
            _reserved: [0; 64],
        });
        Ok(())
    }

    pub fn set_paused(ctx: Context<AdminConfig>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
        Ok(())
    }

    /// OQ-6 interim (E-23): treasury is admin-settable.
    pub fn set_treasury(ctx: Context<AdminConfig>, treasury: Pubkey) -> Result<()> {
        ctx.accounts.config.treasury = treasury;
        Ok(())
    }

    pub fn set_claim_fee(ctx: Context<AdminConfig>, claim_fee: u64) -> Result<()> {
        ctx.accounts.config.claim_fee = claim_fee;
        Ok(())
    }

    pub fn add_panelist(ctx: Context<AddPanelist>, wallet: Pubkey) -> Result<()> {
        ctx.accounts.panelist.set_inner(Panelist {
            wallet,
            active: true,
            cases_assigned: 0,
            cases_voted: 0,
            bump: ctx.bumps.panelist,
            _reserved: [0; 64],
        });
        emit!(PanelistAdded { wallet });
        Ok(())
    }

    pub fn set_panelist_active(ctx: Context<SetPanelistActive>, active: bool) -> Result<()> {
        ctx.accounts.panelist.active = active;
        Ok(())
    }

    // ---------------- claims ----------------

    /// Client files within the window (E-31/E-32): before any submission that is due_ts + 14d.
    /// Claim fee is held in the claim's fee account until finalize.
    pub fn file_claim(ctx: Context<FileClaim>, _index: u8, evidence_hash: [u8; 32]) -> Result<()> {
        require!(!ctx.accounts.config.paused, DisputesError::Paused);
        let m = &ctx.accounts.milestone;
        require!(m.status == MilestoneStatus::Active, DisputesError::NotActive);
        let now = Clock::get()?.unix_timestamp;
        require!(now <= window_end(m, ctx.accounts.escrow_config.claim_window_secs), DisputesError::WindowClosed);

        let fee = ctx.accounts.config.claim_fee;
        if fee > 0 {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.client_ata.to_account_info(),
                        to: ctx.accounts.fee_vault.to_account_info(),
                        authority: ctx.accounts.client.to_account_info(),
                    },
                ),
                fee,
            )?;
        }

        let seeds: &[&[u8]] = &[DISPUTES_AUTHORITY_SEED, &[ctx.bumps.disputes_authority]];
        insuwork_escrow::cpi::freeze_milestone(
            CpiContext::new_with_signer(
                ctx.accounts.escrow_program.to_account_info(),
                insuwork_escrow::cpi::accounts::FreezeMilestone {
                    config: ctx.accounts.escrow_config.to_account_info(),
                    commitment: ctx.accounts.commitment.to_account_info(),
                    milestone: ctx.accounts.milestone.to_account_info(),
                    disputes_authority: ctx.accounts.disputes_authority.to_account_info(),
                },
                &[seeds],
            ),
            m.index,
        )?;

        ctx.accounts.claim.set_inner(Claim {
            commitment: ctx.accounts.commitment.key(),
            milestone: ctx.accounts.milestone.key(),
            claimant: ctx.accounts.client.key(),
            evidence_hash,
            panel: [Pubkey::default(); 3],
            votes: [VOTE_NONE; 3],
            partial_bps: [0; 3],
            status: ClaimStatus::Filed,
            filed_ts: now,
            ruling_deadline: 0,
            outcome: ClaimOutcome::None,
            payout: 0,
            claim_fee: fee,
            bump: ctx.bumps.claim,
            fee_vault_bump: ctx.bumps.fee_vault,
            _reserved: [0; 64],
        });
        emit!(ClaimFiled { claim: ctx.accounts.claim.key(), milestone: ctx.accounts.milestone.key(), evidence_hash });
        Ok(())
    }

    /// remaining_accounts: 3 Panelist accounts, then the commitment's BondVault accounts
    /// (one per backing, in order) so the panel can be checked against every voucher.
    pub fn assign_panel<'info>(ctx: Context<'_, '_, 'info, 'info, AssignPanel<'info>>) -> Result<()> {
        let claim = &ctx.accounts.claim;
        let c = &ctx.accounts.commitment;
        require!(claim.status == ClaimStatus::Filed, DisputesError::InvalidStatus);
        let n = c.backing_count as usize;
        let rem = ctx.remaining_accounts;
        require!(rem.len() == 3 + n, DisputesError::InvalidPanel);

        let mut vouchers = Vec::with_capacity(n);
        for (i, acc) in rem[3..].iter().enumerate() {
            let vault: Account<'info, insuwork_bond::BondVault> = Account::try_from(acc)?;
            let expected = Pubkey::find_program_address(
                &[b"backing", vault.key().as_ref(), c.freelancer_ref.as_ref()],
                &ctx.accounts.config.bond_program,
            )
            .0;
            require_keys_eq!(expected, c.backings[i], DisputesError::InvalidPanel);
            vouchers.push(vault.voucher);
        }

        let mut panel = [Pubkey::default(); 3];
        for (i, acc) in rem[..3].iter().enumerate() {
            let mut p: Account<'info, Panelist> = Account::try_from(acc)?;
            require!(p.active, DisputesError::InvalidPanel);
            // OQ-20: declared-relationship checks are off-chain for now.
            require!(p.wallet != c.client && !vouchers.contains(&p.wallet), DisputesError::InvalidPanel);
            require!(!panel[..i].contains(&p.wallet), DisputesError::InvalidPanel);
            panel[i] = p.wallet;
            p.cases_assigned += 1;
            p.exit(&crate::ID)?;
        }

        let deadline = Clock::get()?.unix_timestamp + ctx.accounts.config.ruling_secs;
        let claim = &mut ctx.accounts.claim;
        claim.panel = panel;
        claim.ruling_deadline = deadline;
        claim.status = ClaimStatus::PanelAssigned;
        emit!(PanelAssigned { claim: claim.key(), panel, ruling_deadline: deadline });
        Ok(())
    }

    pub fn cast_vote(ctx: Context<CastVote>, vote: u8, partial_bps: u16) -> Result<()> {
        let claim = &mut ctx.accounts.claim;
        require!(claim.status == ClaimStatus::PanelAssigned, DisputesError::InvalidStatus);
        require!(Clock::get()?.unix_timestamp <= claim.ruling_deadline, DisputesError::DeadlinePassed);
        // E-33: partial rulings are out of scope for this build.
        require!(vote == VOTE_UPHELD || vote == VOTE_REJECTED, DisputesError::VoteNotSupported);
        let wallet = ctx.accounts.panelist.wallet;
        let i = claim.panel.iter().position(|p| *p == wallet).ok_or(DisputesError::NotPanelist)?;
        require!(claim.votes[i] == VOTE_NONE, DisputesError::AlreadyVoted);
        claim.votes[i] = vote;
        claim.partial_bps[i] = partial_bps;
        ctx.accounts.panelist.cases_voted += 1;
        emit!(VoteCast { claim: claim.key(), panelist: wallet, vote });
        Ok(())
    }

    /// Anyone, once 2 of 3 votes agree. Upheld: each backing pays its lock for this milestone
    /// to the client, escrow refunds salary + premium, claim fee refunded. Rejected: escrow
    /// releases normally, treasury keeps the claim fee (E-32).
    /// remaining_accounts per backing: `[vault, backing, voucher_ata, vault_ata]`.
    pub fn finalize<'info>(ctx: Context<'_, '_, 'info, 'info, Finalize<'info>>) -> Result<()> {
        let claim = &ctx.accounts.claim;
        require!(claim.status == ClaimStatus::PanelAssigned, DisputesError::InvalidStatus);
        // OQ-3 (owner, 2026-10-10): no majority by the ruling deadline defaults to Rejected.
        let now = Clock::get()?.unix_timestamp;
        let outcome = match majority(&claim.votes) {
            Some(o) => o,
            None if now > claim.ruling_deadline => ClaimOutcome::Rejected,
            None => return err!(DisputesError::NoMajority),
        };
        let a = &ctx.accounts;
        let m = &a.milestone;
        let n = a.commitment.backing_count as usize;
        let rem = ctx.remaining_accounts;
        require!(rem.len() == 4 * n, DisputesError::InvalidBackings);
        require_keys_eq!(a.client_ata.owner, claim.claimant, DisputesError::WrongDestination);
        require_keys_eq!(a.treasury_ata.owner, a.config.treasury, DisputesError::WrongDestination);

        let auth: &[&[u8]] = &[DISPUTES_AUTHORITY_SEED, &[ctx.bumps.disputes_authority]];
        let signer: &[&[&[u8]]] = &[auth];

        let mut payout = 0u64;
        if outcome == ClaimOutcome::Upheld {
            for (i, q) in rem.chunks(4).enumerate() {
                let amount = m.locked_per_backing[i];
                if amount == 0 {
                    continue;
                }
                insuwork_bond::cpi::pay_claim(
                    CpiContext::new_with_signer(
                        a.bond_program.to_account_info(),
                        insuwork_bond::cpi::accounts::PayClaim {
                            config: a.bond_config.to_account_info(),
                            disputes_authority: a.disputes_authority.to_account_info(),
                            vault: q[0].clone(),
                            vault_ata: q[3].clone(),
                            backing: q[1].clone(),
                            recipient_ata: a.client_ata.to_account_info(),
                            token_program: a.token_program.to_account_info(),
                        },
                        signer,
                    ),
                    amount,
                )?;
                payout += amount;
            }
        }

        let escrow_rem: Vec<AccountInfo<'info>> = rem.chunks(4).flat_map(|q| q[..3].iter().cloned()).collect();
        insuwork_escrow::cpi::resolve_milestone(
            CpiContext::new_with_signer(
                a.escrow_program.to_account_info(),
                insuwork_escrow::cpi::accounts::Release {
                    config: a.escrow_config.to_account_info(),
                    commitment: a.commitment.to_account_info(),
                    milestone: a.milestone.to_account_info(),
                    escrow_ata: a.escrow_ata.to_account_info(),
                    partner: a.partner.to_account_info(),
                    partner_ata: a.partner_ata.to_account_info(),
                    treasury_ata: a.escrow_treasury_ata.to_account_info(),
                    client_ata: a.client_ata.to_account_info(),
                    escrow_authority: a.escrow_authority.to_account_info(),
                    bond_config: a.bond_config.to_account_info(),
                    bond_program: a.bond_program.to_account_info(),
                    authority: a.disputes_authority.to_account_info(),
                    token_program: a.token_program.to_account_info(),
                },
                signer,
            )
            .with_remaining_accounts(escrow_rem),
            m.index,
            outcome,
        )?;

        // claim fee: refunded if upheld, else to treasury
        if claim.claim_fee > 0 {
            let to = if outcome == ClaimOutcome::Upheld { &a.client_ata } else { &a.treasury_ata };
            let ck = claim.key();
            let claim_seeds: &[&[u8]] = &[b"claim", claim.milestone.as_ref(), &[claim.bump]];
            token::transfer(
                CpiContext::new_with_signer(
                    a.token_program.to_account_info(),
                    Transfer { from: a.fee_vault.to_account_info(), to: to.to_account_info(), authority: a.claim.to_account_info() },
                    &[claim_seeds],
                ),
                claim.claim_fee,
            )?;
        }

        let claim = &mut ctx.accounts.claim;
        claim.status = ClaimStatus::Finalized;
        claim.outcome = outcome;
        claim.payout = payout;
        emit!(ClaimFinalized { claim: claim.key(), outcome, payout });
        Ok(())
    }
}

/// 2 identical (Upheld/Rejected) votes out of 3 -> that outcome.
pub fn majority(votes: &[u8; 3]) -> Option<ClaimOutcome> {
    let count = |v: u8| votes.iter().filter(|&&x| x == v).count();
    if count(VOTE_UPHELD) >= 2 {
        Some(ClaimOutcome::Upheld)
    } else if count(VOTE_REJECTED) >= 2 {
        Some(ClaimOutcome::Rejected)
    } else {
        None
    }
}

// ---------------- accounts ----------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ConfigParams {
    pub escrow_program: Pubkey,
    pub bond_program: Pubkey,
    pub treasury: Pubkey,
    pub ruling_secs: i64,
    pub claim_fee: u64,
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(init, payer = admin, space = 8 + DisputesConfig::INIT_SPACE, seeds = [b"disputes_config"], bump)]
    pub config: Account<'info, DisputesConfig>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(constraint = program.programdata_address()? == Some(program_data.key()))]
    pub program: Program<'info, crate::program::InsuworkDisputes>,
    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ DisputesError::Unauthorized)]
    pub program_data: Account<'info, ProgramData>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminConfig<'info> {
    #[account(mut, seeds = [b"disputes_config"], bump = config.bump, has_one = admin @ DisputesError::Unauthorized)]
    pub config: Account<'info, DisputesConfig>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct AddPanelist<'info> {
    #[account(seeds = [b"disputes_config"], bump = config.bump, has_one = admin @ DisputesError::Unauthorized)]
    pub config: Account<'info, DisputesConfig>,
    #[account(init, payer = admin, space = 8 + Panelist::INIT_SPACE, seeds = [b"panelist", wallet.as_ref()], bump)]
    pub panelist: Account<'info, Panelist>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetPanelistActive<'info> {
    #[account(seeds = [b"disputes_config"], bump = config.bump, has_one = admin @ DisputesError::Unauthorized)]
    pub config: Account<'info, DisputesConfig>,
    #[account(mut, seeds = [b"panelist", panelist.wallet.as_ref()], bump = panelist.bump)]
    pub panelist: Account<'info, Panelist>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct FileClaim<'info> {
    #[account(seeds = [b"disputes_config"], bump = config.bump)]
    pub config: Box<Account<'info, DisputesConfig>>,
    #[account(seeds = [b"escrow_config"], bump = escrow_config.bump, seeds::program = config.escrow_program)]
    pub escrow_config: Box<Account<'info, EscrowConfig>>,
    #[account(has_one = client @ DisputesError::NotClient)]
    pub commitment: Box<Account<'info, Commitment>>,
    #[account(
        mut,
        seeds = [b"milestone", commitment.key().as_ref(), &[index]], bump = milestone.bump,
        seeds::program = config.escrow_program,
    )]
    pub milestone: Box<Account<'info, Milestone>>,
    #[account(init, payer = client, space = 8 + Claim::INIT_SPACE, seeds = [b"claim", milestone.key().as_ref()], bump)]
    pub claim: Box<Account<'info, Claim>>,
    #[account(
        init, payer = client, seeds = [b"claim_fee", claim.key().as_ref()], bump,
        token::mint = usdc_mint, token::authority = claim,
    )]
    pub fee_vault: Box<Account<'info, TokenAccount>>,
    #[account(address = config.usdc_mint)]
    pub usdc_mint: Box<Account<'info, Mint>>,
    #[account(mut, token::mint = config.usdc_mint, token::authority = client)]
    pub client_ata: Box<Account<'info, TokenAccount>>,
    /// CHECK: PDA signer for escrow/bond CPIs.
    #[account(seeds = [DISPUTES_AUTHORITY_SEED], bump)]
    pub disputes_authority: UncheckedAccount<'info>,
    #[account(address = config.escrow_program)]
    pub escrow_program: Program<'info, InsuworkEscrow>,
    #[account(mut)]
    pub client: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AssignPanel<'info> {
    #[account(seeds = [b"disputes_config"], bump = config.bump, has_one = admin @ DisputesError::Unauthorized)]
    pub config: Box<Account<'info, DisputesConfig>>,
    #[account(mut, seeds = [b"claim", claim.milestone.as_ref()], bump = claim.bump, has_one = commitment)]
    pub claim: Box<Account<'info, Claim>>,
    pub commitment: Box<Account<'info, Commitment>>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(mut, seeds = [b"claim", claim.milestone.as_ref()], bump = claim.bump)]
    pub claim: Account<'info, Claim>,
    #[account(mut, seeds = [b"panelist", wallet.key().as_ref()], bump = panelist.bump)]
    pub panelist: Account<'info, Panelist>,
    pub wallet: Signer<'info>,
}

#[derive(Accounts)]
pub struct Finalize<'info> {
    #[account(seeds = [b"disputes_config"], bump = config.bump)]
    pub config: Box<Account<'info, DisputesConfig>>,
    #[account(mut, seeds = [b"claim", claim.milestone.as_ref()], bump = claim.bump, has_one = commitment, has_one = milestone)]
    pub claim: Box<Account<'info, Claim>>,
    #[account(mut, seeds = [b"claim_fee", claim.key().as_ref()], bump = claim.fee_vault_bump)]
    pub fee_vault: Box<Account<'info, TokenAccount>>,
    /// disputes treasury (claim fee destination)
    #[account(mut, token::mint = config.usdc_mint)]
    pub treasury_ata: Box<Account<'info, TokenAccount>>,
    /// CHECK: PDA signer for escrow/bond CPIs.
    #[account(seeds = [DISPUTES_AUTHORITY_SEED], bump)]
    pub disputes_authority: UncheckedAccount<'info>,
    // ---- passed through to escrow.resolve_milestone (validated there) ----
    /// CHECK: escrow config
    pub escrow_config: UncheckedAccount<'info>,
    /// CHECK: validated by has_one on claim and by escrow
    #[account(mut)]
    pub commitment: Box<Account<'info, Commitment>>,
    #[account(mut)]
    pub milestone: Box<Account<'info, Milestone>>,
    /// CHECK: escrow token account
    #[account(mut)]
    pub escrow_ata: UncheckedAccount<'info>,
    /// CHECK: partner record
    pub partner: UncheckedAccount<'info>,
    /// CHECK: partner token account
    #[account(mut)]
    pub partner_ata: UncheckedAccount<'info>,
    /// CHECK: escrow treasury token account (platform fee destination)
    #[account(mut)]
    pub escrow_treasury_ata: UncheckedAccount<'info>,
    #[account(mut, token::mint = config.usdc_mint)]
    pub client_ata: Box<Account<'info, TokenAccount>>,
    /// CHECK: escrow's authority PDA
    pub escrow_authority: UncheckedAccount<'info>,
    /// CHECK: bond config
    pub bond_config: UncheckedAccount<'info>,
    #[account(address = config.bond_program)]
    pub bond_program: Program<'info, InsuworkBond>,
    #[account(address = config.escrow_program)]
    pub escrow_program: Program<'info, InsuworkEscrow>,
    pub token_program: Program<'info, Token>,
}

// ---------------- state ----------------

#[account]
#[derive(InitSpace)]
pub struct DisputesConfig {
    pub admin: Pubkey,
    pub usdc_mint: Pubkey,
    pub escrow_program: Pubkey,
    pub bond_program: Pubkey,
    pub treasury: Pubkey,
    pub ruling_secs: i64,
    pub claim_fee: u64,
    pub paused: bool,
    pub bump: u8,
    pub _reserved: [u8; 64],
}

#[account]
#[derive(InitSpace)]
pub struct Panelist {
    pub wallet: Pubkey,
    pub active: bool,
    pub cases_assigned: u32,
    pub cases_voted: u32,
    pub bump: u8,
    pub _reserved: [u8; 64],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum ClaimStatus { Filed, PanelAssigned, Finalized }

#[account]
#[derive(InitSpace)]
pub struct Claim {
    pub commitment: Pubkey,
    pub milestone: Pubkey,
    pub claimant: Pubkey,
    pub evidence_hash: [u8; 32],
    pub panel: [Pubkey; 3],
    pub votes: [u8; 3],
    pub partial_bps: [u16; 3],
    pub status: ClaimStatus,
    pub filed_ts: i64,
    pub ruling_deadline: i64,
    pub outcome: ClaimOutcome,
    pub payout: u64,
    pub claim_fee: u64,
    pub bump: u8,
    pub fee_vault_bump: u8,
    pub _reserved: [u8; 64],
}

// ---------------- events ----------------

#[event]
pub struct PanelistAdded { pub wallet: Pubkey }
#[event]
pub struct ClaimFiled { pub claim: Pubkey, pub milestone: Pubkey, pub evidence_hash: [u8; 32] }
#[event]
pub struct PanelAssigned { pub claim: Pubkey, pub panel: [Pubkey; 3], pub ruling_deadline: i64 }
#[event]
pub struct VoteCast { pub claim: Pubkey, pub panelist: Pubkey, pub vote: u8 }
#[event]
pub struct ClaimFinalized { pub claim: Pubkey, pub outcome: ClaimOutcome, pub payout: u64 }

#[error_code]
pub enum DisputesError {
    #[msg("Claim window has closed")]
    WindowClosed,
    #[msg("Signer is not the commitment's client")]
    NotClient,
    #[msg("Milestone is not Active")]
    NotActive,
    #[msg("Panel must be 3 distinct active panelists, none the client or a voucher")]
    InvalidPanel,
    #[msg("Signer is not on this claim's panel")]
    NotPanelist,
    #[msg("Panelist already voted")]
    AlreadyVoted,
    #[msg("Ruling deadline has passed")]
    DeadlinePassed,
    #[msg("Only Upheld / Rejected votes are supported (E-33)")]
    VoteNotSupported,
    #[msg("No 2-of-3 majority yet and ruling deadline not passed")]
    NoMajority,
    #[msg("Invalid claim status for this action")]
    InvalidStatus,
    #[msg("Backing accounts don't match the commitment")]
    InvalidBackings,
    #[msg("Destination token account owner is not the expected wallet")]
    WrongDestination,
    #[msg("Program is paused")]
    Paused,
    #[msg("Signer is not the admin / upgrade authority")]
    Unauthorized,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn majority_rules() {
        assert_eq!(majority(&[1, 1, 0]), Some(ClaimOutcome::Upheld));
        assert_eq!(majority(&[2, 1, 2]), Some(ClaimOutcome::Rejected));
        assert_eq!(majority(&[1, 2, 0]), None);
        assert_eq!(majority(&[0, 0, 0]), None);
    }
}
