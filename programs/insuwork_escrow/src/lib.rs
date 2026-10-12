use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use insuwork_bond::{program::InsuworkBond, Backing, BondVault};

declare_id!("FuY5Vc1im394GVYyg9v4aRdD2NaLkNnhqcH7j2bCFaKw");

pub const ESCROW_AUTHORITY_SEED: &[u8] = b"escrow_authority";
pub const DISPUTES_AUTHORITY_SEED: &[u8] = b"disputes_authority";
pub const MAX_MILESTONES: u8 = 12;
// ponytail: fixed small cap keeps Commitment a fixed size; raise if a commitment needs more vouchers.
pub const MAX_BACKINGS: usize = 4;
const BPS: u128 = 10_000;

#[program]
pub mod insuwork_escrow {
    use super::*;

    // ---------------- admin ----------------

    pub fn init_config(ctx: Context<InitConfig>, params: ConfigParams) -> Result<()> {
        require!(params.freelancer_share_bps as u128 <= BPS, EscrowError::InvalidBps);
        ctx.accounts.config.set_inner(EscrowConfig {
            admin: ctx.accounts.admin.key(),
            usdc_mint: ctx.accounts.usdc_mint.key(),
            bond_program: params.bond_program,
            disputes_program: params.disputes_program,
            treasury: params.treasury,
            github_oracle: params.github_oracle,
            submitter: params.submitter,
            premium_bps: params.premium_bps,
            platform_fee_bps: params.platform_fee_bps,
            freelancer_share_bps: params.freelancer_share_bps,
            claim_window_secs: params.claim_window_secs,
            cancel_fee_bps: params.cancel_fee_bps,
            withdraw_penalty_bps: params.withdraw_penalty_bps,
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

    pub fn set_oracle(ctx: Context<AdminConfig>, github_oracle: Pubkey) -> Result<()> {
        ctx.accounts.config.github_oracle = github_oracle;
        Ok(())
    }

    pub fn set_submitter(ctx: Context<AdminConfig>, submitter: Pubkey) -> Result<()> {
        ctx.accounts.config.submitter = submitter;
        Ok(())
    }

    pub fn set_cancel_terms(ctx: Context<AdminConfig>, cancel_fee_bps: u16, withdraw_penalty_bps: u16) -> Result<()> {
        require!(cancel_fee_bps as u128 <= BPS && withdraw_penalty_bps as u128 <= BPS, EscrowError::InvalidBps);
        ctx.accounts.config.cancel_fee_bps = cancel_fee_bps;
        ctx.accounts.config.withdraw_penalty_bps = withdraw_penalty_bps;
        Ok(())
    }

    /// OQ-6: treasury wallet not chosen yet; admin can set it later (E-23).
    pub fn set_treasury(ctx: Context<AdminConfig>, treasury: Pubkey) -> Result<()> {
        ctx.accounts.config.treasury = treasury;
        Ok(())
    }

    /// Platform-default freelancer share of premium + fee (E-28). Applies to new commitments only.
    pub fn set_freelancer_share(ctx: Context<AdminConfig>, freelancer_share_bps: u16) -> Result<()> {
        require!(freelancer_share_bps as u128 <= BPS, EscrowError::InvalidBps);
        ctx.accounts.config.freelancer_share_bps = freelancer_share_bps;
        Ok(())
    }

    pub fn register_partner(ctx: Context<RegisterPartner>, wallet: Pubkey, name: [u8; 32], is_mock: bool) -> Result<()> {
        ctx.accounts.partner.set_inner(PartnerRecord {
            wallet,
            name,
            is_mock,
            active: true,
            bump: ctx.bumps.partner,
            _reserved: [0; 64],
        });
        emit!(PartnerRegistered { wallet, is_mock });
        Ok(())
    }

    pub fn set_partner_active(ctx: Context<SetPartnerActive>, active: bool) -> Result<()> {
        ctx.accounts.partner.active = active;
        emit!(PartnerStatusSet { wallet: ctx.accounts.partner.wallet, active });
        Ok(())
    }

    // ---------------- client ----------------

    /// remaining_accounts: `[vault_0, backing_0, vault_1, backing_1, ...]` (1..=MAX_BACKINGS pairs).
    pub fn create_commitment<'info>(
        ctx: Context<'_, '_, 'info, 'info, CreateCommitment<'info>>,
        commitment_id: u64,
        freelancer_ref: [u8; 32],
        milestone_count: u8,
        share_with_freelancer: bool,
        vest_amount: u64,
        vest_delay_secs: i64,
    ) -> Result<()> {
        let cfg = &ctx.accounts.config;
        require!(vest_delay_secs >= 0, EscrowError::InvalidDueDate);
        require!(!cfg.paused, EscrowError::Paused);
        require!(ctx.accounts.partner.active, EscrowError::InactivePartner);
        require!(milestone_count >= 1 && milestone_count <= MAX_MILESTONES, EscrowError::InvalidMilestoneCount);

        let rem = ctx.remaining_accounts;
        require!(!rem.is_empty() && rem.len() % 2 == 0 && rem.len() / 2 <= MAX_BACKINGS, EscrowError::InvalidBackings);

        let client = ctx.accounts.client.key();
        let mut backings = [Pubkey::default(); MAX_BACKINGS];
        let mut caps = [0u64; MAX_BACKINGS];
        let auth_seeds: &[&[u8]] = &[ESCROW_AUTHORITY_SEED, &[ctx.bumps.escrow_authority]];

        for (i, pair) in rem.chunks(2).enumerate() {
            let vault: Account<'info, BondVault> = Account::try_from(&pair[0])?;
            let backing: Account<'info, Backing> = Account::try_from(&pair[1])?;
            require_keys_eq!(backing.vault, vault.key(), EscrowError::BackingMismatch);
            require!(backing.freelancer_ref == freelancer_ref, EscrowError::BackingMismatch);
            require!(backing.active, EscrowError::BackingMismatch);
            // E-25 (OQ-13): a voucher can't be the client on the same commitment.
            require_keys_neq!(vault.voucher, client, EscrowError::VoucherIsClient);
            require!(!backings[..i].contains(&backing.key()), EscrowError::InvalidBackings);
            backings[i] = backing.key();
            caps[i] = backing.cap; // OQ-1 (owner): pro rata uses caps snapshotted at creation

            // E-20: mark the backing as used by a live commitment.
            insuwork_bond::cpi::attach_commitment(CpiContext::new_with_signer(
                ctx.accounts.bond_program.to_account_info(),
                insuwork_bond::cpi::accounts::EscrowCall {
                    config: ctx.accounts.bond_config.to_account_info(),
                    escrow_authority: ctx.accounts.escrow_authority.to_account_info(),
                    vault: pair[0].clone(),
                    backing: pair[1].clone(),
                },
                &[auth_seeds],
            ))?;
        }

        let c = &mut ctx.accounts.commitment;
        c.client = client;
        c.commitment_id = commitment_id;
        c.freelancer_ref = freelancer_ref;
        c.partner = ctx.accounts.partner.wallet;
        c.backings = backings;
        c.backing_count = (rem.len() / 2) as u8;
        c.backing_caps = caps;
        c.active_milestone = None;
        c.milestone_count = milestone_count;
        c.premium_bps = cfg.premium_bps;
        c.platform_fee_bps = cfg.platform_fee_bps;
        c.freelancer_share_bps = if share_with_freelancer { cfg.freelancer_share_bps } else { 0 };
        c.status = CommitmentStatus::Draft;
        // E-34: client-funded retention vest, paid to the partner `vest_delay_secs` after completion.
        c.vest_amount = vest_amount;
        c.vest_delay_secs = vest_delay_secs;
        c.vest_status = if vest_amount > 0 { VestStatus::Held } else { VestStatus::None };
        c.total_required = vest_amount;
        c.created_ts = Clock::get()?.unix_timestamp;
        c.bump = ctx.bumps.commitment;
        c.ata_bump = ctx.bumps.escrow_ata;
        emit!(CommitmentCreated {
            commitment: c.key(),
            client,
            freelancer_ref,
            partner: c.partner,
            backings: c.backings,
            backing_count: c.backing_count,
            milestone_count,
            freelancer_share_bps: c.freelancer_share_bps,
        });
        Ok(())
    }

    pub fn add_milestone(ctx: Context<AddMilestone>, index: u8, params: MilestoneParams) -> Result<()> {
        let c = &mut ctx.accounts.commitment;
        require!(c.status == CommitmentStatus::Draft, EscrowError::InvalidStatus);
        require!(index == c.milestones_added && index < c.milestone_count, EscrowError::InvalidMilestoneIndex);
        require!(params.amount > 0, EscrowError::ZeroAmount);
        require!(params.due_ts > Clock::get()?.unix_timestamp, EscrowError::InvalidDueDate);

        let split = Split::new(params.amount, c.premium_bps, c.platform_fee_bps, c.freelancer_share_bps)?;
        c.total_required = c.total_required.checked_add(split.client_due).ok_or(EscrowError::Overflow)?;
        c.remaining_salary = c.remaining_salary.checked_add(params.amount).ok_or(EscrowError::Overflow)?;
        c.milestones_added += 1;

        ctx.accounts.milestone.set_inner(Milestone {
            commitment: c.key(),
            index,
            amount: params.amount,
            due_ts: params.due_ts,
            spec_hash: params.spec_hash,
            release_mode: params.release_mode,
            github_ref_hash: params.github_ref_hash,
            status: MilestoneStatus::Pending,
            locked_amount: 0,
            locked_per_backing: [0; MAX_BACKINGS],
            released_ts: 0,
            submitted_ts: 0,
            submissions: 0,
            bump: ctx.bumps.milestone,
            _reserved: [0; 64],
        });
        emit!(MilestoneAdded { commitment: c.key(), index, amount: params.amount, due_ts: params.due_ts, client_due: split.client_due });
        Ok(())
    }

    /// remaining_accounts: `[vault_i, backing_i]` for every backing, in `commitment.backings` order.
    pub fn activate_milestone<'info>(
        ctx: Context<'_, '_, 'info, 'info, ActivateMilestone<'info>>,
        _index: u8,
    ) -> Result<()> {
        let c = &ctx.accounts.commitment;
        require!(!ctx.accounts.config.paused, EscrowError::Paused);
        require!(
            c.status == CommitmentStatus::Funded || c.status == CommitmentStatus::Active,
            EscrowError::InvalidStatus
        );
        // OQ-1 (owner): one active milestone at a time.
        require!(c.active_milestone.is_none(), EscrowError::MilestoneAlreadyActive);
        require!(ctx.accounts.milestone.status == MilestoneStatus::Pending, EscrowError::InvalidStatus);

        let n = c.backing_count as usize;
        let rem = ctx.remaining_accounts;
        require!(rem.len() == 2 * n, EscrowError::InvalidBackings);
        let mut free = [0u64; MAX_BACKINGS];
        for (i, pair) in rem.chunks(2).enumerate() {
            require_keys_eq!(pair[1].key(), c.backings[i], EscrowError::BackingMismatch);
            let backing: Account<'info, Backing> = Account::try_from(&pair[1])?;
            free[i] = backing.cap.saturating_sub(backing.locked);
        }
        let locks = pro_rata_locks(ctx.accounts.milestone.amount, &c.backing_caps[..n], &free[..n]);
        let total: u64 = locks.iter().sum();
        require!(total > 0, EscrowError::BackingInsufficient);

        let auth_seeds: &[&[u8]] = &[ESCROW_AUTHORITY_SEED, &[ctx.bumps.escrow_authority]];
        for (i, pair) in rem.chunks(2).enumerate() {
            if locks[i] == 0 {
                continue;
            }
            insuwork_bond::cpi::lock(
                CpiContext::new_with_signer(
                    ctx.accounts.bond_program.to_account_info(),
                    insuwork_bond::cpi::accounts::EscrowCall {
                        config: ctx.accounts.bond_config.to_account_info(),
                        escrow_authority: ctx.accounts.escrow_authority.to_account_info(),
                        vault: pair[0].clone(),
                        backing: pair[1].clone(),
                    },
                    &[auth_seeds],
                ),
                locks[i],
            )?;
        }

        let m = &mut ctx.accounts.milestone;
        m.status = MilestoneStatus::Active;
        m.locked_amount = total;
        m.locked_per_backing = locks;
        let c = &mut ctx.accounts.commitment;
        c.status = CommitmentStatus::Active;
        c.active_milestone = Some(m.index);
        emit!(MilestoneActivated { commitment: c.key(), index: m.index, locked_amount: total, locked_per_backing: locks });
        Ok(())
    }

    /// E-31: partner or backend records a work submission. The first sets the window;
    /// one later submission inside the window restarts it.
    pub fn submit_milestone(ctx: Context<SubmitMilestone>, _index: u8) -> Result<()> {
        let who = ctx.accounts.submitter.key();
        require!(
            who == ctx.accounts.commitment.partner || who == ctx.accounts.config.submitter,
            EscrowError::Unauthorized
        );
        let window = ctx.accounts.config.claim_window_secs;
        let m = &mut ctx.accounts.milestone;
        require!(m.status == MilestoneStatus::Active, EscrowError::NotActive);
        let now = Clock::get()?.unix_timestamp;
        match m.submissions {
            0 => {}
            1 => require!(now <= window_end(m, window), EscrowError::WindowRestartUsed),
            _ => return err!(EscrowError::WindowRestartUsed),
        }
        m.submitted_ts = now;
        m.submissions += 1;
        emit!(MilestoneSubmitted {
            commitment: m.commitment,
            index: m.index,
            submitted_ts: now,
            window_end: window_end(m, window),
        });
        Ok(())
    }

    /// Client approval; allowed before or after due_ts (OQ-16).
    pub fn approve_milestone<'info>(ctx: Context<'_, '_, 'info, 'info, Release<'info>>, _index: u8) -> Result<()> {
        require_keys_eq!(ctx.accounts.authority.key(), ctx.accounts.commitment.client, EscrowError::Unauthorized);
        release(ctx, ReleaseMode::ClientSig, false)
    }

    pub fn oracle_approve<'info>(
        ctx: Context<'_, '_, 'info, 'info, Release<'info>>,
        _index: u8,
        github_ref_hash: [u8; 32],
    ) -> Result<()> {
        require_keys_eq!(ctx.accounts.authority.key(), ctx.accounts.config.github_oracle, EscrowError::WrongOracle);
        let m = &ctx.accounts.milestone;
        require!(m.release_mode == ReleaseMode::GithubOracle, EscrowError::WrongOracle);
        require!(m.github_ref_hash == github_ref_hash, EscrowError::RefMismatch);
        release(ctx, ReleaseMode::GithubOracle, false)
    }

    /// Anyone may crank once a submission exists and its claim window has closed.
    pub fn crank_auto_release<'info>(ctx: Context<'_, '_, 'info, 'info, Release<'info>>, _index: u8) -> Result<()> {
        let m = &ctx.accounts.milestone;
        require!(m.submissions > 0, EscrowError::NotSubmitted);
        let now = Clock::get()?.unix_timestamp;
        require!(now >= window_end(m, ctx.accounts.config.claim_window_secs), EscrowError::WindowOpen);
        release(ctx, ReleaseMode::ClientSig, false)
    }

    /// disputes CPI: Active -> Disputed (blocks approve / oracle / crank).
    pub fn freeze_milestone(ctx: Context<FreezeMilestone>, _index: u8) -> Result<()> {
        let m = &mut ctx.accounts.milestone;
        require!(m.status == MilestoneStatus::Active, EscrowError::NotActive);
        m.status = MilestoneStatus::Disputed;
        emit!(MilestoneFrozen { commitment: m.commitment, index: m.index });
        Ok(())
    }

    /// disputes CPI after finalize. Upheld: bond has already paid the client (pay_claim);
    /// escrow refunds the client's funded salary + premium for this milestone, treasury keeps
    /// the client's fee portion (E-32). Rejected: normal release.
    /// remaining_accounts as in release: `[vault_i, backing_i, voucher_ata_i]`.
    pub fn resolve_milestone<'info>(
        ctx: Context<'_, '_, 'info, 'info, Release<'info>>,
        _index: u8,
        outcome: ClaimOutcome,
    ) -> Result<()> {
        let expected = Pubkey::find_program_address(&[DISPUTES_AUTHORITY_SEED], &ctx.accounts.config.disputes_program).0;
        require_keys_eq!(ctx.accounts.authority.key(), expected, EscrowError::UnauthorizedCaller);
        match outcome {
            ClaimOutcome::Rejected => release(ctx, ReleaseMode::ClientSig, true),
            ClaimOutcome::Upheld => resolve_upheld(ctx),
            // E-33: partial rulings are out of scope for this build.
            _ => err!(EscrowError::OutcomeNotSupported),
        }
    }

    /// Anyone, after the vest date, if the partner hasn't flagged that the freelancer left (E-34).
    pub fn release_vest(ctx: Context<VestCall>) -> Result<()> {
        let c = &ctx.accounts.commitment;
        require!(c.vest_status == VestStatus::Vesting, EscrowError::InvalidStatus);
        require!(Clock::get()?.unix_timestamp >= c.vest_due_ts, EscrowError::VestNotDue);
        require!(ctx.accounts.partner.active, EscrowError::InactivePartner);
        require_keys_eq!(ctx.accounts.partner_ata.owner, c.partner, EscrowError::WrongDestination);
        commitment_pay(&ctx.accounts.commitment, &ctx.accounts.escrow_ata, &ctx.accounts.partner_ata.to_account_info(), &ctx.accounts.token_program, c.vest_amount)?;
        let c = &mut ctx.accounts.commitment;
        c.vest_status = VestStatus::Released;
        emit!(VestReleased { commitment: c.key(), amount: c.vest_amount, partner: c.partner });
        Ok(())
    }

    /// Partner flags, before the vest date, that the freelancer left: vest goes back to the client
    /// (its funder). Nothing is ever taken from the freelancer side (hard rule 8).
    pub fn flag_vest_left(ctx: Context<VestCall>) -> Result<()> {
        let c = &ctx.accounts.commitment;
        require_keys_eq!(ctx.accounts.authority.key(), c.partner, EscrowError::Unauthorized);
        require!(c.vest_status == VestStatus::Vesting, EscrowError::InvalidStatus);
        require!(Clock::get()?.unix_timestamp < c.vest_due_ts, EscrowError::VestDue);
        require_keys_eq!(ctx.accounts.client_ata.owner, c.client, EscrowError::WrongDestination);
        commitment_pay(&ctx.accounts.commitment, &ctx.accounts.escrow_ata, &ctx.accounts.client_ata.to_account_info(), &ctx.accounts.token_program, c.vest_amount)?;
        let c = &mut ctx.accounts.commitment;
        c.vest_status = VestStatus::Refunded;
        emit!(VestRefunded { commitment: c.key(), amount: c.vest_amount });
        Ok(())
    }

    /// Client cancels between milestones (E-34): partner gets `cancel_fee_bps` of the remaining
    /// salary (time invested), client gets everything else in escrow back (incl. vest).
    /// remaining_accounts: `[vault_i, backing_i, vault_ata_i]` per backing.
    pub fn cancel_commitment<'info>(ctx: Context<'_, '_, 'info, 'info, Cancel<'info>>) -> Result<()> {
        require_keys_eq!(ctx.accounts.authority.key(), ctx.accounts.commitment.client, EscrowError::Unauthorized);
        let c = &ctx.accounts.commitment;
        let charge = (c.remaining_salary as u128 * ctx.accounts.config.cancel_fee_bps as u128 / BPS) as u64;
        close_commitment(ctx, charge, 0, false)
    }

    /// Freelancer side (partner) withdraws between milestones (E-34): freelancer forfeits future
    /// pay and the vest; vouchers pay `withdraw_penalty_bps` of the remaining salary to the client,
    /// pro rata by snapshot caps (clamped to free capacity); client gets all escrow back.
    pub fn withdraw_commitment<'info>(ctx: Context<'_, '_, 'info, 'info, Cancel<'info>>) -> Result<()> {
        require_keys_eq!(ctx.accounts.authority.key(), ctx.accounts.commitment.partner, EscrowError::Unauthorized);
        let c = &ctx.accounts.commitment;
        let penalty = (c.remaining_salary as u128 * ctx.accounts.config.withdraw_penalty_bps as u128 / BPS) as u64;
        close_commitment(ctx, 0, penalty, true)
    }

    pub fn fund(ctx: Context<Fund>, amount: u64) -> Result<()> {
        let c = &ctx.accounts.commitment;
        require!(c.status == CommitmentStatus::Draft, EscrowError::InvalidStatus);
        require!(c.milestones_added == c.milestone_count, EscrowError::MilestonesIncomplete);
        let funded = c.funded.checked_add(amount).ok_or(EscrowError::Overflow)?;
        require!(funded <= c.total_required, EscrowError::Overfund);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.client_ata.to_account_info(),
                    to: ctx.accounts.escrow_ata.to_account_info(),
                    authority: ctx.accounts.client.to_account_info(),
                },
            ),
            amount,
        )?;
        let c = &mut ctx.accounts.commitment;
        c.funded = funded;
        if funded == c.total_required {
            c.status = CommitmentStatus::Funded;
            emit!(CommitmentFunded { commitment: c.key(), funded });
        }
        Ok(())
    }
}

// ---------------- release ----------------

/// Claim / auto-release window end: max(due_ts, submitted_ts) + window (E-31).
/// Before any submission it is due_ts + window (used by disputes for claim filing).
pub fn window_end(m: &Milestone, window_secs: i64) -> i64 {
    m.due_ts.max(m.submitted_ts).saturating_add(window_secs)
}

/// remaining_accounts: `[vault_i, backing_i, voucher_ata_i]` per backing, in `commitment.backings` order.
fn release<'info>(ctx: Context<'_, '_, 'info, 'info, Release<'info>>, mode: ReleaseMode, from_dispute: bool) -> Result<()> {
    let a = &ctx.accounts;
    let c = &a.commitment;
    let m = &a.milestone;
    // I-E3: a Disputed milestone is released only by disputes (Rejected outcome).
    let expected = if from_dispute { MilestoneStatus::Disputed } else { MilestoneStatus::Active };
    require!(m.status == expected, EscrowError::NotActive);
    // I-E1: salary goes only to the registered, active partner.
    require!(a.partner.active, EscrowError::InactivePartner);
    require_keys_eq!(a.partner_ata.owner, c.partner, EscrowError::WrongDestination);
    require_keys_eq!(a.treasury_ata.owner, a.config.treasury, EscrowError::WrongDestination);
    require_keys_eq!(a.client_ata.owner, c.client, EscrowError::WrongDestination);

    let n = c.backing_count as usize;
    let rem = ctx.remaining_accounts;
    require!(rem.len() == 3 * n, EscrowError::InvalidBackings);

    let rs = ReleaseSplit::new(m.amount, m.locked_amount, c.premium_bps, c.platform_fee_bps, c.freelancer_share_bps)?;
    let premiums = pro_rata_premiums(rs.voucher_premium, &m.locked_per_backing[..n]);

    let id = c.commitment_id.to_le_bytes();
    let c_seeds: &[&[u8]] = &[b"commitment", c.client.as_ref(), &id, &[c.bump]];
    let pay = |to: &AccountInfo<'info>, amount: u64| -> Result<()> {
        if amount == 0 {
            return Ok(());
        }
        token::transfer(
            CpiContext::new_with_signer(
                a.token_program.to_account_info(),
                Transfer { from: a.escrow_ata.to_account_info(), to: to.clone(), authority: a.commitment.to_account_info() },
                &[c_seeds],
            ),
            amount,
        )
    };
    pay(&a.partner_ata.to_account_info(), rs.partner_payout)?;
    pay(&a.treasury_ata.to_account_info(), rs.fee)?;
    pay(&a.client_ata.to_account_info(), rs.client_refund)?;

    let auth_seeds: &[&[u8]] = &[ESCROW_AUTHORITY_SEED, &[ctx.bumps.escrow_authority]];
    let signer: &[&[&[u8]]] = &[auth_seeds];
    let completes = c.milestones_closed + 1 == c.milestone_count;
    for (i, t) in rem.chunks(3).enumerate() {
        require_keys_eq!(t[1].key(), c.backings[i], EscrowError::BackingMismatch);
        let vault: Account<'info, BondVault> = Account::try_from(&t[0])?;
        let voucher_ata: Account<'info, TokenAccount> = Account::try_from(&t[2])?;
        require_keys_eq!(voucher_ata.owner, vault.voucher, EscrowError::WrongDestination);
        pay(&t[2], premiums[i])?;

        let bond_ctx = || {
            CpiContext::new_with_signer(
                a.bond_program.to_account_info(),
                insuwork_bond::cpi::accounts::EscrowCall {
                    config: a.bond_config.to_account_info(),
                    escrow_authority: a.escrow_authority.to_account_info(),
                    vault: t[0].clone(),
                    backing: t[1].clone(),
                },
                signer,
            )
        };
        if m.locked_per_backing[i] > 0 {
            insuwork_bond::cpi::unlock(bond_ctx(), m.locked_per_backing[i])?;
        }
        if premiums[i] > 0 {
            insuwork_bond::cpi::record_premium(bond_ctx(), premiums[i])?;
        }
        if completes {
            insuwork_bond::cpi::detach_commitment(bond_ctx())?;
        }
    }

    let now = Clock::get()?.unix_timestamp;
    let m = &mut ctx.accounts.milestone;
    m.status = MilestoneStatus::Released;
    m.released_ts = now;
    let c = &mut ctx.accounts.commitment;
    c.released = c.released.checked_add(rs.partner_payout).ok_or(EscrowError::Overflow)?;
    c.remaining_salary -= m.amount;
    c.milestones_closed += 1;
    c.active_milestone = None;
    if completes {
        c.status = CommitmentStatus::Completed;
        if c.vest_status == VestStatus::Held {
            c.vest_status = VestStatus::Vesting;
            c.vest_due_ts = now.saturating_add(c.vest_delay_secs);
        }
    }
    emit!(MilestoneReleased {
        commitment: c.key(),
        index: m.index,
        amount: m.amount,
        partner_payout: rs.partner_payout,
        premium: rs.voucher_premium,
        fee: rs.fee,
        client_refund: rs.client_refund,
        partner: c.partner,
        freelancer_ref: c.freelancer_ref,
        spec_hash: m.spec_hash,
        mode,
    });
    Ok(())
}

fn resolve_upheld<'info>(ctx: Context<'_, '_, 'info, 'info, Release<'info>>) -> Result<()> {
    let a = &ctx.accounts;
    let c = &a.commitment;
    let m = &a.milestone;
    require!(m.status == MilestoneStatus::Disputed, EscrowError::NotActive);
    require_keys_eq!(a.treasury_ata.owner, a.config.treasury, EscrowError::WrongDestination);
    require_keys_eq!(a.client_ata.owner, c.client, EscrowError::WrongDestination);
    let n = c.backing_count as usize;
    let rem = ctx.remaining_accounts;
    require!(rem.len() == 3 * n, EscrowError::InvalidBackings);

    let split = Split::new(m.amount, c.premium_bps, c.platform_fee_bps, c.freelancer_share_bps)?;
    let client_fee = split.fee - split.fee * c.freelancer_share_bps as u64 / BPS as u64;
    let completes = c.milestones_closed + 1 == c.milestone_count;
    // E-34: commitment ended on a failed milestone -> the vest never starts; refund it now.
    let vest_refund = if completes && c.vest_status == VestStatus::Held { c.vest_amount } else { 0 };
    let refund = split.client_due - client_fee + vest_refund;

    let id = c.commitment_id.to_le_bytes();
    let c_seeds: &[&[u8]] = &[b"commitment", c.client.as_ref(), &id, &[c.bump]];
    for (to, amount) in [(a.client_ata.to_account_info(), refund), (a.treasury_ata.to_account_info(), client_fee)] {
        if amount > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    a.token_program.to_account_info(),
                    Transfer { from: a.escrow_ata.to_account_info(), to, authority: a.commitment.to_account_info() },
                    &[c_seeds],
                ),
                amount,
            )?;
        }
    }

    if completes {
        let auth_seeds: &[&[u8]] = &[ESCROW_AUTHORITY_SEED, &[ctx.bumps.escrow_authority]];
        for (i, t) in rem.chunks(3).enumerate() {
            require_keys_eq!(t[1].key(), c.backings[i], EscrowError::BackingMismatch);
            insuwork_bond::cpi::detach_commitment(CpiContext::new_with_signer(
                a.bond_program.to_account_info(),
                insuwork_bond::cpi::accounts::EscrowCall {
                    config: a.bond_config.to_account_info(),
                    escrow_authority: a.escrow_authority.to_account_info(),
                    vault: t[0].clone(),
                    backing: t[1].clone(),
                },
                &[auth_seeds],
            ))?;
        }
    }

    let m = &mut ctx.accounts.milestone;
    m.status = MilestoneStatus::Resolved;
    let c = &mut ctx.accounts.commitment;
    c.remaining_salary -= m.amount;
    c.milestones_closed += 1;
    c.active_milestone = None;
    if completes {
        c.status = CommitmentStatus::Completed;
        if vest_refund > 0 {
            c.vest_status = VestStatus::Refunded;
        }
    }
    emit!(MilestoneResolved { commitment: c.key(), index: m.index, outcome: ClaimOutcome::Upheld, client_refund: refund, fee: client_fee });
    Ok(())
}

fn commitment_pay<'info>(
    c: &Account<'info, Commitment>,
    escrow_ata: &Account<'info, TokenAccount>,
    to: &AccountInfo<'info>,
    token_program: &Program<'info, Token>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let id = c.commitment_id.to_le_bytes();
    let seeds: &[&[u8]] = &[b"commitment", c.client.as_ref(), &id, &[c.bump]];
    token::transfer(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            Transfer { from: escrow_ata.to_account_info(), to: to.clone(), authority: c.to_account_info() },
            &[seeds],
        ),
        amount,
    )
}

/// Shared by cancel (charge to partner) and withdraw (voucher penalty to client).
fn close_commitment<'info>(ctx: Context<'_, '_, 'info, 'info, Cancel<'info>>, charge: u64, penalty: u64, by_partner: bool) -> Result<()> {
    let a = &ctx.accounts;
    let c = &a.commitment;
    require!(
        matches!(c.status, CommitmentStatus::Draft | CommitmentStatus::Funded | CommitmentStatus::Active),
        EscrowError::InvalidStatus
    );
    // E-34: only between milestones.
    require!(c.active_milestone.is_none(), EscrowError::MilestoneAlreadyActive);
    require_keys_eq!(a.client_ata.owner, c.client, EscrowError::WrongDestination);
    require_keys_eq!(a.partner_ata.owner, c.partner, EscrowError::WrongDestination);
    let n = c.backing_count as usize;
    let rem = ctx.remaining_accounts;
    require!(rem.len() == 3 * n, EscrowError::InvalidBackings);

    let balance = a.escrow_ata.amount;
    let charge = charge.min(balance);
    commitment_pay(c, &a.escrow_ata, &a.partner_ata.to_account_info(), &a.token_program, charge)?;
    commitment_pay(c, &a.escrow_ata, &a.client_ata.to_account_info(), &a.token_program, balance - charge)?;

    // voucher penalty, pro rata by snapshot caps, clamped to each backing's free capacity
    let mut free = [0u64; MAX_BACKINGS];
    for (i, t) in rem.chunks(3).enumerate() {
        require_keys_eq!(t[1].key(), c.backings[i], EscrowError::BackingMismatch);
        let backing: Account<'info, Backing> = Account::try_from(&t[1])?;
        free[i] = backing.cap.saturating_sub(backing.locked);
    }
    let penalties = pro_rata_locks(penalty, &c.backing_caps[..n], &free[..n]);

    let auth_seeds: &[&[u8]] = &[ESCROW_AUTHORITY_SEED, &[ctx.bumps.escrow_authority]];
    let signer: &[&[&[u8]]] = &[auth_seeds];
    let mut penalty_paid = 0u64;
    for (i, t) in rem.chunks(3).enumerate() {
        if penalties[i] > 0 {
            insuwork_bond::cpi::pay_penalty(
                CpiContext::new_with_signer(
                    a.bond_program.to_account_info(),
                    insuwork_bond::cpi::accounts::PayPenalty {
                        config: a.bond_config.to_account_info(),
                        escrow_authority: a.escrow_authority.to_account_info(),
                        vault: t[0].clone(),
                        vault_ata: t[2].clone(),
                        backing: t[1].clone(),
                        recipient_ata: a.client_ata.to_account_info(),
                        token_program: a.token_program.to_account_info(),
                    },
                    signer,
                ),
                penalties[i],
            )?;
            penalty_paid += penalties[i];
        }
        insuwork_bond::cpi::detach_commitment(CpiContext::new_with_signer(
            a.bond_program.to_account_info(),
            insuwork_bond::cpi::accounts::EscrowCall {
                config: a.bond_config.to_account_info(),
                escrow_authority: a.escrow_authority.to_account_info(),
                vault: t[0].clone(),
                backing: t[1].clone(),
            },
            signer,
        ))?;
    }

    let c = &mut ctx.accounts.commitment;
    c.status = CommitmentStatus::Cancelled;
    if c.vest_status == VestStatus::Held {
        c.vest_status = VestStatus::Refunded;
    }
    emit!(CommitmentCancelled {
        commitment: c.key(),
        by_partner,
        charge_to_partner: charge,
        client_refund: balance - charge,
        voucher_penalty: penalty_paid,
    });
    Ok(())
}

/// Voucher premium split pro rata to each backing's actual lock (E-31); dust to the first locked backing.
pub fn pro_rata_premiums(total: u64, locks: &[u64]) -> [u64; MAX_BACKINGS] {
    let mut out = [0u64; MAX_BACKINGS];
    let sum: u128 = locks.iter().map(|&l| l as u128).sum();
    if sum == 0 {
        return out;
    }
    let mut assigned = 0u64;
    for (i, &l) in locks.iter().enumerate() {
        out[i] = (total as u128 * l as u128 / sum) as u64;
        assigned += out[i];
    }
    if let Some(first) = locks.iter().position(|&l| l > 0) {
        out[first] += total - assigned;
    }
    out
}

/// Money at release (E-28 + E-31). Premium is scaled to the covered fraction `locked / amount`;
/// the uncovered premium goes back to the client, and the freelancer-side premium deduction
/// scales the same way (rounded up so the refund can never go negative).
#[derive(Debug, PartialEq)]
pub struct ReleaseSplit {
    pub partner_payout: u64,
    pub voucher_premium: u64,
    pub fee: u64,
    pub client_refund: u64,
}

impl ReleaseSplit {
    pub fn new(amount: u64, locked: u64, premium_bps: u16, fee_bps: u16, share_bps: u16) -> Result<Self> {
        let full = Split::new(amount, premium_bps, fee_bps, share_bps)?;
        let (a, l) = (amount as u128, locked.min(amount) as u128);
        let premium = full.premium as u128;
        let fl_premium_full = premium * share_bps as u128 / BPS;
        let fl_fee = full.freelancer_part as u128 - fl_premium_full;
        let voucher_premium = premium * l / a;
        let fl_premium = (fl_premium_full * l).div_ceil(a);
        let partner_payout = a - fl_premium - fl_fee;
        let client_refund = full.client_due as u128 - partner_payout - voucher_premium - full.fee as u128;
        let cast = |x: u128| u64::try_from(x).map_err(|_| error!(EscrowError::Overflow));
        Ok(ReleaseSplit {
            partner_payout: cast(partner_payout)?,
            voucher_premium: cast(voucher_premium)?,
            fee: full.fee,
            client_refund: cast(client_refund)?,
        })
    }
}

// ---------------- money math ----------------

/// OQ-1 (owner, 2026-10-10): lock `min(milestone.amount, free capacity)`, split pro rata by the
/// caps snapshotted at creation (E-29); each share is clamped to that backing's live free capacity.
/// Rounding dust goes to the first backing.
pub fn pro_rata_locks(amount: u64, snapshot_caps: &[u64], free: &[u64]) -> [u64; MAX_BACKINGS] {
    let mut out = [0u64; MAX_BACKINGS];
    let total: u128 = snapshot_caps.iter().map(|&c| c as u128).sum();
    if total == 0 {
        return out;
    }
    let mut assigned = 0u64;
    for (i, &c) in snapshot_caps.iter().enumerate() {
        let share = (amount as u128 * c as u128 / total) as u64;
        out[i] = share;
        assigned += share;
    }
    out[0] += amount - assigned;
    for i in 0..snapshot_caps.len() {
        out[i] = out[i].min(free[i]);
    }
    out
}

/// Per-milestone split (E-28). The freelancer side's share of premium and fee is
/// deducted from salary at release; the client funds the rest up front.
#[derive(Debug, PartialEq)]
pub struct Split {
    pub premium: u64,
    pub fee: u64,
    /// premium + fee borne by the freelancer side (deducted from partner payout)
    pub freelancer_part: u64,
    /// what the client funds for this milestone
    pub client_due: u64,
    /// what the partner receives at release
    pub partner_payout: u64,
}

impl Split {
    pub fn new(amount: u64, premium_bps: u16, fee_bps: u16, freelancer_share_bps: u16) -> Result<Self> {
        let a = amount as u128;
        let premium = a * premium_bps as u128 / BPS;
        let fee = a * fee_bps as u128 / BPS;
        let freelancer_part = premium * freelancer_share_bps as u128 / BPS + fee * freelancer_share_bps as u128 / BPS;
        require!(freelancer_part <= a, EscrowError::InvalidBps);
        let client_due = a + premium + fee - freelancer_part;
        let cast = |x: u128| u64::try_from(x).map_err(|_| error!(EscrowError::Overflow));
        Ok(Split {
            premium: cast(premium)?,
            fee: cast(fee)?,
            freelancer_part: cast(freelancer_part)?,
            client_due: cast(client_due)?,
            partner_payout: cast(a - freelancer_part)?,
        })
    }
}

// ---------------- accounts ----------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ConfigParams {
    pub bond_program: Pubkey,
    pub disputes_program: Pubkey,
    pub treasury: Pubkey,
    pub github_oracle: Pubkey,
    /// InsuWork backend key allowed to record work submission (partner may too).
    pub submitter: Pubkey,
    pub premium_bps: u16,
    pub platform_fee_bps: u16,
    pub freelancer_share_bps: u16,
    pub claim_window_secs: i64,
    /// client cancel charge, bps of remaining salary, paid to the partner (E-34)
    pub cancel_fee_bps: u16,
    /// voucher penalty on freelancer-side withdrawal, bps of remaining salary, paid to the client (E-34)
    pub withdraw_penalty_bps: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MilestoneParams {
    pub amount: u64,
    pub due_ts: i64,
    pub spec_hash: [u8; 32],
    pub release_mode: ReleaseMode,
    pub github_ref_hash: [u8; 32],
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(init, payer = admin, space = 8 + EscrowConfig::INIT_SPACE, seeds = [b"escrow_config"], bump)]
    pub config: Account<'info, EscrowConfig>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(constraint = program.programdata_address()? == Some(program_data.key()))]
    pub program: Program<'info, crate::program::InsuworkEscrow>,
    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ EscrowError::Unauthorized)]
    pub program_data: Account<'info, ProgramData>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminConfig<'info> {
    #[account(mut, seeds = [b"escrow_config"], bump = config.bump, has_one = admin @ EscrowError::Unauthorized)]
    pub config: Account<'info, EscrowConfig>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct RegisterPartner<'info> {
    #[account(seeds = [b"escrow_config"], bump = config.bump, has_one = admin @ EscrowError::Unauthorized)]
    pub config: Account<'info, EscrowConfig>,
    #[account(init, payer = admin, space = 8 + PartnerRecord::INIT_SPACE, seeds = [b"partner", wallet.as_ref()], bump)]
    pub partner: Account<'info, PartnerRecord>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetPartnerActive<'info> {
    #[account(seeds = [b"escrow_config"], bump = config.bump, has_one = admin @ EscrowError::Unauthorized)]
    pub config: Account<'info, EscrowConfig>,
    #[account(mut, seeds = [b"partner", partner.wallet.as_ref()], bump = partner.bump)]
    pub partner: Account<'info, PartnerRecord>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(commitment_id: u64)]
pub struct CreateCommitment<'info> {
    #[account(seeds = [b"escrow_config"], bump = config.bump)]
    pub config: Account<'info, EscrowConfig>,
    #[account(
        init, payer = client, space = 8 + Commitment::INIT_SPACE,
        seeds = [b"commitment", client.key().as_ref(), &commitment_id.to_le_bytes()], bump,
    )]
    pub commitment: Account<'info, Commitment>,
    #[account(
        init, payer = client, seeds = [b"escrow_ata", commitment.key().as_ref()], bump,
        token::mint = usdc_mint, token::authority = commitment,
    )]
    pub escrow_ata: Account<'info, TokenAccount>,
    #[account(address = config.usdc_mint)]
    pub usdc_mint: Account<'info, Mint>,
    #[account(seeds = [b"partner", partner.wallet.as_ref()], bump = partner.bump)]
    pub partner: Account<'info, PartnerRecord>,
    /// CHECK: PDA signer for bond CPIs; seeds verified here, key verified by bond.
    #[account(seeds = [ESCROW_AUTHORITY_SEED], bump)]
    pub escrow_authority: UncheckedAccount<'info>,
    /// CHECK: bond's BondConfig; validated by the bond program during CPI.
    pub bond_config: UncheckedAccount<'info>,
    #[account(address = config.bond_program)]
    pub bond_program: Program<'info, InsuworkBond>,
    #[account(mut)]
    pub client: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct AddMilestone<'info> {
    #[account(mut, has_one = client)]
    pub commitment: Account<'info, Commitment>,
    #[account(
        init, payer = client, space = 8 + Milestone::INIT_SPACE,
        seeds = [b"milestone", commitment.key().as_ref(), &[index]], bump,
    )]
    pub milestone: Account<'info, Milestone>,
    #[account(mut)]
    pub client: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct ActivateMilestone<'info> {
    #[account(seeds = [b"escrow_config"], bump = config.bump)]
    pub config: Account<'info, EscrowConfig>,
    #[account(mut, has_one = client)]
    pub commitment: Account<'info, Commitment>,
    #[account(mut, seeds = [b"milestone", commitment.key().as_ref(), &[index]], bump = milestone.bump)]
    pub milestone: Account<'info, Milestone>,
    /// CHECK: PDA signer for bond CPIs; seeds verified here, key verified by bond.
    #[account(seeds = [ESCROW_AUTHORITY_SEED], bump)]
    pub escrow_authority: UncheckedAccount<'info>,
    /// CHECK: bond's BondConfig; validated by the bond program during CPI.
    pub bond_config: UncheckedAccount<'info>,
    #[account(address = config.bond_program)]
    pub bond_program: Program<'info, InsuworkBond>,
    pub client: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct FreezeMilestone<'info> {
    #[account(seeds = [b"escrow_config"], bump = config.bump)]
    pub config: Account<'info, EscrowConfig>,
    pub commitment: Account<'info, Commitment>,
    #[account(mut, seeds = [b"milestone", commitment.key().as_ref(), &[index]], bump = milestone.bump)]
    pub milestone: Account<'info, Milestone>,
    #[account(
        constraint = disputes_authority.key()
            == Pubkey::find_program_address(&[DISPUTES_AUTHORITY_SEED], &config.disputes_program).0
            @ EscrowError::UnauthorizedCaller
    )]
    pub disputes_authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct SubmitMilestone<'info> {
    #[account(seeds = [b"escrow_config"], bump = config.bump)]
    pub config: Account<'info, EscrowConfig>,
    pub commitment: Account<'info, Commitment>,
    #[account(mut, seeds = [b"milestone", commitment.key().as_ref(), &[index]], bump = milestone.bump)]
    pub milestone: Account<'info, Milestone>,
    pub submitter: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct Release<'info> {
    #[account(seeds = [b"escrow_config"], bump = config.bump)]
    pub config: Account<'info, EscrowConfig>,
    #[account(mut)]
    pub commitment: Account<'info, Commitment>,
    #[account(mut, seeds = [b"milestone", commitment.key().as_ref(), &[index]], bump = milestone.bump)]
    pub milestone: Account<'info, Milestone>,
    #[account(mut, seeds = [b"escrow_ata", commitment.key().as_ref()], bump = commitment.ata_bump)]
    pub escrow_ata: Account<'info, TokenAccount>,
    #[account(seeds = [b"partner", commitment.partner.as_ref()], bump = partner.bump)]
    pub partner: Account<'info, PartnerRecord>,
    #[account(mut, token::mint = config.usdc_mint)]
    pub partner_ata: Account<'info, TokenAccount>,
    #[account(mut, token::mint = config.usdc_mint)]
    pub treasury_ata: Account<'info, TokenAccount>,
    #[account(mut, token::mint = config.usdc_mint)]
    pub client_ata: Account<'info, TokenAccount>,
    /// CHECK: PDA signer for bond CPIs; seeds verified here, key verified by bond.
    #[account(seeds = [ESCROW_AUTHORITY_SEED], bump)]
    pub escrow_authority: UncheckedAccount<'info>,
    /// CHECK: bond's BondConfig; validated by the bond program during CPI.
    pub bond_config: UncheckedAccount<'info>,
    #[account(address = config.bond_program)]
    pub bond_program: Program<'info, InsuworkBond>,
    /// client (approve), github oracle (oracle_approve) or anyone (crank).
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct VestCall<'info> {
    #[account(mut)]
    pub commitment: Box<Account<'info, Commitment>>,
    #[account(mut, seeds = [b"escrow_ata", commitment.key().as_ref()], bump = commitment.ata_bump)]
    pub escrow_ata: Box<Account<'info, TokenAccount>>,
    #[account(seeds = [b"partner", commitment.partner.as_ref()], bump = partner.bump)]
    pub partner: Box<Account<'info, PartnerRecord>>,
    #[account(mut, token::mint = escrow_ata.mint)]
    pub partner_ata: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = escrow_ata.mint)]
    pub client_ata: Box<Account<'info, TokenAccount>>,
    /// anyone (release_vest) or partner (flag_vest_left)
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(seeds = [b"escrow_config"], bump = config.bump)]
    pub config: Box<Account<'info, EscrowConfig>>,
    #[account(mut)]
    pub commitment: Box<Account<'info, Commitment>>,
    #[account(mut, seeds = [b"escrow_ata", commitment.key().as_ref()], bump = commitment.ata_bump)]
    pub escrow_ata: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = config.usdc_mint)]
    pub partner_ata: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = config.usdc_mint)]
    pub client_ata: Box<Account<'info, TokenAccount>>,
    /// CHECK: PDA signer for bond CPIs; seeds verified here, key verified by bond.
    #[account(seeds = [ESCROW_AUTHORITY_SEED], bump)]
    pub escrow_authority: UncheckedAccount<'info>,
    /// CHECK: bond's BondConfig; validated by the bond program during CPI.
    pub bond_config: UncheckedAccount<'info>,
    #[account(address = config.bond_program)]
    pub bond_program: Program<'info, InsuworkBond>,
    /// client (cancel) or partner (withdraw)
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Fund<'info> {
    #[account(seeds = [b"escrow_config"], bump = config.bump)]
    pub config: Account<'info, EscrowConfig>,
    #[account(mut, has_one = client)]
    pub commitment: Account<'info, Commitment>,
    #[account(mut, seeds = [b"escrow_ata", commitment.key().as_ref()], bump = commitment.ata_bump)]
    pub escrow_ata: Account<'info, TokenAccount>,
    #[account(mut, token::mint = config.usdc_mint, token::authority = client)]
    pub client_ata: Account<'info, TokenAccount>,
    pub client: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

// ---------------- state ----------------

#[account]
#[derive(InitSpace)]
pub struct EscrowConfig {
    pub admin: Pubkey,
    pub usdc_mint: Pubkey,
    pub bond_program: Pubkey,
    pub disputes_program: Pubkey,
    pub treasury: Pubkey,
    pub github_oracle: Pubkey,
    /// InsuWork backend key allowed to record work submission (partner may too).
    pub submitter: Pubkey,
    pub premium_bps: u16,
    pub platform_fee_bps: u16,
    pub freelancer_share_bps: u16,
    pub claim_window_secs: i64,
    /// client cancel charge, bps of remaining salary, paid to the partner (E-34)
    pub cancel_fee_bps: u16,
    /// voucher penalty on freelancer-side withdrawal, bps of remaining salary, paid to the client (E-34)
    pub withdraw_penalty_bps: u16,
    pub paused: bool,
    pub bump: u8,
    pub _reserved: [u8; 64],
}

#[account]
#[derive(InitSpace)]
pub struct PartnerRecord {
    pub wallet: Pubkey,
    pub name: [u8; 32],
    pub is_mock: bool,
    pub active: bool,
    pub bump: u8,
    pub _reserved: [u8; 64],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum CommitmentStatus { Draft, Funded, Active, Completed, Cancelled }

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum ReleaseMode { ClientSig, GithubOracle }

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum VestStatus { None, Held, Vesting, Released, Refunded }

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum ClaimOutcome { None, Upheld, Rejected, Partial }

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum MilestoneStatus { Pending, Active, Released, Disputed, Resolved }

#[account]
#[derive(InitSpace)]
pub struct Commitment {
    pub client: Pubkey,
    pub commitment_id: u64,
    pub freelancer_ref: [u8; 32],
    pub partner: Pubkey,
    pub backings: [Pubkey; MAX_BACKINGS],
    pub backing_count: u8,
    /// Backing caps at creation; lock split is pro rata by these (OQ-1).
    pub backing_caps: [u64; MAX_BACKINGS],
    /// The single Active milestone, if any (OQ-1).
    pub active_milestone: Option<u8>,
    pub milestone_count: u8,
    pub milestones_added: u8,
    pub milestones_closed: u8,
    pub premium_bps: u16,
    pub platform_fee_bps: u16,
    /// 0 when the client didn't opt into sharing (E-28).
    pub freelancer_share_bps: u16,
    pub total_required: u64,
    pub funded: u64,
    pub released: u64,
    pub status: CommitmentStatus,
    /// Σ salary of milestones not yet closed (cancel / withdraw base, E-34).
    pub remaining_salary: u64,
    pub vest_amount: u64,
    pub vest_delay_secs: i64,
    pub vest_due_ts: i64,
    pub vest_status: VestStatus,
    pub created_ts: i64,
    pub bump: u8,
    pub ata_bump: u8,
    pub _reserved: [u8; 64],
}

#[account]
#[derive(InitSpace)]
pub struct Milestone {
    pub commitment: Pubkey,
    pub index: u8,
    pub amount: u64,
    pub due_ts: i64,
    pub spec_hash: [u8; 32],
    pub release_mode: ReleaseMode,
    pub github_ref_hash: [u8; 32],
    pub status: MilestoneStatus,
    pub locked_amount: u64,
    pub locked_per_backing: [u64; MAX_BACKINGS],
    pub released_ts: i64,
    /// Last recorded work submission (0 = none). OQ-16 / E-31.
    pub submitted_ts: i64,
    /// 0, 1, or 2 (one restart allowed).
    pub submissions: u8,
    pub bump: u8,
    pub _reserved: [u8; 64],
}

// ---------------- events ----------------

#[event]
pub struct PartnerRegistered { pub wallet: Pubkey, pub is_mock: bool }
#[event]
pub struct PartnerStatusSet { pub wallet: Pubkey, pub active: bool }
#[event]
pub struct CommitmentCreated {
    pub commitment: Pubkey,
    pub client: Pubkey,
    pub freelancer_ref: [u8; 32],
    pub partner: Pubkey,
    pub backings: [Pubkey; MAX_BACKINGS],
    pub backing_count: u8,
    pub milestone_count: u8,
    pub freelancer_share_bps: u16,
}
#[event]
pub struct MilestoneAdded { pub commitment: Pubkey, pub index: u8, pub amount: u64, pub due_ts: i64, pub client_due: u64 }
#[event]
pub struct MilestoneActivated { pub commitment: Pubkey, pub index: u8, pub locked_amount: u64, pub locked_per_backing: [u64; MAX_BACKINGS] }
#[event]
pub struct MilestoneSubmitted { pub commitment: Pubkey, pub index: u8, pub submitted_ts: i64, pub window_end: i64 }
#[event]
pub struct MilestoneReleased {
    pub commitment: Pubkey,
    pub index: u8,
    pub amount: u64,
    pub partner_payout: u64,
    pub premium: u64,
    pub fee: u64,
    pub client_refund: u64,
    pub partner: Pubkey,
    pub freelancer_ref: [u8; 32],
    pub spec_hash: [u8; 32],
    pub mode: ReleaseMode,
}
#[event]
pub struct MilestoneFrozen { pub commitment: Pubkey, pub index: u8 }
#[event]
pub struct MilestoneResolved { pub commitment: Pubkey, pub index: u8, pub outcome: ClaimOutcome, pub client_refund: u64, pub fee: u64 }
#[event]
pub struct VestReleased { pub commitment: Pubkey, pub amount: u64, pub partner: Pubkey }
#[event]
pub struct VestRefunded { pub commitment: Pubkey, pub amount: u64 }
#[event]
pub struct CommitmentCancelled {
    pub commitment: Pubkey,
    pub by_partner: bool,
    pub charge_to_partner: u64,
    pub client_refund: u64,
    pub voucher_penalty: u64,
}
#[event]
pub struct CommitmentFunded { pub commitment: Pubkey, pub funded: u64 }

#[error_code]
pub enum EscrowError {
    #[msg("Partner is not active")]
    InactivePartner,
    #[msg("Backing does not match this freelancer / vault, or is inactive")]
    BackingMismatch,
    #[msg("Backings must be 1..=4 distinct (vault, backing) pairs")]
    InvalidBackings,
    #[msg("A voucher cannot be the client on the same commitment")]
    VoucherIsClient,
    #[msg("Milestone count must be 1..=12")]
    InvalidMilestoneCount,
    #[msg("Milestones must be added in order, within milestone_count")]
    InvalidMilestoneIndex,
    #[msg("Not all milestones have been added")]
    MilestonesIncomplete,
    #[msg("Funding would exceed total_required")]
    Overfund,
    #[msg("Amount must be > 0")]
    ZeroAmount,
    #[msg("Due date must be in the future")]
    InvalidDueDate,
    #[msg("Another milestone is already active")]
    MilestoneAlreadyActive,
    #[msg("Backings have no free capacity to lock")]
    BackingInsufficient,
    #[msg("Caller is not the expected authority PDA")]
    UnauthorizedCaller,
    #[msg("Claim outcome not supported (E-33)")]
    OutcomeNotSupported,
    #[msg("Vest date not reached")]
    VestNotDue,
    #[msg("Vest date already reached")]
    VestDue,
    #[msg("Milestone is not Active")]
    NotActive,
    #[msg("Destination token account owner is not the expected wallet")]
    WrongDestination,
    #[msg("Signer is not the GitHub oracle, or milestone is not oracle-released")]
    WrongOracle,
    #[msg("GitHub ref hash does not match")]
    RefMismatch,
    #[msg("Claim window still open")]
    WindowOpen,
    #[msg("No work submission recorded")]
    NotSubmitted,
    #[msg("Window can only be restarted once, from inside the window")]
    WindowRestartUsed,
    #[msg("Invalid status for this action")]
    InvalidStatus,
    #[msg("Basis points out of range")]
    InvalidBps,
    #[msg("Program is paused")]
    Paused,
    #[msg("Signer is not the admin / upgrade authority")]
    Unauthorized,
    #[msg("Arithmetic overflow")]
    Overflow,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_no_sharing_matches_spec_worked_example() {
        // SPEC §4: 1,000 USDC, 3% premium, 1% fee, client pays all.
        let s = Split::new(1_000_000_000, 300, 100, 0).unwrap();
        assert_eq!((s.premium, s.fee, s.freelancer_part), (30_000_000, 10_000_000, 0));
        assert_eq!(s.client_due, 1_040_000_000);
        assert_eq!(s.partner_payout, 1_000_000_000);
    }

    #[test]
    fn pro_rata_locks_by_snapshot_caps() {
        // 1000 + 600 caps, 800 milestone -> 500 / 300
        assert_eq!(pro_rata_locks(800, &[1000, 600], &[1000, 600])[..2], [500, 300]);
        // dust to first: 100 over 3 equal caps -> 34/33/33
        assert_eq!(pro_rata_locks(100, &[1, 1, 1], &[100, 100, 100])[..3], [34, 33, 33]);
        // clamped to live free capacity (cap lowered or locked elsewhere)
        assert_eq!(pro_rata_locks(800, &[1000, 600], &[200, 600])[..2], [200, 300]);
        // milestone larger than caps -> each locks its share, clamped
        assert_eq!(pro_rata_locks(5000, &[1000], &[1000])[..1], [1000]);
    }

    #[test]
    fn release_full_cover_no_sharing_is_spec_example() {
        let r = ReleaseSplit::new(1_000, 1_000, 300, 100, 0).unwrap();
        assert_eq!(r, ReleaseSplit { partner_payout: 1_000, voucher_premium: 30, fee: 10, client_refund: 0 });
    }

    #[test]
    fn release_half_cover_refunds_uncovered_premium() {
        // 50% covered, 50/50 sharing: vouchers 15; freelancer premium part ceil(7.5)=8; fee part 5.
        let r = ReleaseSplit::new(1_000, 500, 300, 100, 5_000).unwrap();
        assert_eq!(r.voucher_premium, 15);
        assert_eq!(r.partner_payout, 1_000 - 8 - 5);
        let funded = Split::new(1_000, 300, 100, 5_000).unwrap().client_due;
        assert_eq!(funded, r.partner_payout + r.voucher_premium + r.fee + r.client_refund);
    }

    #[test]
    fn release_conserves_money_everywhere() {
        for amount in [1u64, 7, 99, 1_000, 123_456_789] {
            for locked in [0, 1, amount / 3, amount / 2, amount] {
                for share in [0u16, 1, 3_333, 5_000, 10_000] {
                    let f = Split::new(amount, 300, 100, share).unwrap();
                    let r = ReleaseSplit::new(amount, locked, 300, 100, share).unwrap();
                    assert_eq!(f.client_due, r.partner_payout + r.voucher_premium + r.fee + r.client_refund);
                }
            }
        }
    }

    #[test]
    fn premiums_follow_actual_locks() {
        assert_eq!(pro_rata_premiums(15, &[200, 300])[..2], [6, 9]);
        assert_eq!(pro_rata_premiums(10, &[0, 1, 2])[..3], [0, 4, 6]); // dust to first locked
        assert_eq!(pro_rata_premiums(10, &[0, 0])[..2], [0, 0]);
    }

    #[test]
    fn split_half_shared_conserves_money() {
        let s = Split::new(1_000_000_000, 300, 100, 5_000).unwrap();
        assert_eq!(s.freelancer_part, 20_000_000); // 15 premium + 5 fee
        assert_eq!(s.client_due, 1_020_000_000);
        assert_eq!(s.partner_payout, 980_000_000);
        // everything the client funds leaves escrow: partner + voucher premium + treasury fee
        assert_eq!(s.client_due, s.partner_payout + s.premium + s.fee);
    }
}
